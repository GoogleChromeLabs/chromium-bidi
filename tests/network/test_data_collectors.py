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

import pytest
import pytest_asyncio
from test_helpers import (ANY_UUID, AnyExtending, execute_command,
                          send_JSON_command, subscribe, to_base64)

SOME_CONTENT = "some downloadable content"
NETWORK_RESPONSE_STARTED_EVENT = "network.responseStarted"


@pytest.fixture
def get_url(local_server_http):
    def get_url(content):
        return local_server_http.url_200(
            content,
            content_type="application/octet-stream",
            headers={"Access-Control-Allow-Origin": "*"})

    return get_url


@pytest_asyncio.fixture
async def init_request(websocket, local_server_http, read_messages, get_url):
    async def init_request(context_id, content):
        await subscribe(websocket, NETWORK_RESPONSE_STARTED_EVENT, context_id)
        command_id = await send_JSON_command(
            websocket, {
                "method": "script.callFunction",
                "params": {
                    "functionDeclaration": "(async (url)=>{ return (await fetch(url)).text(); })",
                    "arguments": [{
                        "type": "string",
                        "value": get_url(content)
                    }],
                    "target": {
                        "context": context_id
                    },
                    "awaitPromise": True,
                    "maxDomDepth": None,
                    "resultOwnership": "root"
                }
            })

        [command_result, response_started_event
         ] = await read_messages(2, check_no_other_messages=True)
        request_id = response_started_event["params"]["request"]["request"]

        # Assert the request is unblocked and the script received the response.
        assert command_result == AnyExtending({
            "id": command_id,
            "result": {
                "result": {
                    "type": "string",
                    "value": SOME_CONTENT,
                }
            }
        })

        return request_id

    return init_request


@pytest.mark.asyncio
async def test_network_get_data_required_params(websocket, context_id, get_url,
                                                init_request, read_messages):
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

    request_id = await init_request(context_id, SOME_CONTENT)

    # Assert data is collected.
    resp = await execute_command(
        websocket, {
            "method": "network.getData",
            "params": {
                "dataType": "response",
                "request": request_id
            }
        })
    assert resp == {
        'bytes': {
            'type': 'base64',
            'value': to_base64(SOME_CONTENT)
        }
    }

    # Assert data is available after collection.
    resp = await execute_command(
        websocket, {
            "method": "network.getData",
            "params": {
                "dataType": "response",
                "request": request_id
            }
        })
    assert resp == {
        'bytes': {
            'type': 'base64',
            'value': to_base64(SOME_CONTENT)
        }
    }


@pytest.mark.asyncio
async def test_network_get_data_collector(websocket, context_id, get_url,
                                          init_request, read_messages):
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
    collector_id = resp["collector"]

    request_id = await init_request(context_id, SOME_CONTENT)

    # Assert data is collected.
    resp = await execute_command(
        websocket, {
            "method": "network.getData",
            "params": {
                "dataType": "response",
                "request": request_id,
                "collector": collector_id
            }
        })
    assert resp == {
        'bytes': {
            'type': 'base64',
            'value': to_base64(SOME_CONTENT)
        }
    }

    # Assert data is still available after collecting.
    resp = await execute_command(
        websocket, {
            "method": "network.getData",
            "params": {
                "dataType": "response",
                "request": request_id,
            }
        })
    assert resp == {
        'bytes': {
            'type': 'base64',
            'value': to_base64(SOME_CONTENT)
        }
    }


@pytest.mark.asyncio
async def test_network_get_data_unknown_collector(websocket, context_id,
                                                  get_url, init_request,
                                                  read_messages):
    await execute_command(
        websocket,
        {
            "method": "network.addDataCollector",
            "params": {
                "dataTypes": ["response"],
                "maxEncodedDataSize": 1024 * 1024 * 1024  # 1 MB
            }
        })

    SOME_UNKNOWN_COLLECTOR_ID = "SOME_UNKNOWN_COLLECTOR_ID"
    request_id = await init_request(context_id, SOME_CONTENT)

    with pytest.raises(
            Exception,
            match=str({
                "error": "no such network data",
                "message": f"Collector {SOME_UNKNOWN_COLLECTOR_ID} does not have data for request {request_id}"
            })):
        await execute_command(
            websocket, {
                "method": "network.getData",
                "params": {
                    "dataType": "response",
                    "request": request_id,
                    "collector": "SOME_UNKNOWN_COLLECTOR_ID"
                }
            })


@pytest.mark.asyncio
async def test_network_get_data_disown_no_collector(websocket, context_id,
                                                    get_url, init_request,
                                                    read_messages):
    await execute_command(
        websocket,
        {
            "method": "network.addDataCollector",
            "params": {
                "dataTypes": ["response"],
                "maxEncodedDataSize": 1024 * 1024 * 1024  # 1 MB
            }
        })

    request_id = await init_request(context_id, SOME_CONTENT)

    with pytest.raises(
            Exception,
            match=str({
                'error': 'invalid argument',
                'message': 'Cannot disown collected data without collector ID'
            })):
        await execute_command(
            websocket, {
                "method": "network.getData",
                "params": {
                    "dataType": "response",
                    "request": request_id,
                    "disown": True
                }
            })


@pytest.mark.asyncio
async def test_network_get_data_disown_removes_data(websocket, context_id,
                                                    get_url, init_request,
                                                    read_messages):
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
    collector_id = resp["collector"]

    request_id = await init_request(context_id, SOME_CONTENT)

    # Assert data is collected.
    resp = await execute_command(
        websocket, {
            "method": "network.getData",
            "params": {
                "dataType": "response",
                "request": request_id,
                "collector": collector_id,
                "disown": True
            }
        })
    assert resp == {
        'bytes': {
            'type': 'base64',
            'value': to_base64(SOME_CONTENT)
        }
    }

    with pytest.raises(
            Exception,
            match=str({
                "error": "no such network data",
                "message": f"No collected data for request {request_id}"
            })):
        # Assert data is still available after collecting.
        await execute_command(
            websocket, {
                "method": "network.getData",
                "params": {
                    "dataType": "response",
                    "request": request_id,
                }
            })
