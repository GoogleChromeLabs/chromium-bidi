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

import type {ProtocolMapping} from 'devtools-protocol/types/protocol-mapping.js';

import {EventEmitter} from '../utils/EventEmitter.js';

import type {CdpConnection} from './cdpConnection.js';

export type CdpEvents = {
  [Property in keyof ProtocolMapping.Events]: ProtocolMapping.Events[Property][0];
};

/** A error that will be thrown if/when the connection is closed. */
export class CloseError extends Error {}

export interface ICdpClient extends EventEmitter<CdpEvents> {
  /**
   * Unique session identifier.
   */
  sessionId: string | undefined;

  /**
   * Get the default browser client (no sessionId)
   */
  browserClient(): ICdpClient;

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
    params?: ProtocolMapping.Commands[CdpMethod]['paramsType'][0]
  ): Promise<ProtocolMapping.Commands[CdpMethod]['returnType']>;
}

/** Represents a high-level CDP connection to the browser. */
export class CdpClient extends EventEmitter<CdpEvents> implements ICdpClient {
  #cdpConnection: CdpConnection;
  #sessionId?: string;

  constructor(cdpConnection: CdpConnection, sessionId?: string) {
    super();
    this.#cdpConnection = cdpConnection;
    this.#sessionId = sessionId;
  }

  get sessionId(): string | undefined {
    return this.#sessionId;
  }

  browserClient(): ICdpClient {
    return this.#cdpConnection.browserClient();
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
