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
import type {Protocol} from 'devtools-protocol';

import {Network, NoSuchInterceptException} from '../../../protocol/protocol.js';
import {URLPattern} from '../../../utils/UrlPattern.js';
import {uuidv4} from '../../../utils/uuid.js';
import type {CdpClient} from '../../BidiMapper.js';
import type {CdpTarget} from '../context/CdpTarget.js';
import type {EventManager} from '../session/EventManager.js';

import {NetworkRequest} from './NetworkRequest.js';

interface NetworkInterception {
  urlPatterns: Network.UrlPattern[];
  phases: Network.AddInterceptParameters['phases'];
}

/** Stores network and intercept maps. */
export class NetworkStorage {
  #eventManager: EventManager;

  readonly #targets = new Set<CdpTarget>();
  /**
   * A map from network request ID to Network Request objects.
   * Needed as long as information about requests comes from different events.
   */
  readonly #requests = new Map<Network.Request, NetworkRequest>();

  /** A map from intercept ID to track active network intercepts. */
  readonly #intercepts = new Map<Network.Intercept, NetworkInterception>();

  #interceptionStages = {
    request: false,
    response: false,
    auth: false,
  };

  constructor(eventManager: EventManager, browserClient: CdpClient) {
    this.#eventManager = eventManager;

    browserClient.on(
      'Target.detachedFromTarget',
      ({sessionId}: Protocol.Target.DetachedFromTargetEvent) => {
        this.disposeRequestMap(sessionId);
      }
    );
  }

  /**
   * Gets the network request with the given ID, if any.
   * Otherwise, creates a new network request with the given ID and cdp target.
   */
  #getOrCreateNetworkRequest(
    id: Network.Request,
    cdpTarget: CdpTarget,
    redirectCount?: number
  ): NetworkRequest {
    let request = this.getRequestById(id);
    if (request) {
      return request;
    }

    request = new NetworkRequest(
      id,
      this.#eventManager,
      this,
      cdpTarget,
      redirectCount
    );

    this.addRequest(request);

    return request;
  }

  onNewCdpTarget(cdpTarget: CdpTarget) {
    this.#targets.add(cdpTarget);

    const cdpClient = cdpTarget.cdpClient;

    cdpClient.on(
      'Network.requestWillBeSent',
      (params: Protocol.Network.RequestWillBeSentEvent) => {
        const request = this.getRequestById(params.requestId);
        if (request && request.isRedirecting()) {
          request.handleRedirect(params);
          this.deleteRequest(params.requestId);
          this.#getOrCreateNetworkRequest(
            params.requestId,
            cdpTarget,
            request.redirectCount + 1
          ).onRequestWillBeSentEvent(params);
        } else if (request) {
          request.onRequestWillBeSentEvent(params);
        } else {
          this.#getOrCreateNetworkRequest(
            params.requestId,
            cdpTarget
          ).onRequestWillBeSentEvent(params);
        }
      }
    );

    cdpClient.on(
      'Network.requestWillBeSentExtraInfo',
      (params: Protocol.Network.RequestWillBeSentExtraInfoEvent) => {
        this.#getOrCreateNetworkRequest(
          params.requestId,
          cdpTarget
        ).onRequestWillBeSentExtraInfoEvent(params);
      }
    );

    cdpClient.on(
      'Network.responseReceived',
      (params: Protocol.Network.ResponseReceivedEvent) => {
        this.#getOrCreateNetworkRequest(
          params.requestId,
          cdpTarget
        ).onResponseReceivedEvent(params);
      }
    );

    cdpClient.on(
      'Network.responseReceivedExtraInfo',
      (params: Protocol.Network.ResponseReceivedExtraInfoEvent) => {
        this.#getOrCreateNetworkRequest(
          params.requestId,
          cdpTarget
        ).onResponseReceivedExtraInfoEvent(params);
      }
    );

    cdpClient.on(
      'Network.requestServedFromCache',
      (params: Protocol.Network.RequestServedFromCacheEvent) => {
        this.#getOrCreateNetworkRequest(
          params.requestId,
          cdpTarget
        ).onServedFromCache();
      }
    );

    cdpClient.on(
      'Network.loadingFailed',
      (params: Protocol.Network.LoadingFailedEvent) => {
        this.#getOrCreateNetworkRequest(
          params.requestId,
          cdpTarget
        ).onLoadingFailedEvent(params);
      }
    );

    cdpClient.on('Fetch.requestPaused', (event) => {
      this.#handleNetworkInterception(event, cdpTarget);
    });
    cdpClient.on('Fetch.authRequired', (event) => {
      this.#handleAuthInterception(event, cdpTarget);
    });
  }

  async toggleInterception() {
    if (this.#intercepts.size) {
      const stages = {
        request: false,
        response: false,
        auth: false,
      };
      for (const intercept of this.#intercepts.values()) {
        stages.request ||= intercept.phases.includes(
          Network.InterceptPhase.BeforeRequestSent
        );
        stages.response ||= intercept.phases.includes(
          Network.InterceptPhase.ResponseStarted
        );
        stages.auth ||= intercept.phases.includes(
          Network.InterceptPhase.AuthRequired
        );
      }
      const patterns: Protocol.Fetch.EnableRequest['patterns'] = [];

      if (
        this.#interceptionStages.request !== stages.request ||
        this.#interceptionStages.response !== stages.response ||
        this.#interceptionStages.auth !== stages.auth
      ) {
        this.#interceptionStages = stages;
        // CDP quirk we need request interception when we intercept auth
        if (stages.request || stages.auth) {
          patterns.push({
            urlPattern: '*',
            requestStage: 'Request',
          });
        }
        if (stages.response) {
          patterns.push({
            urlPattern: '*',
            requestStage: 'Response',
          });
        }
      }

      // TODO: Don't enable on start as we will have
      // no network interceptions at this time.
      // Needed to enable fetch events.

      await Promise.all(
        [...this.#targets.values()].map(async (cdpTarget) => {
          await cdpTarget.cdpClient.sendCommand('Fetch.enable', {
            patterns,
            handleAuthRequests: stages.auth,
          });
        })
      );
    } else {
      this.#interceptionStages = {
        request: false,
        response: false,
        auth: false,
      };

      await Promise.all(
        [...this.#targets.values()].map(async ({cdpClient}) => {
          await cdpClient.sendCommand('Fetch.disable');
        })
      );
    }
  }

  requestBlockedBy(
    request: NetworkRequest,
    phase?: Network.InterceptPhase
  ): Set<Network.Intercept> {
    if (request.url === undefined || phase === undefined) {
      return new Set();
    }

    const intercepts = new Set<Network.Intercept>();
    for (const [interceptId, intercept] of this.#intercepts.entries()) {
      if (!intercept.phases.includes(phase)) {
        continue;
      }

      if (intercept.urlPatterns.length === 0) {
        intercepts.add(interceptId);
        continue;
      }

      for (const pattern of intercept.urlPatterns) {
        if (pattern.type === 'string') {
          // TODO: Verify this behavior or convert to common
          if (pattern.pattern.includes(request.url)) {
            intercepts.add(interceptId);
            break;
          }
          continue;
        }

        const urlPattern = new URLPattern(pattern);
        if (urlPattern.test(request.url)) {
          intercepts.add(interceptId);
          break;
        }
      }
    }

    return intercepts;
  }

  disposeRequestMap(sessionId: string) {
    const requests = [...this.#requests.values()].filter((request) => {
      return request.cdpClient.sessionId === sessionId;
    });

    for (const request of requests) {
      request.dispose();
      this.#requests.delete(request.id);
    }
  }

  #handleNetworkInterception(
    event: Protocol.Fetch.RequestPausedEvent,
    cdpTarget: CdpTarget
  ) {
    // CDP quirk if the Network domain is not present this is undefined
    const request = this.#requests.get(event.networkId ?? '');
    if (!request) {
      // CDP quirk even both request/response may be continued
      // with this command
      void cdpTarget.cdpClient
        .sendCommand('Fetch.continueRequest', {
          requestId: event.requestId,
        })
        .catch(() => {
          // TODO: add logging
        });
      return;
    }

    request.onRequestPaused(event);
  }

  #handleAuthInterception(
    event: Protocol.Fetch.AuthRequiredEvent,
    cdpTarget: CdpTarget
  ) {
    // CDP quirk if the Network domain is not present this is undefined
    const request = this.getRequestByFetchId(event.requestId ?? '');
    if (!request) {
      // CDP quirk even both request/response may be continued
      // with this command
      void cdpTarget.cdpClient
        .sendCommand('Fetch.continueWithAuth', {
          requestId: event.requestId,
          authChallengeResponse: {
            response: 'Default',
          },
        })
        .catch(() => {
          // TODO: add logging
        });
      return;
    }

    request.onAuthRequired(event);
  }

  /**
   * Adds the given entry to the intercept map.
   * URL patterns are assumed to be parsed.
   *
   * @return The intercept ID.
   */
  addIntercept(value: NetworkInterception): Network.Intercept {
    const interceptId: Network.Intercept = uuidv4();
    this.#intercepts.set(interceptId, value);

    return interceptId;
  }

  /**
   * Removes the given intercept from the intercept map.
   * Throws NoSuchInterceptException if the intercept does not exist.
   */
  removeIntercept(intercept: Network.Intercept) {
    if (!this.#intercepts.has(intercept)) {
      throw new NoSuchInterceptException(
        `Intercept '${intercept}' does not exist.`
      );
    }

    this.#intercepts.delete(intercept);
  }

  getRequestById(id: Network.Request): NetworkRequest | undefined {
    return this.#requests.get(id);
  }

  getRequestByFetchId(fetchId: Network.Request): NetworkRequest | undefined {
    for (const request of this.#requests.values()) {
      if (request.fetchId === fetchId) {
        return request;
      }
    }

    return;
  }

  addRequest(request: NetworkRequest) {
    this.#requests.set(request.id, request);
  }

  deleteRequest(id: Network.Request) {
    const request = this.#requests.get(id);
    if (request) {
      request.dispose();
      this.#requests.delete(id);
    }
  }
}
