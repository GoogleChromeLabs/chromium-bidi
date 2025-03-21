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
import {urlMatchesAboutBlank} from '../../../utils/urlHelpers.js';
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

export class NavigationState {
  readonly navigationId = uuidv4();
  readonly #browsingContextId: string;

  #started = false;
  #finished = new Deferred<NavigationResult>();
  url: string;
  loaderId?: string;
  #isInitial: boolean;
  #eventManager: EventManager;
  committed = new Deferred<void>();
  isFragmentNavigation?: boolean;

  get finished(): Promise<NavigationResult> {
    return this.#finished;
  }

  constructor(
    url: string,
    browsingContextId: string,
    isInitial: boolean,
    eventManager: EventManager,
  ) {
    this.#browsingContextId = browsingContextId;
    this.url = url;
    this.#isInitial = isInitial;
    this.#eventManager = eventManager;
  }

  navigationInfo(): BrowsingContext.NavigationInfo {
    return {
      context: this.#browsingContextId,
      navigation: this.navigationId,
      timestamp: getTimestamp(),
      url: this.url,
    };
  }

  start() {
    if (
      // Initial navigation should not be reported.
      !this.#isInitial &&
      // No need in reporting started navigation twice.
      !this.#started &&
      // No need for reporting fragment navigations. Step 13 vs step 16 of the spec:
      // https://html.spec.whatwg.org/#beginning-navigation:webdriver-bidi-navigation-started
      !this.isFragmentNavigation
    ) {
      this.#eventManager.registerEvent(
        {
          type: 'event',
          method: ChromiumBidi.BrowsingContext.EventNames.NavigationStarted,
          params: this.navigationInfo(),
        },
        this.#browsingContextId,
      );
    }

