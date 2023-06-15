/*
 * Copyright 2023 Google LLC.
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
 *
 */

import {CommonDataTypes, Script} from '../../../protocol/protocol.js';
import type {IEventManager} from '../events/EventManager.js';

import type {Realm} from './realm.js';

import Handle = CommonDataTypes.Handle;

import {uuidv4} from '../../../utils/uuid';

/**
 * Used to send messages from realm to BiDi user.
 */
export class ChannelProxy {
  readonly #properties: Script.ChannelProperties;

  readonly #id = uuidv4();

  constructor(channel: Script.ChannelProperties) {
    if (
      ![0, null, undefined].includes(channel.serializationOptions?.maxDomDepth)
    ) {
      throw new Error(
        'serializationOptions.maxDomDepth other than 0 or null is not supported'
      );
    }

    if (
      ![undefined, 'none'].includes(
        channel.serializationOptions?.includeShadowTree
      )
    ) {
      throw new Error(
        'serializationOptions.includeShadowTree other than "none" is not supported'
      );
    }

    this.#properties = channel;
  }

  /**
   * Creates a channel proxy in the given realm, initialises listener and
   * returns a handle to `sendMessage` delegate.
   * */
  async init(realm: Realm, eventManager: IEventManager): Promise<Handle> {
    const channelHandle = await ChannelProxy.#createAndGetHandleInRealm(realm);
    const sendMessageHandle = await ChannelProxy.#createSendMessageHandle(
      realm,
      channelHandle
    );

    void this.#startListener(realm, channelHandle, eventManager);
    return sendMessageHandle;
  }

  /** Gets a ChannelProxy from window and returns its handle. */
  async startListenerFromWindow(realm: Realm, eventManager: IEventManager) {
    const channelHandle = await this.#getHandleFromWindow(realm);
    void this.#startListener(realm, channelHandle, eventManager);
  }

  /**
   * Returns a handle of ChannelProxy from window's property which was set there
   * by `getEvalInWindowStr`.
   */
  async #getHandleFromWindow(realm: Realm) {
    const channelHandleResult = await realm.cdpClient.sendCommand(
      'Runtime.evaluate',
      {
        expression: `(()=>{
          const result = window['${this.#id}'];
          delete window['${this.#id}'];
          return result;
      })()`,
        contextId: realm.executionContextId,
        serializationOptions: {
          serialization: 'idOnly',
        },
      }
    );
    if (
      channelHandleResult.exceptionDetails !== undefined ||
      channelHandleResult.result.objectId === undefined
    ) {
      throw new Error(`ChannelHandle is not found in window["${this.#id}"]`);
    }
    return channelHandleResult.result.objectId;
  }

  /**
   * Evaluation string which creates a ChannelProxy object on the client side.
   */
  static #createChannelProxyEvalStr() {
    const functionStr = String(() => {
      const queue: unknown[] = [];
      let queueNonEmptyResolver: null | (() => void) = null;

      return {
        /**
         * Gets a promise, which is resolved as soon as a message occurs
         * in the queue.
         */
        async getMessage(): Promise<unknown> {
          const onMessage: Promise<void> =
            queue.length > 0
              ? Promise.resolve()
              : new Promise<void>((resolve) => {
                  queueNonEmptyResolver = resolve;
                });
          await onMessage;
          return queue.shift();
        },

        /**
         * Adds a message to the queue.
         * Resolves the pending promise if needed.
         */
        sendMessage(message: string) {
          queue.push(message);
          if (queueNonEmptyResolver !== null) {
            queueNonEmptyResolver();
            queueNonEmptyResolver = null;
          }
        },
      };
    });

    return `(${functionStr})()`;
  }

  /** Creates a ChannelProxy in the given realm. */
  static async #createAndGetHandleInRealm(
    realm: Realm
  ): Promise<CommonDataTypes.Handle> {
    const createChannelHandleResult = await realm.cdpClient.sendCommand(
      'Runtime.evaluate',
      {
        expression: this.#createChannelProxyEvalStr(),
        contextId: realm.executionContextId,
        serializationOptions: {
          serialization: 'idOnly',
        },
      }
    );
    if (createChannelHandleResult.exceptionDetails) {
      throw new Error(
        `Failed to create channel handle: ${createChannelHandleResult.exceptionDetails}`
      );
    }
    if (createChannelHandleResult.result.objectId === undefined) {
      throw new Error(`Cannot create chanel`);
    }
    return createChannelHandleResult.result.objectId;
  }

  /** Gets a handle to `sendMessage` delegate from the ChanelProxy handle. */
  static async #createSendMessageHandle(
    realm: Realm,
    channelHandle: CommonDataTypes.Handle
  ): Promise<Handle> {
    const sendMessageArgResult = await realm.cdpClient.sendCommand(
      'Runtime.callFunctionOn',
      {
        functionDeclaration: String(
          (channelHandle: {sendMessage: (message: string) => void}) => {
            return channelHandle.sendMessage;
          }
        ),
        arguments: [{objectId: channelHandle}],
        executionContextId: realm.executionContextId,
        serializationOptions: {
          serialization: 'idOnly',
        },
      }
    );
    return sendMessageArgResult.result.objectId!;
  }

  /** Starts listening for the channel events of the provided ChannelProxy. */
  async #startListener(
    realm: Realm,
    channelHandle: Handle,
    eventManager: IEventManager
  ) {
    // TODO(#294): Remove this loop after the realm is destroyed.
    // Rely on the CDP throwing exception in such a case.
    // noinspection InfiniteLoopJS
    for (;;) {
      const message = await realm.cdpClient.sendCommand(
        'Runtime.callFunctionOn',
        {
          functionDeclaration: String(
            async (channelHandle: {getMessage: () => Promise<unknown>}) =>
              channelHandle.getMessage()
          ),
          arguments: [
            {
              objectId: channelHandle,
            },
          ],
          awaitPromise: true,
          executionContextId: realm.executionContextId,
          serializationOptions: {
            serialization: 'deep',
            ...(this.#properties.serializationOptions?.maxObjectDepth ===
              undefined ||
            this.#properties.serializationOptions.maxObjectDepth === null
              ? {}
              : {
                  maxDepth:
                    this.#properties.serializationOptions.maxObjectDepth,
                }),
          },
        }
      );

      eventManager.registerEvent(
        {
          method: Script.EventNames.MessageEvent,
          params: {
            channel: this.#properties.channel,
            data: realm.cdpToBidiValue(
              message,
              this.#properties.ownership ?? 'none'
            ),
            source: {
              realm: realm.realmId,
              context: realm.browsingContextId,
            },
          },
        },
        realm.browsingContextId
      );
    }
  }

  /**
   * String to be evaluated to create a ProxyChannel and put it to window.
   * Returns the delegate `sendMessage`. Used to provide an argument for preload
   * script. Does the following:
   * 1. Creates a ChannelProxy.
   * 2. Puts the ChannelProxy to window['${this.#id}'].
   * 3. Returns the delegate `sendMessage` of the created ChannelProxy.
   */
  getEvalInWindowStr() {
    // TODO: make window['${this.#id}'] non-iterable.
    return `(()=>{
      const channel = ${ChannelProxy.#createChannelProxyEvalStr()};
      window['${this.#id}'] = channel;
      return channel.sendMessage;
    })()`;
  }
}
