#  Copyright 2025 Google LLC.
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
from test_helpers import (goto_url, read_JSON_message, send_JSON_command,
                          subscribe)

from . import wait_for_prefetch_event_with_timeout


@pytest.mark.asyncio
async def test_speculation_subscribe_to_all_events(websocket, context_id):
    """Test subscribing to all speculation events."""
    subscription_response = await subscribe(websocket, ["speculation"])
    assert "subscription" in subscription_response
    assert isinstance(subscription_response["subscription"], str)


@pytest.mark.asyncio
async def test_speculation_subscribe_to_prefetch_status_updated(
        websocket, context_id):
    """Test subscribing specifically to speculation.prefetchStatusUpdated events."""
    subscription_response = await subscribe(
        websocket, ["speculation.prefetchStatusUpdated"])
    assert "subscription" in subscription_response
    assert isinstance(subscription_response["subscription"], str)


@pytest.mark.asyncio
async def test_speculation_unsubscribe(websocket, context_id):
    """Test unsubscribing from speculation events."""
    # First subscribe
    subscribe_response = await subscribe(websocket, ["speculation"])
    subscription_id = subscribe_response["subscription"]

    # Then unsubscribe
    await send_JSON_command(
        websocket, {
            "id": 3,
            "method": "session.unsubscribe",
            "params": {
                "subscriptions": [subscription_id]
            }
        })

    resp = await read_JSON_message(websocket)
    assert resp["id"] == 3
    assert resp["type"] == "success"


@pytest.mark.asyncio
async def test_speculation_context_subscription(websocket, context_id):
    """Test subscribing to speculation events for a specific context."""
    subscription_response = await subscribe(
        websocket, ["speculation.prefetchStatusUpdated"],
        context_ids=[context_id])
    assert "subscription" in subscription_response
    assert isinstance(subscription_response["subscription"], str)


@pytest.mark.asyncio
async def test_speculation_subscription_with_invalid_event(
        websocket, context_id):
    """Test that subscribing to invalid speculation events fails with an error."""
    await send_JSON_command(
        websocket, {
            "id": 100,
            "method": "session.subscribe",
            "params": {
                "events": ["speculation.invalidEvent"]
            }
        })

    resp = await read_JSON_message(websocket)
    assert resp["id"] == 100
    # Should fail with an error since "speculation.invalidEvent" is not a valid event
    assert resp["type"] == "error"
    assert "error" in resp
    assert "message" in resp


@pytest.mark.asyncio
async def test_speculation_rules_generate_events(websocket, context_id, html):
    """Test that speculation rules actually generate prefetch status events."""
    await subscribe(websocket, ["speculation.prefetchStatusUpdated"])

    # Create a simple target page to prefetch
    target_page = html("""
        <h1>Target Page</h1>
        <p>This is the page that should be prefetched</p>
    """)

    # Create a main page with speculation rules pointing to the target page
    main_page = html(f"""
        <head>
            <title>Speculation Rules Test</title>
        </head>
        <body>
            <h1>Speculation Rules Test</h1>
            <a href="{target_page}" id="prefetch-page">Go to Target Page</a>

            <script type="speculationrules">
            {{
                "prefetch": [
                    {{
                        "eagerness": "immediate",
                        "where": {{"href_matches": "/*"}}
                    }}
                ]
            }}
            </script>
        </body>
    """)

    await goto_url(websocket, context_id, main_page)

    # Wait for prefetch events - expecting multiple events (pending -> ready)
    events = []

    # Collect events for a reasonable time period
    for i in range(3):
        event = await wait_for_prefetch_event_with_timeout(websocket, 2.0)
        if event is None:
            break  # No more events
        events.append(event)

    # Verify all events have correct structure
    for event in events:
        assert event["type"] == "event"
        assert event["method"] == "speculation.prefetchStatusUpdated"

        params = event["params"]
        assert "url" in params
        assert "status" in params
        assert "context" in params
        assert params["status"] in ["pending", "ready", "success", "failure"]

    # Verify the correct order of events
    assert len(
        events) >= 2, "Expected at least 2 prefetch events (pending and ready)"
    assert events[0]["params"]["status"] == "pending"
    assert events[1]["params"]["status"] == "ready"
