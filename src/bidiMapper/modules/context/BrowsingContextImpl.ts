/**
 * Copyright 2022 Google LLC.
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
  BrowsingContext,
  ChromiumBidi,
  InvalidArgumentException,
  InvalidSelectorException,
  NoSuchElementException,
  NoSuchFrameException,
  NoSuchHistoryEntryException,
  Script,
  Session,
  UnableToCaptureScreenException,
  UnknownErrorException,
  UnsupportedOperationException,
} from '../../../protocol/protocol.js';
import {assert} from '../../../utils/assert.js';
import {Deferred} from '../../../utils/Deferred.js';
import {type LoggerFn, LogType} from '../../../utils/log.js';
import {getTimestamp} from '../../../utils/time.js';
import {inchesFromCm} from '../../../utils/unitConversions.js';
import {uuidv4} from '../../../utils/uuid.js';
import type {UserContextConfig} from '../browser/UserContextConfig.js';
import type {CdpTarget} from '../cdp/CdpTarget.js';
import type {Realm} from '../script/Realm.js';
import type {RealmStorage} from '../script/RealmStorage.js';
import {getSharedId} from '../script/SharedId.js';
import {WindowRealm} from '../script/WindowRealm.js';
import type {EventManager} from '../session/EventManager.js';

import type {BrowsingContextStorage} from './BrowsingContextStorage.js';
import {
  NavigationEventName,
  NavigationResult,
  type NavigationState,
  NavigationTracker,
} from './NavigationTracker.js';

export class BrowsingContextImpl {
  static readonly LOGGER_PREFIX = `${LogType.debug}:browsingContext` as const;

  /** Direct children browsing contexts. */
  readonly #children = new Set<BrowsingContext.BrowsingContext>();
  /** The ID of this browsing context. */
  readonly #id: BrowsingContext.BrowsingContext;
  readonly userContext: string;
  // Used for running helper scripts.
  readonly #hiddenSandbox = uuidv4();
  readonly #downloadIdToUrlMap = new Map<string, string>();

  /**
   * The ID of the parent browsing context.
   * If null, this is a top-level context.
   */
  #loaderId?: Protocol.Network.LoaderId;
  #parentId: BrowsingContext.BrowsingContext | null = null;
  #originalOpener?: string;

  #lifecycle = {
    DOMContentLoaded: new Deferred<void>(),
    load: new Deferred<void>(),
  };

  #cdpTarget: CdpTarget;
  #defaultRealmDeferred = new Deferred<Realm>();
  readonly #browsingContextStorage: BrowsingContextStorage;
  readonly #eventManager: EventManager;
  readonly #logger?: LoggerFn;
  readonly #navigationTracker: NavigationTracker;
  readonly #realmStorage: RealmStorage;
  // The deferred will be resolved when the default realm is created.
  readonly #unhandledPromptBehavior?: Session.UserPromptHandler;
  readonly #userContextConfig: UserContextConfig;

  // Set when the user prompt is opened. Required to provide the type in closing event.
  #lastUserPromptType?: BrowsingContext.UserPromptType;

  private constructor(
    id: BrowsingContext.BrowsingContext,
    parentId: BrowsingContext.BrowsingContext | null,
    userContext: string,
    userContextConfig: UserContextConfig,
    cdpTarget: CdpTarget,
    eventManager: EventManager,
    browsingContextStorage: BrowsingContextStorage,
    realmStorage: RealmStorage,
    url: string,
    originalOpener?: string,
    unhandledPromptBehavior?: Session.UserPromptHandler,
    logger?: LoggerFn,
  ) {
    this.#userContextConfig = userContextConfig;
    this.#cdpTarget = cdpTarget;
    this.#id = id;
    this.#parentId = parentId;
    this.userContext = userContext;
    this.#eventManager = eventManager;
    this.#browsingContextStorage = browsingContextStorage;
    this.#realmStorage = realmStorage;
    this.#unhandledPromptBehavior = unhandledPromptBehavior;
    this.#logger = logger;
    this.#originalOpener = originalOpener;

    // Register helper realm as hidden, so that it will not be reported to the user.
    this.#realmStorage.hiddenSandboxes.add(this.#hiddenSandbox);

    this.#navigationTracker = new NavigationTracker(
      url,
      id,
      eventManager,
      logger,
    );
  }

  static create(
    id: BrowsingContext.BrowsingContext,
    parentId: BrowsingContext.BrowsingContext | null,
    userContext: string,
    userContextConfig: UserContextConfig,
    cdpTarget: CdpTarget,
    eventManager: EventManager,
    browsingContextStorage: BrowsingContextStorage,
    realmStorage: RealmStorage,
    url: string,
    originalOpener?: string,
    unhandledPromptBehavior?: Session.UserPromptHandler,
    logger?: LoggerFn,
  ): BrowsingContextImpl {
    const context = new BrowsingContextImpl(
      id,
      parentId,
      userContext,
      userContextConfig,
      cdpTarget,
      eventManager,
      browsingContextStorage,
      realmStorage,
      url,
      originalOpener,
      unhandledPromptBehavior,
      logger,
    );

    context.#initListeners();

    browsingContextStorage.addContext(context);
    if (!context.isTopLevelContext()) {
      context.parent!.addChild(context.id);
    }

    // Hold on the `contextCreated` event until the target is unblocked. This is required,
    // as the parent of the context can be set later in case of reconnecting to an
    // existing browser instance + OOPiF.
    eventManager.registerPromiseEvent(
      context.targetUnblockedOrThrow().then(
        () => {
          return {
            kind: 'success',
            value: {
              type: 'event',
              method: ChromiumBidi.BrowsingContext.EventNames.ContextCreated,
              params: {
                ...context.serializeToBidiValue(),
                // Hack to provide the initial URL of the context, as it can be changed
                // between the page target is attached and unblocked, as the page is not
                // fully paused in MPArch session (https://crbug.com/372842894).
                // TODO: remove once https://crbug.com/372842894 is addressed.
                url,
              },
            },
          };
        },
        (error) => {
          return {
            kind: 'error',
            error,
          };
        },
      ),
      context.id,
      ChromiumBidi.BrowsingContext.EventNames.ContextCreated,
    );

    return context;
  }

  /**
   * @see https://html.spec.whatwg.org/multipage/document-sequences.html#navigable
   */
  get navigableId(): string | undefined {
    return this.#loaderId;
  }

  get navigationId(): string {
    return this.#navigationTracker.currentNavigationId;
  }

  dispose(emitContextDestroyed: boolean) {
    this.#navigationTracker.dispose();

    this.#realmStorage.deleteRealms({
      browsingContextId: this.id,
    });

    // Delete context from the parent.
    if (!this.isTopLevelContext()) {
      this.parent!.#children.delete(this.id);
    }

    // Fail all ongoing navigations.
    this.#failLifecycleIfNotFinished();

    if (emitContextDestroyed) {
      this.#eventManager.registerEvent(
        {
          type: 'event',
          method: ChromiumBidi.BrowsingContext.EventNames.ContextDestroyed,
          params: this.serializeToBidiValue(null),
        },
        this.id,
      );
    }

    // Dispose children after the events are emitted.
    this.#deleteAllChildren();

    this.#eventManager.clearBufferedEvents(this.id);

    this.#browsingContextStorage.deleteContextById(this.id);
  }

  /** Returns the ID of this context. */
  get id(): BrowsingContext.BrowsingContext {
    return this.#id;
  }

  /** Returns the parent context ID. */
  get parentId(): BrowsingContext.BrowsingContext | null {
    return this.#parentId;
  }

  /** Sets the parent context ID and updates parent's children. */
  set parentId(parentId: BrowsingContext.BrowsingContext | null) {
    if (this.#parentId !== null) {
      this.#logger?.(LogType.debugError, 'Parent context already set');
      // Cannot do anything except logging, as throwing will stop event processing. So
      // just return,
      return;
    }

    this.#parentId = parentId;

    if (!this.isTopLevelContext()) {
      this.parent!.addChild(this.id);
    }
  }

  /** Returns the parent context. */
  get parent(): BrowsingContextImpl | null {
    if (this.parentId === null) {
      return null;
    }
    return this.#browsingContextStorage.getContext(this.parentId);
  }

  /** Returns all direct children contexts. */
  get directChildren(): BrowsingContextImpl[] {
    return [...this.#children].map((id) =>
      this.#browsingContextStorage.getContext(id),
    );
  }

  /** Returns all children contexts, flattened. */
  get allChildren(): BrowsingContextImpl[] {
    const children = this.directChildren;
    return children.concat(...children.map((child) => child.allChildren));
  }

  /**
   * Returns true if this is a top-level context.
   * This is the case whenever the parent context ID is null.
   */
  isTopLevelContext(): boolean {
    return this.#parentId === null;
  }

  get top(): BrowsingContextImpl {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let topContext: BrowsingContextImpl = this;
    let parent = topContext.parent;
    while (parent) {
      topContext = parent;
      parent = topContext.parent;
    }
    return topContext;
  }

  addChild(childId: BrowsingContext.BrowsingContext) {
    this.#children.add(childId);
  }

  #deleteAllChildren(emitContextDestroyed: boolean = false) {
    this.directChildren.map((child) => child.dispose(emitContextDestroyed));
  }

  get cdpTarget(): CdpTarget {
    return this.#cdpTarget;
  }

  updateCdpTarget(cdpTarget: CdpTarget) {
    this.#cdpTarget = cdpTarget;
    this.#initListeners();
  }

  get url(): string {
    return this.#navigationTracker.url;
  }

  async lifecycleLoaded() {
    await this.#lifecycle.load;
  }

  async targetUnblockedOrThrow(): Promise<void> {
    const result = await this.#cdpTarget.unblocked;
    if (result.kind === 'error') {
      throw result.error;
    }
  }

  /** Returns a sandbox for internal helper scripts which is not exposed to the user.*/
  async getOrCreateHiddenSandbox(): Promise<Realm> {
    return await this.#getOrCreateSandboxInternal(this.#hiddenSandbox);
  }

  /** Returns a sandbox which is exposed to user. */
  async getOrCreateUserSandbox(sandbox: string | undefined): Promise<Realm> {
    const realm = await this.#getOrCreateSandboxInternal(sandbox);
    if (realm.isHidden()) {
      throw new NoSuchFrameException(`Realm "${sandbox}" not found`);
    }
    return realm;
  }

  async #getOrCreateSandboxInternal(
    sandbox: string | undefined,
  ): Promise<Realm> {
    if (sandbox === undefined || sandbox === '') {
      // Default realm is not guaranteed to be created at this point, so return a deferred.
      return await this.#defaultRealmDeferred;
    }

    let maybeSandboxes = this.#realmStorage.findRealms({
      browsingContextId: this.id,
      sandbox,
    });

    if (maybeSandboxes.length === 0) {
      await this.#cdpTarget.cdpClient.sendCommand('Page.createIsolatedWorld', {
        frameId: this.id,
        worldName: sandbox,
      });
      // `Runtime.executionContextCreated` should be emitted by the time the
      // previous command is done.
      maybeSandboxes = this.#realmStorage.findRealms({
        browsingContextId: this.id,
        sandbox,
      });
      assert(maybeSandboxes.length !== 0);
    }
    // It's possible for more than one sandbox to be created due to provisional
    // frames. In this case, it's always the first one (i.e. the oldest one)
    // that is more relevant since the user may have set that one up already
    // through evaluation.
    return maybeSandboxes[0]!;
  }

  /**
   * Implements https://w3c.github.io/webdriver-bidi/#get-the-navigable-info.
   */
  serializeToBidiValue(
    maxDepth: number | null = 0,
    addParentField = true,
  ): BrowsingContext.Info {
    return {
      context: this.#id,
      url: this.url,
      userContext: this.userContext,
      originalOpener: this.#originalOpener ?? null,
      clientWindow: `${this.cdpTarget.windowId}`,
      children:
        maxDepth === null || maxDepth > 0
          ? this.directChildren.map((c) =>
              c.serializeToBidiValue(
                maxDepth === null ? maxDepth : maxDepth - 1,
                false,
              ),
            )
          : null,
      ...(addParentField ? {parent: this.#parentId} : {}),
    };
  }

  onTargetInfoChanged(params: Protocol.Target.TargetInfoChangedEvent) {
    this.#navigationTracker.onTargetInfoChanged(params.targetInfo.url);
  }

  #initListeners() {
    this.#cdpTarget.cdpClient.on('Network.loadingFailed', (params) => {
      // Detect navigation errors like `net::ERR_BLOCKED_BY_RESPONSE`.
      // Network related to navigation has request id equals to navigation's loader id.
      this.#navigationTracker.networkLoadingFailed(
        params.requestId,
        params.errorText,
      );
    });

    this.#cdpTarget.cdpClient.on('Page.fileChooserOpened', (params) => {
      if (this.id !== params.frameId) {
        return;
      }

      if (this.#loaderId === undefined) {
        this.#logger?.(
          LogType.debugError,
          'LoaderId should be defined when file upload is shown',
          params,
        );
        return;
      }

      const element =
        params.backendNodeId === undefined
          ? undefined
          : {
              sharedId: getSharedId(
                this.id,
                this.#loaderId,
                params.backendNodeId,
              ),
            };
      this.#eventManager.registerEvent(
        {
          type: 'event',
          method: ChromiumBidi.Input.EventNames.FileDialogOpened,
          params: {
            context: this.id,
            multiple: params.mode === 'selectMultiple',
            element,
          },
        },
        this.id,
      );
    });

    this.#cdpTarget.cdpClient.on('Page.frameNavigated', (params) => {
      if (this.id !== params.frame.id) {
        return;
      }
      this.#navigationTracker.frameNavigated(
        params.frame.url + (params.frame.urlFragment ?? ''),
        params.frame.loaderId,
        // `unreachableUrl` indicates if the navigation failed.
        params.frame.unreachableUrl,
      );

      // At the point the page is initialized, all the nested iframes from the
      // previous page are detached and realms are destroyed.
      // Delete children from context.
      this.#deleteAllChildren();

      this.#documentChanged(params.frame.loaderId);
    });

    this.#cdpTarget.cdpClient.on('Page.frameStartedNavigating', (params) => {
      if (this.id !== params.frameId) {
        return;
      }

      this.#navigationTracker.frameStartedNavigating(
        params.url,
        params.loaderId,
        params.navigationType,
      );
    });

    this.#cdpTarget.cdpClient.on('Page.navigatedWithinDocument', (params) => {
      if (this.id !== params.frameId) {
        return;
      }
      this.#navigationTracker.navigatedWithinDocument(
        params.url,
        params.navigationType,
      );
      if (params.navigationType === 'historyApi') {
        this.#eventManager.registerEvent(
          {
            type: 'event',
            method: 'browsingContext.historyUpdated',
            params: {
              context: this.id,
              timestamp: getTimestamp(),
              url: this.#navigationTracker.url,
            },
          },
          this.id,
        );
        return;
      }
    });

    this.#cdpTarget.cdpClient.on('Page.lifecycleEvent', (params) => {
      if (this.id !== params.frameId) {
        return;
      }

      if (params.name === 'init') {
        this.#documentChanged(params.loaderId);
        return;
      }

      if (params.name === 'commit') {
        this.#loaderId = params.loaderId;
        return;
      }

      // If mapper attached to the page late, it might miss init and
      // commit events. In that case, save the first loaderId for this
      // frameId.
      if (!this.#loaderId) {
        this.#loaderId = params.loaderId;
      }

      // Ignore event from not current navigation.
      if (params.loaderId !== this.#loaderId) {
        return;
      }

      switch (params.name) {
        case 'DOMContentLoaded':
          if (!this.#navigationTracker.isInitialNavigation) {
            // Do not emit for the initial navigation.
            this.#eventManager.registerEvent(
              {
                type: 'event',
                method:
                  ChromiumBidi.BrowsingContext.EventNames.DomContentLoaded,
                params: {
                  context: this.id,
                  navigation: this.#navigationTracker.currentNavigationId,
                  timestamp: getTimestamp(),
                  url: this.#navigationTracker.url,
                },
              },
              this.id,
            );
          }
          this.#lifecycle.DOMContentLoaded.resolve();
          break;

        case 'load':
          if (!this.#navigationTracker.isInitialNavigation) {
            // Do not emit for the initial navigation.
            this.#eventManager.registerEvent(
              {
                type: 'event',
                method: ChromiumBidi.BrowsingContext.EventNames.Load,
                params: {
                  context: this.id,
                  navigation: this.#navigationTracker.currentNavigationId,
                  timestamp: getTimestamp(),
                  url: this.#navigationTracker.url,
                },
              },
              this.id,
            );
          }
          // The initial navigation is finished.
          this.#navigationTracker.loadPageEvent(params.loaderId);
          this.#lifecycle.load.resolve();
          break;
      }
    });

    this.#cdpTarget.cdpClient.on(
      'Runtime.executionContextCreated',
      (params) => {
        const {auxData, name, uniqueId, id} = params.context;
        if (!auxData || auxData.frameId !== this.id) {
          return;
        }

        let origin: string;
        let sandbox: string | undefined;
        // Only these execution contexts are supported for now.
        switch (auxData.type) {
          case 'isolated':
            sandbox = name;
            // Sandbox should have the same origin as the context itself, but in CDP
            // it has an empty one.
            if (!this.#defaultRealmDeferred.isFinished) {
              this.#logger?.(
                LogType.debugError,
                'Unexpectedly, isolated realm created before the default one',
              );
            }
            origin = this.#defaultRealmDeferred.isFinished
              ? this.#defaultRealmDeferred.result.origin
              : // This fallback is not expected to be ever reached.
                '';
            break;
          case 'default':
            origin = serializeOrigin(params.context.origin);
            break;
          default:
            return;
        }
        const realm = new WindowRealm(
          this.id,
          this.#browsingContextStorage,
          this.#cdpTarget.cdpClient,
          this.#eventManager,
          id,
          this.#logger,
          origin,
          uniqueId,
          this.#realmStorage,
          sandbox,
        );

        if (auxData.isDefault) {
          this.#defaultRealmDeferred.resolve(realm);

          // Initialize ChannelProxy listeners for all the channels of all the
          // preload scripts related to this BrowsingContext.
          // TODO: extend for not default realms by the sandbox name.
          void Promise.all(
            this.#cdpTarget
              .getChannels()
              .map((channel) =>
                channel.startListenerFromWindow(realm, this.#eventManager),
              ),
          );
        }
      },
    );

    this.#cdpTarget.cdpClient.on(
      'Runtime.executionContextDestroyed',
      (params) => {
        if (
          this.#defaultRealmDeferred.isFinished &&
          this.#defaultRealmDeferred.result.executionContextId ===
            params.executionContextId
        ) {
          this.#defaultRealmDeferred = new Deferred<Realm>();
        }

        this.#realmStorage.deleteRealms({
          cdpSessionId: this.#cdpTarget.cdpSessionId,
          executionContextId: params.executionContextId,
        });
      },
    );

    this.#cdpTarget.cdpClient.on('Runtime.executionContextsCleared', () => {
      if (!this.#defaultRealmDeferred.isFinished) {
        this.#defaultRealmDeferred.reject(
          new UnknownErrorException('execution contexts cleared'),
        );
      }
      this.#defaultRealmDeferred = new Deferred<Realm>();
      this.#realmStorage.deleteRealms({
        cdpSessionId: this.#cdpTarget.cdpSessionId,
      });
    });

    this.#cdpTarget.cdpClient.on('Page.javascriptDialogClosed', (params) => {
      // Checking for `params.frameId` for comptaibility with Chrome
      // versions that do not have a frameId. TODO: remove once
      // https://crrev.com/c/6487891 is in stable.
      if (params.frameId && this.id !== params.frameId) {
        return;
      }
      if (
        !params.frameId &&
        this.#parentId &&
        this.#cdpTarget.cdpClient !==
          this.#browsingContextStorage.getContext(this.#parentId)?.cdpTarget
            .cdpClient
      ) {
        // If CDP event `Page.javascriptDialogClosed` does not have a frameId, this
        // heuristic emits the event only for top-level per-cdp target context, ignoring
        // the event for same-process iframes. So the event will be emitted only once per
        // CDP target. TODO: remove once https://crrev.com/c/6487891 is in stable.
        return;
      }
      const accepted = params.result;
      if (this.#lastUserPromptType === undefined) {
        this.#logger?.(
          LogType.debugError,
          'Unexpectedly no opening prompt event before closing one',
        );
      }
      this.#eventManager.registerEvent(
        {
          type: 'event',
          method: ChromiumBidi.BrowsingContext.EventNames.UserPromptClosed,
          params: {
            context: this.id,
            accepted,
            // `lastUserPromptType` should never be undefined here, so fallback to
            // `UNKNOWN`. The fallback is required to prevent tests from hanging while
            // waiting for the closing event. The cast is required, as the `UNKNOWN` value
            // is not standard.
            type:
              this.#lastUserPromptType ??
              ('UNKNOWN' as BrowsingContext.UserPromptType),
            userText:
              accepted && params.userInput ? params.userInput : undefined,
          },
        },
        this.id,
      );
      this.#lastUserPromptType = undefined;
    });

    this.#cdpTarget.cdpClient.on('Page.javascriptDialogOpening', (params) => {
      // Checking for `params.frameId` for comptaibility with Chrome
      // versions that do not have a frameId. TODO: remove once
      // https://crrev.com/c/6487891 is in stable.
      if (params.frameId && this.id !== params.frameId) {
        return;
      }
      if (
        !params.frameId &&
        this.#parentId &&
        this.#cdpTarget.cdpClient !==
          this.#browsingContextStorage.getContext(this.#parentId)?.cdpTarget
            .cdpClient
      ) {
        // If CDP event `Page.javascriptDialogClosed` does not have a frameId, this
        // heuristic emits the event only for top-level per-cdp target context, ignoring
        // the event for same-process iframes. So the event will be emitted only once per
        // CDP target. TODO: remove once https://crrev.com/c/6487891 is in stable.
        return;
      }
      const promptType = BrowsingContextImpl.#getPromptType(params.type);
      // Set the last prompt type to provide it in closing event.
      this.#lastUserPromptType = promptType;
      const promptHandler = this.#getPromptHandler(promptType);
      this.#eventManager.registerEvent(
        {
          type: 'event',
          method: ChromiumBidi.BrowsingContext.EventNames.UserPromptOpened,
          params: {
            context: this.id,
            handler: promptHandler,
            type: promptType,
            message: params.message,
            ...(params.type === 'prompt'
              ? {defaultValue: params.defaultPrompt}
              : {}),
          },
        },
        this.id,
      );

      switch (promptHandler) {
        // Based on `unhandledPromptBehavior`, check if the prompt should be handled
        // automatically (`accept`, `dismiss`) or wait for the user to do it.
        case Session.UserPromptHandlerType.Accept:
          void this.handleUserPrompt(true);
          break;
        case Session.UserPromptHandlerType.Dismiss:
          void this.handleUserPrompt(false);
          break;
        case Session.UserPromptHandlerType.Ignore:
          break;
      }
    });

    this.#cdpTarget.browserCdpClient.on(
      'Browser.downloadWillBegin',
      (params) => {
        if (this.id !== params.frameId) {
          return;
        }

        this.#downloadIdToUrlMap.set(params.guid, params.url);

        this.#eventManager.registerEvent(
          {
            type: 'event',
            method: ChromiumBidi.BrowsingContext.EventNames.DownloadWillBegin,
            params: {
              context: this.id,
              suggestedFilename: params.suggestedFilename,
              navigation: params.guid,
              timestamp: getTimestamp(),
              url: params.url,
            },
          },
          this.id,
        );
      },
    );

    this.#cdpTarget.browserCdpClient.on(
      'Browser.downloadProgress',
      (params) => {
        if (!this.#downloadIdToUrlMap.has(params.guid)) {
          // The event is not related to this browsing context.
          return;
        }

        if (params.state === 'inProgress') {
          // No need in reporting progress.
          return;
        }

        const url = this.#downloadIdToUrlMap.get(params.guid)!;

        switch (params.state) {
          case 'canceled':
            this.#eventManager.registerEvent(
              {
                type: 'event',
                method: ChromiumBidi.BrowsingContext.EventNames.DownloadEnd,
                params: {
                  status: 'canceled',
                  context: this.id,
                  navigation: params.guid,
                  timestamp: getTimestamp(),
                  url,
                },
              },
              this.id,
            );
            break;
          case 'completed':
            this.#eventManager.registerEvent(
              {
                type: 'event',
                method: ChromiumBidi.BrowsingContext.EventNames.DownloadEnd,
                params: {
                  filepath: params.filePath ?? null,
                  status: 'complete',
                  context: this.id,
                  navigation: params.guid,
                  timestamp: getTimestamp(),
                  url,
                },
              },
              this.id,
            );
            break;
          default:
            // Unreachable.
            throw new UnknownErrorException(
              `Unknown download state: ${params.state}`,
            );
        }
      },
    );
  }

  static #getPromptType(
    cdpType: Protocol.Page.DialogType,
  ): BrowsingContext.UserPromptType {
    switch (cdpType) {
      case 'alert':
        return BrowsingContext.UserPromptType.Alert;
      case 'beforeunload':
        return BrowsingContext.UserPromptType.Beforeunload;
      case 'confirm':
        return BrowsingContext.UserPromptType.Confirm;
      case 'prompt':
        return BrowsingContext.UserPromptType.Prompt;
    }
  }

  /**
   * Returns either custom UserContext's prompt handler, global or default one.
   */
  #getPromptHandler(
    promptType: BrowsingContext.UserPromptType,
  ): Session.UserPromptHandlerType {
    const defaultPromptHandler = Session.UserPromptHandlerType.Dismiss;

    switch (promptType) {
      case BrowsingContext.UserPromptType.Alert:
        return (
          this.#userContextConfig.userPromptHandler?.alert ??
          this.#userContextConfig.userPromptHandler?.default ??
          this.#unhandledPromptBehavior?.alert ??
          this.#unhandledPromptBehavior?.default ??
          defaultPromptHandler
        );
      case BrowsingContext.UserPromptType.Beforeunload:
        return (
          this.#userContextConfig.userPromptHandler?.beforeUnload ??
          this.#userContextConfig.userPromptHandler?.default ??
          this.#unhandledPromptBehavior?.beforeUnload ??
          this.#unhandledPromptBehavior?.default ??
          // In WebDriver Classic spec, `beforeUnload` prompt should be accepted by
          // default. Step 4 of "Get the prompt handler" algorithm
          // (https://w3c.github.io/webdriver/#dfn-get-the-prompt-handler):
          // > If type is "beforeUnload", return a prompt handler configuration with
          //   handler "accept" and notify false.
          Session.UserPromptHandlerType.Accept
        );
      case BrowsingContext.UserPromptType.Confirm:
        return (
          this.#userContextConfig.userPromptHandler?.confirm ??
          this.#userContextConfig.userPromptHandler?.default ??
          this.#unhandledPromptBehavior?.confirm ??
          this.#unhandledPromptBehavior?.default ??
          defaultPromptHandler
        );
      case BrowsingContext.UserPromptType.Prompt:
        return (
          this.#userContextConfig.userPromptHandler?.prompt ??
          this.#userContextConfig.userPromptHandler?.default ??
          this.#unhandledPromptBehavior?.prompt ??
          this.#unhandledPromptBehavior?.default ??
          defaultPromptHandler
        );
    }
  }

  #documentChanged(loaderId?: Protocol.Network.LoaderId) {
    if (loaderId === undefined || this.#loaderId === loaderId) {
      return;
    }

    // Document changed.
    this.#resetLifecycleIfFinished();
    this.#loaderId = loaderId;
    // Delete all child iframes and notify about top level destruction.
    this.#deleteAllChildren(true);
  }

  #resetLifecycleIfFinished() {
    if (this.#lifecycle.DOMContentLoaded.isFinished) {
      this.#lifecycle.DOMContentLoaded = new Deferred();
    } else {
      this.#logger?.(
        BrowsingContextImpl.LOGGER_PREFIX,
        'Document changed (DOMContentLoaded)',
      );
    }

    if (this.#lifecycle.load.isFinished) {
      this.#lifecycle.load = new Deferred();
    } else {
      this.#logger?.(
        BrowsingContextImpl.LOGGER_PREFIX,
        'Document changed (load)',
      );
    }
  }

  #failLifecycleIfNotFinished() {
    if (!this.#lifecycle.DOMContentLoaded.isFinished) {
      this.#lifecycle.DOMContentLoaded.reject(
        new UnknownErrorException('navigation canceled'),
      );
    }

    if (!this.#lifecycle.load.isFinished) {
      this.#lifecycle.load.reject(
        new UnknownErrorException('navigation canceled'),
      );
    }
  }

  async navigate(
    url: string,
    wait: BrowsingContext.ReadinessState,
  ): Promise<BrowsingContext.NavigateResult> {
    try {
      new URL(url);
    } catch {
      throw new InvalidArgumentException(`Invalid URL: ${url}`);
    }

    const navigationState =
      this.#navigationTracker.createPendingNavigation(url);

    // Navigate and wait for the result. If the navigation fails, the error event is
    // emitted and the promise is rejected.
    const cdpNavigatePromise = (async () => {
      const cdpNavigateResult = await this.#cdpTarget.cdpClient.sendCommand(
        'Page.navigate',
        {
          url,
          frameId: this.id,
        },
      );

      if (cdpNavigateResult.errorText) {
        // If navigation failed, no pending navigation is left.
        this.#navigationTracker.failNavigation(
          navigationState,
          cdpNavigateResult.errorText,
        );
        throw new UnknownErrorException(cdpNavigateResult.errorText);
      }

      this.#navigationTracker.navigationCommandFinished(
        navigationState,
        cdpNavigateResult.loaderId,
      );

      this.#documentChanged(cdpNavigateResult.loaderId);
    })();

    // Wait for either the navigation is finished or canceled by another navigation.
    const result = await Promise.race([
      // No `loaderId` means same-document navigation.
      this.#waitNavigation(wait, cdpNavigatePromise, navigationState),
      // Throw an error if the navigation is canceled.
      navigationState.finished,
    ]);

    if (result instanceof NavigationResult) {
      if (
        // TODO: check after decision on the spec is done:
        //  https://github.com/w3c/webdriver-bidi/issues/799.
        result.eventName === NavigationEventName.NavigationAborted ||
        result.eventName === NavigationEventName.NavigationFailed
      ) {
        throw new UnknownErrorException(result.message ?? 'unknown exception');
      }
    }

    return {
      navigation: navigationState.navigationId,
      // Url can change due to redirects. Get the one from commandNavigation.
      url: navigationState.url,
    };
  }

  async #waitNavigation(
    wait: BrowsingContext.ReadinessState,
    cdpCommandPromise: Promise<void>,
    navigationState: NavigationState,
  ) {
    await Promise.all([navigationState.committed, cdpCommandPromise]);

    if (wait === BrowsingContext.ReadinessState.None) {
      return;
    }

    if (navigationState.isFragmentNavigation === true) {
      // After the cdp command is finished, the `fragmentNavigation` should be already
      // settled. If it's the fragment navigation, wait for the `navigationStatus` to be
      // finished, which happens after the fragment navigation happened. No need to wait for
      // DOM events.
      await navigationState.finished;
      return;
    }

    if (wait === BrowsingContext.ReadinessState.Interactive) {
      await this.#lifecycle.DOMContentLoaded;
      return;
    }

    if (wait === BrowsingContext.ReadinessState.Complete) {
      await this.#lifecycle.load;
      return;
    }

    throw new InvalidArgumentException(
      `Wait condition ${wait} is not supported`,
    );
  }

  // TODO: support concurrent navigations analogous to `navigate`.
  async reload(
    ignoreCache: boolean,
    wait: BrowsingContext.ReadinessState,
  ): Promise<BrowsingContext.NavigateResult> {
    await this.targetUnblockedOrThrow();

    this.#resetLifecycleIfFinished();

    const navigationState = this.#navigationTracker.createPendingNavigation(
      this.#navigationTracker.url,
    );

    const cdpReloadPromise = this.#cdpTarget.cdpClient.sendCommand(
      'Page.reload',
      {
        ignoreCache,
      },
    );

    // Wait for either the navigation is finished or canceled by another navigation.
    const result = await Promise.race([
      // No `loaderId` means same-document navigation.
      this.#waitNavigation(wait, cdpReloadPromise, navigationState),
      // Throw an error if the navigation is canceled.
      navigationState.finished,
    ]);

    if (result instanceof NavigationResult) {
      if (
        result.eventName === NavigationEventName.NavigationAborted ||
        result.eventName === NavigationEventName.NavigationFailed
      ) {
        throw new UnknownErrorException(result.message ?? 'unknown exception');
      }
    }

    return {
      navigation: navigationState.navigationId,
      // Url can change due to redirects. Get the one from commandNavigation.
      url: navigationState.url,
    };
  }

  async setViewport(
    viewport?: BrowsingContext.Viewport | null,
    devicePixelRatio?: number | null,
  ) {
    // Set the target's viewport.
    await this.cdpTarget.setViewport(viewport, devicePixelRatio);
  }

  async handleUserPrompt(accept?: boolean, userText?: string): Promise<void> {
    await this.#cdpTarget.cdpClient.sendCommand('Page.handleJavaScriptDialog', {
      accept: accept ?? true,
      promptText: userText,
    });
  }

  async activate(): Promise<void> {
    await this.#cdpTarget.cdpClient.sendCommand('Page.bringToFront');
  }

  async captureScreenshot(
    params: BrowsingContext.CaptureScreenshotParameters,
  ): Promise<BrowsingContext.CaptureScreenshotResult> {
    if (!this.isTopLevelContext()) {
      throw new UnsupportedOperationException(
        `Non-top-level 'context' (${params.context}) is currently not supported`,
      );
    }
    const formatParameters = getImageFormatParameters(params);

    let captureBeyondViewport = false;
    let script: string;
    params.origin ??= 'viewport';
    switch (params.origin) {
      case 'document': {
        script = String(() => {
          const element = document.documentElement;
          return {
            x: 0,
            y: 0,
            width: element.scrollWidth,
            height: element.scrollHeight,
          };
        });
        captureBeyondViewport = true;
        break;
      }
      case 'viewport': {
        script = String(() => {
          const viewport = window.visualViewport!;
          return {
            x: viewport.pageLeft,
            y: viewport.pageTop,
            width: viewport.width,
            height: viewport.height,
          };
        });
        break;
      }
    }
    const hiddenSandboxRealm = await this.getOrCreateHiddenSandbox();
    const originResult = await hiddenSandboxRealm.callFunction(script, false);
    assert(originResult.type === 'success');
    const origin = deserializeDOMRect(originResult.result);
    assert(origin);

    let rect = origin;
    if (params.clip) {
      const clip = params.clip;
      if (params.origin === 'viewport' && clip.type === 'box') {
        // For viewport origin, the clip is relative to the viewport, while the CDP
        // screenshot is relative to the document. So correction for the viewport position
        // is required.
        clip.x += origin.x;
        clip.y += origin.y;
      }
      rect = getIntersectionRect(await this.#parseRect(clip), origin);
    }

    if (rect.width === 0 || rect.height === 0) {
      throw new UnableToCaptureScreenException(
        `Unable to capture screenshot with zero dimensions: width=${rect.width}, height=${rect.height}`,
      );
    }

    return await this.#cdpTarget.cdpClient.sendCommand(
      'Page.captureScreenshot',
      {
        clip: {...rect, scale: 1.0},
        ...formatParameters,
        captureBeyondViewport,
      },
    );
  }

  async print(
    params: BrowsingContext.PrintParameters,
  ): Promise<BrowsingContext.PrintResult> {
    if (!this.isTopLevelContext()) {
      throw new UnsupportedOperationException(
        'Printing of non-top level contexts is not supported',
      );
    }

    const cdpParams: Protocol.Page.PrintToPDFRequest = {};

    if (params.background !== undefined) {
      cdpParams.printBackground = params.background;
    }
    if (params.margin?.bottom !== undefined) {
      cdpParams.marginBottom = inchesFromCm(params.margin.bottom);
    }
    if (params.margin?.left !== undefined) {
      cdpParams.marginLeft = inchesFromCm(params.margin.left);
    }
    if (params.margin?.right !== undefined) {
      cdpParams.marginRight = inchesFromCm(params.margin.right);
    }
    if (params.margin?.top !== undefined) {
      cdpParams.marginTop = inchesFromCm(params.margin.top);
    }
    if (params.orientation !== undefined) {
      cdpParams.landscape = params.orientation === 'landscape';
    }
    if (params.page?.height !== undefined) {
      cdpParams.paperHeight = inchesFromCm(params.page.height);
    }
    if (params.page?.width !== undefined) {
      cdpParams.paperWidth = inchesFromCm(params.page.width);
    }
    if (params.pageRanges !== undefined) {
      for (const range of params.pageRanges) {
        if (typeof range === 'number') {
          continue;
        }
        const rangeParts = range.split('-');
        if (rangeParts.length < 1 || rangeParts.length > 2) {
          throw new InvalidArgumentException(
            `Invalid page range: ${range} is not a valid integer range.`,
          );
        }
        if (rangeParts.length === 1) {
          void parseInteger(rangeParts[0] ?? '');
          continue;
        }
        let lowerBound: number;
        let upperBound: number;
        const [rangeLowerPart = '', rangeUpperPart = ''] = rangeParts;
        if (rangeLowerPart === '') {
          lowerBound = 1;
        } else {
          lowerBound = parseInteger(rangeLowerPart);
        }
        if (rangeUpperPart === '') {
          upperBound = Number.MAX_SAFE_INTEGER;
        } else {
          upperBound = parseInteger(rangeUpperPart);
        }
        if (lowerBound > upperBound) {
          throw new InvalidArgumentException(
            `Invalid page range: ${rangeLowerPart} > ${rangeUpperPart}`,
          );
        }
      }
      cdpParams.pageRanges = params.pageRanges.join(',');
    }
    if (params.scale !== undefined) {
      cdpParams.scale = params.scale;
    }
    if (params.shrinkToFit !== undefined) {
      cdpParams.preferCSSPageSize = !params.shrinkToFit;
    }

    try {
      const result = await this.#cdpTarget.cdpClient.sendCommand(
        'Page.printToPDF',
        cdpParams,
      );
      return {
        data: result.data,
      };
    } catch (error) {
      // Effectively zero dimensions.
      if (
        (error as Error).message ===
        'invalid print parameters: content area is empty'
      ) {
        throw new UnsupportedOperationException((error as Error).message);
      }
      throw error;
    }
  }

  /**
   * See
   * https://w3c.github.io/webdriver-bidi/#:~:text=If%20command%20parameters%20contains%20%22clip%22%3A
   */
  async #parseRect(clip: BrowsingContext.ClipRectangle) {
    switch (clip.type) {
      case 'box':
        return {x: clip.x, y: clip.y, width: clip.width, height: clip.height};
      case 'element': {
        const hiddenSandboxRealm = await this.getOrCreateHiddenSandbox();
        const result = await hiddenSandboxRealm.callFunction(
          String((element: unknown) => {
            return element instanceof Element;
          }),
          false,
          {type: 'undefined'},
          [clip.element],
        );
        if (result.type === 'exception') {
          throw new NoSuchElementException(
            `Element '${clip.element.sharedId}' was not found`,
          );
        }
        assert(result.result.type === 'boolean');
        if (!result.result.value) {
          throw new NoSuchElementException(
            `Node '${clip.element.sharedId}' is not an Element`,
          );
        }
        {
          const result = await hiddenSandboxRealm.callFunction(
            String((element: Element) => {
              const rect = element.getBoundingClientRect();
              return {
                x: rect.x,
                y: rect.y,
                height: rect.height,
                width: rect.width,
              };
            }),
            false,
            {type: 'undefined'},
            [clip.element],
          );
          assert(result.type === 'success');
          const rect = deserializeDOMRect(result.result);
          if (!rect) {
            throw new UnableToCaptureScreenException(
              `Could not get bounding box for Element '${clip.element.sharedId}'`,
            );
          }
          return rect;
        }
      }
    }
  }

  async close(): Promise<void> {
    await this.#cdpTarget.cdpClient.sendCommand('Page.close');
  }

  async traverseHistory(delta: number): Promise<void> {
    if (delta === 0) {
      return;
    }

    const history = await this.#cdpTarget.cdpClient.sendCommand(
      'Page.getNavigationHistory',
    );
    const entry = history.entries[history.currentIndex + delta];
    if (!entry) {
      throw new NoSuchHistoryEntryException(
        `No history entry at delta ${delta}`,
      );
    }
    await this.#cdpTarget.cdpClient.sendCommand('Page.navigateToHistoryEntry', {
      entryId: entry.id,
    });
  }

  async toggleModulesIfNeeded(): Promise<void> {
    await Promise.all([
      this.#cdpTarget.toggleNetworkIfNeeded(),
      this.#cdpTarget.toggleDeviceAccessIfNeeded(),
    ]);
  }

  async locateNodes(
    params: BrowsingContext.LocateNodesParameters,
  ): Promise<BrowsingContext.LocateNodesResult> {
    // TODO: create a dedicated sandbox instead of `#defaultRealm`.
    return await this.#locateNodesByLocator(
      await this.#defaultRealmDeferred,
      params.locator,
      params.startNodes ?? [],
      params.maxNodeCount,
      params.serializationOptions,
    );
  }

  async #getLocatorDelegate(
    realm: Realm,
    locator: BrowsingContext.Locator,
    maxNodeCount: number | undefined,
    startNodes: Script.SharedReference[],
  ): Promise<{
    functionDeclaration: string;
    argumentsLocalValues: Script.LocalValue[];
  }> {
    switch (locator.type) {
      case 'context':
        throw new Error('Unreachable');
      case 'css':
        return {
          functionDeclaration: String(
            (
              cssSelector: string,
              maxNodeCount: number,
              ...startNodes: Node[]
            ) => {
              const locateNodesUsingCss = (element: Node) => {
                if (
                  !(
                    element instanceof HTMLElement ||
                    element instanceof Document ||
                    element instanceof DocumentFragment ||
                    element instanceof SVGElement
                  )
                ) {
                  throw new Error(
                    'startNodes in css selector should be HTMLElement, SVGElement or Document or DocumentFragment',
                  );
                }
                return [...element.querySelectorAll(cssSelector)];
              };

              startNodes = startNodes.length > 0 ? startNodes : [document];
              const returnedNodes = startNodes
                .map((startNode) =>
                  // TODO: stop search early if `maxNodeCount` is reached.
                  locateNodesUsingCss(startNode),
                )
                .flat(1);
              return maxNodeCount === 0
                ? returnedNodes
                : returnedNodes.slice(0, maxNodeCount);
            },
          ),
          argumentsLocalValues: [
            // `cssSelector`
            {type: 'string', value: locator.value},
            // `maxNodeCount` with `0` means no limit.
            {type: 'number', value: maxNodeCount ?? 0},
            // `startNodes`
            ...startNodes,
          ],
        };
      case 'xpath':
        return {
          functionDeclaration: String(
            (
              xPathSelector: string,
              maxNodeCount: number,
              ...startNodes: Node[]
            ) => {
              // https://w3c.github.io/webdriver-bidi/#locate-nodes-using-xpath
              const evaluator = new XPathEvaluator();
              const expression = evaluator.createExpression(xPathSelector);
              const locateNodesUsingXpath = (element: Node) => {
                const xPathResult = expression.evaluate(
                  element,
                  XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
                );
                const returnedNodes = [];
                for (let i = 0; i < xPathResult.snapshotLength; i++) {
                  returnedNodes.push(xPathResult.snapshotItem(i));
                }
                return returnedNodes;
              };
              startNodes = startNodes.length > 0 ? startNodes : [document];
              const returnedNodes = startNodes
                .map((startNode) =>
                  // TODO: stop search early if `maxNodeCount` is reached.
                  locateNodesUsingXpath(startNode),
                )
                .flat(1);
              return maxNodeCount === 0
                ? returnedNodes
                : returnedNodes.slice(0, maxNodeCount);
            },
          ),
          argumentsLocalValues: [
            // `xPathSelector`
            {type: 'string', value: locator.value},
            // `maxNodeCount` with `0` means no limit.
            {type: 'number', value: maxNodeCount ?? 0},
            // `startNodes`
            ...startNodes,
          ],
        };
      case 'innerText':
        // https://w3c.github.io/webdriver-bidi/#locate-nodes-using-inner-text
        if (locator.value === '') {
          throw new InvalidSelectorException(
            'innerText locator cannot be empty',
          );
        }
        return {
          functionDeclaration: String(
            (
              innerTextSelector: string,
              fullMatch: boolean,
              ignoreCase: boolean,
              maxNodeCount: number,
              maxDepth: number,
              ...startNodes: Node[]
            ) => {
              const searchText = ignoreCase
                ? innerTextSelector.toUpperCase()
                : innerTextSelector;
              const locateNodesUsingInnerText: (
                node: Node,
                currentMaxDepth: number,
              ) => HTMLElement[] = (node: Node, currentMaxDepth: number) => {
                const returnedNodes: HTMLElement[] = [];
                if (
                  node instanceof DocumentFragment ||
                  node instanceof Document
                ) {
                  const children = [...node.children];
                  children.forEach((child) =>
                    // `currentMaxDepth` is not decremented intentionally according to
                    // https://github.com/w3c/webdriver-bidi/pull/713.
                    returnedNodes.push(
                      ...locateNodesUsingInnerText(child, currentMaxDepth),
                    ),
                  );
                  return returnedNodes;
                }

                if (!(node instanceof HTMLElement)) {
                  return [];
                }

                const element = node;
                const nodeInnerText = ignoreCase
                  ? element.innerText?.toUpperCase()
                  : element.innerText;
                if (!nodeInnerText.includes(searchText)) {
                  return [];
                }
                const childNodes = [];
                for (const child of element.children) {
                  if (child instanceof HTMLElement) {
                    childNodes.push(child);
                  }
                }
                if (childNodes.length === 0) {
                  if (fullMatch && nodeInnerText === searchText) {
                    returnedNodes.push(element);
                  } else {
                    if (!fullMatch) {
                      // Note: `nodeInnerText.includes(searchText)` is already checked
                      returnedNodes.push(element);
                    }
                  }
                } else {
                  const childNodeMatches =
                    // Don't search deeper if `maxDepth` is reached.
                    currentMaxDepth <= 0
                      ? []
                      : childNodes
                          .map((child) =>
                            locateNodesUsingInnerText(
                              child,
                              currentMaxDepth - 1,
                            ),
                          )
                          .flat(1);
                  if (childNodeMatches.length === 0) {
                    // Note: `nodeInnerText.includes(searchText)` is already checked
                    if (!fullMatch || nodeInnerText === searchText) {
                      returnedNodes.push(element);
                    }
                  } else {
                    returnedNodes.push(...childNodeMatches);
                  }
                }
                // TODO: stop search early if `maxNodeCount` is reached.
                return returnedNodes;
              };
              // TODO: stop search early if `maxNodeCount` is reached.
              startNodes = startNodes.length > 0 ? startNodes : [document];
              const returnedNodes = startNodes
                .map((startNode) =>
                  // TODO: stop search early if `maxNodeCount` is reached.
                  locateNodesUsingInnerText(startNode, maxDepth),
                )
                .flat(1);
              return maxNodeCount === 0
                ? returnedNodes
                : returnedNodes.slice(0, maxNodeCount);
            },
          ),
          argumentsLocalValues: [
            // `innerTextSelector`
            {type: 'string', value: locator.value},
            // `fullMatch` with default `true`.
            {type: 'boolean', value: locator.matchType !== 'partial'},
            // `ignoreCase` with default `false`.
            {type: 'boolean', value: locator.ignoreCase === true},
            // `maxNodeCount` with `0` means no limit.
            {type: 'number', value: maxNodeCount ?? 0},
            // `maxDepth` with default `1000` (same as default full serialization depth).
            {type: 'number', value: locator.maxDepth ?? 1000},
            // `startNodes`
            ...startNodes,
          ],
        };
      case 'accessibility': {
        // https://w3c.github.io/webdriver-bidi/#locate-nodes-using-accessibility-attributes
        if (!locator.value.name && !locator.value.role) {
          throw new InvalidSelectorException(
            'Either name or role has to be specified',
          );
        }

        // The next two commands cause a11y caches for the target to be
        // preserved. We probably do not need to disable them if the
        // client is using a11y features, but we could by calling
        // Accessibility.disable.
        await Promise.all([
          this.#cdpTarget.cdpClient.sendCommand('Accessibility.enable'),
          this.#cdpTarget.cdpClient.sendCommand('Accessibility.getRootAXNode'),
        ]);
        const bindings = await realm.evaluate(
          /* expression=*/ '({getAccessibleName, getAccessibleRole})',
          /* awaitPromise=*/ false,
          /* resultOwnership=*/ Script.ResultOwnership.Root,
          /* serializationOptions= */ undefined,
          /* userActivation=*/ false,
          /* includeCommandLineApi=*/ true,
        );

        if (bindings.type !== 'success') {
          throw new Error('Could not get bindings');
        }

        if (bindings.result.type !== 'object') {
          throw new Error('Could not get bindings');
        }
        return {
          functionDeclaration: String(
            (
              name: string,
              role: string,
              bindings: any,
              maxNodeCount: number,
              ...startNodes: Element[]
            ) => {
              const returnedNodes: Element[] = [];

              let aborted = false;

              function collect(
                contextNodes: Element[],
                selector: {role: string; name: string},
              ) {
                if (aborted) {
                  return;
                }
                for (const contextNode of contextNodes) {
                  let match = true;

                  if (selector.role) {
                    const role = bindings.getAccessibleRole(contextNode);
                    if (selector.role !== role) {
                      match = false;
                    }
                  }

                  if (selector.name) {
                    const name = bindings.getAccessibleName(contextNode);
                    if (selector.name !== name) {
                      match = false;
                    }
                  }

                  if (match) {
                    if (
                      maxNodeCount !== 0 &&
                      returnedNodes.length === maxNodeCount
                    ) {
                      aborted = true;
                      break;
                    }

                    returnedNodes.push(contextNode);
                  }

                  const childNodes: Element[] = [];
                  for (const child of contextNode.children) {
                    if (child instanceof HTMLElement) {
                      childNodes.push(child);
                    }
                  }

                  collect(childNodes, selector);
                }
              }

              startNodes =
                startNodes.length > 0
                  ? startNodes
                  : Array.from(document.documentElement.children).filter(
                      (c) => c instanceof HTMLElement,
                    );
              collect(startNodes, {
                role,
                name,
              });
              return returnedNodes;
            },
          ),
          argumentsLocalValues: [
            // `name`
            {type: 'string', value: locator.value.name || ''},
            // `role`
            {type: 'string', value: locator.value.role || ''},
            // `bindings`.
            {handle: bindings.result.handle!},
            // `maxNodeCount` with `0` means no limit.
            {type: 'number', value: maxNodeCount ?? 0},
            // `startNodes`
            ...startNodes,
          ],
        };
      }
    }
  }

  async #locateNodesByLocator(
    realm: Realm,
    locator: BrowsingContext.Locator,
    startNodes: Script.SharedReference[],
    maxNodeCount: number | undefined,
    serializationOptions: Script.SerializationOptions | undefined,
  ): Promise<BrowsingContext.LocateNodesResult> {
    if (locator.type === 'context') {
      if (startNodes.length !== 0) {
        throw new InvalidArgumentException('Start nodes are not supported');
      }
      const contextId = locator.value.context;
      if (!contextId) {
        throw new InvalidSelectorException('Invalid context');
      }
      const context = this.#browsingContextStorage.getContext(contextId);
      const parent = context.parent;
      if (!parent) {
        throw new InvalidArgumentException('This context has no container');
      }
      try {
        const {backendNodeId} = await parent.#cdpTarget.cdpClient.sendCommand(
          'DOM.getFrameOwner',
          {
            frameId: contextId,
          },
        );
        const {object} = await parent.#cdpTarget.cdpClient.sendCommand(
          'DOM.resolveNode',
          {
            backendNodeId,
          },
        );
        const locatorResult = await realm.callFunction(
          `function () { return this; }`,
          false,
          {handle: object.objectId!},
          [],
          Script.ResultOwnership.None,
          serializationOptions,
        );
        if (locatorResult.type === 'exception') {
          throw new Error('Unknown exception');
        }
        return {nodes: [locatorResult.result as Script.NodeRemoteValue]};
      } catch {
        throw new InvalidArgumentException('Context does not exist');
      }
    }
    const locatorDelegate = await this.#getLocatorDelegate(
      realm,
      locator,
      maxNodeCount,
      startNodes,
    );

    serializationOptions = {
      ...serializationOptions,
      // The returned object is an array of nodes, so no need in deeper JS serialization.
      maxObjectDepth: 1,
    };

    const locatorResult = await realm.callFunction(
      locatorDelegate.functionDeclaration,
      false,
      {type: 'undefined'},
      locatorDelegate.argumentsLocalValues,
      Script.ResultOwnership.None,
      serializationOptions,
    );

    if (locatorResult.type !== 'success') {
      this.#logger?.(
        BrowsingContextImpl.LOGGER_PREFIX,
        'Failed locateNodesByLocator',
        locatorResult,
      );

      // Heuristic to detect invalid selector for different types of selectors.
      if (
        // CSS selector.
        locatorResult.exceptionDetails.text?.endsWith(
          'is not a valid selector.',
        ) ||
        // XPath selector.
        locatorResult.exceptionDetails.text?.endsWith(
          'is not a valid XPath expression.',
        )
      ) {
        throw new InvalidSelectorException(
          `Not valid selector ${typeof locator.value === 'string' ? locator.value : JSON.stringify(locator.value)}`,
        );
      }
      // Heuristic to detect if the `startNode` is not an `HTMLElement` in css selector.
      if (
        locatorResult.exceptionDetails.text ===
        'Error: startNodes in css selector should be HTMLElement, SVGElement or Document or DocumentFragment'
      ) {
        throw new InvalidArgumentException(
          'startNodes in css selector should be HTMLElement, SVGElement or Document or DocumentFragment',
        );
      }
      throw new UnknownErrorException(
        `Unexpected error in selector script: ${locatorResult.exceptionDetails.text}`,
      );
    }

    if (locatorResult.result.type !== 'array') {
      throw new UnknownErrorException(
        `Unexpected selector script result type: ${locatorResult.result.type}`,
      );
    }

    // Check there are no non-node elements in the result.
    const nodes = locatorResult.result.value!.map(
      (value): Script.NodeRemoteValue => {
        if (value.type !== 'node') {
          throw new UnknownErrorException(
            `Unexpected selector script result element: ${value.type}`,
          );
        }
        return value;
      },
    );

    return {nodes};
  }
}

