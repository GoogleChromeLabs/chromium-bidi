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
from test_helpers import AnyExtending, goto_url, send_JSON_command, subscribe


@pytest.mark.asyncio
async def test_navigate_scriptRedirect_checkEvents(websocket, context_id, html,
                                                   url_example,
                                                   read_sorted_messages,
                                                   assert_no_more_messages):
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

    messages = await read_sorted_messages(6)
    await assert_no_more_messages()

    assert messages == [
        AnyExtending({
            'error': 'unknown error',
            'id': command_id,
            'message': 'navigation aborted',
            'type': 'error',
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
        })
    ]


@pytest.mark.asyncio
async def test_navigate_scriptFragmentRedirect_checkEvents(
        websocket, context_id, html, url_example, read_sorted_messages,
        assert_no_more_messages):
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

    messages = await read_sorted_messages(5)
    await assert_no_more_messages()
    assert messages == [
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
        })
    ]


@pytest.mark.asyncio
async def test_nested_navigate_scriptFragmentRedirect_checkEvents(
        websocket, iframe_id, html, url_example, read_sorted_messages,
        assert_no_more_messages):
    await subscribe(websocket, ["browsingContext"])

    initial_url = html("<script>window.location='#test';</script>")
    final_url = initial_url + "#test"

    command_id = await send_JSON_command(
        websocket, {
            "method": "browsingContext.navigate",
            "params": {
                "url": initial_url,
                "wait": "complete",
                "context": iframe_id
            }
        })

    messages = await read_sorted_messages(5)
    await assert_no_more_messages()
    assert messages == [
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
                'context': iframe_id,
                'url': final_url,
            },
            'type': 'event',
        }),
        AnyExtending({
            'method': 'browsingContext.fragmentNavigated',
            'params': {
                'context': iframe_id,
                'url': final_url,
            }
        }),
        AnyExtending({
            'method': 'browsingContext.load',
            'params': {
                'context': iframe_id,
                'url': final_url,
            },
            'type': 'event',
        }),
        AnyExtending({
            'method': 'browsingContext.navigationStarted',
            'params': {
                'context': iframe_id,
                'url': initial_url,
            },
            'type': 'event',
        })
    ]


@pytest.mark.asyncio
async def test_navigate_anotherNavigate_checkEvents(websocket, context_id,
                                                    url_example,
                                                    read_sorted_messages,
                                                    assert_no_more_messages,
                                                    url_hang_forever):
    pytest.xfail("Failing due to lacking of proper document tracking")
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

    messages = await read_sorted_messages(6)
    await assert_no_more_messages()
    assert messages == [
        AnyExtending({
            'error': 'unknown error',
            'id': first_navigation_command_id,
            'message': 'navigation aborted',
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
            'method': 'browsingContext.navigationAborted',
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
    ]


@pytest.mark.asyncio
async def test_navigate_aboutBlank_checkEvents(websocket, context_id,
                                               url_example,
                                               read_sorted_messages,
                                               assert_no_more_messages):

    await goto_url(websocket, context_id, url_example)

    await subscribe(websocket, ["browsingContext"])

    command_id = await send_JSON_command(
        websocket, {
            "method": "browsingContext.navigate",
            "params": {
                "url": "about:blank",
                "wait": "complete",
                "context": context_id
            }
        })

    messages = await read_sorted_messages(4)
    await assert_no_more_messages()
    assert messages == [
        AnyExtending({
            'id': command_id,
            'result': {
                'url': 'about:blank',
            },
            'type': 'success',
        }),
        AnyExtending({
            'method': 'browsingContext.domContentLoaded',
            'params': {
                'context': context_id,
                'url': 'about:blank',
            },
            'type': 'event',
        }),
        AnyExtending({
            'method': 'browsingContext.load',
            'params': {
                'context': context_id,
                'url': 'about:blank',
            },
            'type': 'event',
        }),
        AnyExtending({
            'method': 'browsingContext.navigationStarted',
            'params': {
                'context': context_id,
                'url': 'about:blank',
            },
            'type': 'event',
        }),
    ]


@pytest.mark.asyncio
async def test_navigate_dataUrl_checkEvents(websocket, context_id, url_example,
                                            read_sorted_messages,
                                            assert_no_more_messages):

    data_url = "data:text/html;,<h2>header</h2>"
    await goto_url(websocket, context_id, url_example)

    await subscribe(websocket, ["browsingContext"])

    command_id = await send_JSON_command(
        websocket, {
            "method": "browsingContext.navigate",
            "params": {
                "url": data_url,
                "wait": "complete",
                "context": context_id
            }
        })

    messages = await read_sorted_messages(4)
    await assert_no_more_messages()
    assert messages == [
        AnyExtending({
            'id': command_id,
            'result': {
                'url': data_url,
            },
            'type': 'success',
        }),
        AnyExtending({
            'method': 'browsingContext.domContentLoaded',
            'params': {
                'context': context_id,
                'url': data_url,
            },
            'type': 'event',
        }),
        AnyExtending({
            'method': 'browsingContext.load',
            'params': {
                'context': context_id,
                'url': data_url,
            },
            'type': 'event',
        }),
        AnyExtending({
            'method': 'browsingContext.navigationStarted',
            'params': {
                'context': context_id,
                'url': data_url,
            },
            'type': 'event',
        }),
    ]


@pytest.mark.asyncio
async def test_scriptNavigate_aboutBlank_checkEvents(websocket, context_id,
                                                     url_example, html,
                                                     read_sorted_messages,
                                                     assert_no_more_messages):

    await subscribe(websocket, ["browsingContext"])

    about_blank_url = 'about:blank'
    initial_url = html(
        f"<script>window.location='{about_blank_url}';</script>")

    command_id = await send_JSON_command(
        websocket, {
            "method": "browsingContext.navigate",
            "params": {
                "url": initial_url,
                "wait": "complete",
                "context": context_id
            }
        })

    messages = await read_sorted_messages(4)
    await assert_no_more_messages()
    assert messages == [
        AnyExtending({
            'id': command_id,
            'result': {
                'url': about_blank_url,
            },
            'type': 'success',
        }),
        AnyExtending({
            'method': 'browsingContext.domContentLoaded',
            'params': {
                'context': context_id,
                'url': about_blank_url,
            },
            'type': 'event',
        }),
        AnyExtending({
            'method': 'browsingContext.load',
            'params': {
                'context': context_id,
                'url': about_blank_url,
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
    ]
