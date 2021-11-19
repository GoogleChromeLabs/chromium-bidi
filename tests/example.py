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
    websocket = await get_websocket()

    resp = await read_JSON_message(websocket)
    assert resp['method'] == 'browsingContext.contextCreated'

    contextID = resp["params"]["context"]

    # Navigate to 'https://news.ycombinator.com/'.
    command = {
        "id": 1000,
        "method": "browsingContext.navigate",
        "params": {
            "url": "https://news.ycombinator.com/",
            "context": contextID}}
    await send_JSON_command(websocket, command)

    resp = await read_JSON_message(websocket)
    assert resp["id"] == 1000

    # Send command.
    await send_JSON_command(websocket, {
        "id": 1001,
        "method": "PROTO.script.callFunction",
        "params": {
            "functionDeclaration": """(resultsSelector) => {
                const anchors = Array.from(document.querySelectorAll(resultsSelector));
                return anchors.map((anchor) => {
                    const title = anchor.textContent.trim();
                    return `${title} - ${anchor.href}`;
                });
            }""",
            "args": [{
                "type":"string",
                "value":".titlelink"}],
            "target": {"context": contextID}}})

    resp = await read_JSON_message(websocket)
    assert resp["id"] == 1001

    for item in resp["result"]["result"]["value"]:
        print(item["value"])

loop = asyncio.new_event_loop()
asyncio.set_event_loop(loop)
result = loop.run_until_complete(main())
