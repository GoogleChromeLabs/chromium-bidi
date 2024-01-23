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
from anys import ANY_DICT
from storage import (ANOTHER_COOKIE_NAME, ANOTHER_COOKIE_VALUE,
                     BASE_DOMAIN_ADDRESS, NON_SECURE_ADDRESS, SECURE_ADDRESS,
                     SOME_COOKIE_NAME, SOME_COOKIE_VALUE, SUB_DOMAIN_ADDRESS,
                     YET_ANOTHER_COOKIE_NAME, YET_ANOTHER_COOKIE_VALUE,
                     expected_bidi_cookie, get_hostname_and_origin, set_cookie)
from test_helpers import execute_command, goto_url


@pytest.mark.parametrize('url', [NON_SECURE_ADDRESS, SECURE_ADDRESS])
@pytest.mark.asyncio
async def test_cookies_get_with_partition_source_origin(websocket, url):
    hostname, origin = get_hostname_and_origin(url)
    await set_cookie(websocket, SOME_COOKIE_NAME, SOME_COOKIE_VALUE, hostname,
                     origin)

    res = await execute_command(
        websocket, {
            'method': 'storage.getCookies',
            'params': {
                'partition': {
                    'type': 'storageKey',
                    'sourceOrigin': origin,
                },
            }
        })

    assert res == {
        'cookies': [
            expected_bidi_cookie(SOME_COOKIE_NAME, SOME_COOKIE_VALUE, hostname)
        ],
        'partitionKey': {
            'sourceOrigin': origin,
        },
    }


@pytest.mark.asyncio
async def test_cookies_get_with_unsupported_partition_key(
        websocket, example_url):
    hostname, origin = get_hostname_and_origin(example_url)
    await set_cookie(websocket, SOME_COOKIE_NAME, SOME_COOKIE_VALUE, hostname,
                     origin)

    unknown_partition_key = 'UNKNOWN_PARTITION_KEY'
    unknown_partition_value = 'UNKNOWN_PARTITION_VALUE'

    res = await execute_command(
        websocket, {
            'method': 'storage.getCookies',
            'params': {
                'partition': {
                    'type': 'storageKey',
                    f'{unknown_partition_key}': unknown_partition_value,
                    'sourceOrigin': origin,
                },
            }
        })

    assert res == {
        'cookies': [(expected_bidi_cookie(SOME_COOKIE_NAME, SOME_COOKIE_VALUE,
                                          hostname))],
        'partitionKey': {
            'sourceOrigin': origin,
        },
    }


@pytest.mark.asyncio
async def test_cookies_get_with_partition_browsing_context(
        websocket, context_id, example_url):
    hostname, origin = get_hostname_and_origin(example_url)
    await set_cookie(websocket, SOME_COOKIE_NAME, SOME_COOKIE_VALUE, hostname,
                     origin)

    # Navigate to the page with the cookie.
    await goto_url(websocket, context_id, example_url)

    # Use the browsing context as a partition.
    resp = await execute_command(
        websocket, {
            'method': 'storage.getCookies',
            'params': {
                'partition': {
                    'type': 'context',
                    'context': context_id
                }
            }
        })

    assert resp == {
        'cookies': [(expected_bidi_cookie(SOME_COOKIE_NAME, SOME_COOKIE_VALUE,
                                          hostname))],
        'partitionKey': {
            'sourceOrigin': origin,
        },
    }


@pytest.mark.asyncio
async def test_cookie_get_domain_subdomains(websocket):
    base_hostname, base_origin = get_hostname_and_origin(
        BASE_DOMAIN_ADDRESS, True)
    base_hostname = base_hostname
    sub_hostname, sub_origin = get_hostname_and_origin(SUB_DOMAIN_ADDRESS)

    await set_cookie(websocket, SOME_COOKIE_NAME, SOME_COOKIE_VALUE,
                     base_hostname, base_origin)

    await set_cookie(websocket, ANOTHER_COOKIE_NAME, ANOTHER_COOKIE_VALUE,
                     sub_hostname, base_origin)

    # Assert the base origin accesses only its own cookies.
    resp = await execute_command(
        websocket, {
            'method': 'storage.getCookies',
            'params': {
                'partition': {
                    'type': 'storageKey',
                    'sourceOrigin': base_origin,
                }
            }
        })
    assert resp == {
        'cookies': [
            expected_bidi_cookie(SOME_COOKIE_NAME, SOME_COOKIE_VALUE,
                                 base_hostname)
        ],
        'partitionKey': {
            'sourceOrigin': base_origin
        },
    }

    # Assert subdomain's origin accesses base and subdomain's cookies.
    resp = await execute_command(
        websocket, {
            'method': 'storage.getCookies',
            'params': {
                'partition': {
                    'type': 'storageKey',
                    'sourceOrigin': sub_origin,
                }
            }
        })
    assert len(resp['cookies']) == 2


@pytest.mark.asyncio
async def test_cookies_get_with_filter(websocket, example_url,
                                       another_example_url):
    domain, origin = get_hostname_and_origin(example_url)
    another_domain, another_origin = get_hostname_and_origin(
        another_example_url)
    await set_cookie(websocket, SOME_COOKIE_NAME, SOME_COOKIE_VALUE, domain,
                     origin)
    await set_cookie(websocket, ANOTHER_COOKIE_NAME, ANOTHER_COOKIE_VALUE,
                     domain, origin)
    await set_cookie(websocket, YET_ANOTHER_COOKIE_NAME,
                     YET_ANOTHER_COOKIE_VALUE, another_domain, another_origin)

    some_expected_cookie = expected_bidi_cookie(SOME_COOKIE_NAME,
                                                SOME_COOKIE_VALUE, domain)
    another_expected_cookie = expected_bidi_cookie(ANOTHER_COOKIE_NAME,
                                                   ANOTHER_COOKIE_VALUE,
                                                   domain)
    yet_another_expected_cookie = expected_bidi_cookie(
        YET_ANOTHER_COOKIE_NAME, YET_ANOTHER_COOKIE_VALUE, another_domain)

    # Filter by domain.
    await assert_cookie_filter(websocket, {'domain': another_domain},
                               yet_another_expected_cookie, another_origin)

    # Filter by name.
    await assert_cookie_filter(websocket, {'name': SOME_COOKIE_NAME},
                               some_expected_cookie, origin)

    # Filter by value.
    await assert_cookie_filter(
        websocket,
        {'value': {
            'type': 'string',
            'value': ANOTHER_COOKIE_VALUE
        }}, another_expected_cookie, origin)

    # TODO: test other filters.


async def assert_cookie_filter(websocket, cookie_filter, expected_cookie,
                               origin):
    partition = {'type': 'storageKey', 'sourceOrigin': origin}

    resp = await execute_command(
        websocket, {
            'method': 'storage.getCookies',
            'params': {
                'filter': cookie_filter,
                'partition': partition
            }
        })
    if expected_cookie is None:
        assert resp == {'cookies': [], 'partitionKey': ANY_DICT}
    else:
        assert resp == {'cookies': [expected_cookie], 'partitionKey': ANY_DICT}
