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
import { Log } from '../protocol/bidiProtocolTypes';
import { getRemoteValuesText } from './logHelper';
import { Protocol } from 'devtools-protocol';
import { Realm } from '../script/realm';
import { IEventManager } from '../events/EventManager';
import { ScriptEvaluator } from '../script/scriptEvaluator';

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
            stackTrace: ScriptEvaluator.getBiDiStackTrace(params.stackTrace, 0),

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

        const exceptionText = await ScriptEvaluator.getExceptionText(
          params.exceptionDetails,
          realm
        );

        await this.#eventManager.sendEvent(
          new Log.LogEntryAddedEvent({
            level: 'error',
            source: {
              realm: realm?.realmId ?? 'UNKNOWN',
              context: realm?.browsingContextId ?? 'UNKNOWN',
            },
            text: exceptionText,
            timestamp: Math.round(params.timestamp),
            stackTrace: ScriptEvaluator.getBiDiStackTrace(
              params.exceptionDetails.stackTrace,
              0
            ),
            type: 'javascript',
          }),
          realm?.browsingContextId ?? 'UNKNOWN'
        );
      }
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
}
