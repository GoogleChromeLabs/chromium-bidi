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
 *
 */
import type {Protocol} from 'devtools-protocol';

import type {CdpClient} from '../../../cdp/CdpClient.js';
import {BiDiModule} from '../../../protocol/chromium-bidi.js';
import type {ChromiumBidi, Session} from '../../../protocol/protocol.js';
import {Deferred} from '../../../utils/Deferred.js';
import type {LoggerFn} from '../../../utils/log.js';
import {LogType} from '../../../utils/log.js';
import type {Result} from '../../../utils/result.js';
import {BrowsingContextImpl} from '../context/BrowsingContextImpl.js';
import type {BrowsingContextStorage} from '../context/BrowsingContextStorage.js';
import {LogManager} from '../log/LogManager.js';
import type {NetworkStorage} from '../network/NetworkStorage.js';
import type {ChannelProxy} from '../script/ChannelProxy.js';
import type {PreloadScriptStorage} from '../script/PreloadScriptStorage.js';
import type {RealmStorage} from '../script/RealmStorage.js';
import type {EventManager} from '../session/EventManager.js';

// TODO: rename to CdpPageTarget.
export class CdpTarget {
  readonly #id: Protocol.Target.TargetID;
  readonly #cdpClient: CdpClient;
  readonly #parentCdpClient: CdpClient;
  readonly #realmStorage: RealmStorage;
  readonly #eventManager: EventManager;

  readonly #preloadScriptStorage: PreloadScriptStorage;
  readonly #browsingContextStorage: BrowsingContextStorage;
  readonly #networkStorage: NetworkStorage;

  readonly #unblocked = new Deferred<Result<void>>();
  readonly #unhandledPromptBehavior?: Session.UserPromptHandler;
  readonly #logger: LoggerFn | undefined;

