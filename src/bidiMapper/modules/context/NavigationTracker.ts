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
  type BrowsingContext,
  ChromiumBidi,
} from '../../../protocol/protocol.js';
import {Deferred} from '../../../utils/Deferred.js';
import {type LoggerFn, LogType} from '../../../utils/log.js';
import {getTimestamp} from '../../../utils/time.js';
import {urlMatchesAboutBlank} from '../../../utils/UrlHelpers.js';
import {uuidv4} from '../../../utils/uuid.js';
import type {EventManager} from '../session/EventManager.js';

export const enum NavigationEventName {
  FragmentNavigated = ChromiumBidi.BrowsingContext.EventNames.FragmentNavigated,
  NavigationAborted = ChromiumBidi.BrowsingContext.EventNames.NavigationAborted,
  NavigationFailed = ChromiumBidi.BrowsingContext.EventNames.NavigationFailed,
  Load = ChromiumBidi.BrowsingContext.EventNames.Load,
}

export class NavigationResult {
  readonly eventName: NavigationEventName;
  readonly message?: string;

  constructor(eventName: NavigationEventName, message?: string) {
    this.eventName = eventName;
    this.message = message;
  }
}

class NavigationState {
  readonly navigationId = uuidv4();
  readonly #browsingContextId: string;

  started = new Deferred<void>();
  finished = new Deferred<NavigationResult>();
  url: string;
  loaderId?: string;

  constructor(url: string, browsingContextId: string) {
    this.#browsingContextId = browsingContextId;
    this.url = url;
    void this.finished.then(() => {
      this.started.reject(
        new Error('Navigation finished without being started'),
      );
      return;
    });
  }

  navigationInfo(): BrowsingContext.NavigationInfo {
    return {
      context: this.#browsingContextId,
      navigation: this.navigationId,
      timestamp: getTimestamp(),
      url: this.url,
    };
  }
}

/**
 * Keeps track of navigations. Details: http://go/webdriver:bidi-navigation
 */
export class NavigationTracker {
  readonly #eventManager: EventManager;
  readonly #logger?: LoggerFn;
  readonly #loaderIdToNavigationsMap = new Map<string, NavigationState>();

  readonly #browsingContextId: string;
  #currentNavigation: NavigationState;
  // When a new navigation is started via `BrowsingContext.navigate` with `wait` set to
  // `None`, the command result should have `navigation` value, but mapper does not have
  // it yet. This value will be set to `navigationId` after next .
  #pendingNavigation?: NavigationState;

  // Flags if the initial navigation to `about:blank` is in progress.
  #isInitialNavigation = true;

  navigation = {
    withinDocument: new Deferred<void>(),
  };

  constructor(
    url: string,
    browsingContextId: string,
    eventManager: EventManager,
    logger?: LoggerFn,
  ) {
    this.#browsingContextId = browsingContextId;
    this.#eventManager = eventManager;
    this.#logger = logger;

    this.#isInitialNavigation = true;
    this.#currentNavigation = new NavigationState(url, browsingContextId);
  }

  #createNavigation(url: string): NavigationState {
    const navigation = new NavigationState(url, this.#browsingContextId);
    this.#setListeners(navigation);
    return navigation;
  }

  /**
   * Returns current started ongoing navigation. It can be either a started pending
   * navigation, or one is already navigated.
   */
  get currentNavigationId() {
    if (this.#pendingNavigation?.loaderId !== undefined) {
      return this.#pendingNavigation.navigationId;
    }

    return this.#currentNavigation.navigationId;
  }

  /**
   * Flags if the current navigation relates to the initial to `about:blank` navigation.
   */
  get isInitialNavigation(): boolean {
    return this.#isInitialNavigation;
  }

  /**
   * Url of the last navigated navigation.
   */
  get url(): string {
    return this.#currentNavigation.url;
  }

