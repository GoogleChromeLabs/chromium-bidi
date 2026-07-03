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
import type {BrowsingContextStorage} from '../context/BrowsingContextStorage.js';

export class DigitalCredentialsProcessor {
  readonly #browsingContextStorage: BrowsingContextStorage;
  #defaultBehavior:
    | Omit<DigitalCredentials.SetVirtualWalletBehaviorParameters, 'context'>
    | undefined = undefined;

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

      const contexts = this.#browsingContextStorage.getAllContexts();
      const targets = new Set<CdpTarget>();
      for (const c of contexts) {
        targets.add(c.cdpTarget);
      }

      await Promise.all(
        Array.from(targets).map((target) =>
          this.#sendCdpCommand(target, {action, protocol, response}),
        ),
      );
    } else {
      const browsingContext = this.#browsingContextStorage.getContext(context);
      await this.#sendCdpCommand(browsingContext.cdpTarget, {
        action,
        protocol,
        response,
      });
    }

    return {};
  }

  async onCdpTargetCreated(cdpTarget: CdpTarget, targetType?: string) {
    if (
      targetType !== undefined &&
      targetType !== 'page' &&
      targetType !== 'iframe'
    ) {
      return;
    }

    if (this.#defaultBehavior !== undefined) {
      try {
        await this.#sendCdpCommand(cdpTarget, this.#defaultBehavior);
      } catch {
        // Ignore errors, as the target might not support the DigitalCredentials domain
        // (e.g. if it's a worker).
      }
    }
  }

  async #sendCdpCommand(
    cdpTarget: CdpTarget,
    behavior: Omit<
      DigitalCredentials.SetVirtualWalletBehaviorParameters,
      'context'
    >,
  ) {
    // @ts-expect-error: DigitalCredentials.setVirtualWalletBehavior is not yet in devtools-protocol
    await cdpTarget.cdpClient.sendCommand(
      'DigitalCredentials.setVirtualWalletBehavior',
      {
        action: behavior.action,
        behavior: behavior.action,
        protocol: behavior.protocol,
        response: behavior.response,
      },
    );
  }
}
