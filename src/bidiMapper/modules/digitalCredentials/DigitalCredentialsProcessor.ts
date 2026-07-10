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
  DigitalCredentials,
} from '../../../protocol/protocol.js';
import type {ContextConfigStorage} from '../browser/ContextConfigStorage.js';
import type {CdpTarget} from '../cdp/CdpTarget.js';
import type {BrowsingContextStorage} from '../context/BrowsingContextStorage.js';
import type {BrowsingContextImpl} from '../context/BrowsingContextImpl.js';

type Behavior = Omit<
  DigitalCredentials.SetVirtualWalletBehaviorParameters,
  'context'
>;

export class DigitalCredentialsProcessor {
  readonly #browsingContextStorage: BrowsingContextStorage;
  readonly #contextConfigStorage: ContextConfigStorage;

  constructor(
    browsingContextStorage: BrowsingContextStorage,
    contextConfigStorage: ContextConfigStorage,
  ) {
    this.#browsingContextStorage = browsingContextStorage;
    this.#contextConfigStorage = contextConfigStorage;
  }

  async setVirtualWalletBehavior(
    params: DigitalCredentials.SetVirtualWalletBehaviorParameters,
  ): Promise<EmptyResult> {
    const {context, action, protocol, response} = params;

    if (action === DigitalCredentials.VirtualWalletAction.Respond) {
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
      if (action === DigitalCredentials.VirtualWalletAction.Clear) {
        this.#contextConfigStorage.updateGlobalConfig({
          digitalCredentialsBehavior: null,
        });
      } else {
        this.#contextConfigStorage.updateGlobalConfig({
          digitalCredentialsBehavior: {action, protocol, response},
        });
      }
    } else {
      if (action === DigitalCredentials.VirtualWalletAction.Clear) {
        this.#contextConfigStorage.updateBrowsingContextConfig(context, {
          digitalCredentialsBehavior: null,
        });
      } else {
        this.#contextConfigStorage.updateBrowsingContextConfig(context, {
          digitalCredentialsBehavior: {action, protocol, response},
        });
      }
    }

    await this.#applyBehavior();

    return {};
  }

  #resolveBehavior(contextId: string): Behavior | null | undefined {
    const config =
      this.#contextConfigStorage.getBrowsingContextConfig(contextId);
    if (config?.digitalCredentialsBehavior !== undefined) {
      return config.digitalCredentialsBehavior;
    }

    const context = this.#browsingContextStorage.findContext(contextId);
    if (context) {
      const userContextConfig = this.#contextConfigStorage.getUserContextConfig(
        context.userContext,
      );
      if (userContextConfig?.digitalCredentialsBehavior !== undefined) {
        return userContextConfig.digitalCredentialsBehavior;
      }
    }

    const globalConfig = this.#contextConfigStorage.getGlobalConfig();
    return globalConfig.digitalCredentialsBehavior;
  }

  async #applyBehavior() {
    const contexts = this.#browsingContextStorage.getAllContexts();
    await Promise.all(
      contexts.map((context) => this.#applyBehaviorToContext(context)),
    );
  }

  async #applyBehaviorToContext(context: BrowsingContextImpl) {
    const behavior = this.#resolveBehavior(context.id);
    await this.#sendCdpCommand(context.cdpTarget, context.id, behavior);
  }

  async #sendCdpCommand(
    cdpTarget: CdpTarget,
    frameId: string,
    behavior: Behavior | null | undefined,
  ) {
    const action =
      behavior?.action ?? DigitalCredentials.VirtualWalletAction.Clear;
    const protocol = behavior?.protocol;
    const response = behavior?.response;

    try {
      await cdpTarget.cdpClient.sendCommand(
        'DigitalCredentials.setVirtualWalletBehavior',
        {
          action,
          protocol,
          response,
          frameId,
        },
      );
    } catch {
      // Ignore errors if the target is closed or command not supported
    }
  }
}
