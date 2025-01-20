/**
 * Copyright 2025 Google LLC.
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

/*
 * Copyright 2023 Google LLC.
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
  InvalidWebExtensionException,
  type WebExtension,
} from '../../../protocol/protocol.js';

/**
 * Responsible for handling the `storage` module.
 */
export class WebExtensionProcessor {
  readonly #browserCdpClient: CdpClient;

  constructor(browserCdpClient: CdpClient) {
    this.#browserCdpClient = browserCdpClient;
  }

  async install(
    params: WebExtension.InstallParameters,
  ): Promise<WebExtension.InstallResult> {
    try {
      const response = await this.#browserCdpClient.sendCommand(
        'Extensions.loadUnpacked',
        {
          path: (params.extensionData as WebExtension.ExtensionArchivePath)
            .path,
        },
      );
      return {
        extension: response.id,
      };
    } catch (err: any) {
      throw new InvalidWebExtensionException(err.toString());
    }
  }
}
