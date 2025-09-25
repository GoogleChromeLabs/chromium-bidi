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

import type {NetworkRequest} from './../NetworkRequest.js';
import {Collector} from './Collector.js';

interface RequestDisowned extends Record<string | symbol, unknown> {
  requestId: Network.Request;
}

export class CollectorsStorage extends EventEmitter<RequestDisowned> {
  readonly #collectors = new Map<string, Collector>();
  readonly #logger?: LoggerFn;

  constructor(logger?: LoggerFn) {
    super();
    this.#logger = logger;
  }

  addDataCollector(params: Network.AddDataCollectorParameters) {
    const collector = new Collector(params);
    this.#collectors.set(collector.id, collector);
    return collector.id;
  }

  #getCollectors(collectorId?: string): Collector[] {
    if (collectorId !== undefined) {
      if (!this.#collectors.has(collectorId)) {
        throw new NoSuchNetworkCollectorException(
          `Unknown collector ${collectorId}`,
        );
      }
      return [this.#collectors.get(collectorId)!];
    }
    return [...this.#collectors.values()];
  }

  isCollected(requestId: Network.Request, collectorId?: string): boolean {
    for (const collector of this.#getCollectors(collectorId)) {
      if (collector.isCollected(requestId)) {
        return true;
      }
    }

    return false;
  }

  disown(requestId: Network.Request, collectorId?: string) {
    for (const collector of this.#getCollectors(collectorId)) {
      collector.disown(requestId);
    }
  }

  collectIfNeeded(
    request: NetworkRequest,
    topLevelBrowsingContext: BrowsingContext.BrowsingContext,
    userContext: Browser.UserContext,
  ) {
    for (const collector of this.#collectors.values()) {
      collector.collectIfNeeded(
        request.id,
        topLevelBrowsingContext,
        userContext,
      );
      this.#logger?.(
        LogType.debug,
        `Request ${request.id} collected by ${collector.id}`,
      );
    }
  }

  removeDataCollector(collectorId: Network.Collector): Network.Request[] {
    if (!this.#collectors.has(collectorId)) {
      throw new NoSuchNetworkCollectorException(
        `Collector ${collectorId} does not exist`,
      );
    }
    const collectorsRequests =
      this.#collectors.get(collectorId)?.collectedRequests() ?? [];
    this.#collectors.delete(collectorId);

    // Return the requests that are not collected.
    return collectorsRequests.filter((r) => !this.isCollected(r));
  }
}
