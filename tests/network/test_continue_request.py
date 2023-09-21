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
from typing import Literal

import pytest
from test_helpers import (execute_command, send_JSON_command, subscribe,
                          wait_for_event)


@pytest.mark.asyncio
async def test_continue_request_non_existent_request(websocket):
    with pytest.raises(Exception) as exception_info:
        await execute_command(
            websocket, {
                "method": "network.continueRequest",
                "params": {
                    "request": '_UNKNOWN_',
                },
            })
    assert {
        "error": "no such request",
        "message": "No blocked request found for network id '_UNKNOWN_'"
    } == exception_info.value.args[0]


@pytest.mark.asyncio
async def test_continue_request_invalid_phase(websocket, context_id):
    # TODO: make offline.
    url = "https://www.example.com/"

    network_id = await create_dummy_blocked_request(websocket,
                                                    context_id,
                                                    url=url,
                                                    phases=["responseStarted"])

    with pytest.raises(Exception) as exception_info:
        await execute_command(
            websocket, {
                "method": "network.continueRequest",
                "params": {
                    "request": network_id,
                    "url": url,
                },
            })
    assert {
        "error": "invalid argument",
        "message": f"Blocked request for network id '{network_id}' is not in 'BeforeRequestSent' phase"
    } == exception_info.value.args[0]


@pytest.mark.asyncio
@pytest.mark.skip(
    reason="TODO: #644: Blocked on populating network intercept phases.")
async def test_continue_request_invalid_url(websocket, context_id):
    # TODO: make offline.
    url = "https://www.example.com/"
    invalid_url = '%invalid%'

    network_id = await create_dummy_blocked_request(
        websocket, context_id, url=url, phases=["beforeRequestSent"])

    with pytest.raises(Exception) as exception_info:
        await execute_command(
            websocket, {
                "method": "network.continueRequest",
                "params": {
                    "request": network_id,
                    "url": invalid_url,
                },
            })
    assert {
        "error": "invalid argument",
        "message": f"Invalid URL '{invalid_url}': TODO_ERROR"
    } == exception_info.value.args[0]


async def create_dummy_blocked_request(
    websocket, context_id: str, *, url: str,
    phases: list[Literal["beforeRequestSent", "responseStarted",
                         "authRequired"]]):
    """Creates a dummy blocked network request and returns its network id."""

    await subscribe(websocket, ["cdp.Fetch.requestPaused"])

    await execute_command(
        websocket, {
            "method": "network.addIntercept",
            "params": {
                "phases": phases,
                "urlPatterns": [{
                    "type": "string",
                    "pattern": url,
                }, ],
            },
        })
    await send_JSON_command(
        websocket, {
            "method": "browsingContext.navigate",
            "params": {
                "url": url,
                "context": context_id,
            }
        })
    event_response = await wait_for_event(websocket, "cdp.Fetch.requestPaused")
    network_id = event_response["params"]["params"]["networkId"]

    return network_id
