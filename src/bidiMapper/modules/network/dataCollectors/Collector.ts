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
import {uuidv4} from '../../../../utils/uuid.js';

export class Collector {
  readonly dataTypes: [Network.DataType, ...Network.DataType[]];
  readonly maxEncodedDataSize: JsUint;
  /**
   * @defaultValue `"blob"`
   */
  readonly collectorType?: Network.CollectorType;
  readonly contexts?: [
    BrowsingContext.BrowsingContext,
    ...BrowsingContext.BrowsingContext[],
  ];
  readonly userContexts?: [Browser.UserContext, ...Browser.UserContext[]];

  readonly id = uuidv4();
  readonly #collectedRequests = new Set<Network.Request>();

  constructor(params: Network.AddDataCollectorParameters) {
    this.dataTypes = params.dataTypes;
    this.maxEncodedDataSize = params.maxEncodedDataSize;
    this.collectorType = params.collectorType;
    this.contexts = params.contexts;
    this.userContexts = params.userContexts;
  }

  collectIfNeeded(
    requestId: Network.Request,
    topLevelBrowsingContext: BrowsingContext.BrowsingContext,
    userContext: Browser.UserContext,
  ) {
    if (!this.#shouldCollect(topLevelBrowsingContext, userContext)) {
      return;
    }
    this.#collectedRequests.add(requestId);
  }

  collectedRequests(): Network.Request[] {
    return new Array(...this.#collectedRequests.values());
  }

  isCollected(requestId: Network.Request) {
    return this.#collectedRequests.has(requestId);
  }

  disown(requestId: Network.Request) {
    return this.#collectedRequests.delete(requestId);
  }

  #shouldCollect(
    topLevelBrowsingContext: BrowsingContext.BrowsingContext,
    userContext: Browser.UserContext,
  ): boolean {
    if (!this.userContexts && !this.contexts) {
      // A global collector.
      return true;
    }
    if (this.contexts?.includes(topLevelBrowsingContext)) {
      return true;
    }
    if (this.userContexts?.includes(userContext)) {
      return true;
    }
    return false;
  }
}
