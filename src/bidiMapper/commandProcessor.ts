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

import { CdpClient, CdpConnection } from '../cdp';
import { BrowsingContextProcessor } from './domains/context/browsingContextProcessor';
import { Protocol } from 'devtools-protocol';
import { BidiCommandMessage, IBidiServer } from './utils/bidiServer';
import {
  BrowsingContext,
  CommonDataTypes,
  Script,
  Session,
} from './bidiProtocolTypes';

export class CommandProcessor {
  private _browserCdpClient: CdpClient;
  private _contextProcessor: BrowsingContextProcessor;

  static run(
    cdpConnection: CdpConnection,
    bidiServer: IBidiServer,
    selfTargetId: string,
    EVALUATOR_SCRIPT: string
  ) {
    const commandProcessor = new CommandProcessor(
      cdpConnection,
      bidiServer,
      selfTargetId,
      EVALUATOR_SCRIPT
    );

    commandProcessor.run();
  }

  private constructor(
    private _cdpConnection: CdpConnection,
    private _bidiServer: IBidiServer,
    private _selfTargetId: string,
    EVALUATOR_SCRIPT: string
  ) {
    this._browserCdpClient = this._cdpConnection.browserClient();

    this._contextProcessor = new BrowsingContextProcessor(
      this._cdpConnection,
      this._selfTargetId,
      this._bidiServer,
      EVALUATOR_SCRIPT
    );
  }

  private run() {
    this._bidiServer.on('message', (messageObj) => {
      return this._onBidiMessage(messageObj);
    });
  }

  private _isValidTarget = (target: Protocol.Target.TargetInfo) => {
    if (target.targetId === this._selfTargetId) return false;
    if (!target.type || target.type !== 'page') return false;
    return true;
  };

  private _getErrorResponse(
    commandData: any,
    errorCode: string,
    errorMessage: string
  ) {
    // TODO: this is bizarre per spec. We reparse the payload and
    // extract the ID, regardless of what kind of value it was.
    let commandId = undefined;
    try {
      commandId = commandData.id;
    } catch {}

    return {
      id: commandId,
      error: errorCode,
      message: errorMessage,
      // TODO: optional stacktrace field.
    };
  }

  private _respondWithError(
    commandData: any,
    errorCode: string,
    errorMessage: string
  ) {
    const errorResponse = this._getErrorResponse(
      commandData,
      errorCode,
      errorMessage
    );
    this._bidiServer.sendMessage(errorResponse);
  }

  private _process_session_status = async function (
    commandData: Session.SessionStatusCommand
  ): Promise<Session.SessionStatusResult> {
    return { ready: true, message: 'ready' };
  };

  private _process_session_subscribe = async function (
    commandData: Session.SessionSubscribeCommand
  ): Promise<Session.SessionSubscribeResult> {
    throw new Error('Not implemented');
  };

  private _process_session_unsubscribe = async function (
    commandData: Session.SessionUnsubscribeCommand
  ): Promise<Session.SessionUnsubscribeResult> {
    throw new Error('Not implemented');
  };

  private async _processCommand(
    commandData: BidiCommandMessage
  ): Promise<CommonDataTypes.CommandResultType> {
    switch (commandData.method) {
      case 'session.status':
        return await this._process_session_status(
          commandData as Session.SessionStatusCommand
        );
      case 'session.subscribe':
        return await this._process_session_subscribe(
          commandData as Session.SessionSubscribeCommand
        );
      case 'session.unsubscribe':
        return await this._process_session_unsubscribe(
          commandData as Session.SessionUnsubscribeCommand
        );

      case 'browsingContext.create':
        return await this._contextProcessor.process_browsingContext_create(
          commandData as BrowsingContext.BrowsingContextCreateCommand
        );
      case 'browsingContext.getTree':
        return await this._contextProcessor.process_browsingContext_getTree(
          commandData as BrowsingContext.BrowsingContextGetTreeCommand
        );
      case 'browsingContext.navigate':
        return await this._contextProcessor.process_browsingContext_navigate(
          commandData as BrowsingContext.BrowsingContextNavigateCommand
        );

      case 'script.callFunction':
        return await this._contextProcessor.process_script_callFunction(
          commandData as Script.ScriptCallFunctionCommand
        );
      case 'script.evaluate':
        return await this._contextProcessor.process_script_evaluate(
          commandData as Script.ScriptEvaluateCommand
        );

      case 'PROTO.browsingContext.findElement':
        return await this._contextProcessor.process_PROTO_browsingContext_findElement(
          commandData as BrowsingContext.PROTO.BrowsingContextFindElementCommand
        );
      case 'DEBUG.browsingContext.close':
        return await this._contextProcessor.process_DEBUG_browsingContext_close(
          commandData.params as any
        );

      default:
        throw new Error('unknown command');
    }
  }

  private _onBidiMessage = async (message: BidiCommandMessage) => {
    try {
      const result = await this._processCommand(message);

      const response = {
        id: message.id,
        result,
      };

      this._bidiServer.sendMessage(response);
    } catch (e) {
      const error = e as Error;
      console.error(error);
      this._respondWithError(message, 'unknown error', error.message);
    }
  };
}
