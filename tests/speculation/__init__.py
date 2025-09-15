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
"""Shared utilities for Speculation BiDi tests."""

import asyncio
from test_helpers import wait_for_event


async def wait_for_prefetch_event_with_timeout(websocket, timeout: float = 3.0):
    """Wait for a prefetch status event with a timeout, returning None if timeout occurs."""
    try:
        return await asyncio.wait_for(
            wait_for_event(websocket, "speculation.prefetchStatusUpdated"),
            timeout=timeout
        )
    except asyncio.TimeoutError:
        return None