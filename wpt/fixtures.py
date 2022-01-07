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
import os

import pytest
import websockets

from wpt.wpt_harness.bidi_session import BidiSession


@pytest.fixture(autouse=True)
async def before_each_test(websocket, bidi_session):
    # Initialize all the necessary entities.
    # This method can be used for browser state preparation.
    assert True

@pytest.fixture
async def websocket():
    port = os.getenv('PORT', 8080)
    url = f'ws://localhost:{port}'
    async with websockets.connect(url) as connection:
        yield connection


@pytest.fixture
def bidi_session(websocket):
    return BidiSession(websocket)

@pytest.fixture
def wait_for_event(bidi_session):
    """Wait until the BiDi session emits an event and resolve the event data."""
    return bidi_session.wait_for_event


@pytest.fixture
def send_blocking_command(bidi_session):
    """Send a blocking command that awaits until the BiDi response has been received."""
    return bidi_session.send_blocking_command




@pytest.fixture
def send_command(bidi_session):
    """Send a command to the remote server"""
    return bidi_session.send_command


@pytest.fixture
async def context_id(bidi_session):
    # Note: there can be a race condition between the initially created context's
    # events and following subscription commands. Sometimes subscribe is called
    # before the initial context emitted `browsingContext.contextCreated`,
    # `browsingContext.domContentLoaded`, or `browsingContext.load` events,
    # which makes events verification way harder. The navigation command (goto_url) guarantees
    # there will be no follow-up events, as it uses `interactive` flag.
    # TODO: find a way to avoid mentioned race condition properly.

    result = await bidi_session.send_blocking_command("browsingContext.getTree",
                                                      {})
    open_context_id = result['contexts'][0]['context']
    await goto_url(bidi_session, open_context_id, "about:blank")
    return open_context_id




@pytest.fixture
def recursive_compare():
    def _recursive_compare(expected, actual, ignore_attributes):
        assert type(expected) == type(actual)
        if type(expected) is list:
            assert len(expected) == len(actual)
            for index, val in enumerate(expected):
                _recursive_compare(expected[index], actual[index],
                                   ignore_attributes)
            return

        if type(expected) is dict:
            assert expected.keys() == actual.keys()
            for index, val in enumerate(expected):
                if val not in ignore_attributes:
                    _recursive_compare(expected[val], actual[val],
                                       ignore_attributes)
            return

        assert expected == actual

    return _recursive_compare


async def goto_url(bidi_session, context_id, url):
    # Open given URL in the given context.
    await bidi_session.send_blocking_command("browsingContext.navigate", {
        "url": url,
        "context": context_id,
        "wait": "interactive"})
