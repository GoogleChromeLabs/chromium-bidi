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
 */

import * as assert from 'node:assert';
import {Builder, ScriptManager, BrowsingContext} from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

import {execSync} from 'child_process';
import {join} from 'path';

function installAndGetChromePath() {
  let BROWSER_BIN = process.env.BROWSER_BIN;
  if (!BROWSER_BIN) {
    BROWSER_BIN = execSync(
        `node ${join('tools', 'install-browser.mjs')} '--shell'`
    )
        .toString()
        .trim();
  }
  return BROWSER_BIN;
}

function installAndGetChromeDriverPath() {
  let BROWSER_BIN = process.env.BROWSER_BIN;
  if (!BROWSER_BIN) {
    BROWSER_BIN = execSync(
        `node ${join('tools', 'install-driver.mjs')} '--shell'`
    )
        .toString()
        .trim();
  }
  return BROWSER_BIN;
}

const chromePath = installAndGetChromePath();
const chromeDriverPath = installAndGetChromeDriverPath();

const chromeService = new chrome.ServiceBuilder(chromeDriverPath)
    .addArguments("--bidi-mapper-path=lib/iife/mapperTab.js");

const driver = new Builder()
    .forBrowser('chrome')
    .setChromeOptions(
        new chrome
            .Options()
            .enableBidi()
            .setChromeBinaryPath(chromePath)
    )
    .setChromeService(chromeService)
    .build();

try {
  let startIndex = 0
  let endIndex = 5
  let pngMagicNumber = 'iVBOR'

  // Create a tab.
  const browsingContext = await BrowsingContext(driver, {
    type: 'tab',
  })

  // Navigate tab to some page.
  await browsingContext.navigate('data:text/html,<h1>SOME PAGE</h1>', 'complete')

  const scriptManager =await ScriptManager(browsingContext, driver)

  // Get header element reference.
  const evaluateResult = await scriptManager.evaluateFunctionInBrowsingContext(
      browsingContext.id,
      '(document.getElementsByTagName("h1")[0])',
      false,
      'root'
  )
  assert.strictEqual(evaluateResult.resultType, 'success');
  const elementId = evaluateResult.result.sharedId;

  // Get screenshot of the element.
  const response = await browsingContext.captureElementScreenshot(
      elementId
  )
  const base64code = response.slice(startIndex, endIndex)
  assert.equal(base64code, pngMagicNumber)
} finally {
  await driver.quit();
}
