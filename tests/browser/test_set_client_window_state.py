# Copyright 2026 Google LLC.
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
from anys import ANY_BOOL, ANY_NUMBER
from test_helpers import execute_command, goto_url

SOME_WIDTH = 1234
SOME_HEIGHT = 798
SOME_X = 88
SOME_Y = 99


@pytest.mark.asyncio
async def test_set_client_window_state_normal(websocket, context_id,
                                              client_window_id):
    await goto_url(websocket, context_id, "about:blank")

    result = await execute_command(
        websocket,
        {
            "method": "browser.setClientWindowState",
            "params": {
                "clientWindow": client_window_id,
                "state": "normal",
                "x": SOME_X,
                "y": SOME_Y,
                "width": SOME_WIDTH,
                "height": SOME_HEIGHT,
            },
        },
    )

    assert result == {
        "clientWindow": client_window_id,
        "state": "normal",
        "x": SOME_X,
        "y": SOME_Y,
        "width": SOME_WIDTH,
        "height": SOME_HEIGHT,
        "active": ANY_BOOL,
    }

    result = await execute_command(
        websocket,
        {
            "method": "browser.getClientWindows",
            "params": {},
        },
    )
    assert result["clientWindows"] == [{
        "clientWindow": client_window_id,
        "state": "normal",
        "x": SOME_X,
        "y": SOME_Y,
        "width": SOME_WIDTH,
        "height": SOME_HEIGHT,
        "active": ANY_BOOL,
    }]


@pytest.mark.asyncio
async def test_set_client_window_state_maximized(websocket, context_id,
                                                 client_window_id):
    await goto_url(websocket, context_id, "about:blank")

    result = await execute_command(
        websocket,
        {
            "method": "browser.setClientWindowState",
            "params": {
                "clientWindow": client_window_id,
                "state": "maximized"
            },
        },
    )

    assert result == {
        "clientWindow": client_window_id,
        "state": "maximized",
        "x": ANY_NUMBER,
        "y": ANY_NUMBER,
        "width": ANY_NUMBER,
        "height": ANY_NUMBER,
        "active": ANY_BOOL,
    }

    result = await execute_command(
        websocket,
        {
            "method": "browser.getClientWindows",
            "params": {},
        },
    )
    assert result["clientWindows"] == [{
        "clientWindow": client_window_id,
        "state": "maximized",
        "x": ANY_NUMBER,
        "y": ANY_NUMBER,
        "width": ANY_NUMBER,
        "height": ANY_NUMBER,
        "active": ANY_BOOL,
    }]


@pytest.mark.asyncio
async def test_set_client_window_state_minimized(websocket, context_id,
                                                 client_window_id):
    await goto_url(websocket, context_id, "about:blank")

    result = await execute_command(
        websocket,
        {
            "method": "browser.setClientWindowState",
            "params": {
                "clientWindow": client_window_id,
                "state": "minimized"
            },
        },
    )

    assert result == {
        "clientWindow": client_window_id,
        "state": "minimized",
        "x": ANY_NUMBER,
        "y": ANY_NUMBER,
        "width": ANY_NUMBER,
        "height": ANY_NUMBER,
        "active": ANY_BOOL,
    }

    result = await execute_command(
        websocket,
        {
            "method": "browser.getClientWindows",
            "params": {},
        },
    )
    assert result["clientWindows"] == [{
        "clientWindow": client_window_id,
        "state": "minimized",
        "x": ANY_NUMBER,
        "y": ANY_NUMBER,
        "width": ANY_NUMBER,
        "height": ANY_NUMBER,
        "active": ANY_BOOL,
    }]


@pytest.mark.asyncio
async def test_set_client_window_state_fullscreen(websocket, context_id,
                                                  client_window_id):
    await goto_url(websocket, context_id, "about:blank")

    result = await execute_command(
        websocket,
        {
            "method": "browser.setClientWindowState",
            "params": {
                "clientWindow": client_window_id,
                "state": "fullscreen"
            },
        },
    )

    assert result == {
        "clientWindow": client_window_id,
        "state": "fullscreen",
        "x": ANY_NUMBER,
        "y": ANY_NUMBER,
        "width": ANY_NUMBER,
        "height": ANY_NUMBER,
        "active": ANY_BOOL,
    }

    result = await execute_command(
        websocket,
        {
            "method": "browser.getClientWindows",
            "params": {},
        },
    )
    assert result["clientWindows"] == [{
        "clientWindow": client_window_id,
        "state": "fullscreen",
        "x": ANY_NUMBER,
        "y": ANY_NUMBER,
        "width": ANY_NUMBER,
        "height": ANY_NUMBER,
        "active": ANY_BOOL,
    }]
