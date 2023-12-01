#  Copyright 2023 Google LLC.
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
from test_helpers import (AnyExtending, eval_expression, execute_command,
                          goto_url)


@pytest.mark.asyncio
async def test_get_cookies(websocket, context_id, example_url):
    await goto_url(websocket, context_id, example_url)
    await eval_expression(websocket, context_id, 'document.cookie = "foo=bar"')
    resp = await execute_command(websocket, {
        'method': 'storage.getCookies',
        'params': {
            'cookie': {}
        }
    })

    assert resp == {
        'cookies': [{
            'domain': example_url.split('://')[1].split('/')[0].split(':')[0],
            'expiry': -1,
            'httpOnly': False,
            'name': 'foo',
            'path': '/',
            'sameSite': 'none',
            'secure': False,
            'size': 6,
            'value': {
                'type': 'string',
                'value': 'bar',
            },
        }, ],
        'partitionKey': {},
    }


async def assert_cookie_filter(websocket, context_id, cookie_filter,
                               expected_cookie_name, expected_cookie_value):
    resp = await execute_command(websocket, {
        'method': 'storage.getCookies',
        'params': {
            'filter': cookie_filter
        }
    })
    assert resp == {
        'cookies': [
            AnyExtending({
                'name': expected_cookie_name,
                'value': {
                    'type': 'string',
                    'value': expected_cookie_value,
                },
            }),
        ],
        'partitionKey': {},
    }


@pytest.mark.asyncio
async def test_get_cookies_filter(websocket, context_id, example_url):
    await goto_url(websocket, context_id, example_url)

    await eval_expression(
        websocket, context_id,
        'document.cookie = "foo=bar"; document.cookie = "baz=qux"')

    # # Filter by name.
    await assert_cookie_filter(websocket, context_id, {'name': 'foo'}, 'foo',
                               'bar')

    # Filter by value.
    await assert_cookie_filter(websocket, context_id,
                               {'value': {
                                   'type': 'string',
                                   'value': 'qux'
                               }}, 'baz', 'qux')
    # TODO: test other filters.
