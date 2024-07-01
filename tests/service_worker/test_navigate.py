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
from test_helpers import execute_command


@pytest.mark.asyncio
@pytest.mark.parametrize('capabilities', [{
    'acceptInsecureCerts': True
}],
                         indirect=True)
async def test_serviceWorker_acceptInsecureCertsCapability_respected(
        websocket, context_id, url_bad_ssl, local_server):
    await execute_command(
        websocket, {
            'method': 'browsingContext.navigate',
            'params': {
                'url': local_server.url_service_worker_bad_ssl(),
                'wait': 'complete',
                'context': context_id
            }
        })

    resp = await execute_command(
        websocket, {
            'method': 'script.evaluate',
            'params': {
                'expression': 'window.registrationPromise.then(r=>r.unregister())',
                'awaitPromise': True,
                'target': {
                    'context': context_id
                }
            }
        })
    assert resp['type'] == 'success'
    assert resp['result'] == {'type': 'boolean', 'value': True}
