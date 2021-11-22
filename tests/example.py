# Copyright 2021 Google LLC.
# Copyright (c) Microsoft Corporation.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# This script implemets Puppeteer's `examples/cross-browser.js` scenario using WebDriver BiDi.
# https://github.com/puppeteer/puppeteer/blob/4c3caaa3f99f0c31333a749ec50f56180507a374/examples/cross-browser.js

import asyncio
import json
import os
import pytest
import websockets
import time

async def get_websocket():
    port = os.getenv('PORT', 8080)
    url = f'ws://localhost:{port}'
    return await websockets.connect(url)

async def send_JSON_command(websocket, command):
    await websocket.send(json.dumps(command))

async def read_JSON_message(websocket):
    return json.loads(await websocket.recv())

async def main():
    # const browser = await puppeteer.launch();
    # https://github.com/puppeteer/puppeteer/blob/4c3caaa3f99f0c31333a749ec50f56180507a374/examples/cross-browser.js#L29
    websocket = await get_websocket()

    # Receive initial `browsingContext.contextCreated` event.
    resp = await read_JSON_message(websocket)
    assert resp['method'] == 'browsingContext.contextCreated'

    # Not implemented:
    # await browser.version());
    # https://github.com/puppeteer/puppeteer/blob/4c3caaa3f99f0c31333a749ec50f56180507a374/examples/cross-browser.js#L32

    # Puppeteer:
    # const page = await browser.newPage();

    # Part 1. Execute BiDi command.
    # ... browser.newPage();
    # https://github.com/puppeteer/puppeteer/blob/4c3caaa3f99f0c31333a749ec50f56180507a374/examples/cross-browser.js#L31
    command = {
        "id": 1000,
        "method": "PROTO.browsingContext.create",
        "params": {}}
    await send_JSON_command(websocket, command)

    # Receive `browsingContext.contextCreated` event.
    resp = await read_JSON_message(websocket)
    assert resp['method'] == 'browsingContext.contextCreated'

    # Part 2. Wait for result.
    # ... await ...
    # https://github.com/puppeteer/puppeteer/blob/4c3caaa3f99f0c31333a749ec50f56180507a374/examples/cross-browser.js#L31
    resp = await read_JSON_message(websocket)
    assert resp["id"] == 1000

    # Part 3. Get the command result.
    # const page = ...
    # https://github.com/puppeteer/puppeteer/blob/4c3caaa3f99f0c31333a749ec50f56180507a374/examples/cross-browser.js#L31
    contextID = resp['result']['context']

    # Puppeteer:
    # const page = await browser.newPage();

    # Part 1. Execute BiDi command.
    # ... page.goto('https://news.ycombinator.com/');
    # https://github.com/puppeteer/puppeteer/blob/4c3caaa3f99f0c31333a749ec50f56180507a374/examples/cross-browser.js#L34
    command = {
        "id": 1001,
        "method": "browsingContext.navigate",
        "params": {
            "url": "https://news.ycombinator.com/",
            "context": contextID}}
    await send_JSON_command(websocket, command)

    # Part 2. Wait for result.
    # await ...;
    # https://github.com/puppeteer/puppeteer/blob/4c3caaa3f99f0c31333a749ec50f56180507a374/examples/cross-browser.js#L34
    resp = await read_JSON_message(websocket)
    assert resp["id"] == 1001

    # const resultsSelector = '.storylink';
    # https://github.com/puppeteer/puppeteer/blob/4c3caaa3f99f0c31333a749ec50f56180507a374/examples/cross-browser.js#L37
    resultsSelector = {
                "type":"string",
                "value":".titlelink"}

    # Puppeteer:
    # const links = await page.evaluate((resultsSelector) => {...}, resultsSelector);

    # Part 1. Execute BiDi command.
    # ... page.evaluate((resultsSelector) => {...}, resultsSelector);
    # https://github.com/puppeteer/puppeteer/blob/4c3caaa3f99f0c31333a749ec50f56180507a374/examples/cross-browser.js#L38
    await send_JSON_command(websocket, {
        "id": 1002,
        "method": "PROTO.script.callFunction",
        "params": {
            "functionDeclaration": """(resultsSelector) => {
                const anchors = Array.from(document.querySelectorAll(resultsSelector));
                return anchors.map((anchor) => {
                    const title = anchor.textContent.trim();
                    return `${title} - ${anchor.href}`;
                });
            }""",
            "args": [resultsSelector],
            "target": {"context": contextID}}})

    # Part 2. Wait for result.
    # ... await ...
    # https://github.com/puppeteer/puppeteer/blob/4c3caaa3f99f0c31333a749ec50f56180507a374/examples/cross-browser.js#L38
    resp = await read_JSON_message(websocket)
    assert resp["id"] == 1002

    # Part 3. Get the command result.
    # const links = ...
    # https://github.com/puppeteer/puppeteer/blob/4c3caaa3f99f0c31333a749ec50f56180507a374/examples/cross-browser.js#L38
    links = resp["result"]["result"]
    assert links["type"] == "array"

    # Puppeteer:
    # console.log(links.join('\n'));
    # https://github.com/puppeteer/puppeteer/blob/4c3caaa3f99f0c31333a749ec50f56180507a374/examples/cross-browser.js#L45
    for item in links["value"]:
        print(item["value"])

loop = asyncio.new_event_loop()
asyncio.set_event_loop(loop)
result = loop.run_until_complete(main())
