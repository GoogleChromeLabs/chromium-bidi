/**
 * Copyright 2021 Google Inc. All rights reserved.
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
`use strict`;

import argparse from 'argparse';

import { launchBrowser, BrowserProcess } from './browserLauncher';
import mapperReader from './mapperReader';
import { MapperServer } from './mapperServer';
import { BidiServerRunner } from './bidiServerRunner';
import { IServer } from './utils/iServer';
import { BrowserFetcher } from './node/browserFetcher';

const browserInfo = new BrowserFetcher().revisionInfo();

function parseArguments() {
  var parser = new argparse.ArgumentParser({
    add_help: true,
    exit_on_error: false,
  });

  parser.add_argument('-p', '--port', {
    help: 'Port that BiDi server should listen to. Default is 8080.',
    type: 'int',
    default: process.env.PORT || 8080,
  });

  parser.add_argument('-hl', '--headless', {
    help: 'Sets if browser should run in headless or headful mode. Default is `--headless=true`.',
    default: true,
  });

  parser.add_argument('-b', '--browser', {
    help: `Optional path to custom browser executable.`,
    default: process.env.BROWSER_PATH,
  });

  // `parse_known_args` puts known args in the first element of the result.
  const args = parser.parse_known_args();
  return args[0];
}

(async () => {
  try {
    console.log('Launching BiDi server.');

    const args = parseArguments();

    if (!args.browser && !browserInfo.local)
      throw 'No locally downloaded browser available. Either download one locally by running `npm i` or specify browser binary path in paramter `--browser`';
    const browserExecutablePath = args.browser || browserInfo.executablePath;

    const bidiPort = args.port;
    const headless = args.headless !== 'false';

    BidiServerRunner.run(
      bidiPort,
      (bidiServer: IServer) => {
        return _onNewBidiConnectionOpen(
          browserExecutablePath,
          headless,
          bidiServer
        );
      },
      _onBidiConnectionClosed
    );
    console.log('BiDi server launched.');
  } catch (e) {
    console.log('Error', e);
  }
})();

async function _onNewBidiConnectionOpen(
  browserExecutablePath: string,
  headless: boolean,
  bidiServer: IServer
): Promise<BrowserProcess> {
  // Launch browser.
  const browserProcess = await launchBrowser(browserExecutablePath, headless);
  // Get BiDi Mapper script.
  const bidiMapperScript = await mapperReader();

  // Run BiDi Mapper script on the browser.
  const mapperServer = await MapperServer.create(
    browserProcess.cdpUrl,
    bidiMapperScript
  );

  // Forward messages from BiDi Mapper to the client.
  mapperServer.setOnMessage(async (message) => {
    await bidiServer.sendMessage(message);
  });

  // Forward messages from the client to BiDi Mapper.
  bidiServer.setOnMessage(async (message) => {
    await mapperServer.sendMessage(message);
  });

  // Save handler `closeBrowser` to use after the client disconnected.
  return browserProcess;
}

function _onBidiConnectionClosed(browserProcess: BrowserProcess): void {
  // Client disconnected. Close browser.
  browserProcess.closeBrowser();
}
