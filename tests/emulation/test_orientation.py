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
from test_helpers import execute_command


@pytest_asyncio.fixture
async def initial_orientation(websocket, context_id):
    return await get_orientation(websocket, context_id)


@pytest.fixture
def some_orientation(initial_orientation):
    """Returns some orientation which is not equal to initial one."""
    return {
        "angle": 180 if initial_orientation["angle"] != 180 else 0,
        "type": "portrait-secondary"
                if initial_orientation["type"] != "portrait-secondary" else
                "portrait-primary"
    }


@pytest.fixture
def another_orientation(initial_orientation):
    """Returns some another orientation which is not equal to initial one."""
    return {
        "angle": 90 if initial_orientation["angle"] != 90 else 270,
        "type": "landscape-secondary"
                if initial_orientation["type"] != "landscape-secondary" else
                "landscape-primary"
    }


async def get_orientation(websocket, context_id):
    """
    Returns browsing context's current orientation.
    """
    # Activation is required, as orientation is only available on an active
    # context.
    await execute_command(websocket, {
        "method": "browsingContext.activate",
        "params": {
            "context": context_id
        }
    })

    resp = await execute_command(
        websocket, {
            "method": "script.evaluate",
            "params": {
                "expression": """({
                    angle: screen.orientation.angle,
                    type: screen.orientation.type
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
async def test_orientation_set_and_clear(websocket, context_id,
                                         initial_orientation,
                                         some_orientation):
    await execute_command(
        websocket, {
            'method': 'emulation.setOrientationOverride',
            'params': {
                'contexts': [context_id],
                'orientation': some_orientation
            }
        })

    assert (await get_orientation(websocket, context_id)) == some_orientation

    await execute_command(
        websocket, {
            'method': 'emulation.setOrientationOverride',
            'params': {
                'contexts': [context_id],
                'orientation': None
            }
        })
    assert (await get_orientation(websocket,
                                  context_id)) == initial_orientation


@pytest.mark.asyncio
async def test_orientation_per_user_context(websocket, user_context_id,
                                            create_context, some_orientation,
                                            another_orientation):
    # Set different orientation overrides for different user contexts.
    await execute_command(
        websocket, {
            'method': 'emulation.setOrientationOverride',
            'params': {
                'userContexts': ["default"],
                'orientation': some_orientation
            }
        })
    await execute_command(
        websocket, {
            'method': 'emulation.setOrientationOverride',
            'params': {
                'userContexts': [user_context_id],
                'orientation': another_orientation
            }
        })

    # Assert the overrides applied for the right contexts.
    browsing_context_id_1 = await create_context()
    emulated_orientation_1 = await get_orientation(websocket,
                                                   browsing_context_id_1)
    assert emulated_orientation_1 == some_orientation

    browsing_context_id_2 = await create_context(user_context_id)
    emulated_orientation_2 = await get_orientation(websocket,
                                                   browsing_context_id_2)
    assert emulated_orientation_2 == another_orientation


@pytest.mark.asyncio
async def test_orientation_per_browsing_context(websocket, context_id,
                                                another_context_id,
                                                some_orientation,
                                                another_orientation):
    # Set different orientation overrides for different user contexts.
    await execute_command(
        websocket, {
            'method': 'emulation.setOrientationOverride',
            'params': {
                'contexts': [context_id],
                'orientation': some_orientation
            }
        })
    await execute_command(
        websocket, {
            'method': 'emulation.setOrientationOverride',
            'params': {
                'contexts': [another_context_id],
                'orientation': another_orientation
            }
        })

    assert await get_orientation(websocket, context_id) == some_orientation
    assert await get_orientation(websocket,
                                 another_context_id) == another_orientation
