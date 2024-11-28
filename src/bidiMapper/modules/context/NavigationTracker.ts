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

import {
  type BrowsingContext,
  ChromiumBidi,
} from '../../../protocol/protocol.js';
import {Deferred} from '../../../utils/Deferred.js';
import {getTimestamp} from '../../../utils/Time.js';
import {urlMatchesAboutBlank} from '../../../utils/UrlHelpers.js';
import {uuidv4} from '../../../utils/uuid.js';
import type {EventManager} from '../session/EventManager.js';

export type NavigationEventName =
  // TODO: implement.
  // ChromiumBidi.BrowsingContext.EventNames.DownloadWillBegin|
  | ChromiumBidi.BrowsingContext.EventNames.FragmentNavigated
  | ChromiumBidi.BrowsingContext.EventNames.NavigationAborted
  | ChromiumBidi.BrowsingContext.EventNames.NavigationFailed;

class NavigationState {
  started = new Deferred<void>();
  finished = new Deferred<NavigationEventName>();

  // Tracks CDP events on the navigation. Used to distinguish new navigations from the
  // initial one.
  cdpStates = {
    frameScheduledNavigation: false,
    frameRequestedNavigation: false,
    frameStartedLoading: false,
  };

  markFragmentNavigated() {
    this.started.resolve();
    this.finished.resolve(
      ChromiumBidi.BrowsingContext.EventNames.FragmentNavigated,
    );
  }

  markNavigationAborted() {
    this.started.resolve();
    this.finished.resolve(
      ChromiumBidi.BrowsingContext.EventNames.NavigationAborted,
    );
  }

  markNavigationFailed() {
    this.started.resolve();
    this.finished.resolve(
      ChromiumBidi.BrowsingContext.EventNames.NavigationFailed,
    );
  }

  readonly navigationId = uuidv4();
  url: string;
  readonly #browsingContextId: string;

  constructor(browsingContextId: string, url: string) {
    this.#browsingContextId = browsingContextId;
    this.url = url;
  }

  navigationInfo(): BrowsingContext.NavigationInfo {
    return {
      context: this.#browsingContextId,
      navigation: this.navigationId,
      timestamp: getTimestamp(),
      url: this.url,
    };
  }

  markStarted(): void {
    this.started.resolve();
  }
}

export class NavigationTracker {
  #initialNavigation = true;
  #currentNavigation: NavigationState;
  readonly #eventManager: EventManager;
  readonly #browsingContextId: string;

  constructor(eventManager: EventManager, browsingContextId: string) {
    this.#eventManager = eventManager;
    this.#browsingContextId = browsingContextId;
    // Initial navigation. No need for event listeners.
    this.#currentNavigation = new NavigationState(
      this.#browsingContextId,
      'about:blank',
    );
  }

  get navigationId(): string {
    return this.#currentNavigation.navigationId;
  }

  dispose() {
    this.#currentNavigation.markNavigationAborted();
  }

  createNavigation(url: string): NavigationState {
    this.#initialNavigation = false;
    if (this.#currentNavigation !== undefined) {
      this.#currentNavigation.markNavigationAborted();
    }
    const navigation = new NavigationState(this.#browsingContextId, url);
    this.#setEventListeners(navigation);

    this.#currentNavigation = navigation;
    return navigation;
  }

  #setEventListeners(navigation: NavigationState) {
    void navigation.started.then(() => {
      this.#eventManager.registerEvent(
        {
          type: 'event',
          method: ChromiumBidi.BrowsingContext.EventNames.NavigationStarted,
          params: navigation.navigationInfo(),
        },
        this.#browsingContextId,
      );
      return;
    });

    void navigation.finished.then((eventName: NavigationEventName) => {
      this.#eventManager.registerEvent(
        {
          type: 'event',
          method: eventName,
          params: navigation.navigationInfo(),
        },
        this.#browsingContextId,
      );
      return;
    });
  }

  frameNavigated(url: string): void {
    this.#currentNavigation.url = url;
  }

  navigatedWithinDocument(url: string, navigationType: string): void {
    this.#currentNavigation.url = url;
    if (navigationType === 'fragment') {
      this.#currentNavigation.markFragmentNavigated();
    }
  }

  frameStartedLoading(): void {
    this.#currentNavigation.markStarted();
    this.#currentNavigation.cdpStates.frameStartedLoading = true;
  }

  frameScheduledNavigation(url: string): void {
    // Signals that it's a new navigation:
    // 1. The `Page.frameStartedLoading` was already emitted.
    // 2. The `Page.frameScheduledNavigation` was already emitted.
    // 3. The `Page.frameRequestedNavigation` was already emitted, which cannot happen
    //    before `Page.frameScheduledNavigation`.
    // 4. The current navigation is the initial one, and the URL does not match
    //    `about:blank`.
    const isNewNavigation =
      this.#currentNavigation.cdpStates.frameStartedLoading ||
      this.#currentNavigation.cdpStates.frameRequestedNavigation ||
      this.#currentNavigation.cdpStates.frameScheduledNavigation ||
      (this.#initialNavigation && !urlMatchesAboutBlank(url));

    if (isNewNavigation) {
      this.createNavigation(url);
    } else {
      this.#currentNavigation.url = url;
    }
    this.#currentNavigation.markStarted();
    this.#currentNavigation.cdpStates.frameScheduledNavigation = true;
  }

  frameRequestedNavigation = (url: string): void => {
    // Signals that it's a new navigation:
    // 1. The `Page.frameStartedLoading` was already emitted.
    // 2. The `Page.frameRequestedNavigation` was already emitted. Note that having
    //    `Page.frameScheduledNavigation` emitted at this point does not signal the new
    //    navigation.
    // 3. The current navigation is the initial one, and the URL does not match
    //    `about:blank`.
    const isNewNavigation =
      this.#currentNavigation.cdpStates.frameStartedLoading ||
      this.#currentNavigation.cdpStates.frameRequestedNavigation ||
      (this.#initialNavigation && !urlMatchesAboutBlank(url));

    if (isNewNavigation) {
      this.createNavigation(url);
    } else {
      this.#currentNavigation.url = url;
    }
    this.#currentNavigation.markStarted();
    this.#currentNavigation.cdpStates.frameRequestedNavigation = true;
  };
}
