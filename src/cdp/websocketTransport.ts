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

import { ITransport } from '../utils/transport';
import WebSocket from 'ws';

export class WebSocketTransport implements ITransport {
  #onMessage: ((message: string) => void) | null = null;
  #webSocket: WebSocket;

  constructor(webSocket: WebSocket) {
    this.#webSocket = webSocket;
    this.#webSocket.on('message', (message: string) => {
      if (this.#onMessage) {
        this.#onMessage.call(null, message);
      }
    });
  }

  setOnMessage(onMessage: (message: string) => void): void {
    this.#onMessage = onMessage;
  }

  async sendMessage(message: string): Promise<void> {
    this.#webSocket.send(message);
  }

  close() {
    this.#onMessage = null;
    this.#webSocket.close();
  }
}
