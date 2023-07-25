/**
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
import type {Network} from '../../../protocol/protocol.js';
import {DefaultMap} from '../../../utils/DefaultMap.js';
import type {IEventManager} from '../events/EventManager.js';

import {NetworkRequest} from './NetworkRequest.js';

export class NetworkStorage {
  /**
   * Map of request ID to NetworkRequest objects. Needed as long as information
   * about requests comes from different events.
   */
  readonly #requestMap: DefaultMap<Network.Request, NetworkRequest>;

  /** A map to define the properties of active network intercepts. */
  readonly #interceptMap: Map<
    Network.Intercept,
    {
      urlPattern: string;
      interceptPhase: Network.InterceptPhase;
    }
  >;

  /** A map to track the requests which are actively being blocked. */
  readonly #blockedRequestMap: Map<
    Network.Request,
    {
      request: Network.Request;
      interceptPhase: Network.InterceptPhase;
      response: Network.ResponseData;
    }
  >;

  constructor(eventManager: IEventManager) {
    this.#requestMap = new DefaultMap(
      (requestId) => new NetworkRequest(requestId, eventManager)
    );
    this.#interceptMap = new Map();
    this.#blockedRequestMap = new Map();
  }

  // XXX: Replace getters with custom operations, like Browsing Context Storage.
  get requestMap() {
    return this.#requestMap;
  }

  get interceptMap() {
    return this.#interceptMap;
  }

  get blockedRequestMap() {
    return this.#blockedRequestMap;
  }
}
