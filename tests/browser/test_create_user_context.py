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
from anys import ANY_STR
from test_helpers import (ANY_UUID, AnyExtending, execute_command,
                          read_JSON_message, send_JSON_command, subscribe,
                          wait_for_event)


@pytest.mark.asyncio
async def test_browser_create_user_context(websocket):
    result = await execute_command(websocket, {
        "method": "browser.getUserContexts",
        "params": {}
    })

    assert result['userContexts'] == [{'userContext': 'default'}]

    result = await execute_command(websocket, {
        "method": "browser.createUserContext",
        "params": {}
    })

    user_context_id = result['userContext']

    assert user_context_id != 'default'
    assert user_context_id == ANY_STR

    result = await execute_command(websocket, {
        "method": "browser.getUserContexts",
        "params": {}
    })

    def user_context(x):
        return x["userContext"]

    assert sorted(result['userContexts'],
                  key=user_context) == sorted([{
                      'userContext': 'default'
                  }, {
                      'userContext': user_context_id
                  }],
                                              key=user_context)


@pytest.mark.asyncio
async def test_browser_create_user_context_legacy_proxy(
        websocket, http_proxy_server):
    # Localhost URLs are not proxied.
    example_url = "http://example.com"

    user_context = await execute_command(
        websocket, {
            "method": "browser.createUserContext",
            "params": {
                "goog:proxyServer": f"http://{http_proxy_server.url()}"
            }
        })

    browsing_context = await execute_command(
        websocket, {
            "method": "browsingContext.create",
            "params": {
                "type": "tab",
                "userContext": user_context["userContext"]
            }
        })

    await execute_command(
        websocket, {
            "method": "browsingContext.navigate",
            "params": {
                "url": example_url,
                "wait": "complete",
                "context": browsing_context["context"]
            }
        })

    assert http_proxy_server.stop()[0] == "http://example.com/"


@pytest.mark.asyncio
@pytest.mark.parametrize('no_proxy', [True, False])
async def test_browser_create_user_context_proxy(websocket, http_proxy_server,
                                                 no_proxy):
    example_url = "http://httpbin.org/get"

    user_context = await execute_command(
        websocket, {
            "method": "browser.createUserContext",
            "params": {
                "proxy": {
                    "proxyType": "manual",
                    "httpProxy": http_proxy_server.url(),
                    **({
                        'noProxy': ['httpbin.org']
                    } if no_proxy else {})
                }
            }
        })

    browsing_context = await execute_command(
        websocket, {
            "method": "browsingContext.create",
            "params": {
                "type": "tab",
                "userContext": user_context["userContext"]
            }
        })

    await execute_command(
        websocket, {
            "method": "browsingContext.navigate",
            "params": {
                "url": example_url,
                "wait": "complete",
                "context": browsing_context["context"]
            }
        })

    if no_proxy:
        assert len(http_proxy_server.stop()) == 0
    else:
        assert http_proxy_server.stop()[0] == example_url


@pytest.mark.asyncio
@pytest.mark.parametrize('capabilities', [{}, {
    'acceptInsecureCerts': True
}, {
    'acceptInsecureCerts': False
}],
                         indirect=True)
@pytest.mark.parametrize('accept_insecure_certs', [True, False])
async def test_browser_create_user_context_accept_insecure_certs_isolated(
        websocket, context_id, url_bad_ssl, capabilities,
        accept_insecure_certs):
    if capabilities.get('acceptInsecureCerts') and not accept_insecure_certs:
        pytest.xfail("TODO: 3398")
    user_context = await execute_command(
        websocket, {
            "method": "browser.createUserContext",
            "params": {
                "acceptInsecureCerts": accept_insecure_certs
            }
        })

    await execute_command(
        websocket, {
            "method": "browsingContext.create",
            "params": {
                "type": "tab",
                "userContext": user_context["userContext"]
            }
        })

    command_id = await send_JSON_command(
        websocket, {
            'method': "browsingContext.navigate",
            'params': {
                'url': url_bad_ssl,
                'wait': 'complete',
                'context': context_id
            }
        })

    resp = await read_JSON_message(websocket)
    if capabilities.get('acceptInsecureCerts'):
        assert resp == {
            'id': command_id,
            'result': {
                'navigation': ANY_UUID,
                'url': url_bad_ssl,
            },
            'type': 'success',
        }
    else:
        assert resp == AnyExtending({
            'error': 'unknown error',
            'id': command_id,
            'message': 'net::ERR_CERT_AUTHORITY_INVALID',
            'type': 'error',
        })


