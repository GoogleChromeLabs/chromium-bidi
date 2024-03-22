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
from anys import ANY_STR
from test_helpers import (ANY_TIMESTAMP, read_JSON_message, send_JSON_command,
                          subscribe)


@pytest.mark.asyncio
async def test_browsingContext_create_eventContextCreatedEmitted(
        websocket, read_sorted_messages):
    await subscribe(websocket, [
        "browsingContext.contextCreated", "browsingContext.domContentLoaded",
        "browsingContext.load"
    ])

    await send_JSON_command(websocket, {
        "id": 9,
        "method": "browsingContext.create",
        "params": {
            "type": "tab"
        }
    })

    # Read event messages. The order can vary in headless and headful modes, so
    # sort is needed:
    # * `browsingContext.contextCreated` event.
    # * `browsingContext.domContentLoaded` event.
    # * `browsingContext.load` event.
    [context_created_event, dom_content_loaded_event,
     load_event] = await read_sorted_messages(3)

    # Read the `browsingContext.create` command result. It should be sent after
    # all the loading events.
    command_result = await read_JSON_message(websocket)

    new_context_id = command_result['result']['context']

    # Assert command done.
    assert command_result == {
        "type": "success",
        "id": 9,
        "result": {
            'context': new_context_id
        }
    }

    # Assert "browsingContext.contextCreated" event emitted.
    assert {
        "type": "event",
        "method": "browsingContext.contextCreated",
        "params": {
            "context": new_context_id,
            "url": "about:blank",
            "children": None,
            "parent": None,
            "userContext": "default"
        }
    } == context_created_event

    # Assert "browsingContext.domContentLoaded" event emitted.
    assert {
        "type": "event",
        "method": "browsingContext.domContentLoaded",
        "params": {
            "context": new_context_id,
            "navigation": ANY_STR,
            "timestamp": ANY_TIMESTAMP,
            "url": "about:blank"
        }
    } == dom_content_loaded_event

    # Assert "browsingContext.load" event emitted.
    assert {
        "type": "event",
        "method": "browsingContext.load",
        "params": {
            "context": new_context_id,
            "navigation": ANY_STR,
            "timestamp": ANY_TIMESTAMP,
            "url": "about:blank"
        }
    } == load_event
