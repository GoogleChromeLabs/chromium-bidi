/**
 * Copyright 2021 Google LLC.
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

import type {Protocol} from 'devtools-protocol';
import type {ProtocolMapping} from 'devtools-protocol/types/protocol-mapping.js';
import type {EventType} from 'mitt';

import {EventEmitter} from '../utils/EventEmitter.js';

import type {MapperCdpConnection} from './CdpConnection.js';

export type CdpEvents = {
  [Property in keyof ProtocolMapping.Events]: ProtocolMapping.Events[Property][0];
};

/**
 * Emulated CDP events. These events are not native to the CDP but are synthesized by the
 * BiDi mapper for convenience and compatibility. They are intended to simplify handling
 * certain scenarios.
 */
type EmulatedEvents = {
  /**
   * Emulated CDP event emitted right before the `Network.requestWillBeSent` event
   * indicating that a new navigation is about to start.
   *
   * http://go/webdriver:detect-navigation-started#bookmark=id.64balpqrmadv
   */
  'Page.frameStartedNavigating': {
    loaderId: Protocol.Network.LoaderId;
    url: string;
    // Frame id can be omitted for the top-level frame.
    frameId?: Protocol.Page.FrameId;
  };
};

/** A error that will be thrown if/when the connection is closed. */
export class CloseError extends Error {}

/**
 * CDP client with additional emulated events.
 */
export type ExtendedCdpClient = CdpClientBase<EmulatedEvents>;

export class CdpClientWithEmulatedEventsWrapper
  extends EventEmitter<EmulatedEvents & CdpEvents>
  implements ExtendedCdpClient
{
  readonly #cdpClient: CdpClient;
  constructor(cdpClient: CdpClient) {
    super();
    this.#cdpClient = cdpClient;
    cdpClient.on('*', (event, params) => {
      // We may encounter uses for EventEmitter other than CDP events,
      // which we want to skip.
      if (event === 'Network.requestWillBeSent') {
        const eventParams = params as Protocol.Network.RequestWillBeSentEvent;
        if (eventParams.loaderId === eventParams.requestId) {
          this.emit('Page.frameStartedNavigating', {
            loaderId: eventParams.loaderId,
            url: eventParams.request.url,
            frameId: eventParams.frameId,
          });
        }
      }

      this.emit(event, params);
    });
  }

  get sessionId(): Protocol.Target.SessionID | undefined {
    return this.#cdpClient.sessionId;
  }

  isCloseError(error: unknown): boolean {
    return this.#cdpClient.isCloseError(error);
  }

  sendCommand<CdpMethod extends keyof ProtocolMapping.Commands>(
    method: CdpMethod,
    params?: ProtocolMapping.Commands[CdpMethod]['paramsType'][0],
  ): Promise<ProtocolMapping.Commands[CdpMethod]['returnType']> {
    return this.#cdpClient.sendCommand(method, params);
  }
}

interface CdpClientBase<CdpEventExtensions extends Record<EventType, unknown>>
  extends EventEmitter<CdpEvents & CdpEventExtensions> {
  /** Unique session identifier. */
  sessionId: Protocol.Target.SessionID | undefined;

  /**
   * Provides an unique way to detect if an error was caused by the closure of a
   * Target or Session.
   *
   * @example During the creation of a subframe we navigate the main frame.
   * The subframe Target is closed while initialized commands are in-flight.
   * In this case we want to swallow the thrown error.
   */
  isCloseError(error: unknown): boolean;

  /**
   * Returns a command promise, which will be resolved with the command result
   * after receiving the result from CDP.
   * @param method Name of the CDP command to call.
   * @param params Parameters to pass to the CDP command.
   */
  sendCommand<CdpMethod extends keyof ProtocolMapping.Commands>(
    method: CdpMethod,
    params?: ProtocolMapping.Commands[CdpMethod]['paramsType'][0],
  ): Promise<ProtocolMapping.Commands[CdpMethod]['returnType']>;
}

export type CdpClient = CdpClientBase<CdpEvents>;

/** Represents a high-level CDP connection to the browser. */
export class MapperCdpClient
  extends EventEmitter<CdpEvents>
  implements CdpClient
{
  #cdpConnection: MapperCdpConnection;
  #sessionId?: Protocol.Target.SessionID;

  constructor(
    cdpConnection: MapperCdpConnection,
    sessionId?: Protocol.Target.SessionID,
  ) {
    super();
    this.#cdpConnection = cdpConnection;
    this.#sessionId = sessionId;
  }

  get sessionId(): Protocol.Target.SessionID | undefined {
    return this.#sessionId;
  }

  sendCommand<CdpMethod extends keyof ProtocolMapping.Commands>(
    method: CdpMethod,
    ...params: ProtocolMapping.Commands[CdpMethod]['paramsType']
  ): Promise<ProtocolMapping.Commands[CdpMethod]['returnType']> {
    return this.#cdpConnection.sendCommand(method, params[0], this.#sessionId);
  }

  isCloseError(error: unknown): boolean {
    return error instanceof CloseError;
  }
}
