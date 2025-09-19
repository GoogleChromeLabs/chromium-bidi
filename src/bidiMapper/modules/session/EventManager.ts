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

import type {GoogChannel} from '../../../protocol/chromium-bidi.js';
import {
  type Browser,
  ChromiumBidi,
  InvalidArgumentException,
  type BrowsingContext,
} from '../../../protocol/protocol.js';
import {Buffer} from '../../../utils/Buffer.js';
import {DefaultMap} from '../../../utils/DefaultMap.js';
import {EventEmitter} from '../../../utils/EventEmitter.js';
import {IdWrapper} from '../../../utils/IdWrapper.js';
import type {Result} from '../../../utils/result.js';
import {OutgoingMessage} from '../../OutgoingMessage.js';
import type {UserContextStorage} from '../browser/UserContextStorage.js';
import type {BrowsingContextStorage} from '../context/BrowsingContextStorage.js';

import {assertSupportedEvent} from './events.js';
import {
  difference,
  SubscriptionManager,
  unrollEvents,
} from './SubscriptionManager.js';

class EventWrapper {
  readonly #idWrapper = new IdWrapper();
  readonly #contextId: BrowsingContext.BrowsingContext | null;
  readonly #event: Promise<Result<ChromiumBidi.Event>>;

  constructor(
    event: Promise<Result<ChromiumBidi.Event>>,
    contextId: BrowsingContext.BrowsingContext | null,
  ) {
    this.#event = event;
    this.#contextId = contextId;
  }

  get id(): number {
    return this.#idWrapper.id;
  }

  get contextId(): BrowsingContext.BrowsingContext | null {
    return this.#contextId;
  }

  get event(): Promise<Result<ChromiumBidi.Event>> {
    return this.#event;
  }
}

export const enum EventManagerEvents {
  Event = 'event',
}

interface EventManagerEventsMap extends Record<string | symbol, unknown> {
  [EventManagerEvents.Event]: {
    message: Promise<Result<OutgoingMessage>>;
    event: string;
  };
}
/**
 * Maps event name to a desired buffer length.
 */
const eventBufferLength: ReadonlyMap<ChromiumBidi.EventNames, number> = new Map(
  [[ChromiumBidi.Log.EventNames.LogEntryAdded, 100]],
);

/**
 * Subscription item is a pair of event name and context id.
 */
export interface SubscriptionItem {
  contextId: BrowsingContext.BrowsingContext;
  event: ChromiumBidi.EventNames;
}

export class EventManager extends EventEmitter<EventManagerEventsMap> {
  /**
   * Maps event name to a set of contexts where this event already happened.
   * Needed for getting buffered events from all the contexts in case of
   * subscripting to all contexts.
   */
  #eventToContextsMap = new DefaultMap<
    ChromiumBidi.EventNames,
    Set<BrowsingContext.BrowsingContext | null>
  >(() => new Set());
  /**
   * Maps `eventName` + `browsingContext` to buffer. Used to get buffered events
   * during subscription. Channel-agnostic.
   */
  #eventBuffers = new Map<string, Buffer<EventWrapper>>();
  /**
   * Maps `eventName` + `browsingContext` to  Map of goog:channel to last id.
   * Used to avoid sending duplicated events when user
   * subscribes -> unsubscribes -> subscribes.
   */
  #lastMessageSent = new Map<string, Map<string | null, number>>();
  #subscriptionManager: SubscriptionManager;
  #browsingContextStorage: BrowsingContextStorage;
  /**
   * Map of event name to hooks to be called when client is subscribed to the event.
   */
  #subscribeHooks: DefaultMap<
    ChromiumBidi.EventNames,
    ((contextId: BrowsingContext.BrowsingContext) => void)[]
  >;

  #userContextStorage: UserContextStorage;

  constructor(
    browsingContextStorage: BrowsingContextStorage,
    userContextStorage: UserContextStorage,
  ) {
    super();
    this.#browsingContextStorage = browsingContextStorage;
    this.#userContextStorage = userContextStorage;
    this.#subscriptionManager = new SubscriptionManager(browsingContextStorage);
    this.#subscribeHooks = new DefaultMap(() => []);
  }

  get subscriptionManager(): SubscriptionManager {
    return this.#subscriptionManager;
  }

