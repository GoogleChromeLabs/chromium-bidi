#  Copyright 2023 Google LLC.
#  Copyright (c) Microsoft Corporation.
#
#  Licensed under the Apache License, Version 2.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
#

import pytest
from test_helpers import execute_command


async def get_content(websocket, context_id, url):
    await execute_command(
        websocket, {
            "method": "browsingContext.navigate",
            "params": {
                "url": url,
                "wait": "complete",
                "context": context_id
            }
        })

    resp = await execute_command(
        websocket, {
            "method": "script.evaluate",
            "params": {
                "expression": "document.body.innerText",
                "target": {
                    "context": context_id
                },
                "awaitPromise": True
            }
        })

    return resp["result"]["value"]


@pytest.mark.asyncio
async def test_staticWebServer_url_200(websocket, context_id, url_200):
    assert await get_content(websocket, context_id, url_200()) \
           == "default 200 page"
    assert await get_content(websocket, context_id, url_200("MY CUSTOM PAGE")) \
           == "MY CUSTOM PAGE"


@pytest.mark.asyncio
async def test_staticWebServer_url_301(websocket, context_id, url_200,
                                       url_301):
    assert await get_content(websocket, context_id, url_301()) \
           == "default 200 page"
    assert await get_content(websocket, context_id,
                             url_301(url_200("MY CUSTOM PAGE"))) \
           == "MY CUSTOM PAGE"
