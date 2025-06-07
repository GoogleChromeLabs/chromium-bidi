# Copyright 2025 Google LLC.
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
import pytest_asyncio
from test_helpers import execute_command


@pytest_asyncio.fixture
async def initial_locale(websocket, context_id):
    return await get_locale(websocket, context_id)


@pytest.fixture
def some_locale(initial_locale):
    """Returns some locale which is not equal to initial one."""
    return "es-ES" if initial_locale != "es-ES" else "it-IT"


@pytest.fixture
def another_locale(initial_locale):
    """Returns some locale which is not equal to initial one."""
    return "de-DE" if initial_locale != "de-DE" else "fr-FR"


async def get_locale(websocket, context_id):
    """
    Returns browsing context's current locale.
    """
    resp = await execute_command(
        websocket, {
            "method": "script.evaluate",
            "params": {
                "expression": "new Intl.DateTimeFormat().resolvedOptions().locale",
                "target": {
                    "context": context_id
                },
                "awaitPromise": True,
            }
        })

    return resp["result"]["value"] if "result" in resp else resp


@pytest.mark.asyncio
async def test_locale_set_and_clear(websocket, context_id, initial_locale,
                                    some_locale):
    await execute_command(
        websocket, {
            'method': 'emulation.setLocaleOverride',
            'params': {
                'contexts': [context_id],
                'locale': some_locale
            }
        })

    assert (await get_locale(websocket, context_id)) == some_locale

    await execute_command(
        websocket, {
            'method': 'emulation.setLocaleOverride',
            'params': {
                'contexts': [context_id],
                'locale': None
            }
        })
    assert (await get_locale(websocket, context_id)) == initial_locale


@pytest.mark.asyncio
async def test_locale_per_user_context(websocket, user_context_id,
                                       create_context, some_locale,
                                       another_locale):
    # Set different locale overrides for different user contexts.
    await execute_command(
        websocket, {
            'method': 'emulation.setLocaleOverride',
            'params': {
                'userContexts': ["default"],
                'locale': some_locale
            }
        })
    await execute_command(
        websocket, {
            'method': 'emulation.setLocaleOverride',
            'params': {
                'userContexts': [user_context_id],
                'locale': another_locale
            }
        })

    # Assert the overrides applied for the right contexts.
    browsing_context_id_1 = await create_context()
    emulated_locale_1 = await get_locale(websocket, browsing_context_id_1)
    assert emulated_locale_1 == some_locale

    browsing_context_id_2 = await create_context(user_context_id)
    emulated_locale_2 = await get_locale(websocket, browsing_context_id_2)
    assert emulated_locale_2 == another_locale


@pytest.mark.asyncio
async def test_locale_per_browsing_context(websocket, context_id,
                                           another_context_id, create_context,
                                           some_locale, another_locale):
    # Set different locale overrides for different user contexts.
    await execute_command(
        websocket, {
            'method': 'emulation.setLocaleOverride',
            'params': {
                'contexts': [context_id],
                'locale': some_locale
            }
        })
    await execute_command(
        websocket, {
            'method': 'emulation.setLocaleOverride',
            'params': {
                'contexts': [another_context_id],
                'locale': another_locale
            }
        })

    assert await get_locale(websocket, context_id) == some_locale
    assert await get_locale(websocket, another_context_id) == another_locale
