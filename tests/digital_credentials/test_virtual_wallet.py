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

import asyncio

import pytest
from test_helpers import execute_command, goto_url

# The Digital Credentials API options used in the tests.
CREDENTIAL_OPTIONS = {
    "digital": {"providers": [{"protocol": "openid4vp", "request": "example_request"}]}
}


async def trigger_credentials_get(websocket, context_id):
    """Triggers navigator.credentials.get in the page and returns the evaluation result."""
    # We use a wrapper to catch the error in JS and return it as a string,
    # or return the credential details on success.
    # This avoids script.evaluate throwing an exception in Python if the promise rejects,
    # making it easier to assert on the exact error.
    expression = f"""
    (async () => {{
        try {{
            const c = await navigator.credentials.get({CREDENTIAL_OPTIONS});
            return {{
                "status": "success",
                "type": c.type,
                "id": c.id,
                // token might be in different places depending on implementation,
                // we just return the whole object serialization or token if it exists.
                "token": c.token || (c.data ? new TextDecoder().decode(c.data) : null)
            }};
        }} catch (e) {{
            return {{
                "status": "error",
                "name": e.name,
                "message": e.message
            }};
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
            },
        },
    )
    return result["result"]


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
    assert result["value"]["status"] == "error"
    assert result["value"]["name"] == "NotAllowedError"


@pytest.mark.asyncio
async def test_digital_credentials_wait_then_decline(
    websocket, context_id, url_secure_context
):
    await goto_url(websocket, context_id, url_secure_context)

    # Set behavior to wait
    resp = await execute_command(
        websocket,
        {
            "method": "digitalCredentials.setVirtualWalletBehavior",
            "params": {
                "context": context_id,
                "action": "wait",
            },
        },
    )
    assert resp == {}

    # Trigger request. It should hang, so we don't await the result immediately.
    task = asyncio.create_task(trigger_credentials_get(websocket, context_id))

    # Wait a bit to ensure it is hanging
    await asyncio.sleep(1)
    assert not task.done()

    # Now change behavior to decline
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

    # The pending request should now resolve (fail)
    result = await task
    assert result["value"]["status"] == "error"
    assert result["value"]["name"] == "NotAllowedError"


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
    assert result["value"]["status"] == "success"
    # The actual structure of the returned credential might vary,
    # but it should contain the token we passed.
    # In some implementations, c.token is the token.
    # We assert that the token is present in the returned value.
    assert "mock_token_123" in str(result["value"])
