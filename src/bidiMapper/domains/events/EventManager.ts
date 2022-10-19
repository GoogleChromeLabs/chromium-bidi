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

import { CommonDataTypes, Message } from '../protocol/bidiProtocolTypes';
import { IBidiServer } from '../../utils/bidiServer';
import { SubscriptionManager } from './SubscriptionManager';
import { IdWrapper } from '../../../utils/idWrapper';
import { Buffer } from '../../../utils/buffer';
import { BrowsingContextStorage } from '../context/browsingContextStorage';

export interface IEventManager {
  sendEvent(
    event: Message.EventMessage,
    contextId: CommonDataTypes.BrowsingContext | null
  ): Promise<void>;

  subscribe(
    events: string[],
    contextIds: (CommonDataTypes.BrowsingContext | null)[],
    channel: string | null
  ): Promise<void>;

  unsubscribe(
    event: string[],
    contextIds: (CommonDataTypes.BrowsingContext | null)[],
    channel: string | null
  ): Promise<void>;
}

export class EventManager implements IEventManager {
  /**
   * Maps event name to a desired buffer length.
   * @private
   */
  static readonly #eventBufferLength: Map<string, number> = new Map([
    ['log.entryAdded', 10],
  ]);
  /**
   * Maps `eventName` + `browsingContext` to buffer. Used to get buffered events
   * during subscription. Channel-agnostic.
   * @private
   */
  #eventBuffers: Map<string, Buffer<IdWrapper<Message.EventMessage>>> =
    new Map();
  /**
   * Maps `eventName` + `browsingContext` + `channel` to last sent event id.
   * Used to avoid sending duplicated events when user
   * subscribes -> unsubscribes -> subscribes.
   * @private
   */
  #lastMessageSent: Map<string, number> = new Map();
  #subscriptionManager: SubscriptionManager;
  #bidiServer: IBidiServer;

  constructor(bidiServer: IBidiServer) {
    this.#bidiServer = bidiServer;
    this.#subscriptionManager = new SubscriptionManager();
  }

  /**
   * Returns consistent key to be used to access values maps.
   * @param eventName
   * @param browsingContext
   * @param channel
   * @private
   */
  static #getMapKey(
    eventName: string,
    browsingContext: CommonDataTypes.BrowsingContext | null,
    channel: string | null | undefined = undefined
  ) {
    return JSON.stringify({ eventName, browsingContext, channel });
  }

  async sendEvent(
    event: Message.EventMessage,
    contextId: CommonDataTypes.BrowsingContext | null
  ): Promise<void> {
    const eventWrapper = new IdWrapper<Message.EventMessage>(event);
    const sortedChannels =
      this.#subscriptionManager.getChannelsSubscribedToEvent(
        event.method,
        contextId
      );
    // Buffers event if needed.
    this.#bufferEvent(eventWrapper, contextId);
    // Send events to channels in the subscription priority.
    for (const channel of sortedChannels) {
      await this.#bidiServer.sendMessage(event, channel);
      this.#markEventSent(eventWrapper, contextId, channel);
    }
  }

  async subscribe(
    eventNames: string[],
    contextIds: (CommonDataTypes.BrowsingContext | null)[],
    channel: string | null
  ): Promise<void> {
    for (let eventName of eventNames) {
      for (let contextId of contextIds) {
        if (
          contextId !== null &&
          !BrowsingContextStorage.hasKnownContext(contextId)
        ) {
          // Unknown context. Do nothing.
          continue;
        }
        this.#subscriptionManager.subscribe(eventName, contextId, channel);
        for (let eventWrapper of this.#getBufferedEvents(
          eventName,
          contextId,
          channel
        )) {
          // The order of the events is important.
          await this.#bidiServer.sendMessage(eventWrapper.value, channel);
          this.#markEventSent(eventWrapper, contextId, channel);
        }
      }
    }
  }

  async unsubscribe(
    events: string[],
    contextIds: (CommonDataTypes.BrowsingContext | null)[],
    channel: string | null
  ): Promise<void> {
    for (let event of events) {
      for (let contextId of contextIds) {
        this.#subscriptionManager.unsubscribe(event, contextId, channel);
      }
    }
  }

  /**
   * If the event is buffer-able, put it in the buffer.
   * @param eventWrapper
   * @param contextId
   * @private
   */
  #bufferEvent(
    eventWrapper: IdWrapper<Message.EventMessage>,
    contextId: CommonDataTypes.BrowsingContext | null
  ) {
    const eventName = eventWrapper.value.method;
    if (!EventManager.#eventBufferLength.has(eventName)) {
      // Do nothing if the event is no buffer-able.
      return;
    }
    const bufferMapKey = EventManager.#getMapKey(eventName, contextId);
    if (!this.#eventBuffers.has(bufferMapKey)) {
      this.#eventBuffers.set(
        bufferMapKey,
        new Buffer<IdWrapper<Message.EventMessage>>(
          EventManager.#eventBufferLength.get(eventName)!
        )
      );
    }
    this.#eventBuffers.get(bufferMapKey)!.add(eventWrapper);
  }

  /**
   * If the event is buffer-able, mark it as sent to the given contextId and channel.
   * @param eventWrapper
   * @param contextId
   * @param channel
   * @private
   */
  #markEventSent(
    eventWrapper: IdWrapper<Message.EventMessage>,
    contextId: CommonDataTypes.BrowsingContext | null,
    channel: string | null
  ) {
    const eventName = eventWrapper.value.method;
    if (!EventManager.#eventBufferLength.has(eventName)) {
      // Do nothing if the event is no buffer-able.
      return;
    }

    const lastSentMapKey = EventManager.#getMapKey(
      eventName,
      contextId,
      channel
    );
    this.#lastMessageSent.set(
      lastSentMapKey,
      Math.max(this.#lastMessageSent.get(lastSentMapKey) ?? 0, eventWrapper.id)
    );
  }

  /**
   * Returns events which are buffered and not yet sent to the given channel events.
   * @param eventName
   * @param contextId
   * @param channel
   * @private
   */
  #getBufferedEvents(
    eventName: string,
    contextId: CommonDataTypes.BrowsingContext | null,
    channel: string | null
  ): IdWrapper<Message.EventMessage>[] {
    const bufferMapKey = EventManager.#getMapKey(eventName, contextId);
    const lastSentMapKey = EventManager.#getMapKey(
      eventName,
      contextId,
      channel
    );
    const lastSentMessageId =
      this.#lastMessageSent.get(lastSentMapKey) ?? -Infinity;

    return (
      this.#eventBuffers
        .get(bufferMapKey)
        ?.get()
        .filter((wrapper) => wrapper.id > lastSentMessageId) ?? []
    );
  }
}
