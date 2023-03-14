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
from test_helpers import (execute_command, goto_url, read_JSON_message,
                          send_JSON_command)

GRADIENT_HTML = 'data:text/html,<div style="background: linear-gradient(45deg, green, magenta);height: 100%;"></div>'


@pytest.mark.asyncio
async def test_screenshot_happy_path(websocket, context_id):
    await goto_url(websocket, context_id, GRADIENT_HTML)

    command_result = await execute_command(websocket, {
        "method": "cdp.getSession",
        "params": {
            "context": context_id
        }
    })
    session_id = command_result["cdpSession"]

    # Set a fixed viewport to make the test deterministic.
    await execute_command(
        websocket, {
            "method": "cdp.sendCommand",
            "params": {
                "cdpMethod": "Emulation.setDeviceMetricsOverride",
                "cdpParams": {
                    "width": 200,
                    "height": 200,
                    "deviceScaleFactor": 1.0,
                    "mobile": False,
                },
                "cdpSession": session_id
            }
        })

    await send_JSON_command(
        websocket, {
            "id": 1,
            "method": "browsingContext.captureScreenshot",
            "params": {
                "context": context_id
            }
        })

    resp = await read_JSON_message(websocket)

    assert resp == {
        'id': 1,
        'result': {
            'data': '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'
        }
    }
