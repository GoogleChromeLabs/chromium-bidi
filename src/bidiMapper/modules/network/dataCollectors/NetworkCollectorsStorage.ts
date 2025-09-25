/*
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

import {NoSuchNetworkCollectorException} from '../../../../protocol/ErrorResponse.js';
import type {
  Browser,
  BrowsingContext,
  Network,
} from '../../../../protocol/generated/webdriver-bidi.js';
import {EventEmitter} from '../../../../utils/EventEmitter.js';
import {type LoggerFn, LogType} from '../../../../utils/log.js';
import type {NetworkRequest} from '../NetworkRequest.js';

import {NetworkCollector, type RequestDisowned} from './NetworkCollector.js';

export class NetworkCollectorsStorage extends EventEmitter<RequestDisowned> {
  readonly #collectors = new Map<string, NetworkCollector>();
  // Lookup map to speed up `isCollected`.
  readonly #collectedRequests = new Map<
    Network.Request,
    Set<NetworkCollector>
  >();
  readonly #logger?: LoggerFn;

  constructor(logger?: LoggerFn) {
    super();
    this.#logger = logger;
  }

  addDataCollector(params: Network.AddDataCollectorParameters) {
    const collector = new NetworkCollector(params, this.#logger);
    collector.on('requestDisowned', (requestId) => {
      this.#collectedRequests.get(requestId)?.delete(collector);
      if (!this.isCollected(requestId)) {
        this.#logger?.(
          LogType.debug,
          `Request ${requestId} is not owned anymore.`,
        );
        this.emit('requestDisowned', requestId);
        this.#collectedRequests.delete(requestId);
      }
    });
    this.#collectors.set(collector.id, collector);
    return collector.id;
  }

  #getCollectors(
    requestId: Network.Request,
    collectorId?: string,
  ): NetworkCollector[] {
    if (collectorId !== undefined) {
      if (!this.#collectors.has(collectorId)) {
        throw new NoSuchNetworkCollectorException(
          `Unknown collector ${collectorId}`,
        );
      }
      return [this.#collectors.get(collectorId)!];
    }
    return [...(this.#collectedRequests.get(requestId)?.values() ?? [])];
  }

  isCollected(requestId: Network.Request, collectorId?: string): boolean {
    for (const collector of this.#getCollectors(requestId, collectorId)) {
      if (collector.isCollected(requestId)) {
        return true;
      }
    }

    return false;
  }

  disown(requestId: Network.Request, collectorId?: string) {
    for (const collector of this.#getCollectors(requestId, collectorId)) {
      collector.disown(requestId);
    }
  }

  collectIfNeeded(
    request: NetworkRequest,
    topLevelBrowsingContext: BrowsingContext.BrowsingContext,
    userContext: Browser.UserContext,
  ) {
    const affectedCollectors = [];
    for (const collector of this.#collectors.values()) {
      if (collector.shouldCollect(topLevelBrowsingContext, userContext)) {
        collector.collect(request);

        if (!this.#collectedRequests.has(request.id)) {
          this.#collectedRequests.set(request.id, new Set());
        }
        this.#collectedRequests.get(request.id)?.add(collector);
        affectedCollectors.push(collector);

        this.#logger?.(
          LogType.debug,
          `Request ${request.id} collected by ${collector.id}`,
        );
      }
    }

    // Free up affected collectors only after all the collectors collected the request.
    // Otherwise, request can be falsy claimed as not collected and removed before another
    // collector collected it.
    for (const collector of affectedCollectors) {
      // Free up.
      collector.freeUp();
    }
  }

  removeDataCollector(collectorId: Network.Collector) {
    if (!this.#collectors.has(collectorId)) {
      throw new NoSuchNetworkCollectorException(
        `Collector ${collectorId} does not exist`,
      );
    }
    const collector = this.#collectors.get(collectorId)!;
    collector.dispose();
    // TODO: collector.off('requestDisowned', ...);
    this.#collectors.delete(collectorId);
  }
}
