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

    create_command_promise = await bidi_session.send_command(
        "browsingContext.navigate", {
            "url": "data:text/html,<h2>test</h2>",
            "wait": "none",
            "context": context_id})

    on_load_promise = wait_for_event("browsingContext.load")
    on_dom_content_loaded_promise = wait_for_event(
        "browsingContext.domContentLoaded")

    assert create_command_promise.done() is False
    assert on_load_promise.done() is False
    assert on_dom_content_loaded_promise.done() is False

    create_command_result = await create_command_promise
    navigation_id = create_command_result["navigation"]
    assert create_command_result == {
        "navigation": navigation_id,
        "url": "data:text/html,<h2>test</h2>"}

    # Verify events order.
    assert on_load_promise.done() is False
    assert on_dom_content_loaded_promise.done() is False

    # Wait for `browsingContext.load` event.
    load_event = await on_load_promise
    assert load_event == {
        "context": context_id,
        "navigation": navigation_id}

    # Verify events was not yet emitted.
    assert on_dom_content_loaded_promise.done() is False

    dom_content_loaded_event = await on_dom_content_loaded_promise
    assert dom_content_loaded_event == {
        "context": context_id,
        "navigation": navigation_id}
