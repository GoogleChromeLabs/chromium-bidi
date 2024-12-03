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
import {type LoggerFn, LogType} from '../../../utils/log.js';
import {getTimestamp} from '../../../utils/Time.js';
import {uuidv4} from '../../../utils/uuid.js';
import type {EventManager} from '../session/EventManager.js';

export type NavigationEventName =
  | ChromiumBidi.BrowsingContext.EventNames.FragmentNavigated
  | ChromiumBidi.BrowsingContext.EventNames.NavigationAborted
  | ChromiumBidi.BrowsingContext.EventNames.NavigationFailed
  | ChromiumBidi.BrowsingContext.EventNames.Load;

class NavigationState {
  started = new Deferred<void>();
  finished = new Deferred<NavigationEventName>();

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
}

export class NavigationTracker {
  #currentNavigation: NavigationState;
  #ongoingNavigation?: NavigationState;
  readonly #browsingContextId: string;
  readonly #eventManager: EventManager;
  readonly #logger?: LoggerFn;

  constructor(
    eventManager: EventManager,
    browsingContextId: string,
    logger?: LoggerFn,
  ) {
    this.#browsingContextId = browsingContextId;
    this.#eventManager = eventManager;
    this.#logger = logger;
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
    this.#currentNavigation.finished.resolve(
      ChromiumBidi.BrowsingContext.EventNames.NavigationAborted,
    );
  }

  createOngoingNavigation(url: string): NavigationState {
    if (this.#ongoingNavigation !== undefined) {
      this.#ongoingNavigation.finished.resolve(
        ChromiumBidi.BrowsingContext.EventNames.NavigationAborted,
      );
    }
    const navigation = new NavigationState(this.#browsingContextId, url);

    this.#setEventListeners(navigation);

    this.#ongoingNavigation = navigation;
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
      if (
        [
          ChromiumBidi.BrowsingContext.EventNames.FragmentNavigated,
          ChromiumBidi.BrowsingContext.EventNames.NavigationAborted,
          ChromiumBidi.BrowsingContext.EventNames.NavigationFailed,
        ].includes(eventName)
      ) {
        // Do not emit `load` event, as it should be done in other place.
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

  frameStartedLoading() {
    if (this.#ongoingNavigation === undefined) {
      this.#ongoingNavigation = this.createOngoingNavigation('UNKNOWN');
    }
  }

  navigatedWithinDocument(url: string, navigationType: string) {
    this.#currentNavigation.url = url;

    if (navigationType === 'fragment') {
      if (this.#ongoingNavigation === undefined) {
        this.createOngoingNavigation(url);
      }
      this.#ongoingNavigation!.url = url;
      this.#ongoingNavigation!.finished.resolve(
        ChromiumBidi.BrowsingContext.EventNames.FragmentNavigated,
      );
    }
  }

  requestWillBeSent() {
    this.#currentNavigation.finished.resolve(
      ChromiumBidi.BrowsingContext.EventNames.NavigationAborted,
    );
    if (this.#ongoingNavigation === undefined) {
      // http://goto.google.com/webdriver:detect-navigation-started
      this.#logger?.(
        LogType.debugError,
        'Unexpectedly unset ongoingNavigation on requestWillBeSent',
      );
      return;
    }

    this.#ongoingNavigation.started.resolve();
    this.#currentNavigation = this.#ongoingNavigation;
    this.#ongoingNavigation = undefined;
  }

  frameNavigated(url: string) {
    this.#currentNavigation.url = url;
  }

  frameRequestedNavigation(url: string) {
    this.createOngoingNavigation(url);
  }

  lifecycleEventLoad() {
    this.#currentNavigation.finished.resolve(
      ChromiumBidi.BrowsingContext.EventNames.Load,
    );
  }
}
