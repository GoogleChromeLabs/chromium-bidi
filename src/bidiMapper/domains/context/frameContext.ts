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
import { CdpClient } from '../../../cdp';

export class FrameContext extends Context {
  readonly #cdpClient: CdpClient;

  private constructor(
    params: Protocol.Page.FrameAttachedEvent,
    sessionId: string,
    cdpClient: CdpClient
  ) {
    super(params.frameId, params.parentFrameId, sessionId);
    this.#cdpClient = cdpClient;
  }

  public static async create(
    params: Protocol.Page.FrameAttachedEvent,
    sessionId: string,
    cdpClient: CdpClient
  ): Promise<FrameContext> {
    const context = new FrameContext(params, sessionId, cdpClient);

    // TODO(sadym): Add `Page.frameNavigated` handler.
    context.#initializeEventListeners();
    return context;
  }

  callFunction(
    functionDeclaration: string,
    _this: Script.ArgumentValue,
    _arguments: Script.ArgumentValue[],
    awaitPromise: boolean
  ): Promise<Script.CallFunctionResult> {
    throw new UnknownErrorResponse('Not implemented');
  }

  public async navigate(
    url: string,
    wait: BrowsingContext.ReadinessState
  ): Promise<BrowsingContext.NavigateResult> {
    // TODO: handle loading errors.
    const cdpNavigateResult = await this.#cdpClient.Page.navigate({
      url,
      frameId: this.getContextId(),
    });

    // No `loaderId` means same-document navigation.
    if (cdpNavigateResult.loaderId !== undefined) {
      // Wait for `wait` condition.
      switch (wait) {
        case 'none':
          break;

        case 'interactive':
          await this.#waitPageLifeCycleEvent(
            'DOMContentLoaded',
            cdpNavigateResult.loaderId!
          );
          break;

        case 'complete':
          await this.#waitPageLifeCycleEvent(
            'load',
            cdpNavigateResult.loaderId!
          );
          break;

        default:
          throw new Error(`Not implemented wait '${wait}'`);
      }
    }

    return {
      result: {
        navigation: cdpNavigateResult.loaderId || null,
        url: url,
      },
    };
  }

  scriptEvaluate(
    expression: string,
    awaitPromise: boolean
  ): Promise<Script.EvaluateResult> {
    throw new UnknownErrorResponse('Not implemented');
  }

  #initializeEventListeners() {
    this.#cdpClient.Page.on(
      'frameNavigated',
      (params: Protocol.Page.FrameNavigatedEvent) => {
        const frame = params.frame;
        if (params.frame.id === this.getContextId()) {
          this.setUrl(frame.url);
        }
      }
    );
  }

  async #waitPageLifeCycleEvent(eventName: string, loaderId: string) {
    return new Promise<Protocol.Page.LifecycleEventEvent>((resolve) => {
      const handleLifecycleEvent = async (
        params: Protocol.Page.LifecycleEventEvent
      ) => {
        if (params.name !== eventName || params.loaderId !== loaderId) {
          return;
        }
        this.#cdpClient.Page.removeListener(
          'lifecycleEvent',
          handleLifecycleEvent
        );
        resolve(params);
      };

      this.#cdpClient.Page.on('lifecycleEvent', handleLifecycleEvent);
    });
  }
}
