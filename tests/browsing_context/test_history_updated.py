# Copyright 2024 Google LLC.
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
from test_helpers import (ANY_TIMESTAMP, execute_command, goto_url,
                          read_JSON_message, send_JSON_command,
                          stabilize_key_values, subscribe)


@pytest.mark.asyncio
async def test_browsingContext_historyUpdated_event(websocket, context_id,
                                                    url_base):
    await subscribe(websocket, ["browsingContext.historyUpdated"])

    await goto_url(websocket, context_id, url_base)

    await send_JSON_command(
        websocket, {
            "method": "script.evaluate",
            "params": {
                "expression": "history.replaceState(null, '', '#test');",
                "target": {
                    "context": context_id,
                },
                "awaitPromise": False
            }
        })

    response = await read_JSON_message(websocket)
    assert response == {
        'type': 'event',
        "method": "browsingContext.historyUpdated",
        "params": {
            "context": context_id,
            "url": url_base + "#test",
        }
    }


@pytest.mark.asyncio
async def test_browsingContext_beforeunload_historyUpdated_reload_event(
        websocket, context_id, url_base, read_messages):
    await subscribe(websocket, ["browsingContext"])

    await goto_url(websocket, context_id, url_base)

    await execute_command(
        websocket, {
            "method": "script.evaluate",
            "params": {
                "expression": """
                    window.addEventListener('beforeunload', () => {
                        return history.replaceState(null, 'initial', '#test');
                    },false)
                """,
                "target": {
                    "context": context_id,
                },
                "awaitPromise": False
            }
        })

    command_id = await send_JSON_command(websocket, {
        "method": "browsingContext.reload",
        "params": {
            "context": context_id
        }
    })

    messages = await read_messages(5, check_no_other_messages=True, sort=False)
    stabilize_key_values(messages, ['navigation'])

    assert messages == [{
        'id': command_id,
        'type': "success",
        'result': {
            'navigation': 'stable_0',
            'url': url_base,
        },
    }, {
        'method': 'browsingContext.historyUpdated',
        'params': {
            'context': context_id,
            'url': url_base + "#test",
        },
        'type': 'event',
    }, {
        'method': 'browsingContext.navigationStarted',
        'params': {
            'context': context_id,
            'navigation': 'stable_0',
            'timestamp': ANY_TIMESTAMP,
            'url': url_base,
        },
        'type': 'event',
    }, {
        'method': 'browsingContext.domContentLoaded',
        'params': {
            'context': context_id,
            'navigation': 'stable_0',
            'timestamp': ANY_TIMESTAMP,
            'url': url_base,
        },
        'type': 'event',
    }, {
        'method': 'browsingContext.load',
        'params': {
            'context': context_id,
            'navigation': 'stable_0',
            'timestamp': ANY_TIMESTAMP,
            'url': url_base,
        },
        'type': 'event',
    }]
