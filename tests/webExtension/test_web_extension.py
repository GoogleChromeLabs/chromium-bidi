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
from test_helpers import execute_command


@pytest.mark.asyncio
async def test_method_not_available(websocket):
    with pytest.raises(Exception,
                       match=str({
                           'error': 'unknown error',
                           'message': 'Method not available.',
                       })):
        await execute_command(
            websocket, {
                "method": "webExtension.install",
                "params": {
                    "extensionData": {
                        "type": "path",
                        "path": "invalid-path",
                    },
                }
            })


@pytest.mark.asyncio
@pytest.mark.parametrize('capabilities', [{
        'goog:chromeOptions': {
            'args': ['--enable-unsafe-extension-debugging', '--remote-debugging-pipe']
        },
    }],
    indirect=True)
async def test_invalid_path(websocket):
    with pytest.raises(
            Exception,
            match=str({
                'error': 'unknown error',  # should not be that
                'message': 'Method not available.',
            })):
        await execute_command(
            websocket, {
                "method": "webExtension.install",
                "params": {
                    "extensionData": {
                        "type": "path",
                        "path": "invalid-path",
                    },
                }
            })
