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
import { Context } from './context';
import { BrowsingContext, Script } from '../protocol/bidiProtocolTypes';
import { UnknownErrorResponse } from '../protocol/error';

export class FrameContext extends Context {
  readonly #contextId: string;

  private constructor(params: Protocol.Page.FrameAttachedEvent) {
    super();
    this.#contextId = params.frameId;
  }

  public static async create(
    params: Protocol.Page.FrameAttachedEvent
  ): Promise<FrameContext> {
    return new FrameContext(params);

    // TODO(sadym): Add `Page.frameNavigated` handler.
  }

  callFunction(
    functionDeclaration: string,
    _this: Script.ArgumentValue,
    _arguments: Script.ArgumentValue[],
    awaitPromise: boolean
  ): Promise<Script.CallFunctionResult> {
    throw new UnknownErrorResponse('Not implemented');
  }

  getSessionId(): string {
    throw new UnknownErrorResponse('Not implemented');
  }

  get id(): string {
    return this.#contextId;
  }

  navigate(
    url: string,
    wait: BrowsingContext.ReadinessState
  ): Promise<BrowsingContext.NavigateResult> {
    throw new UnknownErrorResponse('Not implemented');
  }

  scriptEvaluate(
    expression: string,
    awaitPromise: boolean
  ): Promise<Script.EvaluateResult> {
    throw new UnknownErrorResponse('Not implemented');
  }

  serializeToBidiValue(): BrowsingContext.Info {
    return {
      context: this.#contextId,
      parent: 'NOT_IMPLEMENTED',
      url: 'NOT_IMPLEMENTED',
      children: [],
    };
  }
}
