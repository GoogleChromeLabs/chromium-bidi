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

import type {NetworkRequest} from './NetworkRequest.js';

interface NetworkInterception {
  urlPatterns: Network.UrlPattern[];
  phases: Network.AddInterceptParameters['phases'];
}

/** Stores network and intercept maps. */
export class NetworkStorage {
  #browserClient: CdpClient;
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
  #interceptionHandler = this.#handleNetworkInterception.bind(this);
  #authHandler = this.#handleAuthInterception.bind(this);

  constructor(browserClient: CdpClient) {
    this.#browserClient = browserClient;
  }

  /*
   * Toggles network interception if needed
   */
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
      await this.#browserClient.sendCommand('Fetch.enable', {
        patterns,
        handleAuthRequests: stages.auth,
      });
      this.#browserClient.on('Fetch.requestPaused', this.#interceptionHandler);
      this.#browserClient.on('Fetch.authRequired', this.#authHandler);
    } else {
      this.#interceptionStages = {
        request: false,
        response: false,
        auth: false,
      };
      await this.#browserClient.sendCommand('Fetch.disable');
      this.#browserClient.off('Fetch.requestPaused', this.#interceptionHandler);
      this.#browserClient.off('Fetch.authRequired', this.#authHandler);
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

  disposeRequestMap() {
    for (const request of this.#requests.values()) {
      request.dispose();
    }

    this.#requests.clear();
  }

  #handleNetworkInterception(event: Protocol.Fetch.RequestPausedEvent) {
    // CDP quirk if the Network domain is not present this is undefined
    const request = this.#requests.get(event.networkId ?? '');
    if (!request) {
      // CDP quirk even both request/response may be continued
      // with this command
      void this.#browserClient
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

  #handleAuthInterception(event: Protocol.Fetch.AuthRequiredEvent) {
    // CDP quirk if the Network domain is not present this is undefined
    const request = this.getRequestByFetchId(event.requestId ?? '');
    if (!request) {
      // CDP quirk even both request/response may be continued
      // with this command
      void this.#browserClient
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

  /** Converts a URL pattern from the spec to a CDP URL pattern. */
  static cdpFromSpecUrlPattern(urlPattern: Network.UrlPattern): string {
    switch (urlPattern.type) {
      case 'string':
        return urlPattern.pattern;
      case 'pattern':
        return NetworkStorage.buildUrlPatternString(urlPattern);
    }
  }

  static buildUrlPatternString({
    protocol,
    hostname,
    port,
    pathname,
    search,
  }: Network.UrlPatternPattern): string {
    if (!protocol && !hostname && !port && !pathname && !search) {
      return '*';
    }

    let url: string = '';

    if (protocol) {
      url += protocol;

      if (!protocol.endsWith(':')) {
        url += ':';
      }

      if (NetworkStorage.isSpecialScheme(protocol)) {
        url += '//';
      }
    }

    if (hostname) {
      url += hostname;
    }

    if (port) {
      url += `:${port}`;
    }

    if (pathname) {
      if (!pathname.startsWith('/')) {
        url += '/';
      }

      url += pathname;
    }

    if (search) {
      if (!search.startsWith('?')) {
        url += '?';
      }

      url += search;
    }

    return url;
  }

  /**
   * Returns true if the given protocol is special.
   * Special protocols are those that have a default port.
   *
   * Example inputs: 'http', 'http:'
   *
   * @see https://url.spec.whatwg.org/#special-scheme
   */
  static isSpecialScheme(protocol: string): boolean {
    return ['ftp', 'file', 'http', 'https', 'ws', 'wss'].includes(
      protocol.replace(/:$/, '')
    );
  }

  /** Matches the given URLPattern against the given URL. */
  static matchUrlPattern(
    urlPattern: Network.UrlPattern,
    url: string | undefined
  ): boolean {
    switch (urlPattern.type) {
      case 'string':
        return urlPattern.pattern === url;
      case 'pattern': {
        return (
          new URLPattern({
            protocol: urlPattern.protocol,
            hostname: urlPattern.hostname,
            port: urlPattern.port,
            pathname: urlPattern.pathname,
            search: urlPattern.search,
          }).exec(url) !== null
        );
      }
    }
  }
}
