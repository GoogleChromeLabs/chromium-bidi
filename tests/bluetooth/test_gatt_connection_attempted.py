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
import pytest_asyncio
from test_helpers import (AnyExtending, execute_command, goto_url,
                          send_JSON_command, subscribe, wait_for_event)

HTML_SINGLE_PERIPHERAL = """
<div>
    <button id="bluetooth">bluetooth</button>
    <button id="gatt-connect">gatt connect</button>
    <script>
        let device;
        const options = {filters: [{name:"SomeDevice"}]};
        document.getElementById('bluetooth').addEventListener('click', async () => {
          device = await navigator.bluetooth.requestDevice(options);
        });
        document.getElementById('gatt-connect').addEventListener('click', async () => {
          console.log('[DEBUG]', device.name);
          device.gatt.connect();
        });
    </script>
</div>
"""

# Create a fake BT device.
fake_device_address = '09:09:09:09:09:09'


async def setup_device(websocket):
    # Enable BT emulation.
    await execute_command(
        websocket, {
            'method': 'goog:cdp.sendCommand',
            'params': {
                'method': 'BluetoothEmulation.enable',
                'params': {
                    'state': 'powered-on',
                    'leSupported': True,
                }
            }
        })

    await execute_command(
        websocket, {
            'method': 'goog:cdp.sendCommand',
            'params': {
                'method': 'BluetoothEmulation.simulatePreconnectedPeripheral',
                'params': {
                    'address': fake_device_address,
                    'name': 'SomeDevice',
                    'manufacturerData': [],
                    'knownServiceUuids':
                        ['12345678-1234-5678-9abc-def123456789', ],
                }
            }
        })


async def request_device(websocket, context_id, html):
    await send_JSON_command(
        websocket, {
            'method': 'script.evaluate',
            'params': {
                'expression': 'document.querySelector("#bluetooth").click();',
                'awaitPromise': True,
                'target': {
                    'context': context_id,
                },
                'userActivation': True
            }
        })

    event = await wait_for_event(websocket,
                                 'bluetooth.requestDevicePromptUpdated')

    await execute_command(
        websocket, {
            'method': 'bluetooth.handleRequestDevicePrompt',
            'params': {
                'context': context_id,
                'accept': True,
                'prompt': event['params']['prompt'],
                'device': event['params']['devices'][0]['id']
            }
        })


@pytest_asyncio.fixture(autouse=True)
async def disable_simulation(websocket, context_id):
    yield
    await execute_command(
        websocket, {
            'method': 'bluetooth.disableSimulation',
            'params': {
                'context': context_id,
            }
        })


@pytest.mark.asyncio
@pytest.mark.parametrize('capabilities', [{
    'goog:chromeOptions': {
        # 'args': ['--enable-features=WebBluetooth,WebBluetoothNewPermissionsBackend']
        'args': ['--enable-features=WebBluetooth']
    }
}],
    indirect=True)
@pytest.mark.parametrize('code', [0x0])
async def test_bluetooth_handleGattConnectionAttempted(websocket, context_id, html,
                                                       code):
    await subscribe(websocket, ['bluetooth'])
    url = html(HTML_SINGLE_PERIPHERAL)
    await goto_url(websocket, context_id, url)
    await setup_device(websocket)
    await request_device(websocket, context_id, html)

    await send_JSON_command(
        websocket, {
            'method': 'script.evaluate',
            'params': {
                'expression': 'document.querySelector("#gatt-connect").click();',
                'awaitPromise': True,
                'target': {
                    'context': context_id,
                },
                'userActivation': True
            }
        })

    event = await wait_for_event(websocket,
                                 'bluetooth.gattConnectionAttempted')

    # await execute_command(
    #     websocket, {
    #         'method': 'bluetooth.simulateGattConnectionResponse',
    #         'params': {
    #             'context': context_id,
    #             'accept': True,
    #             'address': event['params']['address'],
    #             'code': code
    #         }
    #     })

