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
import pytest
from anys import ANY_DICT, ANY_NUMBER, ANY_STR
from test_helpers import (ANY_UUID, AnyExtending, execute_command,
                          send_JSON_command, subscribe, wait_for_event)


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
