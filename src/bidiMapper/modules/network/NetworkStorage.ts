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

import {
  type BrowsingContext,
  InvalidArgumentException,
  Network,
  NoSuchInterceptException,
  NoSuchNetworkCollectorException,
  NoSuchNetworkDataException,
} from '../../../protocol/protocol.js';
import {type LoggerFn, LogType} from '../../../utils/log.js';
import {uuidv4} from '../../../utils/uuid.js';
import type {CdpClient} from '../../BidiMapper.js';
import type {CdpTarget} from '../cdp/CdpTarget.js';
import type {BrowsingContextStorage} from '../context/BrowsingContextStorage';
import type {EventManager} from '../session/EventManager.js';

import {NetworkRequest} from './NetworkRequest.js';
import {matchUrlPattern, type ParsedUrlPattern} from './NetworkUtils.js';

type NetworkInterception = Omit<
  Network.AddInterceptParameters,
  'urlPatterns'
> & {
  urlPatterns: ParsedUrlPattern[];
};

type NetworkCollector = Network.AddDataCollectorParameters & {
  collectorId: string;
};

/** Stores network and intercept maps. */
export class NetworkStorage {
  readonly #browsingContextStorage: BrowsingContextStorage;
  readonly #eventManager: EventManager;
  readonly #logger?: LoggerFn;

  /**
   * A map from network request ID to Network Request objects.
   * Needed as long as information about requests comes from different events.
   */
  readonly #requests = new Map<Network.Request, NetworkRequest>();

  /** A map from intercept ID to track active network intercepts. */
  readonly #intercepts = new Map<Network.Intercept, NetworkInterception>();

  readonly #collectors = new Map<string, NetworkCollector>();
  readonly #collectedResponses = new Map<
    Network.Request,
    {data: Network.GetDataResult; collectors: Set<string>}
  >();

  #defaultCacheBehavior: Network.SetCacheBehaviorParameters['cacheBehavior'] =
    'default';

  constructor(
    eventManager: EventManager,
    browsingContextStorage: BrowsingContextStorage,
    browserClient: CdpClient,
    logger?: LoggerFn,
  ) {
    this.#browsingContextStorage = browsingContextStorage;
    this.#eventManager = eventManager;

    browserClient.on('Target.detachedFromTarget', ({sessionId}) => {
      this.disposeRequestMap(sessionId);
    });

    this.#logger = logger;
  }