@pytest.mark.asyncio
@pytest.mark.parametrize('capabilities', [{}, {
    'acceptInsecureCerts': True
}, {
    'acceptInsecureCerts': False
}],
                         indirect=True)
@pytest.mark.parametrize('accept_insecure_certs', [True, False])
async def test_browser_create_user_context_accept_insecure_certs_respected(
        websocket, context_id, url_bad_ssl, capabilities,
        accept_insecure_certs):
    if capabilities.get('acceptInsecureCerts') and not accept_insecure_certs:
        pytest.xfail("TODO: 3398")

    user_context = await execute_command(
        websocket, {
            "method": "browser.createUserContext",
            "params": {
                "acceptInsecureCerts": accept_insecure_certs
            }
        })

    browsing_context = await execute_command(
        websocket, {
            "method": "browsingContext.create",
            "params": {
                "type": "tab",
                "userContext": user_context["userContext"]
            }
        })

    context_id = browsing_context["context"]

    command_id = await send_JSON_command(
        websocket, {
            'method': "browsingContext.navigate",
            'params': {
                'url': url_bad_ssl,
                'wait': 'complete',
                'context': context_id
            }
        })

    resp = await read_JSON_message(websocket)
    if accept_insecure_certs:
        assert resp == {
            'id': command_id,
            'result': {
                'navigation': ANY_UUID,
                'url': url_bad_ssl,
            },
            'type': 'success',
        }
    else:
        assert resp == AnyExtending({
            'error': 'unknown error',
            'id': command_id,
            'message': 'net::ERR_CERT_AUTHORITY_INVALID',
            'type': 'error',
        })


# All the combinations will be tested in WPT, keep only a few cases here to save
# runtime.
@pytest.mark.asyncio
@pytest.mark.parametrize("behavior", [None, "accept"])
@pytest.mark.parametrize("default", [None, "ignore"])
@pytest.mark.parametrize("prompt_type", ["alert"])
async def test_browser_create_user_context_unhandled_prompt_behavior(
        websocket, prompt_type, behavior, default, create_context):
    PROMPT_MESSAGE = "SOME MESSAGE"

    unhandled_prompt_behavior = {}

    if behavior is not None:
        unhandled_prompt_behavior[prompt_type] = behavior
    if default is not None:
        unhandled_prompt_behavior["default"] = default

    user_context = await execute_command(
        websocket, {
            "method": "browser.createUserContext",
            "params": {
                "unhandledPromptBehavior": unhandled_prompt_behavior
            }
        })

    context_id = await create_context(
        user_context_id=user_context["userContext"])

    await subscribe(websocket, [
        "browsingContext.userPromptOpened", "browsingContext.userPromptClosed"
    ])
    await send_JSON_command(
        websocket, {
            "method": "script.evaluate",
            "params": {
                "expression": f"""{prompt_type}('{PROMPT_MESSAGE}')""",
                "awaitPromise": True,
                "target": {
                    "context": context_id,
                }
            }
        })
    response = await wait_for_event(websocket,
                                    "browsingContext.userPromptOpened")
    if behavior is not None:
        expected_handler = behavior
    elif default is not None:
        expected_handler = default
    else:
        expected_handler = 'dismiss'

    assert response == {
        'type': 'event',
        "method": "browsingContext.userPromptOpened",
        "params": {
            "context": context_id,
            "type": prompt_type,
            'handler': expected_handler,
            "message": PROMPT_MESSAGE,
            **({
                "defaultValue": ""
            } if prompt_type == "prompt" else {}),
        }
    }

    if expected_handler == 'ignore':
        # Dismiss the prompt manually.
        await send_JSON_command(
            websocket, {
                "method": "browsingContext.handleUserPrompt",
                "params": {
                    "context": context_id,
                    "accept": False
                }
            })
    response = await wait_for_event(websocket,
                                    "browsingContext.userPromptClosed")
    assert response == {
        'type': 'event',
        "method": "browsingContext.userPromptClosed",
        "params": {
            "context": context_id,
            "accepted": expected_handler == 'accept',
            "type": prompt_type
        }
    }
