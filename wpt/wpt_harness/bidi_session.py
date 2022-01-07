import asyncio
import json
from typing import Any, Awaitable, Mapping

from wpt.wpt_harness.session import Session


class BidiSession:
    def __init__(self, websocket):
        self._websocket = websocket
        self.session = Session(self.send_blocking_command)

        self._command_counter = 1
        self._event_listeners = {}
        self._pending_commands = {}

        # read_message_task.start()
        asyncio.get_event_loop().create_task(
            self._read_messages_task())

    async def _send_JSON_command(self, command):
        await self._websocket.send(json.dumps(command))

    def _get_next_command_id(self):
        self._command_counter += 1
        return self._command_counter

    async def _read_messages_task(self) -> None:
        async for msg in self._websocket:
            data = json.loads(msg)
            if "id" in data and data["id"] in self._pending_commands:
                self._pending_commands[data["id"]].set_result(data["result"])
            elif "method" in data:
                if data["method"] in self._event_listeners:
                    for listener in self._event_listeners[data["method"]]:
                        listener(data["method"], data["params"])

    async def goto_url(self, context_id, url):
        await self.send_blocking_command("browsingContext.navigate", {
            "url": url,
            "context": context_id,
            "wait": "interactive"})

    def wait_for_event(self, event_name):
        future = asyncio.Future()

        def on_event(method, data):
            remove_listener()
            future.set_result(data)

        remove_listener = self.add_event_listener(event_name, on_event)
        return future

    async def send_command(
          self,
          method: str,
          params: Mapping[str, Any]
    ) -> Awaitable[Mapping[str, Any]]:
        command_id = self._get_next_command_id()
        assert command_id not in self._pending_commands
        await self._send_JSON_command({
            "id": command_id,
            "method": method,
            "params": params
        })
        self._pending_commands[command_id] = asyncio.Future()
        return self._pending_commands[command_id]

    async def send_blocking_command(self, command, params):
        future_response = await self.send_command(command, params)
        return await future_response

    def add_event_listener(self, name, fn):
        # Add a listener for the event with a given name.
        #
        # If name is None, the listener is called for all messages that are not otherwise
        # handled.
        #
        # :param name: Name of event to listen for or None to register a default handler
        # :param fn: Async callback function that receives event data
        #
        # :return: Function to remove the added listener

        if name not in self._event_listeners:
            self._event_listeners[name] = []
        self._event_listeners[name].append(fn)

        return lambda: self._event_listeners[name].remove(fn)

    async def send_command(
          self,
          method: str,
          params: Mapping[str, Any]
    ) -> Awaitable[Mapping[str, Any]]:
        command_id = self._get_next_command_id()
        assert command_id not in self._pending_commands
        await self._send_JSON_command({
            "id": command_id,
            "method": method,
            "params": params
        })
        self._pending_commands[command_id] = asyncio.Future()
        return self._pending_commands[command_id]
