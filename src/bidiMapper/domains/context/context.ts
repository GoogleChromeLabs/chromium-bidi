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
import { NoSuchFrameException } from '../protocol/error';
import { CdpClient } from '../../../cdp';
import { IContext } from './iContext';

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
}
