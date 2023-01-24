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

import {BrowsingContextImpl} from './browsingContextImpl.js';
import {Message} from '../../../protocol/protocol.js';

const contexts = new Map<string, BrowsingContextImpl>();

export function removeContext(contextId: string) {
  contexts.delete(contextId);
}

export function findContext(
  contextId: string
): BrowsingContextImpl | undefined {
  return contexts.get(contextId);
}

export function hasKnownContext(contextId: string): boolean {
  return contexts.has(contextId);
}

export function getTopLevelContexts(): BrowsingContextImpl[] {
  return Array.from(contexts.values()).filter((c) => c.parentId === null);
}

export function getKnownContext(contextId: string): BrowsingContextImpl {
  const result = findContext(contextId);
  if (result === undefined) {
    throw new Message.NoSuchFrameException(`Context ${contextId} not found`);
  }
  return result;
}

export function addContext(context: BrowsingContextImpl) {
  contexts.set(context.contextId, context);
  if (context.parentId !== null) {
    getKnownContext(context.parentId).addChild(context);
  }
}
