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
  #lastCommittedNavigation: NavigationState;
  // When a new navigation is started via `BrowsingContext.navigate` with `wait` set to
  // `None`, the command result should have `navigation` value, but mapper does not have
  // it yet. This value will be set to `navigationId` after next .
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
      // If there is a pending navigation which is not a fragment one, it should be considered as the current one.
      return this.#pendingNavigation.navigationId;
    }

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

    if (!this.#loaderIdToNavigationsMap.has(loaderId)) {
      this.#logger?.(
        LogType.debugError,
        `FrameNavigated with unknown loaderId ${loaderId}`,
      );
      return;
    }

    if (
      unreachableUrl !== undefined &&
      !this.#loaderIdToNavigationsMap.has(loaderId)
    ) {
      // The navigation failed before started. Get or create pending navigation and fail
      // it.
      const navigation =
        this.#pendingNavigation ??
        this.createPendingNavigation(unreachableUrl, true);
      navigation.url = unreachableUrl;
      navigation.start();
      navigation.fail('the requested url is unreachable');
      return;
    }

    const navigation = this.#getNavigationForFrameNavigated(url, loaderId);

    navigation.url = url;
    navigation.loaderId = loaderId;
    navigation.start();
    navigation.frameNavigated();
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

    // There is no way to guaranteed match pending navigation with finished fragment
    // navigations. So assume any pending navigation without loader id is the fragment
    // one.
    const fragmentNavigation =
      this.#pendingNavigation !== undefined &&
      this.#pendingNavigation.isFragmentNavigation
        ? this.#pendingNavigation
        : new NavigationState(
            url,
            this.#browsingContextId,
            false,
            this.#eventManager,
          );

    fragmentNavigation.url = url;
    // Finish ongoing navigation.
    fragmentNavigation.fragmentNavigated();

    if (fragmentNavigation === this.#pendingNavigation) {
      this.#pendingNavigation = undefined;
    }
  }

  frameRequestedNavigation(url: string) {
    this.#logger?.(LogType.debug, `Page.frameRequestedNavigation ${url}`);
    // The page is about to navigate to the url.
    this.createPendingNavigation(url, true);
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

    if (loaderId !== undefined && navigation.loaderId !== loaderId) {
      this.#logger?.(
        LogType.debugError,
        `Command navigation result mismatches the loader id ${navigation.loaderId} vs ${loaderId}`,
      );
      return;
    }

    if (
      loaderId === undefined ||
      this.#lastCommittedNavigation === navigation
    ) {
      // If the command's navigation is same-document or is already the current one,
      // nothing to do.
      return;
    }
  }

  frameStartedNavigating(
    url: string,
    loaderId: string,
    navigationType: string,
  ) {
    this.#logger?.(LogType.debug, `frameStartedNavigating ${url}, ${loaderId}`);

    if (this.#loaderIdToNavigationsMap.has(loaderId)) {
      const existingNavigation = this.#loaderIdToNavigationsMap.get(loaderId)!;
      // Navigation can be changed from `sameDocument` to `differentDocument`.
      existingNavigation.isFragmentNavigation = [
        'historySameDocument',
        'sameDocument',
      ].includes(navigationType);
      return;
    }

    const navigation =
      this.#pendingNavigation ?? this.createPendingNavigation(url, true);

    navigation.isFragmentNavigation = [
      'historySameDocument',
      'sameDocument',
    ].includes(navigationType);
    navigation.url = url;

    navigation.loaderId = loaderId;
    this.#loaderIdToNavigationsMap.set(loaderId, navigation);

    if (!navigation.isFragmentNavigation) {
      this.#lastCommittedNavigation.fail(
        'navigation canceled by concurrent navigation',
      );
      this.#lastCommittedNavigation = navigation;
      this.#pendingNavigation = undefined;
    }

    navigation.start();
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
    this.#pendingNavigation.start();
  }

  /**
   * If there is a navigation with the loaderId equals to the network request id, it means
   * that the navigation failed.
   */
  networkLoadingFailed(loaderId: string, errorText: string) {
    this.#loaderIdToNavigationsMap.get(loaderId)?.fail(errorText);
  }
}
