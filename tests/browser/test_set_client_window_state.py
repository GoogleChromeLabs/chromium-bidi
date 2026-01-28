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

from unittest.mock import ANY

import pytest
from test_helpers import execute_command, goto_url


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
                "x": 0,
                "y": 0,
                "width": 1024,
                "height": 768,
            },
        },
    )

    assert result == {
        "clientWindow": client_window_id,
        "state": "normal",
        "x": 0,
        "y": 0,
        "width": 1024,
        "height": 768,
        "active": ANY,
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
        "x": 0,
        "y": 0,
        "width": 1024,
        "height": 768,
        "active": ANY,
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
        "x": ANY,
        "y": ANY,
        "width": ANY,
        "height": ANY,
        "active": ANY,
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
        "x": ANY,
        "y": ANY,
        "width": ANY,
        "height": ANY,
        "active": ANY,
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
        "x": ANY,
        "y": ANY,
        "width": ANY,
        "height": ANY,
        "active": ANY,
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
        "x": ANY,
        "y": ANY,
        "width": ANY,
        "height": ANY,
        "active": ANY,
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
        "x": ANY,
        "y": ANY,
        "width": ANY,
        "height": ANY,
        "active": ANY,
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
        "x": ANY,
        "y": ANY,
        "width": ANY,
        "height": ANY,
        "active": ANY,
    }]
