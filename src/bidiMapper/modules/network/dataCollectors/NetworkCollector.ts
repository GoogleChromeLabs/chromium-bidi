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

import type {
  Browser,
  BrowsingContext,
  JsUint,
  Network,
} from '../../../../protocol/generated/webdriver-bidi.js';
import {EventEmitter} from '../../../../utils/EventEmitter.js';
import {type LoggerFn, LogType} from '../../../../utils/log.js';
import {uuidv4} from '../../../../utils/uuid.js';
import type {NetworkRequest} from '../NetworkRequest.js';

export interface RequestDisowned extends Record<string | symbol, unknown> {
  requestDisowned: Network.Request;
}

export class NetworkCollector extends EventEmitter<RequestDisowned> {
  readonly id = uuidv4();
  readonly #contexts?: [
    BrowsingContext.BrowsingContext,
    ...BrowsingContext.BrowsingContext[],
  ];
  readonly #maxEncodedDataSize: JsUint;
  readonly #userContexts?: [Browser.UserContext, ...Browser.UserContext[]];

  readonly #collectedRequests = new Map<Network.Request, NetworkRequest>();
  readonly #logger?: LoggerFn;
  // Track the size of all collected network requests.
  #collectedSize = 0;

  constructor(params: Network.AddDataCollectorParameters, logger?: LoggerFn) {
    super();
    this.#logger = logger;
    this.#maxEncodedDataSize = params.maxEncodedDataSize;
    this.#contexts = params.contexts;
    this.#userContexts = params.userContexts;
  }

  collect(request: NetworkRequest) {
    this.#collectedRequests.set(request.id, request);
    if (request.bytesReceived === 0) {
      this.#logger?.(LogType.debug, `Warn! Request ${request.id} has 0 bytes.`);
    }
    this.#collectedSize += request.bytesReceived;
  }

  freeUp() {
    while (this.#collectedSize > this.#maxEncodedDataSize) {
      for (const request of this.#collectedRequests.values()) {
        this.#logger?.(
          LogType.debug,
          `The collected size ${this.#collectedSize}, while ${this.#maxEncodedDataSize}. Removing ${request.id}`,
        );
        this.disown(request.id);
      }
    }
  }

  isCollected(requestId: Network.Request) {
    return this.#collectedRequests.has(requestId);
  }

  disown(requestId: Network.Request) {
    const freedBytes =
      this.#collectedRequests.get(requestId)?.bytesReceived ?? 0;
    this.#collectedSize -= freedBytes;
    this.#collectedRequests.delete(requestId);
    this.emit('requestDisowned', requestId);
    this.#logger?.(
      LogType.debug,
      `Collector ${this.id} disowned request ${requestId}, freed up ${freedBytes} bytes.`,
    );
  }

  shouldCollect(
    topLevelBrowsingContext: BrowsingContext.BrowsingContext,
    userContext: Browser.UserContext,
  ): boolean {
    if (!this.#userContexts && !this.#contexts) {
      // A global collector.
      return true;
    }
    if (this.#contexts?.includes(topLevelBrowsingContext)) {
      return true;
    }
    if (this.#userContexts?.includes(userContext)) {
      return true;
    }
    return false;
  }

  dispose(): void {
    for (const request of this.#collectedRequests.values()) {
      this.disown(request.id);
    }
  }
}
