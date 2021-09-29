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
import { CdpClient } from '../../../cdp';
import { Script, CommonDataTypes } from '../../bidiProtocolTypes';

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

  /**
   * Serializes a given CDP object into BiDi, keeping references in the
   * target's `globalThis`.
   * @param cdpObject CDP remote object to be serialized.
   */
  private async _serializeCdpObject(
    cdpObject: Protocol.Runtime.RemoteObject
  ): Promise<CommonDataTypes.RemoteValue> {
    // TODO sadym: `dummyContextObject` needed for the running context.
    // Find a way to use the proper `executionContextId` instead.
    const dummyContextObject = await this._cdpClient.Runtime.evaluate({
      expression: '(()=>{return {}})()',
    });

    const response = await this._cdpClient.Runtime.callFunctionOn({
      functionDeclaration: `${EVALUATOR_SCRIPT}.serialize`,
      objectId: dummyContextObject.result.objectId,
      arguments: [cdpObject],
      returnByValue: true,
    });

    if (response.exceptionDetails)
      // Serialisation failed unexpectidely.
      throw new Error(
        'Cannot serialize object: ' + response.exceptionDetails.text
      );

    return response.result.value;
  }

  public async evaluateScript(
    script: string
  ): Promise<Script.ScriptEvaluateResult> {
    // Evaluate works with 2 DP calls:
    // 1. Evaluates the script;
    // 2. serializes the result or exception.
    // This needed to provide a detailed stacktrace in case of not `Error` but
    // anything else wihtout`stacktrace` is thrown. To provide the stacktrace,
    // CDP domains `Debugger` and`Runtime` should be enabled.
    await this._cdpClient.Debugger.enable({});
    await this._cdpClient.Runtime.enable();

    const expression = script;
    const cdpEvaluateResult = await this._cdpClient.Runtime.evaluate({
      expression,
      returnByValue: false,
    });
    // const { result, exceptionDetails } = await this._cdpClient.Runtime.evaluate(
    //   {
    //     expression,
    //     returnByValue: false,
    //   }
    // );

    // Serialize exception details.
    if (cdpEvaluateResult.exceptionDetails) {
      const callFrames =
        cdpEvaluateResult.exceptionDetails.stackTrace?.callFrames.map(
          (frame) => ({
            url: frame.url,
            functionName: frame.functionName,
            lineNumber: frame.lineNumber,
            columnNumber: frame.columnNumber,
          })
        );
      const exception = await this._serializeCdpObject(
        // Exception should always be there.
        cdpEvaluateResult.exceptionDetails.exception!
      );

      return {
        exceptionDetails: {
          exception,
          columnNumber: cdpEvaluateResult.exceptionDetails.columnNumber,
          lineNumber: cdpEvaluateResult.exceptionDetails.lineNumber,
          stackTrace: {
            callFrames: callFrames || [],
          },
          text: cdpEvaluateResult.exceptionDetails.text,
        },
      };
    }

    return {
      result: await this._serializeCdpObject(cdpEvaluateResult.result),
    };
  }
}
