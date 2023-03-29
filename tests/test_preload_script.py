# Copyright 2023 Google LLC.
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

import pytest
from test_helpers import (execute_command, read_JSON_message,
                          send_JSON_command, subscribe, wait_for_event)


@pytest.mark.asyncio
async def test_addPreloadScript_setGlobalVariable(websocket, context_id):
    await send_JSON_command(
        websocket, {
            "id": 1,
            "method": "script.addPreloadScript",
            "params": {
                "expression": "() => { window.foo='bar'; }",
                "context": context_id,
            }
        })

    resp = await read_JSON_message(websocket)

    assert resp == {'id': 1, 'script': '1'}

    result = await execute_command(
        websocket, {
            "method": "script.evaluate",
            "params": {
                "expression": "window.foo",
                "target": {
                    "context": context_id
                },
                "awaitPromise": True,
                "resultOwnership": "root"
            }
        })

    assert result == {
        'type': "success",
        "result": {
            "type": "string",
            "value": 'bar'
        }
    }


@pytest.mark.asyncio
async def test_addPreloadScript_logging(websocket, context_id):
    await subscribe(websocket, "log.entryAdded")

    await send_JSON_command(
        websocket, {
            "id": 1,
            "method": "script.addPreloadScript",
            "params": {
                "expression": "() => console.log('my preload script');",
                "context": context_id,
            }
        })

    resp = await read_JSON_message(websocket)

    assert resp == {'id': 1, 'script': '1'}

    await wait_for_event(websocket, "log.entryAdded")
