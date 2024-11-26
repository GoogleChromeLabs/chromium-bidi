/*
 *  Copyright 2024 Google LLC.
 *  Copyright (c) Microsoft Corporation.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 *
 */

import type {Protocol} from 'devtools-protocol';

import {
  BrowsingContext,
  ChromiumBidi,
  InvalidArgumentException,
  NoSuchHistoryEntryException,
  UnknownErrorException,
} from '../../../protocol/protocol.js';
import {Deferred} from '../../../utils/Deferred.js';
import {type LoggerFn, LogType} from '../../../utils/log.js';
import type {EventManager} from '../session/EventManager.js';

import {BrowsingContextImpl} from './BrowsingContextImpl.js';
import {Navigation} from './Navigation.js';

export class NavigationTracker {
  static readonly LOGGER_PREFIX = `${LogType.debug}:navigationTracker` as const;

  #lifecycle = {
    DOMContentLoaded: new Deferred<void>(),
    load: new Deferred<void>(),
    navigatedWithinDocument: new Deferred<void>(),
  };

  #url: string;
  readonly #eventManager: EventManager;

  #loaderId?: Protocol.Network.LoaderId;
  readonly #logger?: LoggerFn;

  targetInfoChanged(params: Protocol.Target.TargetInfoChangedEvent) {
    this.#url = params.targetInfo.url;
  }

  // TODO
  #currentNavigation: Navigation = new Navigation('about:blank', false, null);

  readonly #browsingContextImpl: BrowsingContextImpl;

  private constructor(
    browsingContextImpl: BrowsingContextImpl,
    eventManager: EventManager,
    url: string,
    logger?: LoggerFn,
  ) {
    this.#browsingContextImpl = browsingContextImpl;
    this.#eventManager = eventManager;
    this.#logger = logger;
    this.#url = url;
  }

  static create(
    browsingContextImpl: BrowsingContextImpl,
    eventManager: EventManager,
    url: string,
    logger?: LoggerFn,
  ): NavigationTracker {
    const navigationTracker = new NavigationTracker(
      browsingContextImpl,
      eventManager,
      url,
      logger,
    );
    navigationTracker.#initListeners();
    return navigationTracker;
  }

  static getTimestamp(): number {
    // `timestamp` from the event is MonotonicTime, not real time, so
    // the best Mapper can do is to set the timestamp to the epoch time
    // of the event arrived.
    // https://chromedevtools.github.io/devtools-protocol/tot/Network/#type-MonotonicTime
    return new Date().getTime();
  }

  /**
   * @see https://html.spec.whatwg.org/multipage/document-sequences.html#navigable
   */
  get navigableId(): string | undefined {
    return this.#loaderId;
  }

  get navigationId(): string {
    return this.#currentNavigation.navigationId;
  }

  dispose() {
    this.#currentNavigation.cancel('navigation canceled by context disposal');

    // Fail all ongoing navigations.
    this.#failLifecycleIfNotFinished();
  }

  get url(): string {
    return this.#url;
  }

  async lifecycleLoaded() {
    await this.#lifecycle.load;
  }

  #initListeners() {
    this.#browsingContextImpl.cdpTarget.cdpClient.on(
      'Page.frameNavigated',
      (params) => {
        if (this.#browsingContextImpl.id !== params.frame.id) {
          return;
        }
        this.#url = params.frame.url + (params.frame.urlFragment ?? '');
        this.#currentNavigation.url = this.#url;

        // At the point the page is initialized, all the nested iframes from the
        // previous page are detached and realms are destroyed.
        // Delete children from context.
        this.#browsingContextImpl.deleteAllChildren();
      },
    );

    this.#browsingContextImpl.cdpTarget.cdpClient.on(
      'Page.navigatedWithinDocument',
      (params) => {
        if (this.#browsingContextImpl.id !== params.frameId) {
          return;
        }
        if (params.navigationType === 'historyApi') {
          this.#url = params.url;
          this.#eventManager.registerEvent(
            {
              type: 'event',
              method: 'browsingContext.historyUpdated',
              params: {
                context: this.#browsingContextImpl.id,
                url: this.#url,
              },
            },
            this.#browsingContextImpl.id,
          );
          return;
        }
        const timestamp = BrowsingContextImpl.getTimestamp();
        this.#url = params.url;
        this.#currentNavigation.url = params.url;
        this.#lifecycle.navigatedWithinDocument.resolve();

        if (params.navigationType === 'fragment') {
          this.#eventManager.registerEvent(
            {
              type: 'event',
              method: ChromiumBidi.BrowsingContext.EventNames.FragmentNavigated,
              params: {
                context: this.#browsingContextImpl.id,
                navigation: this.#currentNavigation.navigationId,
                timestamp,
                url: this.#url,
              },
            },
            this.#browsingContextImpl.id,
          );
        }
      },
    );

    this.#browsingContextImpl.cdpTarget.cdpClient.on(
      'Page.frameStartedLoading',
      (params) => {
        if (this.#browsingContextImpl.id !== params.frameId) {
          return;
        }

        // At this point the `lastNavigation` was set by `browsingContext.navigate` or
        // `browsingContext.reload` commands, or by `Page.frameRequestedNavigation` event.

        if (this.#currentNavigation.expectFrameRequestedNavigation) {
          // In case of the navigation is initiated by `browsingContext.navigate` or
          // `browsingContext.reload` commands, the `Page.frameRequestedNavigation` is not
          // emitted, which means the `NavigationStarted` is not emitted.
          // TODO: consider emit it right after the CDP command `navigate` or `reload` is finished.

          // The URL of the navigation that is currently in progress. Although the URL
          // is not yet known in case of user-initiated navigations, it is possible to
          // provide the URL in case of BiDi-initiated navigations.
          // TODO: provide proper URL in case of user-initiated navigations.
          this.#eventManager.registerEvent(
            {
              type: 'event',
              method: ChromiumBidi.BrowsingContext.EventNames.NavigationStarted,
              params: {
                context: this.#browsingContextImpl.id,
                navigation: this.#currentNavigation.navigationId,
                timestamp: BrowsingContextImpl.getTimestamp(),
                url: this.#currentNavigation.url,
              },
            },
            this.#browsingContextImpl.id,
          );
        }
      },
    );

    // TODO: don't use deprecated `Page.frameScheduledNavigation` event.
    this.#browsingContextImpl.cdpTarget.cdpClient.on(
      'Page.frameScheduledNavigation',
      (params) => {
        if (this.#browsingContextImpl.id !== params.frameId) {
          return;
        }

        // TODO: check if not created in case of other navigations.
        this.#currentNavigation.cancel('navigation aborted');
        this.#currentNavigation = new Navigation(
          params.url,
          true,
          this.#currentNavigation,
        );
      },
    );

    this.#browsingContextImpl.cdpTarget.cdpClient.on(
      'Page.frameRequestedNavigation',
      (params) => {
        if (this.#browsingContextImpl.id !== params.frameId) {
          return;
        }

        this.#currentNavigation.cancel('navigation aborted');
        this.#currentNavigation = new Navigation(
          params.url,
          false,
          this.#currentNavigation,
        );

        if (!this.#currentNavigation.initialNavigation) {
          // Do not emit the event for the initial navigation to `about:blank`.
          this.#eventManager.registerEvent(
            {
              type: 'event',
              method: ChromiumBidi.BrowsingContext.EventNames.NavigationStarted,
              params: {
                context: this.#browsingContextImpl.id,
                navigation: this.#currentNavigation.navigationId,
                timestamp: BrowsingContextImpl.getTimestamp(),
                url: params.url,
              },
            },
            this.#browsingContextImpl.id,
          );
        }
      },
    );

    this.#browsingContextImpl.cdpTarget.cdpClient.on(
      'Page.lifecycleEvent',
      (params) => {
        if (this.#browsingContextImpl.id !== params.frameId) {
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

        const timestamp = BrowsingContextImpl.getTimestamp();

        switch (params.name) {
          case 'DOMContentLoaded':
            if (!this.#currentNavigation.initialNavigation) {
              // Do not emit for the initial navigation.
              this.#eventManager.registerEvent(
                {
                  type: 'event',
                  method:
                    ChromiumBidi.BrowsingContext.EventNames.DomContentLoaded,
                  params: {
                    context: this.#browsingContextImpl.id,
                    navigation: this.#currentNavigation.navigationId,
                    timestamp,
                    url: this.#url,
                  },
                },
                this.#browsingContextImpl.id,
              );
            }
            this.#lifecycle.DOMContentLoaded.resolve();
            break;

          case 'load':
            if (!this.#currentNavigation.initialNavigation) {
              // Do not emit for the initial navigation.
              this.#eventManager.registerEvent(
                {
                  type: 'event',
                  method: ChromiumBidi.BrowsingContext.EventNames.Load,
                  params: {
                    context: this.#browsingContextImpl.id,
                    navigation: this.#currentNavigation.navigationId,
                    timestamp,
                    url: this.#url,
                  },
                },
                this.#browsingContextImpl.id,
              );
            }
            this.#currentNavigation.finish();
            this.#lifecycle.load.resolve();
            break;
        }
      },
    );
  }

  #documentChanged(loaderId?: Protocol.Network.LoaderId) {
    if (loaderId === undefined || this.#loaderId === loaderId) {
      // Same document navigation. Document didn't change.
      if (this.#lifecycle.navigatedWithinDocument.isFinished) {
        this.#lifecycle.navigatedWithinDocument = new Deferred();
      } else {
        this.#logger?.(
          BrowsingContextImpl.LOGGER_PREFIX,
          'Document changed (navigatedWithinDocument)',
        );
      }
      return;
    }

    // Document changed.
    this.#resetLifecycleIfFinished();
    this.#loaderId = loaderId;
    // Delete all child iframes and notify about top level destruction.
    this.#browsingContextImpl.deleteAllChildren(true);
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

    this.#currentNavigation.cancel(
      'navigation canceled by concurrent navigation',
    );
    await this.#browsingContextImpl.targetUnblockedOrThrow();

    const navigation = new Navigation(url, true, this.#currentNavigation);
    this.#currentNavigation = navigation;

    // Navigate and wait for the result. If the navigation fails, the error event is
    // emitted and the promise is rejected.
    const cdpNavigatePromise = (async () => {
      const cdpNavigateResult =
        await this.#browsingContextImpl.cdpTarget.cdpClient.sendCommand(
          'Page.navigate',
          {
            url,
            frameId: this.#browsingContextImpl.id,
          },
        );

      if (cdpNavigateResult.errorText) {
        // If navigation failed, no pending navigation is left.
        this.#eventManager.registerEvent(
          {
            type: 'event',
            method: ChromiumBidi.BrowsingContext.EventNames.NavigationFailed,
            params: {
              context: this.#browsingContextImpl.id,
              navigation: navigation.navigationId,
              timestamp: BrowsingContextImpl.getTimestamp(),
              url,
            },
          },
          this.#browsingContextImpl.id,
        );

        throw new UnknownErrorException(cdpNavigateResult.errorText);
      }

      this.#documentChanged(cdpNavigateResult.loaderId);
      return cdpNavigateResult;
    })();

    if (wait === BrowsingContext.ReadinessState.None) {
      return {
        navigation: navigation.navigationId,
        url,
      };
    }

    const cdpNavigateResult = await cdpNavigatePromise;

    // Wait for either the navigation is finished or canceled by another navigation.
    await Promise.race([
      // No `loaderId` means same-document navigation.
      this.#waitNavigation(wait, cdpNavigateResult.loaderId === undefined),
      // Throw an error if the navigation is canceled.
      navigation.deferred,
    ]).catch((e) => {
      if (e.message === 'navigation aborted') {
        // Aborting navigation should not fail the original navigation command for now.
        // https://github.com/w3c/webdriver-bidi/issues/799#issue-2605618955
        this.#eventManager.registerEvent(
          {
            type: 'event',
            method: ChromiumBidi.BrowsingContext.EventNames.NavigationAborted,
            params: {
              context: this.#browsingContextImpl.id,
              navigation: navigation.navigationId,
              timestamp: BrowsingContextImpl.getTimestamp(),
              url: this.#url,
            },
          },
          this.#browsingContextImpl.id,
        );
      } else {
        this.#eventManager.registerEvent(
          {
            type: 'event',
            method: ChromiumBidi.BrowsingContext.EventNames.NavigationFailed,
            params: {
              context: this.#browsingContextImpl.id,
              navigation: navigation.navigationId,
              timestamp: BrowsingContextImpl.getTimestamp(),
              url: this.#url,
            },
          },
          this.#browsingContextImpl.id,
        );
        // The navigation command should fail, if not finished yet.
        throw e;
      }
    });

    return {
      navigation: navigation.navigationId,
      // Url can change due to redirect. Get the latest one.
      url: this.#url,
    };
  }

  async #waitNavigation(
    wait: BrowsingContext.ReadinessState,
    withinDocument: boolean,
  ) {
    if (withinDocument) {
      await this.#lifecycle.navigatedWithinDocument;
      return;
    }
    switch (wait) {
      case BrowsingContext.ReadinessState.None:
        return;
      case BrowsingContext.ReadinessState.Interactive:
        await this.#lifecycle.DOMContentLoaded;
        return;
      case BrowsingContext.ReadinessState.Complete:
        await this.#lifecycle.load;
        return;
    }
  }

  // TODO: support concurrent navigations analogous to `navigate`.
  async reload(
    ignoreCache: boolean,
    wait: BrowsingContext.ReadinessState,
  ): Promise<BrowsingContext.NavigateResult> {
    await this.#browsingContextImpl.targetUnblockedOrThrow();

    this.#resetLifecycleIfFinished();

    const navigation = new Navigation(this.url, true, this.#currentNavigation);
    this.#currentNavigation = navigation;

    await this.#browsingContextImpl.cdpTarget.cdpClient.sendCommand(
      'Page.reload',
      {
        ignoreCache,
      },
    );

    switch (wait) {
      case BrowsingContext.ReadinessState.None:
        break;
      case BrowsingContext.ReadinessState.Interactive:
        await this.#lifecycle.DOMContentLoaded;
        break;
      case BrowsingContext.ReadinessState.Complete:
        await this.#lifecycle.load;
        break;
    }

    return {
      navigation: navigation.navigationId,
      url: this.url,
    };
  }

  async traverseHistory(delta: number): Promise<void> {
    if (delta === 0) {
      return;
    }

    const history =
      await this.#browsingContextImpl.cdpTarget.cdpClient.sendCommand(
        'Page.getNavigationHistory',
      );
    const entry = history.entries[history.currentIndex + delta];
    if (!entry) {
      throw new NoSuchHistoryEntryException(
        `No history entry at delta ${delta}`,
      );
    }
    await this.#browsingContextImpl.cdpTarget.cdpClient.sendCommand(
      'Page.navigateToHistoryEntry',
      {
        entryId: entry.id,
      },
    );
  }
}
