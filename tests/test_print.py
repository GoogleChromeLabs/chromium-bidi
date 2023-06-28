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
from test_helpers import assert_images_equal, execute_command, goto_url


@pytest.mark.asyncio
async def test_print(websocket, context_id, html, get_cdp_session_id):
    await goto_url(websocket, context_id, html())

    print_result = await execute_command(
        websocket, {
            "method": "browsingContext.print",
            "params": {
                "context": context_id,
                "page": {
                    "width": 100,
                    "height": 100,
                },
                "scale": 1.0,
            }
        })

    # 'data' is not deterministic, ~a dozen characters differ between runs.
    assert print_result["data"] == ANY_STR

    await goto_url(websocket, context_id,
                   f'data:application/pdf,base64;{print_result["data"]}')

    session_id = await get_cdp_session_id(context_id)

    # Set a fixed viewport to make the test deterministic.
    await execute_command(
        websocket, {
            "method": "cdp.sendCommand",
            "params": {
                "method": "Emulation.setDeviceMetricsOverride",
                "params": {
                    "width": 200,
                    "height": 200,
                    "deviceScaleFactor": 1.0,
                    "mobile": False,
                },
                "session": session_id
            }
        })

    screenshot_result = await execute_command(
        websocket, {
            "method": "browsingContext.captureScreenshot",
            "params": {
                "context": context_id
            }
        })

    print(screenshot_result["data"])

    assert_images_equal(
        screenshot_result["data"],
        "iVBORw0KGgoAAAANSUhEUgAAAMgAAADICAYAAACtWK6eAAABL2lDQ1BTa2lhAAAokX2Qv0vDUBSFP0tB1C6iooNDxi5qW7E/sA62atGxVahuaRqK2NaQRnTv6h/h7Ca4iNDZxUlwEnFxFwTXeNIMKUi9l5v7vfMOee8+iC2hiKeg0/XcaqVk1I9PjMkPJpTDMK2ew/iQ6+c19L6s/OMbF1NNu2epf6k8V4frl03xfCvkq4AbIV8HfOk5nvgmYPewWhbfi5OtEW6MsOW4gf9NXOy0L6zo3iTs7lFNva5apsK5skUbmzVqnHGKKUqxS4E86+rbyg1VmoyUAlmtUpQpkdM3x56UvPbS7AxZjuA9wyP777A18H3/MdIOBnCXhemHSEtuwmwCnp4jLXpjx3TNoRRXxewSfC9olFuY+4SZvtTFYHvMrMafWQ326WKxKspomjTZXwyUTdpToV43AAACF0lEQVR4nO3TMRHAMBDAsCRgnj/DhkDPaztICLx4z8yzgFfn6wD4M4NAMAgEg0AwCASDQDAIBINAMAgEg0AwCASDQDAIBINAMAgEg0AwCASDQDAIBINAMAgEg0AwCASDQDAIBINAMAgEg0AwCASDQDAIBINAMAgEg0AwCASDQDAIBINAMAgEg0AwCASDQDAIBINAMAgEg0AwCASDQDAIBINAMAgEg0AwCASDQDAIBINAMAgEg0AwCASDQDAIBINAMAgEg0AwCASDQDAIBINAMAgEg0AwCASDQDAIBINAMAgEg0AwCASDQDAIBINAMAgEg0AwCASDQDAIBINAMAgEg0AwCASDQDAIBINAMAgEg0AwCASDQDAIBINAMAgEg0AwCASDQDAIBINAMAgEg0AwCASDQDAIBINAMAgEg0AwCASDQDAIBINAMAgEg0AwCASDQDAIBINAMAgEg0AwCASDQDAIBINAMAgEg0AwCASDQDAIBINAMAgEg0AwCASDQDAIBINAMAgEg0AwCASDQDAIBINAMAgEg0AwCASDQDAIBINAMAgEg0AwCASDQDAIBINAMAgEg0AwCASDQDAIBINAMAgEg0AwCASDQDAIBINAMAgEg0AwCASDQDAIBINAMAgEg0AwCASDQDAIBINAMAgEg0AwCASDQDAIBINAMAgEg0AwCASDQDAIBINAMAgEg0AwCASDQDAIhAukDwMBXpINdQAAAABJRU5ErkJggg=="
    )
