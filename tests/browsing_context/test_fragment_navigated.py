# Copyright 2021 Google LLC.
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
from anys import ANY_DICT
from test_helpers import (ANY_TIMESTAMP, ANY_UUID, goto_url, read_JSON_message,
                          send_JSON_command, subscribe)


@pytest.mark.asyncio
async def test_browsingContext_fragmentNavigated_event(websocket, context_id,
                                                       url_base):
    await subscribe(websocket, ["browsingContext.fragmentNavigated"])

    await goto_url(websocket, context_id, url_base)

    await send_JSON_command(
        websocket, {
            "method": "script.evaluate",
            "params": {
                "expression": "location.href = '#test';",
                "target": {
                    "context": context_id,
                },
                "awaitPromise": False
            }
        })

    response = await read_JSON_message(websocket)
    assert response == {
        'type': 'event',
        "method": "browsingContext.fragmentNavigated",
        "params": {
            "context": context_id,
            "navigation": ANY_UUID,
            "timestamp": ANY_TIMESTAMP,
            "url": url_base + "#test",
        }
    }


@pytest.mark.asyncio
async def test_browsing_context_fragment_navigated_not_emitted_on_push_state(
        websocket, context_id, url_example, read_messages):
    # https://github.com/GoogleChromeLabs/chromium-bidi/issues/2425
    await goto_url(websocket, context_id, url_example)

    await subscribe(websocket, [
        "browsingContext.fragmentNavigated", "browsingContext.historyUpdated"
    ])

    command_id = await send_JSON_command(
        websocket, {
            "method": "script.evaluate",
            "params": {
                "expression": "history.pushState(null, '', window.location.pathname + '#foo');",
                "target": {
                    "context": context_id,
                },
                "awaitPromise": False
            }
        })

    messages = await read_messages(2, check_no_other_messages=True, sort=False)
    assert messages == [{
        'method': 'browsingContext.historyUpdated',
        'params': {
            'context': context_id,
            'timestamp': ANY_TIMESTAMP,
            'url': f'{url_example}#foo',
        },
        'type': 'event',
    }, {
        'id': command_id,
        'result': ANY_DICT,
        'type': 'success',
    }]
