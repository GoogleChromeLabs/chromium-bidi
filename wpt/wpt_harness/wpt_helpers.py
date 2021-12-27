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

import asyncio
import json
import os
from typing import Any, Awaitable, Mapping

import pytest
import websockets

_command_counter = 1
_pending_commands = {}
_event_listeners = {}


async def _read_messages_task(websocket) -> None:
    async for msg in websocket:
        data = json.loads(msg)
        if "id" in data and data["id"] in _pending_commands:
            _pending_commands[data["id"]].set_result(data["result"])
        elif "method" in data:
            if data["method"] in _event_listeners:
                for listener in _event_listeners[data["method"]]:
                    listener(data["method"], data["params"])


@pytest.fixture
def wait_for_event(bidi_session):
    """Send a blocking command that awaits until the BiDi response has been received."""

    def wait_for_event(event_name):
        future = asyncio.Future()

        def on_event(method, data):
            remove_listener()
            future.set_result(data)

        remove_listener = bidi_session.add_event_listener(event_name, on_event)
        return future

    return wait_for_event


@pytest.fixture
def send_blocking_command(send_command):
    """Send a blocking command that awaits until the BiDi response has been received."""

    async def send_blocking_command(command: str, params: Mapping[str, Any]) -> \
          Mapping[str, Any]:
        future_response = await send_command(command, params)
        return await future_response

    return send_blocking_command


@pytest.fixture
def send_command(websocket):
    # read_message_task.start()
    task = asyncio.get_event_loop().create_task(
        _read_messages_task(websocket))

    async def send_command(
          method: str,
          params: Mapping[str, Any]
    ) -> Awaitable[Mapping[str, Any]]:
        command_id = get_next_command_id()
        assert command_id not in _pending_commands
        await send_JSON_command(websocket, {
            "id": command_id,
            "method": method,
            "params": params
        })
        _pending_commands[command_id] = asyncio.Future()
        return _pending_commands[command_id]

    return send_command


def get_next_command_id():
    global _command_counter
    _command_counter += 1
    return _command_counter


@pytest.fixture
async def websocket():
    port = os.getenv('PORT', 8080)
    url = f'ws://localhost:{port}'
    async with websockets.connect(url) as connection:
        yield connection


# noinspection PyUnusedFunction
@pytest.fixture
async def context_id(send_blocking_command):
    # Note: there can be a race condition between initially created context's
    # events and following subscription commands. Sometimes subscribe is called
    # before the initial context emitted `browsingContext.contextCreated`,
    # `browsingContext.domContentLoaded`, or `browsingContext.load` events,
    # which makes events verification way harder. Navigation command guarantees
    # there will be no follow-up events, as it uses `interactive` flag.
    # TODO: find a way to avoid mentioned race condition properly.

    open_context_id = await get_open_context_id(send_blocking_command)
    await goto_url(send_blocking_command, open_context_id, "about:blank")
    return open_context_id


@pytest.fixture(autouse=True)
async def before_each_test(websocket):
    # This method can be used for browser state preparation.
    assert True


async def subscribe(websocket, event_names, context_ids=None):
    command = {
        "method": "session.subscribe",
        "params": {
            "events": event_names}}

    if context_ids is not None:
        command["params"]["contexts"] = context_ids

    await execute_command(websocket, command)


@pytest.fixture
def recursive_compare():
    def recursive_compare(expected, actual, ignore_attributes):
        assert type(expected) == type(actual)
        if type(expected) is list:
            assert len(expected) == len(actual)
            for index, val in enumerate(expected):
                recursive_compare(expected[index], actual[index],
                                  ignore_attributes)
            return

        if type(expected) is dict:
            assert expected.keys() == actual.keys()
            for index, val in enumerate(expected):
                if val not in ignore_attributes:
                    recursive_compare(expected[val], actual[val],
                                      ignore_attributes)
            return

        assert expected == actual

    return recursive_compare


@pytest.fixture
def bidi_session(send_blocking_command, send_command):
    return BidiSession(send_blocking_command, send_command)


# Returns an id of an open context.
async def get_open_context_id(send_blocking_command):
    result = await send_blocking_command("browsingContext.getTree", {})
    return result['contexts'][0]['context']


async def send_JSON_command(websocket, command):
    await websocket.send(json.dumps(command))


async def read_JSON_message(websocket):
    return json.loads(await websocket.recv())


# Open given URL in the given context.
async def goto_url(send_blocking_command, context_id, url):
    await send_blocking_command("browsingContext.navigate", {
        "url": url,
        "context": context_id,
        "wait": "interactive"})

# # noinspection PySameParameterValue
# async def execute_command(websocket, command, result_field='result'):
#     command_id = get_next_command_id()
#     command['id'] = command_id
#
#     await send_JSON_command(websocket, command)
#
#     while True:
#         # Wait for the command to be finished.
#         resp = await read_JSON_message(websocket)
#         if 'id' in resp and resp['id'] == command_id:
#             assert result_field in resp
#             return resp[result_field]


class BidiSession:
    def __init__(self, send_blocking_command, send_command):
        self.session = Session(send_blocking_command)
        self._send_command = send_command

    async def send_command(self, method_name, params):
        return await self._send_command(method_name, params)

    def add_event_listener(self, name, fn):
        """Add a listener for the event with a given name.

        If name is None, the listener is called for all messages that are not otherwise
        handled.

        :param name: Name of event to listen for or None to register a default handler
        :param fn: Async callback function that receives event data

        :return: Function to remove the added listener
        """
        if name not in _event_listeners:
            _event_listeners[name] = []
        _event_listeners[name].append(fn)

        return lambda: _event_listeners[name].remove(fn)


class Session:
    def __init__(self, send_blocking_command):
        self._send_blocking_command = send_blocking_command

    async def subscribe(self, events):
        await self._send_blocking_command("session.subscribe",
                                          {"events": events})
