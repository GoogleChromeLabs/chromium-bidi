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
@pytest.mark.parametrize('capabilities', [{
    'goog:chromeOptions': {
        'args':
            ['--enable-unsafe-extension-debugging', '--remote-debugging-pipe']
    },
}],
                         indirect=True)
async def test_extensions_invalid_path(websocket):
    with pytest.raises(
            Exception,
            match=str({
                'error': 'unknown error',
                'message': 'Missing \'manifest_version\' key. Its value must be an integer either 2 or 3. See developer.chrome.com/extensions/manifestVersion for details.',
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
