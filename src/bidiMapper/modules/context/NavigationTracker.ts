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

export type NavigationEventName =
  | ChromiumBidi.BrowsingContext.EventNames.FragmentNavigated
  | ChromiumBidi.BrowsingContext.EventNames.NavigationAborted
  | ChromiumBidi.BrowsingContext.EventNames.NavigationFailed
  | ChromiumBidi.BrowsingContext.EventNames.Load;

class NavigationState {
  readonly navigationId = uuidv4();
  readonly #browsingContextId: string;

  started = new Deferred<void>();
  finished = new Deferred<NavigationEventName>();
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
  #initialNavigation = true;

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

    this.#initialNavigation = true;
    this.#currentNavigation = new NavigationState(url, browsingContextId);
  }

  #createNavigation(url: string): NavigationState {
    const navigation = new NavigationState(url, this.#browsingContextId);
    this.#setListeners(navigation);
    return navigation;
  }

  get currentNavigationId() {
    // TODO: what is expected here?
    return (
      this.#pendingNavigation?.navigationId ??
      this.#currentNavigation.navigationId
    );
  }

  get initialNavigation(): boolean {
    return this.#initialNavigation;
  }

  get url(): string {
    return this.#currentNavigation.url;
  }

  createPendingNavigation(url: string): NavigationState {
    this.#logger?.(LogType.debug, 'createCommandNavigation');

    this.#pendingNavigation?.finished.resolve(
      ChromiumBidi.BrowsingContext.EventNames.NavigationAborted,
    );
    const navigation = this.#createNavigation(url);
    this.#pendingNavigation = navigation;
    return navigation;
  }

  // #navigationStarted(url: string) {
  //   this.#currentNavigation.finished.resolve(
  //     ChromiumBidi.BrowsingContext.EventNames.NavigationAborted,
  //   );
  //   this.#currentNavigation =
  //     this.#pendingNavigation ?? this.createPendingNavigation(url);
  //   this.#initialNavigation = false;
  //   this.#currentNavigation.url = url;
  //   this.#currentNavigation.started.resolve();
  //   this.#pendingNavigation = undefined;
  // }

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

    void navigation.finished.then((eventName: NavigationEventName) => {
      this.#logger?.(
        LogType.debug,
        `Navigation ${navigation.navigationId} finished with ${eventName}, started: ${navigation.started.isFinished}`,
      );

      if (!navigation.started.isFinished) {
        // TODO: remove.
        console.log(
          `!!@@## Unexpectedly not started navigation ${navigation.navigationId} finished with ${eventName}`,
        );
        this.#logger?.(
          LogType.debugError,
          `!!@@## Unexpectedly not started navigation ${navigation.navigationId} finished with ${eventName}`,
        );
        return;
      }

      if (
        eventName ===
          ChromiumBidi.BrowsingContext.EventNames.FragmentNavigated ||
        eventName ===
          ChromiumBidi.BrowsingContext.EventNames.NavigationAborted ||
        eventName === ChromiumBidi.BrowsingContext.EventNames.NavigationFailed
      ) {
        this.#eventManager.registerEvent(
          {
            type: 'event',
            method: eventName,
            params: navigation.navigationInfo(),
          },
          this.#browsingContextId,
        );
      }
      return;
    });
  }

  dispose() {
    this.#pendingNavigation?.finished.resolve(
      ChromiumBidi.BrowsingContext.EventNames.NavigationAborted,
    );
    this.#currentNavigation.finished.resolve(
      ChromiumBidi.BrowsingContext.EventNames.NavigationAborted,
    );
  }

  onTargetInfoChanged(url: string) {
    this.#logger?.(LogType.debug, `onTargetInfoChanged ${url}`);
    this.#currentNavigation.url = url;
  }

  frameNavigated(url: string, loaderId: string) {
    this.#logger?.(LogType.debug, `Page.frameNavigated ${url}`);

    if (!this.#loaderIdToNavigationsMap.has(loaderId)) {
      console.log(`!!@@## Unknown loader ${loaderId} is navigated`);
      this.#logger?.(
        LogType.debugError,
        `!!@@## Unknown loader ${loaderId} is navigated`,
      );
      const navigation = this.#createNavigation(url);
      this.#loaderIdToNavigationsMap.set(loaderId, navigation);
    }

    const navigation = this.#loaderIdToNavigationsMap.get(loaderId)!;
    navigation.url = url;
    // Make sure the pending navigation is started, as `Page.frameStartedNavigating` is
    // missing for `about:blank`.
    navigation.started.resolve();

    if (navigation !== this.#currentNavigation) {
      this.#currentNavigation.finished.resolve(
        ChromiumBidi.BrowsingContext.EventNames.NavigationAborted,
      );
    }
    this.#currentNavigation = navigation;
  }

  navigatedWithinDocument(
    url: string,
    navigationType: Protocol.Page.NavigatedWithinDocumentEvent['navigationType'],
  ) {
    this.#logger?.(
      LogType.debug,
      `Page.navigatedWithinDocument ${url}, ${navigationType}`,
    );

    // Current navigation URL should be updated.
    this.#currentNavigation.url = url;

    if (navigationType !== 'fragment') {
      return;
    }

    const fragmentNavigation =
      this.#pendingNavigation !== undefined &&
      this.#pendingNavigation.loaderId === undefined
        ? this.#pendingNavigation
        : this.#createNavigation(url);

    this.#logger?.(
      LogType.debug,
      `fragmentNavigation: ${fragmentNavigation.navigationId}`,
    );

    // Finish ongoing navigation.
    fragmentNavigation.finished.resolve(
      ChromiumBidi.BrowsingContext.EventNames.FragmentNavigated,
    );

    if (fragmentNavigation === this.#pendingNavigation) {
      // If the pending navigation was created by navigation command and en
      this.#pendingNavigation = undefined;
    }
  }

  frameRequestedNavigation(url: string) {
    this.#logger?.(LogType.debug, `Page.frameRequestedNavigation ${url}`);
    if (!urlMatchesAboutBlank(url)) {
      this.#initialNavigation = false;
    }
    // The page is about to navigate to the url.
    this.createPendingNavigation(url);
  }

  lifecycleEventLoad(loaderId: string) {
    this.#logger?.(LogType.debug, 'lifecycleEventLoad');
    this.#initialNavigation = false;

    this.#loaderIdToNavigationsMap
      .get(loaderId)
      ?.finished.resolve(ChromiumBidi.BrowsingContext.EventNames.Load);
  }

  failNavigation(navigation: NavigationState) {
    this.#logger?.(LogType.debug, 'failCommandNavigation');
    navigation.finished.resolve(
      ChromiumBidi.BrowsingContext.EventNames.NavigationFailed,
    );
  }

  navigationCommandFinished(navigation: NavigationState, loaderId?: string) {
    this.#logger?.(
      LogType.debug,
      `finishCommandNavigation ${navigation.navigationId}, ${loaderId}`,
    );

    if (loaderId !== undefined) {
      navigation.loaderId = loaderId;
      this.#loaderIdToNavigationsMap.set(loaderId, navigation);
    }

    if (this.#currentNavigation !== navigation && loaderId !== undefined) {
      // Missing loader ID means it's same-document navigation, so no need in starting or
      // updating the current navigation.
      navigation.started.resolve();
      this.#currentNavigation.finished.resolve(
        ChromiumBidi.BrowsingContext.EventNames.NavigationAborted,
      );
      this.#initialNavigation = false;
      this.#currentNavigation = navigation;
    }
    if (this.#pendingNavigation === navigation) {
      // Reset pending navigation if needed.
      this.#pendingNavigation = undefined;
    }
  }

  frameStartedNavigating(url: string, loaderId: string) {
    this.#logger?.(LogType.debug, `frameStartedNavigating ${url}, ${loaderId}`);

    if (this.#loaderIdToNavigationsMap.has(loaderId)) {
      // TODO: remove.
      console.log(`!!@@## frameStartedNavigating again, ${loaderId}`);
      this.#logger?.(
        LogType.debugError,
        `!!@@## frameStartedNavigating again, ${loaderId}`,
      );
      return;
    }

    if (this.#pendingNavigation === undefined) {
      this.createPendingNavigation(url);
    }

    this.#pendingNavigation!.started.resolve();
    this.#pendingNavigation!.url = url;

    this.#pendingNavigation!.loaderId = loaderId;
    this.#loaderIdToNavigationsMap.set(loaderId, this.#pendingNavigation!);
  }

  beforeunload() {
    if (this.#pendingNavigation === undefined) {
      // TODO: remove.
      console.log(`!!@@## Unexpectedly no pending navigation on beforeunload`);
      this.#logger?.(
        LogType.debugError,
        `!!@@## Unexpectedly no pending navigation on beforeunload`,
      );
      return;
    }
    this.#pendingNavigation.started.resolve();
  }
}