  #deviceAccessEnabled = false;
  #cacheDisableState = false;
  #networkDomainEnabled = false;
  #fetchDomainStages = {
    request: false,
    response: false,
    auth: false,
  };

  static create(
    targetId: Protocol.Target.TargetID,
    cdpClient: CdpClient,
    parentCdpClient: CdpClient,
    realmStorage: RealmStorage,
    eventManager: EventManager,
    preloadScriptStorage: PreloadScriptStorage,
    browsingContextStorage: BrowsingContextStorage,
    networkStorage: NetworkStorage,
    unhandledPromptBehavior?: Session.UserPromptHandler,
    logger?: LoggerFn
  ): CdpTarget {
    const cdpTarget = new CdpTarget(
      targetId,
      cdpClient,
      parentCdpClient,
      eventManager,
      realmStorage,
      preloadScriptStorage,
      browsingContextStorage,
      networkStorage,
      unhandledPromptBehavior,
      logger
    );

    LogManager.create(cdpTarget, realmStorage, eventManager, logger);

    cdpTarget.#setEventListeners();

    // No need to await.
    // Deferred will be resolved when the target is unblocked.
    void cdpTarget.#unblock();

    return cdpTarget;
  }

  constructor(
    targetId: Protocol.Target.TargetID,
    cdpClient: CdpClient,
    parentCdpClient: CdpClient,
    eventManager: EventManager,
    realmStorage: RealmStorage,
    preloadScriptStorage: PreloadScriptStorage,
    browsingContextStorage: BrowsingContextStorage,
    networkStorage: NetworkStorage,
    unhandledPromptBehavior?: Session.UserPromptHandler,
    logger?: LoggerFn
  ) {
    this.#id = targetId;
    this.#cdpClient = cdpClient;
    this.#parentCdpClient = parentCdpClient;
    this.#eventManager = eventManager;
    this.#realmStorage = realmStorage;
    this.#preloadScriptStorage = preloadScriptStorage;
    this.#networkStorage = networkStorage;
    this.#browsingContextStorage = browsingContextStorage;
    this.#unhandledPromptBehavior = unhandledPromptBehavior;
    this.#logger = logger;
  }

  /** Returns a deferred that resolves when the target is unblocked. */
  get unblocked(): Deferred<Result<void>> {
    return this.#unblocked;
  }

  get id(): Protocol.Target.TargetID {
    return this.#id;
  }

  get cdpClient(): CdpClient {
    return this.#cdpClient;
  }

  get parentCdpClient(): CdpClient {
    return this.#parentCdpClient;
  }

  /** Needed for CDP escape path. */
  get cdpSessionId(): Protocol.Target.SessionID {
    // SAFETY we got the client by it's id for creating
    return this.#cdpClient.sessionId!;
  }

  /**
   * Enables all the required CDP domains and unblocks the target.
   */
  async #unblock() {
    try {
      await Promise.all([
        this.#cdpClient.sendCommand('Page.enable'),
        // There can be some existing frames in the target, if reconnecting to an
        // existing browser instance, e.g. via Puppeteer. Need to restore the browsing
        // contexts for the frames to correctly handle further events, like
        // `Runtime.executionContextCreated`.
        // It's important to schedule this task together with enabling domains commands to
        // prepare the tree before the events (e.g. Runtime.executionContextCreated) start
        // coming.
        // https://github.com/GoogleChromeLabs/chromium-bidi/issues/2282
        this.#cdpClient
          .sendCommand('Page.getFrameTree')
          .then((frameTree) =>
            this.#restoreFrameTreeState(frameTree.frameTree)
          ),
        this.#cdpClient.sendCommand('Runtime.enable'),
        this.#cdpClient.sendCommand('Page.setLifecycleEventsEnabled', {
          enabled: true,
        }),
        this.toggleNetworkIfNeeded(),
        this.#cdpClient.sendCommand('Target.setAutoAttach', {
          autoAttach: true,
          waitForDebuggerOnStart: true,
          flatten: true,
        }),
        this.#initAndEvaluatePreloadScripts(),
        this.#cdpClient.sendCommand('Runtime.runIfWaitingForDebugger'),
        // Resume tab execution as well if it was paused by the debugger.
        this.#parentCdpClient.sendCommand('Runtime.runIfWaitingForDebugger'),
        this.toggleDeviceAccessIfNeeded(),
      ]);
    } catch (error: any) {
      this.#logger?.(LogType.debugError, 'Failed to unblock target', error);
      // The target might have been closed before the initialization finished.
      if (!this.#cdpClient.isCloseError(error)) {
        this.#unblocked.resolve({
          kind: 'error',
          error,
        });
        return;
      }
    }

    this.#unblocked.resolve({
      kind: 'success',
      value: undefined,
    });
  }

  #restoreFrameTreeState(frameTree: Protocol.Page.FrameTree) {
    const frame = frameTree.frame;
    const maybeContext = this.#browsingContextStorage.findContext(frame.id);
    if (maybeContext !== undefined) {
      // Restoring parent of already known browsing context. This means the target is
      // OOPiF and the BiDi session was connected to already existing browser instance.
      if (
        maybeContext.parentId === null &&
        frame.parentId !== null &&
        frame.parentId !== undefined
      ) {
        maybeContext.parentId = frame.parentId;
      }
    }
    if (maybeContext === undefined && frame.parentId !== undefined) {
      // Restore not yet known nested frames. The top-level frame is created when the
      // target is attached.
      const parentBrowsingContext = this.#browsingContextStorage.getContext(
        frame.parentId
      );
      BrowsingContextImpl.create(
        frame.id,
        frame.parentId,
        parentBrowsingContext.userContext,
        parentBrowsingContext.cdpTarget,
        this.#eventManager,
        this.#browsingContextStorage,
        this.#realmStorage,
        frame.url,
        undefined,
        this.#unhandledPromptBehavior,
        this.#logger
      );
    }
    frameTree.childFrames?.map((frameTree) =>
      this.#restoreFrameTreeState(frameTree)
    );
  }

  async toggleFetchIfNeeded() {
    const stages = this.#networkStorage.getInterceptionStages(this.topLevelId);

    if (
      // Only toggle interception when Network is enabled
      !this.#networkDomainEnabled ||
      (this.#fetchDomainStages.request === stages.request &&
        this.#fetchDomainStages.response === stages.response &&
        this.#fetchDomainStages.auth === stages.auth)
    ) {
      return;
    }
    const patterns: Protocol.Fetch.EnableRequest['patterns'] = [];

    this.#fetchDomainStages = stages;
    if (stages.request || stages.auth) {
      // CDP quirk we need request interception when we intercept auth
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
    if (patterns.length) {
      await this.#cdpClient.sendCommand('Fetch.enable', {
        patterns,
        handleAuthRequests: stages.auth,
      });
    } else {
      await this.#cdpClient.sendCommand('Fetch.disable');
    }
  }

  /**
   * Toggles both Network and Fetch domains.
   */
  async toggleNetworkIfNeeded(): Promise<void> {
    const enabled = this.isSubscribedTo(BiDiModule.Network);
    if (enabled === this.#networkDomainEnabled) {
      return;
    }

    this.#networkDomainEnabled = enabled;
    try {
      await Promise.all([
        this.#cdpClient
          .sendCommand(enabled ? 'Network.enable' : 'Network.disable')
          .then(async () => await this.toggleSetCacheDisabled()),
        this.toggleFetchIfNeeded(),
      ]);
    } catch (err) {
      this.#logger?.(LogType.debugError, err);
      this.#networkDomainEnabled = !enabled;
      if (!this.#isExpectedError(err)) {
        throw err;
      }
    }
  }

  async toggleSetCacheDisabled(disable?: boolean) {
    const defaultCacheDisabled =
      this.#networkStorage.defaultCacheBehavior === 'bypass';
    const cacheDisabled = disable ?? defaultCacheDisabled;

    if (
      !this.#networkDomainEnabled ||
      this.#cacheDisableState === cacheDisabled
    ) {
      return;
    }
    this.#cacheDisableState = cacheDisabled;
    try {
      await this.#cdpClient.sendCommand('Network.setCacheDisabled', {
        cacheDisabled,
      });
    } catch (err) {
      this.#logger?.(LogType.debugError, err);
      this.#cacheDisableState = !cacheDisabled;
      if (!this.#isExpectedError(err)) {
        throw err;
      }
    }
  }

  async toggleDeviceAccessIfNeeded(): Promise<void> {
    const enabled = this.isSubscribedTo(BiDiModule.Bluetooth);
    if (this.#deviceAccessEnabled === enabled) {
      return;
    }

    this.#deviceAccessEnabled = enabled;
    try {
      await this.#cdpClient.sendCommand(
        enabled ? 'DeviceAccess.enable' : 'DeviceAccess.disable'
      );
    } catch (err) {
      this.#logger?.(LogType.debugError, err);
      this.#deviceAccessEnabled = !enabled;
      if (!this.#isExpectedError(err)) {
        throw err;
      }
    }
  }

  /**
   * Heuristic checking if the error is due to the session being closed. If so, ignore the
   * error.
   */
  #isExpectedError(err: unknown): boolean {
    const error = err as {code?: unknown; message?: unknown};
    return (
      (error.code === -32001 &&
        error.message === 'Session with given id not found.') ||
      this.#cdpClient.isCloseError(err)
    );
  }

  #setEventListeners() {
    this.#cdpClient.on('*', (event, params) => {
      // We may encounter uses for EventEmitter other than CDP events,
      // which we want to skip.
      if (typeof event !== 'string') {
        return;
      }
      this.#eventManager.registerEvent(
        {
          type: 'event',
          method: `cdp.${event}`,
          params: {
            event,
            params,
            session: this.cdpSessionId,
          },
        },
        this.id
      );
    });
  }

  /**
   * All the ProxyChannels from all the preload scripts of the given
   * BrowsingContext.
   */
  getChannels(): ChannelProxy[] {
    return this.#preloadScriptStorage
      .find()
      .flatMap((script) => script.channels);
  }

  /** Loads all top-level preload scripts. */
  async #initAndEvaluatePreloadScripts() {
    await Promise.all(
      this.#preloadScriptStorage
        .find({
          // Needed for OOPIF
          targetId: this.topLevelId,
          global: true,
        })
        .map((script) => {
          return script.initInTarget(this, true);
        })
    );
  }

  get topLevelId() {
    return (
      this.#browsingContextStorage.findTopLevelContextId(this.id) ?? this.id
    );
  }

  isSubscribedTo(moduleOrEvent: ChromiumBidi.EventNames): boolean {
    return this.#eventManager.subscriptionManager.isSubscribedTo(
      moduleOrEvent,
      this.topLevelId
    );
  }
}
