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

from test_helpers import execute_command

NON_SECURE_ADDRESS = 'http://some_non_secure_address.com'
SECURE_ADDRESS = 'https://some_secure_address.com'

BASE_DOMAIN_ADDRESS = 'https://some_domain.com'
SUB_DOMAIN_ADDRESS = 'https://subdomain.some_domain.com'

SOME_COOKIE_NAME = 'some_cookie_name'
SOME_COOKIE_VALUE = 'some_cookie_value'
ANOTHER_COOKIE_NAME = 'another_cookie_name'
ANOTHER_COOKIE_VALUE = 'another_cookie_value'
YET_ANOTHER_COOKIE_NAME = 'yet_another_cookie_name'
YET_ANOTHER_COOKIE_VALUE = 'yet_another_cookie_value'


def get_hostname_and_origin(url, share_with_subdomains=False):
    """ Return the hostname and origin of cookies for the given url."""
    parts = urlparse(url)
    if parts.hostname is None or parts.scheme is None:
        return None, None
    # Leading `.` means the cookie is shared with subdomains.
    return ('.' if share_with_subdomains else '') + str(
        parts.hostname), parts.scheme + '://' + parts.hostname


def expected_bidi_cookie(cookie_name,
                         cookie_value,
                         domain,
                         path="/",
                         http_only=False,
                         secure=False,
                         same_site='none',
                         expiry=None):
    """ Return a cookie object with the given parameters."""
    return {
        'domain': domain,
        'httpOnly': http_only,
        'name': cookie_name,
        'path': path,
        'sameSite': same_site,
        'secure': secure,
        'size': len(cookie_name) + len(cookie_value),
        'value': {
            'type': 'string',
            'value': cookie_value,
        },
    } \
        | ({
               'expiry': expiry
           } if expiry is not None else {})


async def set_cookie(
    websocket,
    cookie_name,
    cookie_value,
    domain,
    origin,
    path="/",
    http_only=False,
    secure=False,
    same_site=None,
    expiry=None,
):
    """ Set cookie via BiDi command."""

    cookie = {
        'domain': domain,
        'httpOnly': http_only,
        'name': cookie_name,
        'path': path,
        # 'sameSite': same_site,
        'secure': secure,
        'size': len(cookie_name) + len(cookie_value),
        'value': {
            'type': 'string',
            'value': cookie_value,
        },
    }
    if expiry is not None:
        cookie['expiry'] = expiry

    if same_site is not None:
        cookie['sameSite'] = same_site

    partition = {'type': 'storageKey', 'sourceOrigin': origin}

    await execute_command(
        websocket, {
            'method': 'storage.setCookie',
            'params': {
                'cookie': cookie,
                'partition': partition
            }
        })
