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

import type {Speculation} from '../../../protocol/generated/webdriver-bidi-speculation.js';
import {
  type EmptyResult,
  InvalidArgumentException,
} from '../../../protocol/protocol.js';
import type {CdpTarget} from '../cdp/CdpTarget.js';
import type {BrowsingContextStorage} from '../context/BrowsingContextStorage.js';
import type {EventManager} from '../session/EventManager.js';

/** Represents a prefetch request with its status. */
class PrefetchRequest {
  readonly url: string;
  readonly initiatingFrameId: number;
  status: Speculation.PrefetchStatus;

  constructor(
    url: string,
    initiatingFrameId: number,
    status: Speculation.PrefetchStatus,
  ) {
    this.url = url;
    this.initiatingFrameId = initiatingFrameId;
    this.status = status;
  }
}

export class SpeculationProcessor {
  #eventManager: EventManager;
  #browsingContextStorage: BrowsingContextStorage;
  // A map from URL to its PrefetchRequest object.
  #prefetchRequests = new Map<string, PrefetchRequest>();

  constructor(
    eventManager: EventManager,
    browsingContextStorage: BrowsingContextStorage,
  ) {
    this.#eventManager = eventManager;
    this.#browsingContextStorage = browsingContextStorage;
  }

  #getPrefetchRequest(url: string): PrefetchRequest {
    const request = this.#prefetchRequests.get(url);
    if (!request) {
      throw new InvalidArgumentException(
        `Prefetch request for URL ${url} does not exist`,
      );
    }
    return request;
  }

  /**
   * Simulates a prefetch request status update.
   * This method would typically be called by CDP events when they become available.
   *
   * Note: Currently, preload.prefetchStatusUpdated events are not fully supported
   * in the ChromiumBidi event system. This method is prepared for when the proper
   * event handling is implemented.
   */
  #updatePrefetchStatus(
    cdpTarget: CdpTarget,
    url: string,
    initiatingFrameId: number,
    status: Speculation.PrefetchStatus,
  ): void {
    // Update or create the prefetch request
    const existingRequest = this.#prefetchRequests.get(url);
    if (existingRequest) {
      existingRequest.status = status;
    } else {
      this.#prefetchRequests.set(
        url,
        new PrefetchRequest(url, initiatingFrameId, status),
      );
    }

    // TODO: Emit the prefetchStatusUpdated event when event system supports it
    // When preload events are supported, this should emit:
    this.#eventManager.registerEvent(
      {
        type: 'event',
        method: 'speculation.prefetchStatusUpdated',
        params: {
          context: cdpTarget.id,
          initiatingFrameId,
          url,
          status,
        },
      },
      cdpTarget.id,
    );
  }

  /**
   * Handles CDP target creation and sets up event listeners.
   * When CDP events for speculation rules become available, this method
   * should register listeners for those events.
   */
  onCdpTargetCreated(cdpTarget: CdpTarget): void {
    // Register CDP event listener for Preload.prefetchStatusUpdated
    cdpTarget.cdpClient.on('Preload.prefetchStatusUpdated', (event) => {
      this.#updatePrefetchStatus(
        cdpTarget,
        event.key.url,
        parseInt(event.key.loaderId, 10), // Convert string to number
        event.status as Speculation.PrefetchStatus,
      );
    });
  }

  /**
   * Manually trigger a prefetch status update event.
   * This can be used for testing or when CDP events are not yet available.
   */
  simulatePrefetchStatusUpdate(params: {
    context: string;
    url: string;
    initiatingFrameId: number;
    status: Speculation.PrefetchStatus;
  }): EmptyResult {
    const context = this.#browsingContextStorage.getContext(params.context);

    this.#updatePrefetchStatus(
      context.cdpTarget,
      params.url,
      params.initiatingFrameId,
      params.status,
    );

    return {};
  }

  /**
   * Get the current status of a prefetch request.
   */
  getPrefetchStatus(url: string): Speculation.PrefetchStatus {
    const request = this.#getPrefetchRequest(url);
    return request.status;
  }

  /**
   * Clear all prefetch request tracking.
   */
  clearPrefetchRequests(): void {
    this.#prefetchRequests.clear();
  }
}
