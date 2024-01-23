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

from datetime import datetime, timedelta

import pytest
from storage import (NON_SECURE_ADDRESS, SECURE_ADDRESS, SOME_COOKIE_NAME,
                     SOME_COOKIE_VALUE, expected_bidi_cookie,
                     get_hostname_and_origin)
from test_helpers import execute_command, goto_url


async def assert_cookie_set(websocket, cookie, partition, expected_cookie,
                            expected_origin):
    await execute_command(
        websocket, {
            'method': 'storage.setCookie',
            'params': {
                'cookie': cookie,
                'partition': partition
            }
        })

    resp = await execute_command(websocket, {
        'method': 'storage.getCookies',
        'params': {
            'partition': partition
        }
    })
    assert resp == {
        'cookies': [expected_cookie],
        'partitionKey': {
            'sourceOrigin': expected_origin
        },
    }


@pytest.mark.parametrize(
    'url',
    ['http://some_non_secure_address.com', 'https://some_secure_address.com'])
@pytest.mark.asyncio
async def test_cookie_set_partition_storage_key(websocket, context_id, url):
    hostname, expected_origin = get_hostname_and_origin(url)
    await assert_cookie_set(
        websocket, {
            'name': SOME_COOKIE_NAME,
            'value': {
                'type': 'string',
                'value': SOME_COOKIE_VALUE
            },
            'domain': hostname,
        }, {
            'type': 'storageKey',
            'sourceOrigin': expected_origin,
        },
        expected_bidi_cookie(SOME_COOKIE_NAME,
                             SOME_COOKIE_VALUE,
                             hostname,
                             secure=False), expected_origin)


@pytest.mark.asyncio
async def test_cookie_set_partition_context_non_secure(websocket, context_id,
                                                       example_url):
    hostname, expected_origin = get_hostname_and_origin(example_url)
    await goto_url(websocket, context_id, example_url)

    await assert_cookie_set(
        websocket,
        {
            'name': SOME_COOKIE_NAME,
            'value': {
                'type': 'string',
                'value': SOME_COOKIE_VALUE
            },
            'domain': hostname,
        },
        {
            'type': 'context',
            'context': context_id
        },
        expected_bidi_cookie(SOME_COOKIE_NAME, SOME_COOKIE_VALUE, hostname),
        expected_origin,
    )


# Ignore ssl errors for this test, as a page with `https` url is required.
@pytest.mark.parametrize('websocket', [{
    'capabilities': {
        'acceptInsecureCerts': True
    }
}],
                         indirect=['websocket'])
@pytest.mark.asyncio
async def test_cookie_set_partition_context_secure(websocket, context_id,
                                                   bad_ssl_url):
    hostname, expected_origin = get_hostname_and_origin(bad_ssl_url)
    await goto_url(websocket, context_id, bad_ssl_url)

    await assert_cookie_set(
        websocket, {
            'name': SOME_COOKIE_NAME,
            'value': {
                'type': 'string',
                'value': SOME_COOKIE_VALUE
            },
            'domain': hostname,
        }, {
            'type': 'context',
            'context': context_id
        }, expected_bidi_cookie(SOME_COOKIE_NAME, SOME_COOKIE_VALUE, hostname),
        expected_origin)


@pytest.mark.parametrize(
    'url, secure',
    [
        (SECURE_ADDRESS, True),
        (SECURE_ADDRESS, False),
        # Non-secure pages allow to set only non-secure cookies.
        (NON_SECURE_ADDRESS, False)
    ])
@pytest.mark.parametrize('http_only', [True, False])
@pytest.mark.asyncio
async def test_cookie_set_with_all_fields(websocket, url, secure, http_only):
    hostname, expected_origin = get_hostname_and_origin(url)
    some_path = "/SOME_PATH"
    http_only = True
    same_site = 'lax'
    expiry = int((datetime.now() + timedelta(hours=1)).timestamp())

    await assert_cookie_set(
        websocket, {
            'name': SOME_COOKIE_NAME,
            'value': {
                'type': 'string',
                'value': SOME_COOKIE_VALUE
            },
            'domain': hostname,
            'path': some_path,
            'httpOnly': http_only,
            'secure': secure,
            'sameSite': same_site,
            'expiry': expiry,
        }, {
            'type': 'storageKey',
            'sourceOrigin': expected_origin,
        },
        expected_bidi_cookie(SOME_COOKIE_NAME, SOME_COOKIE_VALUE, hostname,
                             some_path, http_only, secure, same_site, expiry),
        expected_origin)


@pytest.mark.asyncio
async def test_cookie_set_expired(websocket, context_id, example_url):
    hostname, expected_origin = get_hostname_and_origin(example_url)
    expiry = int((datetime.now() - timedelta(seconds=1)).timestamp())
    await execute_command(
        websocket, {
            'method': 'storage.setCookie',
            'params': {
                'cookie': expected_bidi_cookie(SOME_COOKIE_NAME,
                                               SOME_COOKIE_VALUE,
                                               hostname,
                                               expiry=expiry),
                'partition': {
                    'type': 'storageKey',
                    'sourceOrigin': expected_origin,
                },
            }
        })

    resp = await execute_command(
        websocket, {
            'method': 'storage.getCookies',
            'params': {
                'partition': {
                    'type': 'storageKey',
                    'sourceOrigin': expected_origin,
                }
            }
        })
    assert resp['cookies'] == []
