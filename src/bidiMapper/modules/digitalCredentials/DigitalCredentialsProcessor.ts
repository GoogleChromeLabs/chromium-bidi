/**
 * Copyright 2026 Google LLC.
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

import {
  InvalidArgumentException,
  type EmptyResult,
  type DigitalCredentials,
} from '../../../protocol/protocol.js';
import type {CdpTarget} from '../cdp/CdpTarget.js';
import {BrowsingContextImpl} from '../context/BrowsingContextImpl.js';
import type {BrowsingContextStorage} from '../context/BrowsingContextStorage.js';

type Behavior = Omit<
  DigitalCredentials.SetVirtualWalletBehaviorParameters,
  'context'
>;

export class DigitalCredentialsProcessor {
  readonly #browsingContextStorage: BrowsingContextStorage;
  #defaultBehavior: Behavior | undefined = undefined;
  readonly #contextBehaviors = new Map<string, Behavior>();
  readonly #appliedTargets = new WeakSet<CdpTarget>();

  constructor(browsingContextStorage: BrowsingContextStorage) {
    this.#browsingContextStorage = browsingContextStorage;
  }

  async setVirtualWalletBehavior(
    params: DigitalCredentials.SetVirtualWalletBehaviorParameters,
  ): Promise<EmptyResult> {
    const {context, action, protocol, response} = params;

    if (action === 'respond') {
      if (protocol === undefined || response === undefined) {
        throw new InvalidArgumentException(
          "Protocol and response are required when action is 'respond'",
        );
      }
    } else {
      if (protocol !== undefined || response !== undefined) {
        throw new InvalidArgumentException(
          "Protocol and response are only allowed when action is 'respond'",
        );
      }
    }

    if (context === undefined) {
      if (action === 'clear') {
        this.#defaultBehavior = undefined;
      } else {
        this.#defaultBehavior = {action, protocol, response};
      }
    } else {
      if (action === 'clear') {
        this.#contextBehaviors.delete(context);
      } else {
        this.#contextBehaviors.set(context, {action, protocol, response});
      }
    }

    await this.#applyToAllTargets();

    return {};
  }

  async applyBehavior(browsingContext: BrowsingContextImpl) {
    try {
      await this.#applyBehaviorToTarget(browsingContext.cdpTarget);
    } catch {
      // Ignore errors, as the target might not support the DigitalCredentials domain
      // (e.g. if the browser version is too old).
    }
  }

  async #applyToAllTargets() {
    const contexts = this.#browsingContextStorage.getAllContexts();
    const targets = new Set<CdpTarget>();
    for (const c of contexts) {
      targets.add(c.cdpTarget);
    }

    await Promise.all(
      Array.from(targets).map((target) => this.#applyBehaviorToTarget(target)),
    );
  }

  async #applyBehaviorToTarget(target: CdpTarget) {
    const contexts = this.#browsingContextStorage
      .getAllContexts()
      .filter((c) => c.cdpTarget === target);
    if (contexts.length === 0) {
      return;
    }

    let chosenBehavior: Behavior | undefined = undefined;
    for (const context of contexts) {
      const behavior = this.#getBehaviorForContext(context);
      if (behavior !== undefined) {
        chosenBehavior = behavior;
        break;
      }
    }

    const behaviorToApply = chosenBehavior ?? this.#defaultBehavior;
    if (behaviorToApply === undefined) {
      if (this.#appliedTargets.has(target)) {
        await this.#sendCdpCommand(target, {action: 'clear'});
        this.#appliedTargets.delete(target);
      }
      return;
    }

    await this.#sendCdpCommand(target, behaviorToApply);
    this.#appliedTargets.add(target);
  }

  #getBehaviorForContext(context: BrowsingContextImpl): Behavior | undefined {
    let current: BrowsingContextImpl | null = context;
    while (current !== null) {
      const behavior = this.#contextBehaviors.get(current.id);
      if (behavior !== undefined) {
        return behavior;
      }
      current = current.parentId
        ? this.#browsingContextStorage.getContext(current.parentId)
        : null;
    }
    return undefined;
  }

  async #sendCdpCommand(cdpTarget: CdpTarget, behavior: Behavior) {
    // @ts-expect-error: DigitalCredentials.setVirtualWalletBehavior is not yet in devtools-protocol
    await cdpTarget.cdpClient.sendCommand('DigitalCredentials.setVirtualWalletBehavior', {
      action: behavior.action,
      behavior: behavior.action,
      protocol: behavior.protocol,
      response: behavior.response,
    });
  }
}
