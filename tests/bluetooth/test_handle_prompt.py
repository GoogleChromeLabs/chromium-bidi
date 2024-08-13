#  Copyright 2024 Google LLC.
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
from test_helpers import execute_command, goto_url, subscribe, wait_for_event


@pytest.mark.asyncio
async def test_bluetooth_handle_prompt(websocket, context_id):
    await subscribe(websocket, ["bluetooth"])

    await goto_url(websocket, context_id,
                   "http://127.0.0.1:8080/deviceRequest.html")

    # await execute_command(
    #   websocket, {
    #       "method": "script.callFunction",
    #       "params": {
    #           "functionDeclaration": """() => {
    #               document.querySelector("#bluetooth").click();
    #             }""",
    #           "target": {
    #               "context": context_id
    #           },
    #           "awaitPromise": True,
    #           "userActivation": True
    #       }
    #   })

    await wait_for_event(websocket, "bluetooth.requestDevicePromptOpened")
