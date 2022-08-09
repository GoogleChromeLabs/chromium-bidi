/**
 * Copyright 2022 Google LLC.
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
import { BrowsingContext, Script } from '../protocol/bidiProtocolTypes';
import { NoSuchFrameException, UnknownErrorResponse } from '../protocol/error';
import { CdpClient } from '../../../cdp';
import { Deferred } from '../../utils/deferred';
import { IEventManager } from '../events/EventManager';
import { IContext } from './iContext';
import { ContextImpl } from './contextImpl';

export abstract class Context {
  static #contexts: Map<string, IContext> = new Map();

  public static getTopLevelContexts(): IContext[] {
    return Array.from(Context.#contexts.values()).filter(
      (c) => c.parentId === null
    );
  }

  public static removeContext(contextId: string) {
    Context.#contexts.delete(contextId);
  }

  public static registerContext(context: IContext) {
    Context.#contexts.set(context.contextId, context);
    if (context.parentId !== null) {
      Context.getKnownContext(context.parentId).addChild(context);
    }
  }

  public static hasKnownContext(contextId: string): boolean {
    return Context.#contexts.has(contextId);
  }

  public static getKnownContext(contextId: string): IContext {
    if (!Context.hasKnownContext(contextId)) {
      throw new NoSuchFrameException(`Context ${contextId} not found`);
    }
    return Context.#contexts.get(contextId)!;
  }

  public static async getDocumentId(
    contextId: string,
    cdpClient: CdpClient
  ): Promise<string | null> {
    const c = await cdpClient.Page.getFrameTree();
    const getLoaderId: (
      frameId: string,
      frameTree: Protocol.Page.FrameTree
    ) => string | null = (
      frameId: string,
      frameTree: Protocol.Page.FrameTree
    ) => {
      if (frameTree.frame.id === frameId) {
        return frameTree.frame.loaderId;
      }
      if (!frameTree.childFrames) {
        return null;
      }
      for (let child of frameTree.childFrames) {
        const maybeLoaderId = getLoaderId(frameId, child);
        if (maybeLoaderId) {
          return maybeLoaderId;
        }
      }
      return null;
    };

    return getLoaderId(contextId, c.frameTree);
  }

  // readonly #targetDeferres = {
  //   Page: {
  //     navigatedWithinDocument:
  //       new Deferred<Protocol.Page.NavigatedWithinDocumentEvent>(),
  //     lifecycleEvent: {
  //       DOMContentLoaded: new Deferred<Protocol.Page.LifecycleEventEvent>(),
  //       load: new Deferred<Protocol.Page.LifecycleEventEvent>(),
  //     },
  //   },
  // };
  //
  // protected readonly cdpClient: CdpClient;
  // initialized: Deferred<void> = new Deferred<void>();
  // documentId: string | null = null;
  // readonly #contextId: string;
  // readonly #sessionId: string;
  // readonly #parentId: string | null;
  // readonly #childrenIds: Set<string> = new Set();
  // #url: string = 'about:blank';
  //
  // public getContextId = (): string => this.#contextId;
  // public getChildren = (): IContext[] =>
  //   Array.from(this.#childrenIds).map((contextId) =>
  //     Context.getKnownContext(contextId)
  //   );
  // public getSessionId = (): string => this.#sessionId;
  // public getParentId = (): string | null => this.#parentId;
  // public getUrl = (): string | null => this.#url;
  // public eventManager: IEventManager;
  //
  // public setUrl(url: string) {
  //   this.#url = url;
  // }
  //
  // public addChild(child: Context) {
  //   this.#childrenIds.add(child.getContextId());
  // }
  //
  // protected constructor(
  //   contextId: string,
  //   loaderId: string | null,
  //   parent: string | null,
  //   sessionId: string,
  //   cdpClient: CdpClient,
  //   eventManager: IEventManager
  // ) {
  //   this.#contextId = contextId;
  //   this.#parentId = parent;
  //   this.#sessionId = sessionId;
  //   this.cdpClient = cdpClient;
  //   this.eventManager = eventManager;
  //
  //   this.#setCdpListeners();
  // }
  //
  // #setCdpListeners() {
  //   this.cdpClient.Page.on(
  //     'lifecycleEvent',
  //     (params: Protocol.Page.LifecycleEventEvent) => {
  //       if (params.name == 'init') {
  //         this.documentId = params.loaderId;
  //
  //         if (
  //           !this.#targetDeferres.Page.lifecycleEvent.DOMContentLoaded
  //             .isFinished
  //         ) {
  //           this.#targetDeferres.Page.lifecycleEvent.DOMContentLoaded.reject(
  //             'Page re-initialized'
  //           );
  //         }
  //         this.#targetDeferres.Page.lifecycleEvent.DOMContentLoaded =
  //           new Deferred<Protocol.Page.LifecycleEventEvent>();
  //
  //         if (!this.#targetDeferres.Page.lifecycleEvent.load.isFinished) {
  //           this.#targetDeferres.Page.lifecycleEvent.load.reject(
  //             'Page re-initialized'
  //           );
  //         }
  //         this.#targetDeferres.Page.lifecycleEvent.load =
  //           new Deferred<Protocol.Page.LifecycleEventEvent>();
  //
  //         if (!this.#targetDeferres.Page.navigatedWithinDocument.isFinished) {
  //           this.#targetDeferres.Page.navigatedWithinDocument.reject(
  //             'Page re-initialized'
  //           );
  //         }
  //         this.#targetDeferres.Page.navigatedWithinDocument =
  //           new Deferred<Protocol.Page.NavigatedWithinDocumentEvent>();
  //
  //         this.initialized.resolve();
  //         return;
  //       }
  //
  //       if (params.loaderId !== this.documentId) {
  //         return;
  //       }
  //
  //       if (params.name === 'DOMContentLoaded') {
  //         this.#targetDeferres.Page.lifecycleEvent.DOMContentLoaded.resolve(
  //           params
  //         );
  //
  //         this.eventManager.sendEvent(
  //           new BrowsingContext.DomContentLoadedEvent({
  //             context: this.#contextId,
  //             navigation: params.loaderId,
  //           }),
  //           this.#contextId
  //         );
  //       }
  //       if (params.name === 'load') {
  //         this.#targetDeferres.Page.lifecycleEvent.load.resolve(params);
  //
  //         this.eventManager.sendEvent(
  //           new BrowsingContext.LoadEvent({
  //             context: this.#contextId,
  //             navigation: params.loaderId,
  //           }),
  //           this.#contextId
  //         );
  //       }
  //     }
  //   );
  //
  //   this.cdpClient.Page.on(
  //     'navigatedWithinDocument',
  //     (params: Protocol.Page.NavigatedWithinDocumentEvent) => {
  //       if (params.frameId !== this.getContextId()) {
  //         return;
  //       }
  //       this.#targetDeferres.Page.navigatedWithinDocument.resolve(params);
  //       this.#targetDeferres.Page.navigatedWithinDocument = new Deferred();
  //     }
  //   );
  // }
  //
  // abstract callFunction(
  //   functionDeclaration: string,
  //   _this: Script.ArgumentValue,
  //   _arguments: Script.ArgumentValue[],
  //   awaitPromise: boolean,
  //   resultOwnership: Script.OwnershipModel
  // ): Promise<Script.CallFunctionResult>;
  //
  // abstract scriptEvaluate(
  //   expression: string,
  //   awaitPromise: boolean,
  //   resultOwnership: Script.OwnershipModel
  // ): Promise<Script.EvaluateResult>;
  //
  // async waitInitialized(): Promise<void> {
  //   await this.initialized;
  // }
  //
  // public serializeToBidiValue(
  //   maxDepth: number,
  //   isRoot: boolean
  // ): BrowsingContext.Info {
  //   return {
  //     context: this.#contextId,
  //     url: this.#url,
  //     children:
  //       maxDepth > 0
  //         ? this.getChildren().map((c) =>
  //             c.serializeToBidiValue(maxDepth - 1, false)
  //           )
  //         : null,
  //     ...(isRoot ? { parent: this.#parentId } : {}),
  //   };
  // }
  //
  // public async findElement(
  //   selector: string
  // ): Promise<BrowsingContext.PROTO.FindElementResult> {
  //   const functionDeclaration = String((resultsSelector: string) =>
  //     document.querySelector(resultsSelector)
  //   );
  //   const _arguments: Script.ArgumentValue[] = [
  //     { type: 'string', value: selector },
  //   ];
  //
  //   // TODO(sadym): handle not found exception.
  //   const result = await this.callFunction(
  //     functionDeclaration,
  //     {
  //       type: 'undefined',
  //     },
  //     _arguments,
  //     true,
  //     'root'
  //   );
  //
  //   // TODO(sadym): handle type properly.
  //   return result as any as BrowsingContext.PROTO.FindElementResult;
  // }
  //
  // public async navigate(
  //   url: string,
  //   wait: BrowsingContext.ReadinessState
  // ): Promise<BrowsingContext.NavigateResult> {
  //   await this.waitInitialized();
  //   this.initialized = new Deferred<void>();
  //
  //   // TODO: handle loading errors.
  //   const cdpNavigateResult = await this.cdpClient.Page.navigate({
  //     url,
  //     frameId: this.getContextId(),
  //   });
  //
  //   if (cdpNavigateResult.errorText) {
  //     throw new UnknownErrorResponse(cdpNavigateResult.errorText);
  //   }
  //
  //   // Wait for `wait` condition.
  //   switch (wait) {
  //     case 'none':
  //       break;
  //
  //     case 'interactive':
  //       // No `loaderId` means same-document navigation.
  //       if (cdpNavigateResult.loaderId === undefined) {
  //         await this.#targetDeferres.Page.navigatedWithinDocument;
  //       } else {
  //         await this.#targetDeferres.Page.lifecycleEvent.DOMContentLoaded;
  //       }
  //       break;
  //
  //     case 'complete':
  //       // No `loaderId` means same-document navigation.
  //       if (cdpNavigateResult.loaderId === undefined) {
  //         await this.#targetDeferres.Page.navigatedWithinDocument;
  //       } else {
  //         await this.#targetDeferres.Page.lifecycleEvent.load;
  //       }
  //       break;
  //
  //     default:
  //       throw new Error(`Not implemented wait '${wait}'`);
  //   }
  //
  //   return {
  //     result: {
  //       navigation: cdpNavigateResult.loaderId || null,
  //       url: url,
  //     },
  //   };
  // }
  //
  // static async #waitForDeferredWithKey<T>(
  //   key: string,
  //   map: Map<string, Deferred<T>>
  // ): Promise<T> {
  //   if (!map.has(key)) {
  //     map.set(key, new Deferred<T>());
  //   }
  //   return map.get(key)!;
  // }
}
