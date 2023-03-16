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
from test_helpers import execute_command, read_JSON_message, subscribe


# TODO(#294): Implement E2E tests.
@pytest.mark.asyncio
async def test_channel(websocket, context_id):
    await subscribe(websocket, "script.message")

    # The channel was successfully created if there's no thrown exception.
    await execute_command(
        websocket,
        {
            "method": "script.callFunction",
            "params": {
                # A small delay is needed to avoid a race condition.
                "functionDeclaration": """(binding) => {
                    setTimeout(() => {
                        binding('MY_MESSAGE1');
                        binding('MY_MESSAGE2');
                    }, 1);
                }""",
                "arguments": [{
                    "type": "channel",
                    "value": {
                        "channel": "MY_CHANNEL",
                        "ownership": "root",
                    },
                }],
                "target": {
                    "context": context_id
                },
                "awaitPromise": False,
                "resultOwnership": "root"
            }
        })

    resp = await read_JSON_message(websocket)

    assert resp == {
        "method": "script.message",
        "params": {
            "channel": "MY_CHANNEL",
            "data": {
                "type": "string",
                "value": "MY_MESSAGE1"
            },
            "source": {
                "context": context_id,
                "realm": ANY_STR,
            }
        }
    }

    resp = await read_JSON_message(websocket)

    assert resp == {
        "method": "script.message",
        "params": {
            "channel": "MY_CHANNEL",
            "data": {
                "type": "string",
                "value": "MY_MESSAGE2"
            },
            "source": {
                "context": context_id,
                "realm": ANY_STR,
            }
        }
    }
