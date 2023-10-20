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
 *
 * @license
 */

import {BidiServer} from '../bidiMapper/BidiMapper.js';
import {CdpConnection} from '../cdp/CdpConnection.js';
import {LogType} from '../utils/log.js';

import {BidiParser} from './BidiParser.js';
import {WindowBidiTransport, WindowCdpTransport} from './Transport.js';
import {generatePage, log} from './mapperTabPage.js';

declare global {
  /**
   * Mapper is run by Runner (either NodeJS or ChromeDriver). In order to provide
   * communication channels, the `window` object of the tab where the Mapper is running,
   * is extended with the following properties.
   */
  interface Window {
    /**
     * Launch the BiDi mapper instance.
     * Is set by the Mapper when Mapper script is initialized, and will be evaluated via
     * `Runtime.evaluate` by the runner via `Runtime.evaluate`.
     * @param selfTargetId CDP TargetId of the tab, where Mapper is running. Needed to
     * filter out info related to BiDi target.
     * @param bidiSessionId Unique ID of the BiDi session. Will be used to direct the
     * messages
     */
    runMapperInstance:
      | ((selfTargetId: string, bidiSessionId: string) => Promise<void>)
      | null;

    /**
     * CDP bindings. Used by Mapper to communicate to CDP. It is exposed by Runner via
     * `Target.exposeDevToolsProtocol`.
     * https://chromedevtools.github.io/devtools-protocol/tot/Target/#method-exposeDevToolsProtocol.
     */
    cdp: {
      send: (message: string) => void;
      onmessage: ((message: string) => void) | null;
    };

    /**
     * Send BiDi response (either a command result or an event) from Mapper to client.
     * It set by Runner via `Runtime.addBinding`.
     * @param {string} response JSON stringified BiDi response.
     */
    sendBidiResponse: (response: string) => void;

    /**
     * Process BiDi command from client. It is set by the Mapper, and is called by Runner
     * via `Runtime.evaluate` by the runner (NodeJS or ChromeDriver).
     * @param {string} message JSON stringified BiDi command.
     */
    onBidiMessage: ((message: string) => void) | null;

    /**
     * Send debug messages from Mapper to Runner. They are not supposed to be forwarded to
     * client. It is set by the Runner via `Runtime.addBinding` and is called by the
     * Mapper.
     */
    sendDebugMessage?: ((message: string) => void) | null;
  }
}

generatePage();
const mapperTabToServerTransport = new WindowBidiTransport();
const cdpTransport = new WindowCdpTransport();

/**
 * A CdpTransport implementation that uses the window.cdp bindings
 * injected by Target.exposeDevToolsProtocol.
 */
const cdpConnection = new CdpConnection(cdpTransport, log);

window.runMapperInstance = async (selfTargetId) => {
  console.log('Launching Mapper instance with selfTargetId:', selfTargetId);

  await BidiServer.createAndStart(
    mapperTabToServerTransport,
    cdpConnection,
    /**
     * Create a Browser CDP Session per Mapper instance.
     */
    await cdpConnection.createBrowserSession(),
    selfTargetId,
    new BidiParser(),
    log
  );

  log(LogType.debugInfo, 'Mapper instance has been launched');
};
