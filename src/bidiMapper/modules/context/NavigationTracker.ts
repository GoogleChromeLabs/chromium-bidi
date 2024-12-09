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
import {getTimestamp} from '../../../utils/time.js';
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
  loaderId?: string;
  // Hack.
  startedByBeforeUnload = false;

  readonly navigationId = uuidv4();
  url: string;
  readonly #browsingContextId: string;

  constructor(browsingContextId: string, url: string) {
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
    this.#logger?.(LogType.debug, 'dispose');

    this.#currentNavigation.finished.resolve(
      ChromiumBidi.BrowsingContext.EventNames.NavigationAborted,
    );
  }

  createOngoingNavigation(url: string): NavigationState {
    this.#logger?.(LogType.debug, 'createOngoingNavigation');

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
        `Navigation ${navigation.navigationId} finished with ${eventName}`,
      );
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
    this.#logger?.(LogType.debug, 'Page.frameStartedLoading');
  }

  navigatedWithinDocument(url: string, navigationType: string) {
    this.#logger?.(LogType.debug, 'Page.navigatedWithinDocument');
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

  beforeunload() {
    // Hack.
    this.#currentNavigation.finished.resolve(
      ChromiumBidi.BrowsingContext.EventNames.NavigationAborted,
    );
    if (this.#ongoingNavigation === undefined) {
      // http://goto.google.com/webdriver:detect-navigation-started
      this.#logger?.(
        LogType.debugError,
        'Unexpectedly unset ongoingNavigation on beforeunload',
      );
      return;
    }

    this.#ongoingNavigation.started.resolve();
    this.#currentNavigation = this.#ongoingNavigation;
    this.#currentNavigation.startedByBeforeUnload = true;
    this.#ongoingNavigation = undefined;
  }

  frameStartedNavigating(loaderId: string) {
    this.#logger?.(LogType.debug, `Page.frameStartedNavigating ${loaderId}`);

    if (this.#currentNavigation.loaderId === loaderId) {
      // The same request can be due to redirect. Ignore if so.
      return;
    }
    if (this.#currentNavigation.startedByBeforeUnload) {
      // Hack.
      return;
    }
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
    this.#currentNavigation.loaderId = loaderId;
    this.#ongoingNavigation = undefined;
  }

  frameNavigated(url: string) {
    this.#logger?.(LogType.debug, `Page.frameNavigated ${url}`);
    if (this.#ongoingNavigation !== undefined) {
      // In some cases (`about:blank`) the `requestWillBeSent` is not emitted.
      this.#currentNavigation = this.#ongoingNavigation;
    }
    this.#currentNavigation.url = url;
  }

  frameRequestedNavigation(url: string) {
    this.#logger?.(LogType.debug, `Page.frameRequestedNavigation ${url}`);
    this.createOngoingNavigation(url);
  }

  lifecycleEventLoad() {
    this.#logger?.(LogType.debug, 'Page.lifecycleEvent:load');
    this.#currentNavigation.finished.resolve(
      ChromiumBidi.BrowsingContext.EventNames.Load,
    );
  }
}