export function serializeOrigin(origin: string) {
  // https://html.spec.whatwg.org/multipage/origin.html#ascii-serialisation-of-an-origin
  if (['://', ''].includes(origin)) {
    origin = 'null';
  }
  return origin;
}

function getImageFormatParameters(
  params: Readonly<BrowsingContext.CaptureScreenshotParameters>,
) {
  const {quality, type} = params.format ?? {
    type: 'image/png',
  };
  switch (type) {
    case 'image/png': {
      return {format: 'png'} as const;
    }
    case 'image/jpeg': {
      return {
        format: 'jpeg',
        ...(quality === undefined ? {} : {quality: Math.round(quality * 100)}),
      } as const;
    }
    case 'image/webp': {
      return {
        format: 'webp',
        ...(quality === undefined ? {} : {quality: Math.round(quality * 100)}),
      } as const;
    }
  }
  throw new InvalidArgumentException(
    `Image format '${type}' is not a supported format`,
  );
}

function deserializeDOMRect(
  result: Script.RemoteValue,
): Protocol.DOM.Rect | undefined {
  if (result.type !== 'object' || result.value === undefined) {
    return;
  }
  const x = result.value.find(([key]) => {
    return key === 'x';
  })?.[1];
  const y = result.value.find(([key]) => {
    return key === 'y';
  })?.[1];
  const height = result.value.find(([key]) => {
    return key === 'height';
  })?.[1];
  const width = result.value.find(([key]) => {
    return key === 'width';
  })?.[1];
  if (
    x?.type !== 'number' ||
    y?.type !== 'number' ||
    height?.type !== 'number' ||
    width?.type !== 'number'
  ) {
    return;
  }
  return {
    x: x.value,
    y: y.value,
    width: width.value,
    height: height.value,
  } as Protocol.DOM.Rect;
}