  /**
   * Returns consistent key to be used to access value maps.
   */
  static #getMapKey(
    eventName: ChromiumBidi.EventNames,
    browsingContext: BrowsingContext.BrowsingContext | null,
  ) {
    return JSON.stringify({eventName, browsingContext});
  }

  addSubscribeHook(
    event: ChromiumBidi.EventNames,
    hook: (contextId: BrowsingContext.BrowsingContext) => Promise<void>,
  ): void {
    this.#subscribeHooks.get(event).push(hook);
  }

  registerEvent(
    event: ChromiumBidi.Event,
    contextId: BrowsingContext.BrowsingContext,
  ): void {
    this.registerPromiseEvent(
      Promise.resolve({
        kind: 'success',
        value: event,
      }),
      contextId,
      event.method,
    );
  }

  registerGlobalEvent(event: ChromiumBidi.Event): void {
    this.registerGlobalPromiseEvent(
      Promise.resolve({
        kind: 'success',
        value: event,
      }),
      event.method,
    );
  }

  registerPromiseEvent(
    event: Promise<Result<ChromiumBidi.Event>>,
    contextId: BrowsingContext.BrowsingContext,
    eventName: ChromiumBidi.EventNames,
  ): void {
    const eventWrapper = new EventWrapper(event, contextId);
    const sortedGoogChannels =
      this.#subscriptionManager.getGoogChannelsSubscribedToEvent(
        eventName,
        contextId,
      );
    this.#bufferEvent(eventWrapper, eventName);
    // Send events to channels in the subscription priority.
    for (const googChannel of sortedGoogChannels) {
      this.emit(EventManagerEvents.Event, {
        message: OutgoingMessage.createFromPromise(event, googChannel),
        event: eventName,
      });
      this.#markEventSent(eventWrapper, googChannel, eventName);
    }
  }

  registerGlobalPromiseEvent(
    event: Promise<Result<ChromiumBidi.Event>>,
    eventName: ChromiumBidi.EventNames,
  ): void {
    const eventWrapper = new EventWrapper(event, null);
    const sortedGoogChannels =
      this.#subscriptionManager.getGoogChannelsSubscribedToEventGlobally(
        eventName,
      );
    this.#bufferEvent(eventWrapper, eventName);
    // Send events to goog:channels in the subscription priority.
    for (const googChannel of sortedGoogChannels) {
      this.emit(EventManagerEvents.Event, {
        message: OutgoingMessage.createFromPromise(event, googChannel),
        event: eventName,
      });
      this.#markEventSent(eventWrapper, googChannel, eventName);
    }
  }

  async subscribe(
    eventNames: ChromiumBidi.EventNames[],
    contextIds: BrowsingContext.BrowsingContext[],
    userContextIds: Browser.UserContext[],
    googChannel: GoogChannel,
  ): Promise<string> {
    for (const name of eventNames) {
      assertSupportedEvent(name);
    }

    if (userContextIds.length && contextIds.length) {
      throw new InvalidArgumentException(
        'Both userContexts and contexts cannot be specified.',
      );
    }

    // First check if all the contexts are known.
    this.#browsingContextStorage.verifyContextsList(contextIds);

    // Validate user contexts.
    await this.#userContextStorage.verifyUserContextIdList(userContextIds);

    const unrolledEventNames = new Set(unrollEvents(eventNames));
    const subscribeStepEvents = new Map<ChromiumBidi.EventNames, Set<string>>();
    const subscriptionNavigableIds = new Set(
      contextIds.length
        ? contextIds.map((contextId) => {
            const id =
              this.#browsingContextStorage.findTopLevelContextId(contextId);
            if (!id) {
              throw new InvalidArgumentException('Invalid context id');
            }
            return id;
          })
        : this.#browsingContextStorage.getTopLevelContexts().map((c) => c.id),
    );

    for (const eventName of unrolledEventNames) {
      const subscribedNavigableIds = new Set(
        this.#browsingContextStorage
          .getTopLevelContexts()
          .map((c) => c.id)
          .filter((id) => {
            return this.#subscriptionManager.isSubscribedTo(eventName, id);
          }),
      );
      subscribeStepEvents.set(
        eventName,
        difference(subscriptionNavigableIds, subscribedNavigableIds),
      );
    }

    const subscription = this.#subscriptionManager.subscribe(
      eventNames,
      contextIds,
      userContextIds,
      googChannel,
    );

    for (const eventName of subscription.eventNames) {
      for (const contextId of subscriptionNavigableIds) {
        for (const eventWrapper of this.#getBufferedEvents(
          eventName,
          contextId,
          googChannel,
        )) {
          // The order of the events is important.
          this.emit(EventManagerEvents.Event, {
            message: OutgoingMessage.createFromPromise(
              eventWrapper.event,
              googChannel,
            ),
            event: eventName,
          });
          this.#markEventSent(eventWrapper, googChannel, eventName);
        }
      }
    }

    for (const [eventName, contextIds] of subscribeStepEvents) {
      for (const contextId of contextIds) {
        this.#subscribeHooks.get(eventName).forEach((hook) => hook(contextId));
      }
    }

    await this.toggleModulesIfNeeded();

    return subscription.id;
  }

  async unsubscribe(
    eventNames: ChromiumBidi.EventNames[],
    googChannel: GoogChannel,
  ): Promise<void> {
    for (const name of eventNames) {
      assertSupportedEvent(name);
    }
    this.#subscriptionManager.unsubscribe(eventNames, googChannel);
    await this.toggleModulesIfNeeded();
  }

  async unsubscribeByIds(subscriptionIds: string[]): Promise<void> {
    this.#subscriptionManager.unsubscribeById(subscriptionIds);
    await this.toggleModulesIfNeeded();
  }

  async toggleModulesIfNeeded(): Promise<void> {
    // TODO(1): Only update changed subscribers
    // TODO(2): Enable for Worker Targets
    await Promise.all(
      this.#browsingContextStorage.getAllContexts().map(async (context) => {
        return await context.toggleModulesIfNeeded();
      }),
    );
  }

  clearBufferedEvents(contextId: string): void {
    for (const eventName of eventBufferLength.keys()) {
      const bufferMapKey = EventManager.#getMapKey(eventName, contextId);

      this.#eventBuffers.delete(bufferMapKey);
    }
  }

  /**
   * If the event is buffer-able, put it in the buffer.
   */
  #bufferEvent(eventWrapper: EventWrapper, eventName: ChromiumBidi.EventNames) {
    if (!eventBufferLength.has(eventName)) {
      // Do nothing if the event is no buffer-able.
      return;
    }
    const bufferMapKey = EventManager.#getMapKey(
      eventName,
      eventWrapper.contextId,
    );
    if (!this.#eventBuffers.has(bufferMapKey)) {
      this.#eventBuffers.set(
        bufferMapKey,
        new Buffer<EventWrapper>(eventBufferLength.get(eventName)!),
      );
    }
    this.#eventBuffers.get(bufferMapKey)!.add(eventWrapper);
    // Add the context to the list of contexts having `eventName` events.
    this.#eventToContextsMap.get(eventName).add(eventWrapper.contextId);
  }

  /**
   * If the event is buffer-able, mark it as sent to the given contextId and goog:channel.
   */
  #markEventSent(
    eventWrapper: EventWrapper,
    googChannel: GoogChannel,
    eventName: ChromiumBidi.EventNames,
  ) {
    if (!eventBufferLength.has(eventName)) {
      // Do nothing if the event is no buffer-able.
      return;
    }

    const lastSentMapKey = EventManager.#getMapKey(
      eventName,
      eventWrapper.contextId,
    );

    const lastId = Math.max(
      this.#lastMessageSent.get(lastSentMapKey)?.get(googChannel) ?? 0,
      eventWrapper.id,
    );

    const googChannelMap = this.#lastMessageSent.get(lastSentMapKey);
    if (googChannelMap) {
      googChannelMap.set(googChannel, lastId);
    } else {
      this.#lastMessageSent.set(
        lastSentMapKey,
        new Map([[googChannel, lastId]]),
      );
    }
  }

  /**
   * Returns events which are buffered and not yet sent to the given goog:channel events.
   */
  #getBufferedEvents(
    eventName: ChromiumBidi.EventNames,
    contextId: BrowsingContext.BrowsingContext | null,
    googChannel: GoogChannel,
  ): EventWrapper[] {
    const bufferMapKey = EventManager.#getMapKey(eventName, contextId);
    const lastSentMessageId =
      this.#lastMessageSent.get(bufferMapKey)?.get(googChannel) ?? -Infinity;

    const result: EventWrapper[] =
      this.#eventBuffers
        .get(bufferMapKey)
        ?.get()
        .filter((wrapper) => wrapper.id > lastSentMessageId) ?? [];

    if (contextId === null) {
      // For global subscriptions, events buffered in each context should be sent back.
      Array.from(this.#eventToContextsMap.get(eventName).keys())
        .filter(
          (_contextId) =>
            // Events without context are already in the result.
            _contextId !== null &&
            // Events from deleted contexts should not be sent.
            this.#browsingContextStorage.hasContext(_contextId),
        )
        .map((_contextId) =>
          this.#getBufferedEvents(eventName, _contextId, googChannel),
        )
        .forEach((events) => result.push(...events));
    }
    return result.sort((e1, e2) => e1.id - e2.id);
  }
}
