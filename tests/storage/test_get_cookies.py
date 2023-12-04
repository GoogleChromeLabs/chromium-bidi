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

from urllib.parse import urlparse

import pytest
from anys import ANY_DICT, ANY_STR
from test_helpers import eval_expression, execute_command, goto_url

SOME_COOKIE_NAME = 'some_cookie_name'
SOME_COOKIE_VALUE = 'some_cookie_value'
ANOTHER_COOKIE_NAME = 'another_cookie_name'
ANOTHER_COOKIE_VALUE = 'another_cookie_value'


@pytest.mark.asyncio
async def test_get_cookies_with_empty_params(websocket, context_id,
                                             example_url):
    await goto_url(websocket, context_id, example_url)
    await set_cookie(websocket, context_id, SOME_COOKIE_NAME,
                     SOME_COOKIE_VALUE)

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
async def test_get_cookies_with_partition_source_origin(
        websocket, context_id, example_url):
    await goto_url(websocket, context_id, example_url)
    await set_cookie(websocket, context_id, SOME_COOKIE_NAME,
                     SOME_COOKIE_VALUE)

    hostname, expected_origin = get_hostname_and_origin(example_url)

    res = await execute_command(
        websocket, {
            'method': 'storage.getCookies',
            'params': {
                'partition': {
                    'sourceOrigin': expected_origin,
                },
            }
        })

    assert res == {
        'cookies': [
            get_expected_cookie(hostname, SOME_COOKIE_NAME, SOME_COOKIE_VALUE)
        ],
        'partitionKey': {
            'sourceOrigin': expected_origin,
        },
    }


@pytest.mark.asyncio
async def test_get_cookies_with_unsupported_partition_key(
        websocket, context_id, example_url):
    await goto_url(websocket, context_id, example_url)
    await set_cookie(websocket, context_id, SOME_COOKIE_NAME,
                     SOME_COOKIE_VALUE)

    hostname, expected_origin = get_hostname_and_origin(example_url)
    unknown_partition_key = 'UNKNOWN_PARTITION_KEY'
    unknown_partition_value = 'UNKNOWN_PARTITION_VALUE'

    res = await execute_command(
        websocket, {
            'method': 'storage.getCookies',
            'params': {
                'partition': {
                    f'{unknown_partition_key}': unknown_partition_value,
                    'sourceOrigin': expected_origin,
                },
            }
        })

    assert res == {
        'cookies': [
            get_expected_cookie(hostname, SOME_COOKIE_NAME, SOME_COOKIE_VALUE)
        ],
        'partitionKey': {
            f'{unknown_partition_key}': unknown_partition_value,
            'sourceOrigin': expected_origin,
        },
    }


@pytest.mark.asyncio
async def test_get_cookies_with_partition_browsing_context(
        websocket, context_id, example_url):
    await goto_url(websocket, context_id, example_url)
    await set_cookie(websocket, context_id, SOME_COOKIE_NAME,
                     SOME_COOKIE_VALUE)

    hostname, expected_origin = get_hostname_and_origin(example_url)

    resp = await execute_command(websocket, {
        'method': 'storage.getCookies',
        'params': {
            'partition': context_id
        }
    })

    assert resp == {
        'cookies': [
            get_expected_cookie(hostname, SOME_COOKIE_NAME, SOME_COOKIE_VALUE)
        ],
        'partitionKey': {
            'sourceOrigin': expected_origin,
        },
    }


@pytest.mark.asyncio
async def test_get_cookies_with_filter_cookie_domain(websocket, context_id,
                                                     example_url):
    await goto_url(websocket, context_id, example_url)
    await set_cookie(websocket, context_id, SOME_COOKIE_NAME,
                     SOME_COOKIE_VALUE)

    hostname, expected_origin = get_hostname_and_origin(example_url)

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
        'cookies': [
            get_expected_cookie(hostname, SOME_COOKIE_NAME, SOME_COOKIE_VALUE)
        ],
        'partitionKey': {
            'sourceOrigin': expected_origin,
        },
    }


@pytest.mark.asyncio
async def test_get_cookies_with_filter(websocket, context_id, example_url):
    await goto_url(websocket, context_id, example_url)

    await set_cookie(websocket, context_id, SOME_COOKIE_NAME,
                     SOME_COOKIE_VALUE)
    await set_cookie(websocket, context_id, ANOTHER_COOKIE_NAME,
                     ANOTHER_COOKIE_VALUE)

    # # Filter by name.
    await assert_cookie_filter(websocket, context_id,
                               {'name': SOME_COOKIE_NAME}, SOME_COOKIE_NAME,
                               SOME_COOKIE_VALUE)

    # Filter by value.
    await assert_cookie_filter(
        websocket, context_id,
        {'value': {
            'type': 'string',
            'value': ANOTHER_COOKIE_VALUE
        }}, ANOTHER_COOKIE_NAME, ANOTHER_COOKIE_VALUE)
    # TODO: test other filters.


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
            get_expected_cookie(ANY_STR, expected_cookie_name,
                                expected_cookie_value)
        ],
        'partitionKey': ANY_DICT
    }


# Expected should not contain port number.
def get_hostname_and_origin(url):
    parts = urlparse(url)
    return parts.hostname, parts.scheme + '://' + parts.hostname


def get_expected_cookie(hostname, cookie_name, cookie_value):
    return {
        'domain': hostname,
        'expiry': -1,
        'httpOnly': False,
        'name': cookie_name,
        'path': '/',
        'sameSite': 'none',
        'secure': True,
        'size': len(cookie_name) + len(cookie_value),
        'value': {
            'type': 'string',
            'value': cookie_value,
        },
    }


async def set_cookie(websocket, context_id, cookie_name, cookie_value):
    await eval_expression(
        websocket, context_id,
        f'document.cookie = "{cookie_name}={cookie_value};Secure;Partitioned;"'
    )
