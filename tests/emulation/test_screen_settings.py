#   Copyright 2025 Google LLC.
#   Copyright (c) Microsoft Corporation.
#
#   Licensed under the Apache License, Version 2.0 (the "License");
#   you may not use this file except in compliance with the License.
#   You may obtain a copy of the License at
#
#       http://www.apache.org/licenses/LICENSE-2.0
#
#   Unless required by applicable law or agreed to in writing, software
#   distributed under the License is distributed on an "AS IS" BASIS,
#   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#   See the License for the specific language governing permissions and
#   limitations under the License.

import pytest
import pytest_asyncio
from test_helpers import execute_command, send_JSON_command


@pytest_asyncio.fixture
async def initial_screen_settings(websocket, context_id):
    return await get_screen_settings(websocket, context_id)


async def get_screen_settings(websocket, context_id):
    """
    Returns browsing context's current screen settings.
    """
    resp = await execute_command(
        websocket, {
            "method": "script.evaluate",
            "params": {
                "expression": """({
                    width: screen.width,
                    height: screen.height,
                    availWidth: screen.availWidth,
                    availHeight: screen.availHeight,
                })""",
                "target": {
                    "context": context_id
                },
                "awaitPromise": True,
            }
        })
    if "result" not in resp:
        return resp

    result = {}
    for key, value in resp["result"]["value"]:
        result[key] = value["value"]
    return result


@pytest.mark.asyncio
async def test_screen_settings_set_and_clear(
    websocket,
    context_id,
    initial_screen_settings,
):
    await execute_command(
        websocket, {
            'method': 'emulation.setScreenSettingsOverride',
            'params': {
                'contexts': [context_id],
                'screenArea': {
                    'width': 100,
                    'height': 200,
                }
            }
        })

    settings = await get_screen_settings(websocket, context_id)
    assert settings['width'] == 100
    assert settings['height'] == 200

    await execute_command(
        websocket, {
            'method': 'emulation.setScreenSettingsOverride',
            'params': {
                'contexts': [context_id],
                'screenArea': None
            }
        })
    assert await get_screen_settings(websocket,
                                     context_id) == initial_screen_settings


@pytest.mark.asyncio
async def test_screen_settings_screen_area_and_viewport(
        websocket, context_id, read_messages, initial_screen_settings):
    # Set viewport
    command_id_1 = await send_JSON_command(
        websocket, {
            "method": "browsingContext.setViewport",
            "params": {
                "context": context_id,
                "viewport": {
                    "width": 345,
                    "height": 456,
                },
                "devicePixelRatio": 4
            }
        })

    await read_messages(
        1, filter_lambda=lambda x: 'id' in x and x['id'] == command_id_1)

    # Set Screen Area
    command_id_2 = await send_JSON_command(
        websocket, {
            'method': 'emulation.setScreenSettingsOverride',
            'params': {
                'contexts': [context_id],
                'screenArea': {
                    'width': 600,
                    'height': 800,
                }
            }
        })

    await read_messages(
        1, filter_lambda=lambda x: 'id' in x and x['id'] == command_id_2)

    settings = await get_screen_settings(websocket, context_id)
    assert settings['width'] == 600
    assert settings['height'] == 800

    # Also verify viewport is still set (by checking innerWidth/innerHeight)
    resp = await execute_command(
        websocket, {
            "method": "script.evaluate",
            "params": {
                "expression": """({
                    width: window.innerWidth,
                    height: window.innerHeight,
                    dpr: window.devicePixelRatio,
                })""",
                "target": {
                    "context": context_id
                },
                "awaitPromise": True,
            }
        })

    viewport_result = {}
    for key, value in resp["result"]["value"]:
        viewport_result[key] = value["value"]

    assert viewport_result['width'] == 345
    assert viewport_result['height'] == 456
    assert viewport_result['dpr'] == 4
