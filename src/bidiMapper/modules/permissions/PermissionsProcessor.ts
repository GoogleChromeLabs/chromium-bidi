/**
 * Copyright 2024 Google LLC.
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

import type {CdpClient} from '../../../cdp/CdpClient.js';
import {
  InvalidArgumentException,
  type EmptyResult,
  type Permissions,
} from '../../../protocol/protocol.js';

export class PermissionsProcessor {
  #browserCdpClient: CdpClient;

  constructor(browserCdpClient: CdpClient) {
    this.#browserCdpClient = browserCdpClient;
  }

  async setPermissions(
    params: Permissions.SetPermissionParameters,
  ): Promise<EmptyResult> {
    try {
      const userContextId =
        (params as {'goog:userContext'?: string})['goog:userContext'] ||
        params.userContext;
      await this.#browserCdpClient.sendCommand('Browser.setPermission', {
        origin: params.origin,
        embeddingOrigin:
          params.topLevelOrigin ? params.topLevelOrigin : undefined,
        browserContextId:
          userContextId && userContextId !== 'default'
            ? userContextId
            : undefined,
        permission: {
          name: params.descriptor.name,
        },
        setting: params.state,
      });
    } catch (err) {
      if (
        (err as Error).message ===
        `Permission can't be granted to opaque origins.`
      ) {
        // Return success if the origin is not valid (does not match any
        // existing origins).
        return {};
      }
      throw new InvalidArgumentException((err as Error).message);
    }
    return {};
  }
}
