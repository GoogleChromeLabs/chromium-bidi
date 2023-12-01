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
import re
from urllib.parse import urlparse

import pytest
from anys import ANY_STR
from test_helpers import (AnyExtending, eval_expression, execute_command,
                          goto_url)


async def set_cookie(websocket,
                     context_id,
                     cookie='foo=bar;Secure;Partitioned;'):
    await eval_expression(websocket, context_id,
                          f'document.cookie = "{cookie}"')


@pytest.mark.asyncio
async def test_get_cookies_with_empty_params(websocket, context_id,
                                             example_url):
    await goto_url(websocket, context_id, example_url)
    await set_cookie(websocket, context_id)

    with pytest.raises(
            Exception,
            match=str({
                'error': 'unknown source origin',
                'message': 'sourceOrigin or cookie.domain should be set'
            })):
        await execute_command(websocket, {
            'method': 'storage.getCookies',
            'params': {}
        })


@pytest.mark.asyncio
async def test_get_cookies_unsupported_partition_key(websocket, context_id,
                                                     example_url):
    await goto_url(websocket, context_id, example_url)
    await set_cookie(websocket, context_id)
    unknown_partition_key = 'UNKNOWN_PARTITION_KEY'
    with pytest.raises(Exception,
                       match=re.compile(
                           str({
                               'error': 'unsupported operation',
                               'message': f'.*{unknown_partition_key}.*'
                           }))):
        await execute_command(
            websocket, {
                'method': 'storage.getCookies',
                'params': {
                    'partition': {
                        f'{unknown_partition_key}': 'UNKNOWN',
                        'sourceOrigin': 'SOME_ORIGIN'
                    }
                }
            })


@pytest.mark.asyncio
async def test_get_cookies_for_browsing_context(websocket, context_id,
                                                example_url):
    await goto_url(websocket, context_id, example_url)
    await set_cookie(websocket, context_id)

    parts = urlparse(example_url)
    # Expected should not contain port number.
    expected_origin = parts.scheme + '://' + parts.hostname

    resp = await execute_command(websocket, {
        'method': 'storage.getCookies',
        'params': {
            'partition': context_id
        }
    })

    assert resp == {
        'cookies': [{
            'domain': parts.hostname,
            'expiry': -1,
            'httpOnly': False,
            'name': 'foo',
            'path': '/',
            'sameSite': 'none',
            'secure': True,
            'size': 6,
            'value': {
                'type': 'string',
                'value': 'bar',
            },
        }, ],
        'partitionKey': {
            'sourceOrigin': expected_origin,
        },
    }


@pytest.mark.asyncio
async def test_get_cookies_for_cookie_domain(websocket, context_id,
                                             example_url):
    await goto_url(websocket, context_id, example_url)
    await set_cookie(websocket, context_id)

    parts = urlparse(example_url)
    # Expected should not contain port number.
    expected_origin = parts.scheme + '://' + parts.hostname

    resp = await execute_command(
        websocket, {
            'method': 'storage.getCookies',
            'params': {
                'filter': {
                    'domain': expected_origin
                }
            }
        })

    assert resp == {
        'cookies': [{
            'domain': parts.hostname,
            'expiry': -1,
            'httpOnly': False,
            'name': 'foo',
            'path': '/',
            'sameSite': 'none',
            'secure': True,
            'size': 6,
            'value': {
                'type': 'string',
                'value': 'bar',
            },
        }, ],
        'partitionKey': {
            'sourceOrigin': expected_origin,
        },
    }


async def assert_cookie_filter(websocket, context_id, cookie_filter,
                               expected_cookie_name, expected_cookie_value):
    resp = await execute_command(
        websocket, {
            'method': 'storage.getCookies',
            'params': {
                'filter': cookie_filter,
                'partition': context_id
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
        'partitionKey': {
            'sourceOrigin': ANY_STR
        },
    }


@pytest.mark.asyncio
async def test_get_cookies_filter(websocket, context_id, example_url):
    await goto_url(websocket, context_id, example_url)

    await set_cookie(websocket, context_id, 'foo=bar;Secure;Partitioned;')
    await set_cookie(websocket, context_id, 'baz=qux;Secure;Partitioned;')

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
