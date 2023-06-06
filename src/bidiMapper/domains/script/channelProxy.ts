/**
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
 */
import {Script} from '../../../protocol/protocol.js';
import {IEventManager} from '../events/EventManager.js';

import {Realm} from './realm.js';
import Channel = Script.Channel;

/** Creates a new channel proxy script suitable for evaluation. */
export function newChannelProxy(): string {
  return String(() => {
    const queue: {message: string; channelName: string}[] = [];
    let queueNonEmptyResolver: null | (() => void) = null;

    return {
      /**
       * Gets a promise, which is resolved as soon as a message occurs
       * in the queue.
       */
      async getMessage(): Promise<(typeof queue)[0]> {
        const onMessage =
          queue.length > 0
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                queueNonEmptyResolver = resolve;
              });
        await onMessage;
        return queue.shift()!;
      },

      /**
       * Gets a function that can be used to send messages to the queue with
       * the given channel name.
       */
      getSendMessageByChannelName(channelName: string) {
        return (message: string) => {
          this.sendMessage(message, channelName);
        };
      },

      /**
       * Adds a message to the queue.
       * Resolves the pending promise if needed.
       */
      sendMessage(message: string, channelName: string) {
        queue.push({message, channelName});
        if (queueNonEmptyResolver !== null) {
          queueNonEmptyResolver();
          queueNonEmptyResolver = null;
        }
      },
    };
  });
}

export async function initChannelListener(
  channelHandle: string | undefined,
  channelUuid: string | undefined,
  realm: Realm,
  eventManager: IEventManager
) {
  // Get channel handler from window.
  // TODO: probably, condition should be `channelHandle===undefined`.
  if (channelUuid !== undefined) {
    const message = await realm.cdpClient.sendCommand('Runtime.evaluate', {
      expression: `(async()=>{
        if(window['${channelUuid}']!==undefined){
          const result = window['${channelUuid}'];
          delete window['${channelUuid}'];
          return result;
        }
        let resolve;
        const promise = new Promise(r=>resolve=r);
        // TODO: make non-enumerable
        window['${channelUuid}'] = promise;
        const result = await promise;
        delete window['${channelUuid}'];
        return result; 
      })()`,
      awaitPromise: true,
      contextId: realm.executionContextId,
      serializationOptions: {
        // TODO: replace with `idOnly`.
        serialization: 'deep',
      },
    });

    channelHandle = message.result.objectId;
  }

  // TODO(#294): Remove this loop after the realm is destroyed.
  // Rely on the CDP throwing exception in such a case.
  // noinspection InfiniteLoopJS
  for (;;) {
    // TODO: error handling.
    const event = await realm.cdpClient.sendCommand('Runtime.callFunctionOn', {
      functionDeclaration: String(
        async (channelHandle: {
          getMessage: () => Promise<{message: string; channelName: string}>;
        }) => await channelHandle.getMessage()
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
        maxDepth: 1,
      },
    });

    const channelName = event.result.deepSerializedValue?.value.find(
      (v: String[]) => v[0] == 'channelName'
    )[1].value as Channel;

    // Extra call is needed to get the handle and properly serialized message.
    const message = await realm.cdpClient.sendCommand(
      'Runtime.callFunctionOn',
      {
        functionDeclaration: 'event => event.message',
        arguments: [
          {
            objectId: event.result.objectId,
          },
        ],
        awaitPromise: false,
        executionContextId: realm.executionContextId,
        serializationOptions: {
          serialization: 'deep',
          // TODO: add serialization options.
        },
      }
    );

    // TODO: error handling.
    eventManager.registerEvent(
      {
        method: Script.EventNames.MessageEvent,
        params: {
          channel: channelName,
          // TODO handle result ownership.
          data: realm.cdpToBidiValue(message, 'none'),
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
