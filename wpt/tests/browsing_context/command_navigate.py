# Copyright 2021 Google LLC.
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


@pytest.mark.asyncio
async def test_browsing_context_navigate_wait_none(bidi_session, wait_for_event,
      context_id):
    await bidi_session.session.subscribe(
        events=["browsingContext.domContentLoaded", "browsingContext.load"])

    page_with_an_image_url = "data:text/html,<img src='data:image/png;base64, iVBORw0KGgoAAAANSUhEUgAAAAUA AAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO 9TXL0Y4OHwAAAABJRU5ErkJggg=='>"

    create_command_promise = await bidi_session.send_command(
        "browsingContext.navigate", {
            "url": page_with_an_image_url,
            "wait": "none",
            "context": context_id})

    load_event_promise = wait_for_event("browsingContext.load")
    dom_content_loaded_event_promise = wait_for_event(
        "browsingContext.domContentLoaded")

    assert create_command_promise.done() is False
    assert load_event_promise.done() is False
    assert dom_content_loaded_event_promise.done() is False

    create_command_result = await create_command_promise
    navigation_id = create_command_result["navigation"]
    assert create_command_result == {
        "navigation": navigation_id,
        "url": page_with_an_image_url}

    # Verify event order.
    assert load_event_promise.done() is False
    assert dom_content_loaded_event_promise.done() is False

    dom_content_loaded_event = await dom_content_loaded_event_promise
    assert dom_content_loaded_event == {
        "context": context_id,
        "navigation": navigation_id}

    # Verify event was not yet emitted.
    assert load_event_promise.done() is False

    # Wait for `browsingContext.load` event.
    load_event = await load_event_promise
    assert load_event == {
        "context": context_id,
        "navigation": navigation_id}
