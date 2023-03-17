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
import {LogType} from '../utils/log';
import {BidiServer} from '../bidiMapper/BidiServer';
import {OutgoingBidiMessage} from '../bidiMapper/OutgoingBidiMessage';

import {log as logToPage} from './mapperTabPage.js';

export class Logger {
  #bidiServer: BidiServer | undefined;
  #verboseDebugChannel: string | undefined;

  constructor() {
    this.#verboseDebugChannel = undefined;
    this.#bidiServer = undefined;
  }

  log(logType: LogType, ...messages: unknown[]) {
    logToPage(logType, ...messages);

    if (
      (logType === LogType.cdp || logType === LogType.system) &&
      this.#verboseDebugChannel !== undefined &&
      this.#bidiServer !== undefined
    ) {
      this.#bidiServer.emitOutgoingMessage(
        OutgoingBidiMessage.createResolved(
          {
            method: 'MapperDebug',
            params: {
              logType,
              messages,
            },
          },
          this.#verboseDebugChannel
        )
      );
    }
  }

  setVerboseDebugChannel(verboseDebugChannel: string | undefined) {
    this.#verboseDebugChannel = verboseDebugChannel;
  }

  setBiDiServer(bidiServer: BidiServer) {
    this.#bidiServer = bidiServer;
  }
}
