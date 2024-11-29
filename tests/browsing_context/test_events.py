# Copyright 2024 Google LLC.
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
from test_helpers import AnyExtending, send_JSON_command, subscribe


@pytest.mark.asyncio
async def test_navigate_scriptRedirect_checkEvents(websocket, context_id, html,
                                                   url_example,
      assert_only_messages):
    await subscribe(websocket, ["browsingContext"])

    initial_url = html(f"<script>window.location='{url_example}';</script>")

    command_id = await send_JSON_command(
        websocket, {
            "method": "browsingContext.navigate",
            "params": {
                "url": initial_url,
                "wait": "complete",
                "context": context_id
            }
        })

    await assert_only_messages([
        AnyExtending({
            'id': command_id,
            'type': 'success',
        }),
        AnyExtending({
            'method': 'browsingContext.domContentLoaded',
            'params': {
                'context': context_id,
                'url': url_example,
            },
            'type': 'event',
        }),
        AnyExtending({
            'method': 'browsingContext.load',
            'params': {
                'context': context_id,
                'url': url_example,
            },
            'type': 'event',
        }),
        AnyExtending({
            'method': 'browsingContext.navigationAborted',
            'params': {
                'context': context_id,
                'url': initial_url,
            },
            'type': 'event',
        }),
        AnyExtending({
            'method': 'browsingContext.navigationStarted',
            'params': {
                'context': context_id,
                'url': initial_url,
            },
            'type': 'event',
        }),
        AnyExtending({
            'method': 'browsingContext.navigationStarted',
            'params': {
                'context': context_id,
                'url': url_example,
            },
            'type': 'event',
        }),
    ])


@pytest.mark.asyncio
async def test_navigate_scriptFragmentRedirect_checkEvents(
        websocket, context_id, html, url_example, assert_only_messages):
    await subscribe(websocket, ["browsingContext"])

    initial_url = html("<script>window.location='#test';</script>")
    final_url = initial_url + "#test"

    command_id = await send_JSON_command(
        websocket, {
            "method": "browsingContext.navigate",
            "params": {
                "url": initial_url,
                "wait": "complete",
                "context": context_id
            }
        })

    await assert_only_messages([
        AnyExtending({
            'id': command_id,
            'result': {
                'url': final_url,
            },
            'type': 'success',
        }),
        AnyExtending({
            'method': 'browsingContext.domContentLoaded',
            'params': {
                'context': context_id,
                'url': final_url,
            },
            'type': 'event',
        }),
        AnyExtending({
            'method': 'browsingContext.fragmentNavigated',
            'params': {
                'context': context_id,
                'url': final_url,
            },
            'type': 'event',
        }),
        AnyExtending({
            'method': 'browsingContext.load',
            'params': {
                'context': context_id,
                'url': final_url,
            },
            'type': 'event',
        }),
        AnyExtending({
            'method': 'browsingContext.navigationStarted',
            'params': {
                'context': context_id,
                'url': initial_url,
            },
            'type': 'event',
        }),
    ])


@pytest.mark.asyncio
async def test_navigate_anotherNavigate_checkEvents(websocket, context_id,
                                                    url_example,
      assert_only_messages,
                                                    url_hang_forever):
    await subscribe(websocket, ["browsingContext"])

    first_navigation_command_id = await send_JSON_command(
        websocket, {
            "method": "browsingContext.navigate",
            "params": {
                "url": url_hang_forever,
                "wait": "complete",
                "context": context_id
            }
        })

    second_navigation_command_id = await send_JSON_command(
        websocket, {
            "method": "browsingContext.navigate",
            "params": {
                "url": url_example,
                "wait": "complete",
                "context": context_id
            }
        })

    await assert_only_messages([
        AnyExtending({
            'error': 'unknown error',
            'id': first_navigation_command_id,
            'message': 'net::ERR_ABORTED',
            'type': 'error',
        }),
        AnyExtending({
            'id': second_navigation_command_id,
            'result': {
                'url': url_example,
            },
            'type': 'success',
        }),
        AnyExtending({
            'method': 'browsingContext.domContentLoaded',
            'params': {
                'context': context_id,
                'url': url_example,
            },
            'type': 'event',
        }),
        AnyExtending({
            'method': 'browsingContext.load',
            'params': {
                'context': context_id,
                'url': url_example,
            },
            'type': 'event',
        }),
        AnyExtending({
            'method': 'browsingContext.navigationFailed',
            'params': {
                'context': context_id,
                'url': url_hang_forever,
            },
            'type': 'event',
        }),
        AnyExtending({
            'method': 'browsingContext.navigationStarted',
            'params': {
                'context': context_id,
                'url': url_example,
            },
            'type': 'event',
        }),
        AnyExtending({
            'method': 'browsingContext.navigationStarted',
            'params': {
                'context': context_id,
                'url': 'UNKNOWN',
            },
            'type': 'event',
        })
    ])