  /**
   * Creates a pending navigation e.g. when navigation command is called. Required to
   * provide navigation id before the actual navigation is started. It will be used when
   * navigation started. Can be aborted, failed, fragment navigated, or became a current
   * navigation.
   */
  createPendingNavigation(url: string): NavigationState {
    this.#logger?.(LogType.debug, 'createCommandNavigation');

    this.#pendingNavigation?.finished.resolve(
      new NavigationResult(
        NavigationEventName.NavigationAborted,
        'navigation canceled by concurrent navigation',
      ),
    );
    const navigation = this.#createNavigation(url);
    this.#pendingNavigation = navigation;
    return navigation;
  }

  #setListeners(navigation: NavigationState) {
    void navigation.started
      .then(() => {
        this.#logger?.(
          LogType.debug,
          `Navigation ${navigation.navigationId} started`,
        );
        this.#eventManager.registerEvent(
          {
            type: 'event',
            method: ChromiumBidi.BrowsingContext.EventNames.NavigationStarted,
            params: navigation.navigationInfo(),
          },
          this.#browsingContextId,
        );
        return;
      })
      .catch(() => {
        // Navigation can be finished without being started in case of fragment navigation. Ignore.
        return;
      });

    void navigation.finished.then((eventName: NavigationResult) => {
      this.#logger?.(
        LogType.debug,
        `Navigation ${navigation.navigationId} finished with ${eventName.eventName}, ${eventName.message}`,
      );

      if (
        eventName.eventName === NavigationEventName.FragmentNavigated ||
        eventName.eventName === NavigationEventName.NavigationAborted ||
        eventName.eventName === NavigationEventName.NavigationFailed
      ) {
        this.#eventManager.registerEvent(
          {
            type: 'event',
            method: eventName.eventName,
            params: navigation.navigationInfo(),
          },
          this.#browsingContextId,
        );
      }
      return;
    });
  }

  dispose() {
    // TODO: check if it should be aborted or failed.
    this.#pendingNavigation?.finished.resolve(
      new NavigationResult(
        NavigationEventName.NavigationFailed,
        'navigation canceled by context disposal',
      ),
    );
    // TODO: check if it should be aborted or failed.
    this.#currentNavigation.finished.resolve(
      new NavigationResult(
        NavigationEventName.NavigationFailed,
        'navigation canceled by context disposal',
      ),
    );
  }

  // Update the current url.
  onTargetInfoChanged(url: string) {
    this.#logger?.(LogType.debug, `onTargetInfoChanged ${url}`);
    this.#currentNavigation.url = url;
  }

  /**
   * @param {string} unreachableUrl indicated the navigation is actually failed.
   */
  frameNavigated(url: string, loaderId: string, unreachableUrl?: string) {
    this.#logger?.(LogType.debug, `frameNavigated ${url}`);

    if (
      unreachableUrl !== undefined &&
      !this.#loaderIdToNavigationsMap.has(loaderId)
    ) {
      // The navigation failed before started. Get or create pending navigation and fail
      // it.
      const navigation =
        this.#pendingNavigation ?? this.createPendingNavigation(unreachableUrl);
      navigation.started.resolve();
      navigation.finished.resolve(
        new NavigationResult(
          NavigationEventName.NavigationFailed,
          'the requested url is unreachable',
        ),
      );
      return;
    }

    if (!this.#loaderIdToNavigationsMap.has(loaderId)) {
      // Unexpected situation, but no need in throwing exception.
      this.#logger?.(LogType.debug, `Unknown loader ${loaderId} navigated`);

      if (
        this.#pendingNavigation !== undefined &&
        this.#pendingNavigation?.loaderId === undefined
      ) {
        // This can be a pending navigation to `about:blank` created by a command. Use the
        // pending navigation in this case.
        const navigation = this.#pendingNavigation;
        navigation.started.resolve();
        navigation.loaderId = loaderId;
        this.#loaderIdToNavigationsMap.set(loaderId, navigation);
      } else {
        // Create a new pending started navigation and set its loader id.
        const navigation = this.createPendingNavigation(url);
        navigation.started.resolve();
        navigation.loaderId = loaderId;
        this.#loaderIdToNavigationsMap.set(
          loaderId,
          this.#createNavigation(url),
        );
      }
    }

    const navigation = this.#loaderIdToNavigationsMap.get(loaderId)!;
    navigation.url = url;

    if (navigation !== this.#currentNavigation) {
      this.#currentNavigation.finished.resolve(
        new NavigationResult(
          NavigationEventName.NavigationAborted,
          'navigation canceled by concurrent navigation',
        ),
      );
    }
    this.#currentNavigation = navigation;
    if (this.#pendingNavigation === navigation) {
      this.#pendingNavigation = undefined;
    }
  }

  navigatedWithinDocument(
    url: string,
    navigationType: Protocol.Page.NavigatedWithinDocumentEvent['navigationType'],
  ) {
    this.#logger?.(
      LogType.debug,
      `navigatedWithinDocument ${url}, ${navigationType}`,
    );

    // Current navigation URL should be updated.
    this.#currentNavigation.url = url;

    if (navigationType !== 'fragment') {
      // TODO: check for other navigation types, like `javascript`.
      return;
    }

    // There is no way to guaranteed match pending navigation with finished fragment
    // navigations. So assume any pending navigation without loader id is the fragment
    // one.
    const fragmentNavigation =
      this.#pendingNavigation !== undefined &&
      this.#pendingNavigation.loaderId === undefined
        ? this.#pendingNavigation
        : this.#createNavigation(url);

    // Finish ongoing navigation.
    fragmentNavigation.finished.resolve(
      new NavigationResult(NavigationEventName.FragmentNavigated),
    );

    if (fragmentNavigation === this.#pendingNavigation) {
      this.#pendingNavigation = undefined;
    }
  }

  frameRequestedNavigation(url: string) {
    this.#logger?.(LogType.debug, `Page.frameRequestedNavigation ${url}`);
    if (!urlMatchesAboutBlank(url)) {
      this.#isInitialNavigation = false;
    }
    // The page is about to navigate to the url.
    this.createPendingNavigation(url);
  }

  /**
   * Required to mark navigation as fully complete.
   * TODO: navigation should be complete when it became the current one on
   * `Page.frameNavigated` or on navigating command finished with a new loader Id.
   */
  loadPageEvent(loaderId: string) {
    this.#logger?.(LogType.debug, 'loadPageEvent');
    this.#isInitialNavigation = false;

    this.#loaderIdToNavigationsMap
      .get(loaderId)
      ?.finished.resolve(new NavigationResult(NavigationEventName.Load));
  }

  /**
   * Fail navigation due to navigation command failed.
   */
  failNavigation(navigation: NavigationState, errorText: string) {
    this.#logger?.(LogType.debug, 'failCommandNavigation');
    navigation.finished.resolve(
      new NavigationResult(NavigationEventName.NavigationFailed, errorText),
    );
  }

  /**
   * Updates the navigation's `loaderId` and sets it as current one, if it is a
   * cross-document navigation.
   */
  navigationCommandFinished(navigation: NavigationState, loaderId?: string) {
    this.#logger?.(
      LogType.debug,
      `finishCommandNavigation ${navigation.navigationId}, ${loaderId}`,
    );

    if (loaderId !== undefined) {
      navigation.loaderId = loaderId;
      this.#loaderIdToNavigationsMap.set(loaderId, navigation);
    }

    if (loaderId === undefined || this.#currentNavigation === navigation) {
      // If the command's navigation is same-document or is already the current one,
      // nothing to do.
      return;
    }

    this.#currentNavigation.finished.resolve(
      new NavigationResult(
        NavigationEventName.NavigationAborted,
        'navigation canceled by concurrent navigation',
      ),
    );

    navigation.started.resolve();
    this.#isInitialNavigation = false;
    this.#currentNavigation = navigation;

    if (this.#pendingNavigation === navigation) {
      this.#pendingNavigation = undefined;
    }
  }

  /**
   * Emulated event, tight to `Network.requestWillBeSent`.
   */
  frameStartedNavigating(url: string, loaderId: string) {
    this.#logger?.(LogType.debug, `frameStartedNavigating ${url}, ${loaderId}`);

    if (this.#loaderIdToNavigationsMap.has(loaderId)) {
      // The `frameStartedNavigating` is tight to the `Network.requestWillBeSent` event
      // which can be emitted several times, e.g. in case of redirection. Nothing to do in
      // such a case.
      return;
    }

    const pendingNavigation =
      this.#pendingNavigation ?? this.createPendingNavigation(url);

    pendingNavigation.started.resolve();
    pendingNavigation.url = url;

    pendingNavigation.loaderId = loaderId;
    this.#loaderIdToNavigationsMap.set(loaderId, pendingNavigation);
  }

  /**
   * In case of `beforeunload` handler, the pending navigation should be marked as started
   * for consistency, as the `browsingContext.navigationStarted` should be emitted before
   * user prompt.
   */
  beforeunload() {
    this.#logger?.(LogType.debug, `beforeunload`);

    if (this.#pendingNavigation === undefined) {
      this.#logger?.(
        LogType.debugError,
        `Unexpectedly no pending navigation on beforeunload`,
      );
      return;
    }
    this.#pendingNavigation.started.resolve();
  }

  /**
   * If there is a navigation with the loaderId equals to the network request id, it means
   * that the navigation failed.
   */
  networkLoadingFailed(loaderId: string, errorText: string) {
    if (this.#loaderIdToNavigationsMap.has(loaderId)) {
      const navigation = this.#loaderIdToNavigationsMap.get(loaderId)!;
      navigation.finished.resolve(
        new NavigationResult(NavigationEventName.NavigationFailed, errorText),
      );
    }
  }
}
