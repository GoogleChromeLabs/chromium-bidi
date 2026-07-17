#  Copyright 2026 Google LLC.
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

import json

import pytest
from test_helpers import execute_command, get_tree, goto_url

# The Digital Credentials API options used in the tests.
CREDENTIAL_OPTIONS = """{
    digital: {
        requests: [{
            protocol: 'openid4vp',
            data: {}
        }]
    }
}"""


async def trigger_credentials_get(websocket, context_id):
    """Triggers navigator.credentials.get in the page and returns the evaluation result."""
    # We use a wrapper to catch the error in JS and return it as a JSON string.
    # This avoids script.evaluate throwing an exception in Python if the promise rejects,
    # and avoids dealing with complex RemoteValue serialization in Python.
    expression = f"""
    (async () => {{
        try {{
            const c = await navigator.credentials.get({CREDENTIAL_OPTIONS});
            let token = c.token;
            if (!token && c.data) {{
                if (c.data instanceof ArrayBuffer || ArrayBuffer.isView(c.data)) {{
                    token = new TextDecoder().decode(c.data);
                }} else if (typeof c.data === 'object') {{
                    token = JSON.stringify(c.data);
                }} else {{
                    token = String(c.data);
                }}
            }}
            return JSON.stringify({{
                "status": "success",
                "type": c.type,
                "id": c.id,
                "token": token
            }});
        }} catch (e) {{
            return JSON.stringify({{
                "status": "error",
                "name": e.name,
                "message": e.message
            }});
        }}
    }})()
    """
    result = await execute_command(
        websocket,
        {
            "method": "script.evaluate",
            "params": {
                "expression": expression,
                "awaitPromise": True,
                "target": {"context": context_id},
                "userActivation": True,
            },
        },
    )
    return json.loads(result["result"]["value"])


@pytest.mark.asyncio
async def test_digital_credentials_decline(websocket, context_id, url_secure_context):
    await goto_url(websocket, context_id, url_secure_context)

    # Set behavior to decline
    resp = await execute_command(
        websocket,
        {
            "method": "digitalCredentials.setVirtualWalletBehavior",
            "params": {
                "context": context_id,
                "action": "decline",
            },
        },
    )
    assert resp == {}

    # Trigger request and verify it is declined
    result = await trigger_credentials_get(websocket, context_id)
    assert result["status"] == "error"
    assert result["name"] == "NotAllowedError"


@pytest.mark.asyncio
async def test_digital_credentials_respond(websocket, context_id, url_secure_context):
    await goto_url(websocket, context_id, url_secure_context)

    # Set behavior to respond with mock token
    resp = await execute_command(
        websocket,
        {
            "method": "digitalCredentials.setVirtualWalletBehavior",
            "params": {
                "context": context_id,
                "action": "respond",
                "protocol": "openid4vp",
                "response": {"token": "mock_token_123"},
            },
        },
    )
    assert resp == {}

    # Trigger request and verify it succeeds with the mock token
    result = await trigger_credentials_get(websocket, context_id)
    assert result["status"] == "success"
    assert "mock_token_123" in str(result)


@pytest.mark.asyncio
async def test_digital_credentials_iframe_decline(
    websocket, context_id, local_server_good_ssl
):
    # Set up same-origin iframe
    iframe_url = local_server_good_ssl.url_200(content="<h1>Iframe</h1>")
    iframe_tag = f'<iframe allow="identity-credentials-get" src="{iframe_url}" />'
    main_url = local_server_good_ssl.url_200(content=f"<h1>Main</h1>{iframe_tag}")

    await goto_url(websocket, context_id, main_url)

    # Get iframe context ID
    tree = await get_tree(websocket, context_id)
    iframe_id = tree["contexts"][0]["children"][0]["context"]

    # Set behavior to decline on iframe
    resp = await execute_command(
        websocket,
        {
            "method": "digitalCredentials.setVirtualWalletBehavior",
            "params": {
                "context": iframe_id,
                "action": "decline",
            },
        },
    )
    assert resp == {}

    # Trigger request in iframe and verify it is declined
    result = await trigger_credentials_get(websocket, iframe_id)
    assert result["status"] == "error"
    assert result["name"] == "NotAllowedError"


@pytest.mark.asyncio
async def test_digital_credentials_iframe_no_inheritance(
    websocket, context_id, local_server_good_ssl
):
    # Set up same-origin iframe
    iframe_url = local_server_good_ssl.url_200(content="<h1>Iframe</h1>")
    iframe_tag = f'<iframe allow="identity-credentials-get" src="{iframe_url}" />'
    main_url = local_server_good_ssl.url_200(content=f"<h1>Main</h1>{iframe_tag}")

    await goto_url(websocket, context_id, main_url)

    # Get iframe context ID
    tree = await get_tree(websocket, context_id)
    iframe_id = tree["contexts"][0]["children"][0]["context"]

    # Set behavior globally to respond with global_token
    await execute_command(
        websocket,
        {
            "method": "digitalCredentials.setVirtualWalletBehavior",
            "params": {
                "action": "respond",
                "protocol": "openid4vp",
                "response": {"token": "global_token"},
            },
        },
    )

    # Set behavior on main frame to respond with main_token
    await execute_command(
        websocket,
        {
            "method": "digitalCredentials.setVirtualWalletBehavior",
            "params": {
                "context": context_id,
                "action": "respond",
                "protocol": "openid4vp",
                "response": {"token": "main_token"},
            },
        },
    )

    # Trigger request in iframe and verify it gets global_token (no inheritance from main)
    result = await trigger_credentials_get(websocket, iframe_id)
    assert result["status"] == "success"
    assert "global_token" in str(result)


@pytest.mark.asyncio
async def test_digital_credentials_iframe_override(
    websocket, context_id, local_server_good_ssl
):
    # Set up same-origin iframe
    iframe_url = local_server_good_ssl.url_200(content="<h1>Iframe</h1>")
    iframe_tag = f'<iframe allow="identity-credentials-get" src="{iframe_url}" />'
    main_url = local_server_good_ssl.url_200(content=f"<h1>Main</h1>{iframe_tag}")

    await goto_url(websocket, context_id, main_url)

    # Get iframe context ID
    tree = await get_tree(websocket, context_id)
    iframe_id = tree["contexts"][0]["children"][0]["context"]

    # Set behavior to decline on main frame
    await execute_command(
        websocket,
        {
            "method": "digitalCredentials.setVirtualWalletBehavior",
            "params": {
                "context": context_id,
                "action": "decline",
            },
        },
    )

    # Set behavior to respond on iframe
    await execute_command(
        websocket,
        {
            "method": "digitalCredentials.setVirtualWalletBehavior",
            "params": {
                "context": iframe_id,
                "action": "respond",
                "protocol": "openid4vp",
                "response": {"token": "iframe_token"},
            },
        },
    )

    # Trigger request in main frame and verify it is declined (before iframe request)
    result_main = await trigger_credentials_get(websocket, context_id)
    assert result_main["status"] == "error"
    assert result_main["name"] == "NotAllowedError"

    # Trigger request in iframe and verify it succeeds with iframe's token (override)
    result = await trigger_credentials_get(websocket, iframe_id)
    assert result["status"] == "success"
    assert "iframe_token" in str(result)

    # Trigger request in main frame and verify it is still declined
    result_main_2 = await trigger_credentials_get(websocket, context_id)
    assert result_main_2["status"] == "error"
    assert result_main_2["name"] == "NotAllowedError"