  /**
   * Gets the network request with the given ID, if any.
   * Otherwise, creates a new network request with the given ID and cdp target.
   */
  #getOrCreateNetworkRequest(
    id: Network.Request,
    cdpTarget: CdpTarget,
    redirectCount?: number,
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
      redirectCount,
      this.#logger,
    );

    this.addRequest(request);

    return request;
  }

  onCdpTargetCreated(cdpTarget: CdpTarget) {
    const cdpClient = cdpTarget.cdpClient;

    // TODO: Wrap into object
    const listeners = [
      [
        'Network.requestWillBeSent',
        (params: Protocol.Network.RequestWillBeSentEvent) => {
          const request = this.getRequestById(params.requestId);

          if (request && request.isRedirecting()) {
            request.handleRedirect(params);
            this.deleteRequest(params.requestId);
            this.#getOrCreateNetworkRequest(
              params.requestId,
              cdpTarget,
              request.redirectCount + 1,
            ).onRequestWillBeSentEvent(params);
          } else {
            this.#getOrCreateNetworkRequest(
              params.requestId,
              cdpTarget,
            ).onRequestWillBeSentEvent(params);
          }
        },
      ],
      [
        'Network.requestWillBeSentExtraInfo',
        (params: Protocol.Network.RequestWillBeSentExtraInfoEvent) => {
          this.#getOrCreateNetworkRequest(
            params.requestId,
            cdpTarget,
          ).onRequestWillBeSentExtraInfoEvent(params);
        },
      ],
      [
        'Network.responseReceived',
        (params: Protocol.Network.ResponseReceivedEvent) => {
          this.#getOrCreateNetworkRequest(
            params.requestId,
            cdpTarget,
          ).onResponseReceivedEvent(params);
        },
      ],
      [
        'Network.responseReceivedExtraInfo',
        (params: Protocol.Network.ResponseReceivedExtraInfoEvent) => {
          this.#getOrCreateNetworkRequest(
            params.requestId,
            cdpTarget,
          ).onResponseReceivedExtraInfoEvent(params);
        },
      ],
      [
        'Network.requestServedFromCache',
        (params: Protocol.Network.RequestServedFromCacheEvent) => {
          this.#getOrCreateNetworkRequest(
            params.requestId,
            cdpTarget,
          ).onServedFromCache();
        },
      ],
      [
        'Network.loadingFailed',
        (params: Protocol.Network.LoadingFailedEvent) => {
          this.#getOrCreateNetworkRequest(
            params.requestId,
            cdpTarget,
          ).onLoadingFailedEvent(params);
        },
      ],
      [
        'Fetch.requestPaused',
        (event: Protocol.Fetch.RequestPausedEvent) => {
          this.#getOrCreateNetworkRequest(
            // CDP quirk if the Network domain is not present this is undefined
            event.networkId ?? event.requestId,
            cdpTarget,
          ).onRequestPaused(event);
        },
      ],
      [
        'Fetch.authRequired',
        (event: Protocol.Fetch.AuthRequiredEvent) => {
          let request = this.getRequestByFetchId(event.requestId);
          if (!request) {
            request = this.#getOrCreateNetworkRequest(
              event.requestId,
              cdpTarget,
            );
          }

          request.onAuthRequired(event);
        },
      ],
    ] as const;

    for (const [event, listener] of listeners) {
      cdpClient.on(event, listener as any);
    }
  }

  getCollectorsForBrowsingContext(
    browsingContextId: BrowsingContext.BrowsingContext,
  ) {
    if (!this.#browsingContextStorage.hasContext(browsingContextId)) {
      this.#logger?.(
        LogType.debugError,
        'trying to get collector for unknown browsing context',
      );
      return [];
    }

    const userContext =
      this.#browsingContextStorage.getContext(browsingContextId).userContext;

    const collectors = new Set<NetworkCollector>();
    for (const collector of this.#collectors.values()) {
      if (collector.contexts?.includes(browsingContextId)) {
        // Collector is targeted to the browsing context.
        collectors.add(collector);
      }
      if (collector.userContexts?.includes(userContext)) {
        // Collector is targeted to the user context.
        collectors.add(collector);
      }
      if (
        collector.userContexts === undefined &&
        collector.contexts === undefined
      ) {
        // Collector is global.
        collectors.add(collector);
      }
    }

    this.#logger?.(
      LogType.debug,
      `Browsing Context ${browsingContextId} has ${collectors.size} collectors`,
    );
    return [...collectors.values()];
  }

  getCollectedData(params: Network.GetDataParameters): Network.GetDataResult {
    if (params.disown && params.collector === undefined)
      throw new InvalidArgumentException(
        'Cannot disown collected data without collector ID',
      );

    const collectedData = this.#collectedResponses.get(params.request);
    if (collectedData === undefined) {
      throw new NoSuchNetworkDataException(
        `No collected data for request ${params.request}`,
      );
    }

    if (
      params.collector !== undefined &&
      !collectedData.collectors.has(params.collector)
    ) {
      throw new NoSuchNetworkDataException(
        `Collector ${params.collector} does not have data for request ${params.request}`,
      );
    }

    if (params.disown && params.collector !== undefined) {
      collectedData.collectors.delete(params.collector);
      if (collectedData.collectors.size === 0) {
        this.#collectedResponses.delete(params.request);
      }
    }

    return collectedData.data;
  }

  getCollectorsForRequest(request: NetworkRequest): NetworkCollector[] {
    const collectors = new Set<NetworkCollector>();
    for (const collector of this.#collectors.values()) {
      if (!collector.userContexts && !collector.contexts) {
        // Add all global collectors.
        collectors.add(collector);
      }
      if (collector.contexts?.includes(request.cdpTarget.topLevelId)) {
        collectors.add(collector);
      }
      if (
        collector.userContexts?.includes(
          this.#browsingContextStorage.getContext(request.cdpTarget.topLevelId)
            .userContext,
        )
      ) {
        collectors.add(collector);
      }
    }

    this.#logger?.(
      LogType.debug,
      `Request ${request.id} has ${collectors.size} collectors`,
    );
    return [...collectors.values()];
  }

  async collectResponse(
    request: NetworkRequest,
    collectors: NetworkCollector[],
  ) {
    const result = await request.cdpTarget.cdpClient.sendCommand(
      'Fetch.getResponseBody',
      {requestId: request.fetchId!},
    );

    const response: Network.GetDataResult = {
      bytes: {
        type: result.base64Encoded ? 'base64' : 'string',
        value: result.body,
      },
    };

    this.#collectedResponses.set(request.id, {
      data: response,
      collectors: new Set(collectors.map((collector) => collector.collectorId)),
    });
  }

  getInterceptionStages(browsingContextId: BrowsingContext.BrowsingContext) {
    const stages = {
      request: false,
      // In CDP the collectors work only on the intercepted requests.
      response:
        this.getCollectorsForBrowsingContext(browsingContextId).length > 0,
      auth: false,
    };
    for (const intercept of this.#intercepts.values()) {
      if (
        intercept.contexts &&
        !intercept.contexts.includes(browsingContextId)
      ) {
        continue;
      }

      stages.request ||= intercept.phases.includes(
        Network.InterceptPhase.BeforeRequestSent,
      );
      stages.response ||= intercept.phases.includes(
        Network.InterceptPhase.ResponseStarted,
      );
      stages.auth ||= intercept.phases.includes(
        Network.InterceptPhase.AuthRequired,
      );
    }

    return stages;
  }

  getInterceptsForPhase(
    request: NetworkRequest,
    phase: Network.InterceptPhase,
  ): Set<Network.Intercept> {
    if (request.url === NetworkRequest.unknownParameter) {
      return new Set();
    }

    const intercepts = new Set<Network.Intercept>();
    for (const [interceptId, intercept] of this.#intercepts.entries()) {
      if (
        !intercept.phases.includes(phase) ||
        (intercept.contexts &&
          !intercept.contexts.includes(request.cdpTarget.topLevelId))
      ) {
        continue;
      }

      if (intercept.urlPatterns.length === 0) {
        intercepts.add(interceptId);
        continue;
      }

      for (const pattern of intercept.urlPatterns) {
        if (matchUrlPattern(pattern, request.url)) {
          intercepts.add(interceptId);
          break;
        }
      }
    }

    return intercepts;
  }

  disposeRequestMap(sessionId: string) {
    for (const request of this.#requests.values()) {
      if (request.cdpClient.sessionId === sessionId) {
        this.#requests.delete(request.id);
        request.dispose();
      }
    }
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
        `Intercept '${intercept}' does not exist.`,
      );
    }
    this.#intercepts.delete(intercept);
  }

  getRequestsByTarget(target: CdpTarget): NetworkRequest[] {
    const requests: NetworkRequest[] = [];
    for (const request of this.#requests.values()) {
      if (request.cdpTarget === target) {
        requests.push(request);
      }
    }
    return requests;
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
    this.#requests.delete(id);
  }

  /**
   * Gets the virtual navigation ID for the given navigable ID.
   */
  getNavigationId(contextId: string | undefined): string | null {
    if (contextId === undefined) {
      return null;
    }
    return (
      this.#browsingContextStorage.findContext(contextId)?.navigationId ?? null
    );
  }

  set defaultCacheBehavior(
    behavior: Network.SetCacheBehaviorParameters['cacheBehavior'],
  ) {
    this.#defaultCacheBehavior = behavior;
  }

  get defaultCacheBehavior() {
    return this.#defaultCacheBehavior;
  }

  addDataCollector(params: Network.AddDataCollectorParameters): string {
    const collectorId = uuidv4();
    this.#collectors.set(collectorId, {
      ...params,
      collectorId,
    });
    return collectorId;
  }

  removeDataCollector(params: Network.RemoveDataCollectorParameters) {
    const collectorId = params.collector;
    if (!this.#collectors.has(collectorId)) {
      throw new NoSuchNetworkCollectorException(
        `Collector ${params.collector} does not exist`,
      );
    }
    this.#collectors.delete(params.collector);

    // Clean up collected responses.
    for (const [requestId, collectedResponse] of this.#collectedResponses) {
      if (collectedResponse.collectors.has(collectorId)) {
        collectedResponse.collectors.delete(collectorId);
        if (collectedResponse.collectors.size === 0) {
          this.#collectedResponses.delete(requestId);
        }
      }
    }
  }

  disownData(params: Network.DisownDataParameters) {
    const collectorId = params.collector;
    const requestId = params.request;

    if (!this.#collectors.has(collectorId)) {
      throw new NoSuchNetworkCollectorException(
        `Collector ${collectorId} does not exist`,
      );
    }

    if (!this.#collectedResponses.has(requestId)) {
      throw new NoSuchNetworkDataException(
        `No collected data for request ${requestId}`,
      );
    }
    const collectedResponse = this.#collectedResponses.get(requestId)!;

    if (!collectedResponse.collectors.has(collectorId)) {
      throw new NoSuchNetworkDataException(
        `No collected data for request ${requestId} and collector ${collectorId}`,
      );
    }

    collectedResponse.collectors.delete(collectorId);
    if (collectedResponse.collectors.size === 0) {
      this.#collectedResponses.delete(requestId);
    }
  }
}
