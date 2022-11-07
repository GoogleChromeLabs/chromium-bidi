/**
 * Copyright 2021 Google LLC.
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { CdpClient } from '../../../cdp';
import { Log, Script } from '../protocol/bidiProtocolTypes';
import { getRemoteValuesText } from './logHelper';
import { Protocol } from 'devtools-protocol';
import { Realm } from '../script/realm';
import { IEventManager } from '../events/EventManager';

export class LogManager {
  readonly #contextId: string;
  readonly #cdpClient: CdpClient;
  readonly #cdpSessionId: string;
  readonly #eventManager: IEventManager;

  private constructor(
    contextId: string,
    cdpClient: CdpClient,
    cdpSessionId: string,
    eventManager: IEventManager
  ) {
    this.#cdpSessionId = cdpSessionId;
    this.#cdpClient = cdpClient;
    this.#contextId = contextId;
    this.#eventManager = eventManager;
  }

  public static create(
    contextId: string,
    cdpClient: CdpClient,
    cdpSessionId: string,
    eventManager: IEventManager
  ) {
    const logManager = new LogManager(
      contextId,
      cdpClient,
      cdpSessionId,
      eventManager
    );

    logManager.#initialize();
    return logManager;
  }

  #initialize() {
    this.#initializeEventListeners();
  }

  #initializeEventListeners() {
    this.#initializeLogEntryAddedEventListener();
  }

  #initializeLogEntryAddedEventListener() {
    this.#cdpClient.Runtime.on(
      'consoleAPICalled',
      async (params: Protocol.Runtime.ConsoleAPICalledEvent) => {
        // Try to find realm by `cdpSessionId` and `executionContextId`,
        // if provided.
        const realm: Realm | undefined = Realm.findRealm({
          cdpSessionId: this.#cdpSessionId,
          executionContextId: params.executionContextId,
        });
        const args =
          realm === undefined
            ? params.args
            : // Properly serialize arguments if possible.
              await Promise.all(
                params.args.map(async (arg) => {
                  return realm.serializeCdpObject(arg, 'none');
                })
              );

        await this.#eventManager.sendEvent(
          new Log.LogEntryAddedEvent({
            level: LogManager.#getLogLevel(params.type),
            source: {
              realm: realm?.realmId ?? 'UNKNOWN',
              context: realm?.browsingContextId ?? 'UNKNOWN',
            },
            text: getRemoteValuesText(args, true),
            timestamp: Math.round(params.timestamp),
            stackTrace: LogManager.#getBidiStackTrace(params.stackTrace),
            type: 'console',
            // Console method is `warn`, not `warning`.
            method: params.type === 'warning' ? 'warn' : params.type,
            args: args,
          }),
          realm?.browsingContextId ?? 'UNKNOWN'
        );
      }
    );

    this.#cdpClient.Runtime.on(
      'exceptionThrown',
      async (params: Protocol.Runtime.ExceptionThrownEvent) => {
        // Try to find realm by `cdpSessionId` and `executionContextId`,
        // if provided.
        const realm: Realm | undefined = Realm.findRealm({
          cdpSessionId: this.#cdpSessionId,
          executionContextId: params.exceptionDetails.executionContextId,
        });

        // Try all the best to get the exception text.
        const exceptionText = await LogManager.#getExceptionText(params, realm);

        await this.#eventManager.sendEvent(
          new Log.LogEntryAddedEvent({
            level: 'error',
            source: {
              realm: realm?.realmId ?? 'UNKNOWN',
              context: realm?.browsingContextId ?? 'UNKNOWN',
            },
            text: exceptionText,
            timestamp: Math.round(params.timestamp),
            stackTrace: LogManager.#getBidiStackTrace(
              params.exceptionDetails.stackTrace
            ),
            type: 'javascript',
          }),
          realm?.browsingContextId ?? 'UNKNOWN'
        );
      }
    );
  }

  /**
   * Heuristic to get the exception description without extra CDP round trip to
   * avoid BiDi message delay.
   * @param params CDP exception details has the following format:
   *   // {
   *   //   "method": "Runtime.exceptionThrown",
   *   //   "params": {
   *   //     "exceptionDetails": {
   *   //       "text": "Uncaught",
   *   //       "exception": {
   *   //         "description": "Error: cached_message\\n    at <anonymous>:1:16\\n...",
   *   //         "objectId": "-2282565827719730523.1.1",
   *   //         "preview": {
   *   //           "description": "Error: cached_message\\n    at <anonymous>:1:16\\n...",
   *   //           "properties": [
   *   //             {
   *   //               "name": "stack",
   *   //               "type": "string",
   *   //               "value": "Error: cached_message\\n    at <anonymous>:1:16\\n..."
   *   //             }, {
   *   //               "name": "message",
   *   //               "type": "string",
   *   //               "value": "cached_message"
   *   //             }]
   *   //         }, ...
   *   //       },  ...
   *   //     }, ...
   *   //   }, ...
   *   // }
   * @param realm is used in case of the preview is not available, and additional CDP round-trip is required.
   */
  static async #getExceptionText(
    params: Protocol.Runtime.ExceptionThrownEvent,
    realm: Realm | undefined
  ): Promise<string> {
    if (!params.exceptionDetails.exception) {
      return params.exceptionDetails.text;
    }

    const previewMessage =
      params.exceptionDetails.exception.preview?.properties.find(
        (p) => p.name === 'message'
      )?.value;

    if (previewMessage !== undefined) {
      return previewMessage;
    }

    if (realm === undefined) {
      return JSON.stringify(params.exceptionDetails.exception);
    }

    return await realm.stringifyObject(
      params.exceptionDetails.exception,
      realm
    );
  }

  static #getLogLevel(consoleApiType: string): Log.LogLevel {
    if (['assert', 'error'].includes(consoleApiType)) {
      return 'error';
    }
    if (['debug', 'trace'].includes(consoleApiType)) {
      return 'debug';
    }
    if (['warn', 'warning'].includes(consoleApiType)) {
      return 'warn';
    }
    return 'info';
  }

  // convert CDP StackTrace object to Bidi StackTrace object
  static #getBidiStackTrace(
    cdpStackTrace: Protocol.Runtime.StackTrace | undefined
  ): Script.StackTrace | undefined {
    const stackFrames = cdpStackTrace?.callFrames.map((callFrame) => {
      return {
        columnNumber: callFrame.columnNumber,
        functionName: callFrame.functionName,
        lineNumber: callFrame.lineNumber,
        url: callFrame.url,
      };
    });

    return stackFrames ? { callFrames: stackFrames } : undefined;
  }
}
