#  Copyright 2025 Google LLC.
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

import base64

import pytest
from anys import ANY_STR
from test_helpers import (ANY_UUID, execute_command, send_JSON_command,
                          subscribe, wait_for_event)

SOME_CONTENT = "some downloadable content"
NETWORK_RESPONSE_STARTED_EVENT = "network.responseStarted"


@pytest.mark.asyncio
async def test_network_get_data_no_params(websocket, context_id, url_download):
    await subscribe(websocket, NETWORK_RESPONSE_STARTED_EVENT)

    resp = await execute_command(
        websocket,
        {
            "method": "network.addDataCollector",
            "params": {
                "dataTypes": ["response"],
                "maxEncodedDataSize": 1024 * 1024 * 1024  # 1 MB
            }
        })
    assert resp == {"collector": ANY_UUID}

    await send_JSON_command(
        websocket, {
            "method": "browsingContext.navigate",
            "params": {
                "url": url_download(content=SOME_CONTENT),
                "context": context_id,
                "wait": 'none'
            }
        })

    event = await wait_for_event(websocket, NETWORK_RESPONSE_STARTED_EVENT)

    resp = await execute_command(
        websocket, {
            "method": "network.getData",
            "params": {
                "dataType": "response",
                "request": event["params"]["request"]["request"]
            }
        })

    assert resp == {'bytes': {'type': 'base64', 'value': ANY_STR}}

    assert base64.b64decode(resp["bytes"]["value"]).decode() == SOME_CONTENT
