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

import type {CdpClient} from '../../../cdp/CdpClient.js';
import {
  type Autofill,
  type EmptyResult,
  NoSuchNodeException,
  UnsupportedOperationException,
} from '../../../protocol/protocol.js';
import type {BrowsingContextStorage} from '../context/BrowsingContextStorage.js';
import {parseSharedId} from '../script/SharedId.js';

/**
 * Responsible for handling the `autofill` module.
 */
export class AutofillProcessor {
  readonly #browsingContextStorage: BrowsingContextStorage;

  constructor(browsingContextStorage: BrowsingContextStorage) {
    this.#browsingContextStorage = browsingContextStorage;
  }

  /**
   * Triggers autofill for a specific element with the provided field data.
   *
   * @param params Parameters for the autofill.trigger command
   * @returns An empty result
   */
  async trigger(params: Autofill.TriggerParameters): Promise<EmptyResult> {
    try {
      // Get the browsing context from the parameters
      const context = this.#browsingContextStorage.getContext(params.context);

      // Parse the shared ID to get frame, document, and backend node ID
      const parsedSharedId = parseSharedId(params.element.sharedId);
      if (parsedSharedId === null) {
        throw new NoSuchNodeException(
          `SharedId "${params.element.sharedId}" was not found.`,
        );
      }

      const {frameId, documentId, backendNodeId} = parsedSharedId;

      // Assert that the frame matches the current context (if frameId is available)
      if (frameId !== undefined && frameId !== params.context) {
        throw new NoSuchNodeException(
          `SharedId "${params.element.sharedId}" belongs to different frame. Current frame is ${params.context}.`,
        );
      }

      // Assert that the document matches the current context's navigable ID
      if (context.navigableId !== documentId) {
        throw new NoSuchNodeException(
          `SharedId "${params.element.sharedId}" belongs to different document. Current document is ${context.navigableId}.`,
        );
      }

      // Cast to `any` as a temporary workaround for prototyping, since the TypeScript types
      // for CDP in "Chromium BiDi" aren't automatically updated with local changes.

      // Based on the Autofill.pdl definition, call the correct CDP method
      // The PDL shows: command trigger with fieldId as DOM.BackendNodeId

      // First, we need to enable the Autofill domain
      try {
        await context.cdpTarget.cdpClient.sendCommand('Autofill.enable');
      } catch (enableErr) {
        console.log('Failed to enable Autofill domain:', (enableErr as Error).message);
      }

      // Call the trigger method with the correct parameters from PDL
      await (context.cdpTarget.cdpClient as any).sendCommand('Autofill.trigger', {
        fieldId: backendNodeId, // DOM.BackendNodeId from parsed shared ID
        frameId: frameId, // Page.FrameId from parsed shared ID
        card: params.card,  // optional CreditCard
        address: params.address, // optional Address
      });

      return {};
    } catch (err) {
      if ((err as Error).message.includes('command was not found')) {
        throw new UnsupportedOperationException(
          'Autofill.trigger() is not supported by this browser',
        );
      }
      throw err;
    }
  }
}
