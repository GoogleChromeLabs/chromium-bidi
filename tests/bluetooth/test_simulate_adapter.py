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
from test_helpers import AnyExtending, execute_command, goto_url


async def simulate_adapter_and_assert(websocket, context_id, state,
                                      expected_available):
    await execute_command(
        websocket, {
            'method': 'bluetooth.simulateAdapter',
            'params': {
                'context': context_id,
                'state': state,
            }
        })

    resp = await execute_command(
        websocket, {
            'method': 'script.evaluate',
            'params': {
                'expression': "navigator.bluetooth.getAvailability()",
                'awaitPromise': True,
                'target': {
                    'context': context_id,
                },
            }
        })

    assert resp == AnyExtending({
        'result': {
            'type': 'boolean',
            'value': expected_available,
        },
        'type': 'success'
    })


@pytest.mark.asyncio
@pytest.mark.parametrize("state_1,expected_available_1",
                         [("absent", False), ("powered-off", True),
                          ("powered-on", True)])
@pytest.mark.parametrize("state_2,expected_available_2",
                         [("absent", False), ("powered-off", True),
                          ("powered-on", True)])
@pytest.mark.parametrize('capabilities', [{
    'goog:chromeOptions': {
        'args': ['--enable-features=WebBluetooth']
    }
}],
                         indirect=True)
async def test_simulate_adapter_twice(websocket, context_id, state_1,
                                      expected_available_1, state_2,
                                      expected_available_2, html,
                                      test_headless_mode):
    if test_headless_mode == "old":
        pytest.xfail("Old headless mode does not support Bluetooth")

    # WebBluetooth is not available on the about:blank.
    await goto_url(websocket, context_id, html(""))

    await simulate_adapter_and_assert(state_1, expected_available_1)

    # Assert adapter can be simulated twice.
    await simulate_adapter_and_assert(state_2, expected_available_2)
