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
from syrupy.filters import paths
from test_helpers import (execute_command, get_tree, goto_url,
                          read_JSON_message, send_JSON_command, subscribe,
                          wait_for_event)


@pytest.mark.asyncio
async def test_browsingContext_close_closed(websocket, context_id,
                                            is_chromedriver):
    await subscribe(websocket, ["browsingContext.contextDestroyed"])

    command_id = await send_JSON_command(websocket, {
        "method": "browsingContext.close",
        "params": {
            "context": context_id
        }
    })

    # Assert "browsingContext.contextCreated" event emitted.
    resp = await read_JSON_message(websocket)
    assert resp == {
        'type': 'event',
        "method": "browsingContext.contextDestroyed",
        "params": {
            "context": context_id,
            "parent": None,
            "url": "about:blank",
            "children": None,
            "userContext": "default"
        }
    }

    resp = await read_JSON_message(websocket)
    assert resp == {"type": "success", "id": command_id, "result": {}}

    # Chromedriver and nodejs runners behaves differently here. Chromedriver
    # closes the session after the last tab is closed, while nodejs runner keeps
    # the session running.
    # TODO: revisit after BiDi specification is clarified:
    #  https://github.com/w3c/webdriver-bidi/issues/187

    if is_chromedriver:
        await websocket.wait_closed()
    else:
        result = await get_tree(websocket)
        # Assert no open contexts left.
        assert result == {'contexts': []}


@pytest.mark.asyncio
async def test_browsingContext_close_prompt(websocket, context_id, html,
                                            snapshot, is_chromedriver):
    if is_chromedriver:
        pytest.xfail(
            reason=  # noqa: E251. The line is too long.
            "TODO: https://github.com/GoogleChromeLabs/chromium-bidi/issues/1010"
        )

    await subscribe(websocket, [
        "browsingContext.userPromptOpened", "browsingContext.contextDestroyed"
    ])

    url = html("""
        <script>
            window.addEventListener('beforeunload', event => {
                event.returnValue = 'Leave?';
                event.preventDefault();
            });
        </script>
        """)

    await goto_url(websocket, context_id, url)

    # We need to interact with the page to trigger "beforeunload"
    result = await execute_command(
        websocket, {
            "method": "script.evaluate",
            "params": {
                "expression": "document.body.click()",
                "target": {
                    "context": context_id
                },
                "awaitPromise": False,
                "userActivation": True
            }
        })

    command_id = await send_JSON_command(
        websocket, {
            "method": "browsingContext.close",
            "params": {
                "context": context_id,
                "promptUnload": True
            }
        })

    # Assert "browsingContext.userPromptOpened" event emitted.
    resp = await read_JSON_message(websocket)
    assert resp == {
        'type': 'event',
        "method": "browsingContext.userPromptOpened",
        "params": {
            "context": context_id,
            "message": "",
            "type": "beforeunload"
        }
    }

    await send_JSON_command(
        websocket, {
            "method": "browsingContext.handleUserPrompt",
            "params": {
                "context": context_id,
            }
        })

    # Assert "browsingContext.contextDestroyed"" event emitted.
    response = await wait_for_event(websocket,
                                    "browsingContext.contextDestroyed")
    assert response == snapshot(exclude=paths("params.context"))
    assert response['params']['context'] == context_id

    resp = await read_JSON_message(websocket)
    assert resp == {"type": "success", "id": command_id, "result": {}}

    result = await get_tree(websocket)

    # Assert context is closed.
    assert result == {'contexts': []}
