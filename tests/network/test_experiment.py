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

from . import create_blocked_request


@pytest.mark.parametrize('execution_number', range(100))
@pytest.mark.asyncio
async def test_create_blocked_request(websocket, context_id, example_url,
                                      execution_number):
    await create_blocked_request(websocket,
                                 context_id,
                                 url=example_url,
                                 phase="responseStarted")