    this.#started = true;
  }

  #finish(navigationResult: NavigationResult) {
    this.#started = true;

    if (
      !this.#isInitial &&
      !this.#finished.isFinished &&
      navigationResult.eventName !== NavigationEventName.Load
    ) {
      this.#eventManager.registerEvent(
        {
          type: 'event',
          method: navigationResult.eventName,
          params: this.navigationInfo(),
        },
        this.#browsingContextId,
      );
    }
    this.#finished.resolve(navigationResult);
  }

  frameNavigated() {
    this.committed.resolve();
    if (!this.#isInitial) {
      this.#eventManager.registerEvent(
        {
          type: 'event',
          method: ChromiumBidi.BrowsingContext.EventNames.NavigationCommitted,
          params: this.navigationInfo(),
        },
        this.#browsingContextId,
      );
    }
  }

  fragmentNavigated() {
    this.committed.resolve();
    this.#finish(new NavigationResult(NavigationEventName.FragmentNavigated));
  }

  load() {
    this.#finish(new NavigationResult(NavigationEventName.Load));
  }

  fail(message: string) {
    this.#finish(
      new NavigationResult(
        this.committed.isFinished
          ? NavigationEventName.NavigationAborted
          : NavigationEventName.NavigationFailed,
        message,
      ),
    );
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
  /**
   * Last committed navigation is committed, but is not guaranteed to be finished, as it
   * can still wait for `load` or `DOMContentLoaded` events.
   */
  #lastCommittedNavigation: NavigationState;
  /**
   * Pending navigation is a navigation that is started but not yet committed.
   */
  #pendingNavigation?: NavigationState;

  // Flags if the initial navigation to `about:blank` is in progress.
  #isInitialNavigation = true;

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
    // The initial navigation is always committed.
    this.#lastCommittedNavigation = new NavigationState(
      url,
      browsingContextId,
      urlMatchesAboutBlank(url),
      this.#eventManager,
    );
  }

  /**
   * Returns current started ongoing navigation. It can be either a started pending
   * navigation, or one is already navigated.
   */
  get currentNavigationId() {
    if (this.#pendingNavigation?.isFragmentNavigation === false) {
      // Use pending navigation if it is started and it is not a fragment navigation.
      return this.#pendingNavigation.navigationId;
    }

    // If the pending navigation is a fragment one, or if it is not exists, the last
    // committed navigation should be used.
    return this.#lastCommittedNavigation.navigationId;
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
    return this.#lastCommittedNavigation.url;
  }

  /**
   * Creates a pending navigation e.g. when navigation command is called. Required to
   * provide navigation id before the actual navigation is started. It will be used when
   * navigation started. Can be aborted, failed, fragment navigated, or became a current
   * navigation.
   */
  createPendingNavigation(
    url: string,
    canBeInitialNavigation: boolean = false,
  ): NavigationState {
    this.#logger?.(LogType.debug, 'createCommandNavigation');
    this.#isInitialNavigation =
      canBeInitialNavigation &&
      this.#isInitialNavigation &&
      urlMatchesAboutBlank(url);

    this.#pendingNavigation?.fail(
      'navigation canceled by concurrent navigation',
    );
    const navigation = new NavigationState(
      url,
      this.#browsingContextId,
      this.#isInitialNavigation,
      this.#eventManager,
    );
    this.#pendingNavigation = navigation;
    return navigation;
  }

  dispose() {
    this.#pendingNavigation?.fail('navigation canceled by context disposal');
    this.#lastCommittedNavigation.fail(
      'navigation canceled by context disposal',
    );
  }

  // Update the current url.
  onTargetInfoChanged(url: string) {
    this.#logger?.(LogType.debug, `onTargetInfoChanged ${url}`);
    this.#lastCommittedNavigation.url = url;
  }

  #getNavigationForFrameNavigated(
    url: string,
    loaderId: string,
  ): NavigationState {
    if (this.#loaderIdToNavigationsMap.has(loaderId)) {
      return this.#loaderIdToNavigationsMap.get(loaderId)!;
    }

    if (
      this.#pendingNavigation !== undefined &&
      this.#pendingNavigation.loaderId === undefined
    ) {
      // This can be a pending navigation to `about:blank` created by a command. Use the
      // pending navigation in this case.
      return this.#pendingNavigation;
    }
    // Create a new pending navigation.
    return this.createPendingNavigation(url, true);
  }

  /**
   * @param {string} unreachableUrl indicated the navigation is actually failed.
   */
  frameNavigated(url: string, loaderId: string, unreachableUrl?: string) {
    this.#logger?.(LogType.debug, `frameNavigated ${url}`);

    if (unreachableUrl !== undefined) {
      // The navigation failed.
      const navigation =
        this.#loaderIdToNavigationsMap.get(loaderId) ??
        this.#pendingNavigation ??
        this.createPendingNavigation(unreachableUrl, true);
      navigation.url = unreachableUrl;
      navigation.start();
      navigation.fail('the requested url is unreachable');
      return;
    }

    const navigation = this.#getNavigationForFrameNavigated(url, loaderId);

    if (navigation !== this.#lastCommittedNavigation) {
      // Even though the `lastCommittedNavigation` is navigated, it still can be waiting
      // for `load` or `DOMContentLoaded` events.
      this.#lastCommittedNavigation.fail(
        'navigation canceled by concurrent navigation',
      );
    }

    navigation.url = url;
    navigation.loaderId = loaderId;
    this.#loaderIdToNavigationsMap.set(loaderId, navigation);
    navigation.start();
    navigation.frameNavigated();

    this.#lastCommittedNavigation = navigation;
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
    this.#lastCommittedNavigation.url = url;

    if (navigationType !== 'fragment') {
      // TODO: check for other navigation types, like `javascript`.
      return;
    }

    // There is no way to map `navigatedWithinDocument` to a specific navigation. Consider
    // it is the pending navigation, if it is a fragment one.
    const fragmentNavigation =
      this.#pendingNavigation?.isFragmentNavigation === true
        ? this.#pendingNavigation
        : new NavigationState(
            url,
            this.#browsingContextId,
            false,
            this.#eventManager,
          );

    // Finish ongoing navigation.
    fragmentNavigation.fragmentNavigated();

    if (fragmentNavigation === this.#pendingNavigation) {
      this.#pendingNavigation = undefined;
    }
  }

  /**
   * Required to mark navigation as fully complete.
   * TODO: navigation should be complete when it became the current one on
   * `Page.frameNavigated` or on navigating command finished with a new loader Id.
   */
  loadPageEvent(loaderId: string) {
    this.#logger?.(LogType.debug, 'loadPageEvent');
    // Even if it was an initial navigation, it is finished.
    this.#isInitialNavigation = false;

    this.#loaderIdToNavigationsMap.get(loaderId)?.load();
  }

  /**
   * Fail navigation due to navigation command failed.
   */
  failNavigation(navigation: NavigationState, errorText: string) {
    this.#logger?.(LogType.debug, 'failCommandNavigation');
    navigation.fail(errorText);
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

    navigation.isFragmentNavigation = loaderId === undefined;
  }

  frameStartedNavigating(
    url: string,
    loaderId: string,
    navigationType: string,
  ) {
    this.#logger?.(LogType.debug, `frameStartedNavigating ${url}, ${loaderId}`);

    if (![loaderId, undefined].includes(this.#pendingNavigation?.loaderId)) {
      // If there is a pending navigation with loader id set, but not equal to the new
      // loader id, cancel pending navigation.
      this.#pendingNavigation?.fail(
        'navigation canceled by concurrent navigation',
      );
      this.#pendingNavigation = undefined;
    }

    if (this.#loaderIdToNavigationsMap.has(loaderId)) {
      const existingNavigation = this.#loaderIdToNavigationsMap.get(loaderId)!;
      // Navigation can be changed from `sameDocument` to `differentDocument`.
      existingNavigation.isFragmentNavigation = [
        'historySameDocument',
        'sameDocument',
      ].includes(navigationType);
      this.#pendingNavigation = existingNavigation;
      return;
    }

    const pendingNavigation =
      this.#pendingNavigation ?? this.createPendingNavigation(url, true);

    this.#loaderIdToNavigationsMap.set(loaderId, pendingNavigation);

    pendingNavigation.isFragmentNavigation = [
      'historySameDocument',
      'sameDocument',
    ].includes(navigationType);

    pendingNavigation.url = url;
    pendingNavigation.loaderId = loaderId;
    pendingNavigation.start();
  }

  /**
   * If there is a navigation with the loaderId equals to the network request id, it means
   * that the navigation failed.
   */
  networkLoadingFailed(loaderId: string, errorText: string) {
    this.#loaderIdToNavigationsMap.get(loaderId)?.fail(errorText);
  }
}