/** @see https://w3c.github.io/webdriver-bidi/#normalize-rect */
function normalizeRect(box: Readonly<Protocol.DOM.Rect>): Protocol.DOM.Rect {
  return {
    ...(box.width < 0
      ? {
          x: box.x + box.width,
          width: -box.width,
        }
      : {
          x: box.x,
          width: box.width,
        }),
    ...(box.height < 0
      ? {
          y: box.y + box.height,
          height: -box.height,
        }
      : {
          y: box.y,
          height: box.height,
        }),
  };
}

/** @see https://w3c.github.io/webdriver-bidi/#rectangle-intersection */
function getIntersectionRect(
  first: Readonly<Protocol.DOM.Rect>,
  second: Readonly<Protocol.DOM.Rect>,
): Protocol.DOM.Rect {
  first = normalizeRect(first);
  second = normalizeRect(second);
  const x = Math.max(first.x, second.x);
  const y = Math.max(first.y, second.y);
  return {
    x,
    y,
    width: Math.max(
      Math.min(first.x + first.width, second.x + second.width) - x,
      0,
    ),
    height: Math.max(
      Math.min(first.y + first.height, second.y + second.height) - y,
      0,
    ),
  };
}

function parseInteger(value: string) {
  value = value.trim();
  if (!/^[0-9]+$/.test(value)) {
    throw new InvalidArgumentException(`Invalid integer: ${value}`);
  }
  return parseInt(value);
}
