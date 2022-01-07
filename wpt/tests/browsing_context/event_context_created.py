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
import logging

import pytest


@pytest.mark.asyncio
async def test_browsing_context_context_created_emitted(bidi_session,
      wait_for_event, recursive_compare):

    await bidi_session.session.subscribe(
        events=["browsingContext.contextCreated"])

    context_created_event_promise = wait_for_event("browsingContext.contextCreated")

    create_command_promise = await bidi_session.send_command(
        "browsingContext.create", {})

    context_created_event = await context_created_event_promise

    recursive_compare({
        "context": "__any_value__",
        "children": [],
        "url": "__any_value__"},
        context_created_event, ["url", "context"])

    await create_command_promise
