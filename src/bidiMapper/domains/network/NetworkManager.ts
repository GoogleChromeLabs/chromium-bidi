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

/**
 * @fileoverview This file implements the Network domain processor which is
 * responsible for processing Network domain events and redirecting events to
 * related `NetworkRequest`.
 */
import type Protocol from 'devtools-protocol';

import type {ICdpClient} from '../../../cdp/cdpClient.js';
import type {Network} from '../../../protocol/protocol.js';

import type {NetworkRequest} from './NetworkRequest.js';
import type {NetworkStorage} from './NetworkStorage.js';

export class NetworkManager {
  readonly #networkStorage: NetworkStorage;

  private constructor(networkStorage: NetworkStorage) {
    this.#networkStorage = networkStorage;
  }

  static create(
    cdpClient: ICdpClient,
    networkStorage: NetworkStorage
  ): NetworkManager {
    const networkManager = new NetworkManager(networkStorage);

    cdpClient
      .browserClient()
      .on(
        'Target.detachedFromTarget',
        (params: Protocol.Target.DetachedFromTargetEvent) => {
          if (cdpClient.sessionId === params.sessionId) {
            networkManager.#networkStorage.disposeRequestMap();
          }
        }
      );

    cdpClient.on(
      'Network.requestWillBeSent',
      (params: Protocol.Network.RequestWillBeSentEvent) => {
        networkManager
          .#getOrCreateNetworkRequest(params.requestId)
          .onRequestWillBeSentEvent(params);
      }
    );

    cdpClient.on(
      'Network.requestWillBeSentExtraInfo',
      (params: Protocol.Network.RequestWillBeSentExtraInfoEvent) => {
        networkManager
          .#getOrCreateNetworkRequest(params.requestId)
          .onRequestWillBeSentExtraInfoEvent(params);
      }
    );

    cdpClient.on(
      'Network.responseReceived',
      (params: Protocol.Network.ResponseReceivedEvent) => {
        networkManager
          .#getOrCreateNetworkRequest(params.requestId)
          .onResponseReceivedEvent(params);
      }
    );

    cdpClient.on(
      'Network.responseReceivedExtraInfo',
      (params: Protocol.Network.ResponseReceivedExtraInfoEvent) => {
        networkManager
          .#getOrCreateNetworkRequest(params.requestId)
          .onResponseReceivedEventExtraInfo(params);
      }
    );

    cdpClient.on(
      'Network.requestServedFromCache',
      (params: Protocol.Network.RequestServedFromCacheEvent) => {
        networkManager
          .#getOrCreateNetworkRequest(params.requestId)
          .onServedFromCache();
      }
    );

    cdpClient.on(
      'Network.loadingFailed',
      (params: Protocol.Network.LoadingFailedEvent) => {
        networkManager
          .#getOrCreateNetworkRequest(params.requestId)
          .onLoadingFailedEvent(params);
        networkManager.#forgetRequest(params.requestId);
      }
    );

    cdpClient.on(
      'Network.loadingFinished',
      (params: Protocol.Network.RequestServedFromCacheEvent) => {
        networkManager.#forgetRequest(params.requestId);
      }
    );

    return networkManager;
  }

  #forgetRequest(requestId: Network.Request): void {
    const request = this.#networkStorage.requestMap.get(requestId);
    if (request) {
      request.dispose();
      this.#networkStorage.requestMap.delete(requestId);
    }
  }

  #getOrCreateNetworkRequest(requestId: Network.Request): NetworkRequest {
    return this.#networkStorage.requestMap.get(requestId);
  }
}
