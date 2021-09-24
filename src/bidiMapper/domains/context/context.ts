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

import { Protocol } from 'devtools-protocol';
import { CommonDataTypes, Script } from '../../bidiProtocolTypes';
import { CdpClient } from '../../../cdp';

import EVALUATOR_SCRIPT from '../../scripts/eval.es';

export class Context {
  _targetInfo?: Protocol.Target.TargetInfo;
  _sessionId?: string;

  private constructor(
    private _contextId: string,
    private _cdpClient: CdpClient
  ) {}

  public static create(contextId: string, cdpClient: CdpClient) {
    const context = new Context(contextId, cdpClient);
    context._initialize();
    return context;
  }

  private _initialize() {
    // TODO: Subscribe to Runtime and Page events to track executionContexts and frames.
  }

  _setSessionId(sessionId: string): void {
    this._sessionId = sessionId;
  }

  _updateTargetInfo(targetInfo: Protocol.Target.TargetInfo) {
    this._targetInfo = targetInfo;
  }

  _onInfoChangedEvent(targetInfo: Protocol.Target.TargetInfo) {
    this._updateTargetInfo(targetInfo);
  }

  public get id(): string {
    return this._contextId;
  }

  toBidi() {
    return {
      context: this._targetInfo!.targetId,
      parent: this._targetInfo!.openerId ? this._targetInfo!.openerId : null,
      url: this._targetInfo!.url,
    };
  }

  private async _serializeCdpObject(cdpObject: Protocol.Runtime.RemoteObject) {
    // TODO sadym: `dummyContextObject` needed for the running context.
    // Use proper`executionContextId`.
    const dummyContextObject = await this._cdpClient.Runtime.evaluate({
      expression: 'return {}',
    });

    const response = await this._cdpClient.Runtime.callFunctionOn({
      functionDeclaration: `${EVALUATOR_SCRIPT}.serialize`,
      objectId: dummyContextObject.result.objectId,
      arguments: [cdpObject],
      returnByValue: true,
    });

    if (response.exceptionDetails)
      // Serialisation unexpectidely failed.
      throw response.exceptionDetails;

    // Return serialised value.
    return response.result.value;
  }

  public async evaluateScript(
    script: string,
    args: any[]
  ): Promise<Script.ScriptEvaluateResult> {
    // Wrapping serialisation into `Runtime.evaluate` hides exception
    // stacktrace and other details. So first call `Runtime.evaluate`, which
    // returns CDP objects. Use`Runtime.callFunctionOn` with serialization
    // script afterwards.
    const expression = script;
    const { result, exceptionDetails } = await this._cdpClient.Runtime.evaluate(
      {
        expression,
        returnByValue: false,
        generatePreview: false,
      }
    );

    if (exceptionDetails) {
      const serializedException = await this._serializeCdpObject(
        exceptionDetails.exception!
      );

      return {
        exceptionDetails: {
          columnNumber: exceptionDetails.columnNumber,
          // TODO sadym: verify the exception object is serialized.
          exception: serializedException,
          lineNumber: exceptionDetails.lineNumber,
          // TODO sadym: map `stackTrace`.
          // stackTrace?: StackTrace,
          text: exceptionDetails.text,
        } as CommonDataTypes.ExceptionDetails,
      } as Script.ScriptEvaluateExceptionResult;
    }

    // Runtime.evaluate did not return a result for some reason. Could be an
    // internal error, or a failure to parse the user's script.
    if (!result) {
      throw new Error('unable to parse result from evaluateScript');
    }

    return { result: await this._serializeCdpObject(result) };
  }
}
