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
from test_helpers import *


@pytest.mark.asyncio
async def test_subscribeForUnknownContext_exceptionReturned(websocket):
    with pytest.raises(Exception) as exception_info:
        await execute_command(
            websocket, {
                "method": "session.subscribe",
                "params": {
                    "events": ["browsingContext.load"],
                    "contexts": ["UNKNOWN_CONTEXT_ID"]
                }
            })
    recursive_compare(
        {
            'error': 'no such frame',
            'message': 'Context UNKNOWN_CONTEXT_ID not found'
        }, exception_info.value.args[0])


@pytest.mark.asyncio
async def test_subscribeWithoutContext_subscribesToEventsInAllContexts(
        websocket, context_id):
    result = await execute_command(
        websocket, {
            "method": "session.subscribe",
            "params": {
                "events": ["browsingContext.load"]
            }
        })
    assert result == {}

    # Navigate to some page.
    await send_JSON_command(
        websocket, {
            "id": get_next_command_id(),
            "method": "browsingContext.navigate",
            "params": {
                "url": "data:text/html,<h2>test</h2>",
                "wait": "complete",
                "context": context_id
            }
        })

    # Wait for `browsingContext.load` event.
    resp = await read_JSON_message(websocket)
    assert resp["method"] == "browsingContext.load"
    assert resp["params"]["context"] == context_id


@pytest.mark.asyncio
async def test_subscribeWithContext_subscribesToEventsInGivenContext(
        websocket, context_id):
    result = await execute_command(
        websocket, {
            "method": "session.subscribe",
            "params": {
                "events": ["browsingContext.load"],
                "contexts": [context_id]
            }
        })
    assert result == {}

    # Navigate to some page.
    await send_JSON_command(
        websocket, {
            "id": get_next_command_id(),
            "method": "browsingContext.navigate",
            "params": {
                "url": "data:text/html,<h2>test</h2>",
                "wait": "complete",
                "context": context_id
            }
        })

    # Wait for `browsingContext.load` event.
    resp = await read_JSON_message(websocket)
    assert resp["method"] == "browsingContext.load"
    assert resp["params"]["context"] == context_id


@pytest.mark.asyncio
async def test_subscribeWithContext_subscribesToEventsInNestedContext(
        websocket, context_id, page_with_nested_iframe_url):
    await subscribe(websocket, "browsingContext.contextCreated")

    # Navigate to some page.
    await send_JSON_command(
        websocket, {
            "id": get_next_command_id(),
            "method": "browsingContext.navigate",
            "params": {
                "url": page_with_nested_iframe_url,
                "wait": "complete",
                "context": context_id
            }
        })

    # Wait for `browsingContext.load` event.
    resp = await read_JSON_message(websocket)
    recursive_compare(
        {
            "method": "browsingContext.contextCreated",
            "params": {
                "context": any_string,
                "url": "about:blank",
                "children": None,
                "parent": context_id
            }
        }, resp)


@pytest.mark.asyncio
async def test_subscribeToNestedContext_subscribesToTopLevelContext(
        websocket, context_id, iframe_id):
    await subscribe(websocket, "log.entryAdded", iframe_id)

    await send_JSON_command(
        websocket, {
            "method": "script.evaluate",
            "params": {
                "expression": "console.log('SOME_MESSAGE')",
                "target": {
                    "context": context_id
                },
                "awaitPromise": True
            }
        })

    # Assert event received.
    resp = await read_JSON_message(websocket)
    recursive_compare({
        "method": "log.entryAdded",
        "params": any_value,
    }, resp)


@pytest.mark.asyncio
async def test_subscribeToNestedContextAndUnsubscribeFromTopLevelContext_unsubscribedFromTopLevelContext(
        websocket, context_id, iframe_id):
    await subscribe(websocket, "log.entryAdded", iframe_id)
    await execute_command(
        websocket, {
            "method": "session.unsubscribe",
            "params": {
                "events": ["log.entryAdded"],
                "contexts": [context_id]
            }
        })

    # Assert unsubscribed from top level context.
    command_id = await send_JSON_command(
        websocket, {
            "method": "script.evaluate",
            "params": {
                "expression": "console.log('SOME_MESSAGE')",
                "target": {
                    "context": context_id
                },
                "awaitPromise": True
            }
        })

    # Assert evaluate script is ended without any events before.
    resp = await read_JSON_message(websocket)
    recursive_compare({'id': command_id, 'result': any_value}, resp)

    # Assert unsubscribed from nested context.
    command_id = await send_JSON_command(
        websocket, {
            "method": "script.evaluate",
            "params": {
                "expression": "console.log('SOME_MESSAGE')",
                "target": {
                    "context": iframe_id
                },
                "awaitPromise": True
            }
        })

    # Assert evaluate script is ended without any events before.
    resp = await read_JSON_message(websocket)
    recursive_compare({'id': command_id, 'result': any_value}, resp)


@pytest.mark.asyncio
async def test_subscribeToTopLevelContextAndUnsubscribeFromNestedContext_unsubscribedFromTopLevelContext(
        websocket, context_id, iframe_id):
    await subscribe(websocket, "log.entryAdded", context_id)
    await execute_command(
        websocket, {
            "method": "session.unsubscribe",
            "params": {
                "events": ["log.entryAdded"],
                "contexts": [iframe_id]
            }
        })

    # Assert unsubscribed from top level context.
    command_id = await send_JSON_command(
        websocket, {
            "method": "script.evaluate",
            "params": {
                "expression": "console.log('SOME_MESSAGE')",
                "target": {
                    "context": context_id
                },
                "awaitPromise": True
            }
        })

    # Assert evaluate script is ended without any events before.
    resp = await read_JSON_message(websocket)
    recursive_compare({'id': command_id, 'result': any_value}, resp)

    # Assert unsubscribed from nested context.
    command_id = await send_JSON_command(
        websocket, {
            "method": "script.evaluate",
            "params": {
                "expression": "console.log('SOME_MESSAGE')",
                "target": {
                    "context": iframe_id
                },
                "awaitPromise": True
            }
        })

    # Assert evaluate script is ended without any events before.
    resp = await read_JSON_message(websocket)
    recursive_compare({'id': command_id, 'result': any_value}, resp)


@pytest.mark.asyncio
async def test_subscribeWithContext_doesNotSubscribeToEventsInAnotherContexts(
        websocket, context_id, another_context_id):
    # 1. Get 2 contexts.
    # 2. Subscribe to event `browsingContext.load` on the first one.
    # 3. Navigate waiting complete loading in both contexts.
    # 4. Verify `browsingContext.load` emitted only for the first context.

    await subscribe(websocket, ["browsingContext.load"], [context_id])

    # 3.1 Navigate first context.
    command_id_1 = get_next_command_id()
    await send_JSON_command(
        websocket, {
            "id": command_id_1,
            "method": "browsingContext.navigate",
            "params": {
                "url": "data:text/html,<h2>test</h2>",
                "wait": "complete",
                "context": context_id
            }
        })
    # 4.1 Verify `browsingContext.load` is emitted for the first context.
    resp = await read_JSON_message(websocket)
    assert resp["method"] == "browsingContext.load"
    assert resp["params"]["context"] == context_id

    # Verify first navigation finished.
    resp = await read_JSON_message(websocket)
    assert resp["id"] == command_id_1

    # 3.2 Navigate second context.
    command_id_2 = get_next_command_id()
    await send_JSON_command(
        websocket, {
            "id": command_id_2,
            "method": "browsingContext.navigate",
            "params": {
                "url": "data:text/html,<h2>test</h2>",
                "wait": "complete",
                "context": another_context_id
            }
        })

    # 4.2 Verify second navigation finished without emitting
    # `browsingContext.load`.
    resp = await read_JSON_message(websocket)
    assert resp["id"] == command_id_2


@pytest.mark.asyncio
async def test_subscribeToOneChannel_eventReceivedWithProperChannel(
        websocket, context_id):
    # Subscribe and unsubscribe in `CHANNEL_1`.
    await execute_command(
        websocket, {
            "method": "session.subscribe",
            "channel": "CHANNEL_1",
            "params": {
                "events": ["log.entryAdded"]
            }
        })
    await execute_command(
        websocket, {
            "method": "session.unsubscribe",
            "channel": "CHANNEL_1",
            "params": {
                "events": ["log.entryAdded"]
            }
        })

    # Subscribe in `CHANNEL_2`.
    await execute_command(
        websocket, {
            "method": "session.subscribe",
            "channel": "CHANNEL_2",
            "params": {
                "events": ["log.entryAdded"]
            }
        })

    await send_JSON_command(
        websocket, {
            "method": "script.evaluate",
            "params": {
                "expression": "console.log('SOME_MESSAGE')",
                "target": {
                    "context": context_id
                },
                "awaitPromise": True
            }
        })

    # Assert event received in `CHANNEL_2`.
    resp = await read_JSON_message(websocket)
    recursive_compare(
        {
            "method": "log.entryAdded",
            "params": any_value,
            "channel": "CHANNEL_2"
        }, resp)


@pytest.mark.asyncio
async def test_subscribeToMultipleChannels_eventsReceivedInProperOrder(
        websocket, context_id):
    empty_channel = ""
    channel_2 = "999_SECOND_SUBSCRIBED_CHANNEL"
    channel_3 = "000_THIRD_SUBSCRIBED_CHANNEL"
    channel_4 = "555_FOURTH_SUBSCRIBED_CHANNEL"

    await subscribe(websocket, "log.entryAdded", None, empty_channel)
    await subscribe(websocket, "log.entryAdded", None, channel_2)
    await subscribe(websocket, "log.entryAdded", context_id, channel_3)
    await subscribe(websocket, "log.entryAdded", context_id, channel_4)
    # Re-subscribe with specific BrowsingContext.
    await subscribe(websocket, "log.entryAdded", context_id, channel_3)
    # Re-subscribe.
    await subscribe(websocket, "log.entryAdded", None, channel_2)

    await execute_command(
        websocket, {
            "method": "session.subscribe",
            "channel": channel_3,
            "params": {
                "events": ["log.entryAdded"]
            }
        })
    # Subscribe with a context. The initial subscription should still have
    # higher priority.
    await execute_command(
        websocket, {
            "method": "session.subscribe",
            "channel": channel_2,
            "params": {
                "events": ["log.entryAdded"],
                "cointext": context_id
            }
        })

    await send_JSON_command(
        websocket, {
            "method": "script.evaluate",
            "channel": "SOME_OTHER_CHANNEL",
            "params": {
                "expression": "console.log('SOME_MESSAGE')",
                "target": {
                    "context": context_id
                },
                "awaitPromise": True
            }
        })

    # Empty string channel is considered as no channel provided.
    resp = await read_JSON_message(websocket)
    recursive_compare({"method": "log.entryAdded", "params": any_value}, resp)

    resp = await read_JSON_message(websocket)
    recursive_compare(
        {
            "method": "log.entryAdded",
            "channel": channel_2,
            "params": any_value
        }, resp)

    resp = await read_JSON_message(websocket)
    recursive_compare(
        {
            "method": "log.entryAdded",
            "channel": channel_3,
            "params": any_value
        }, resp)

    resp = await read_JSON_message(websocket)
    recursive_compare(
        {
            "method": "log.entryAdded",
            "channel": channel_4,
            "params": any_value
        }, resp)


@pytest.mark.asyncio
async def test_subscribeWithoutContext_bufferedEventsFromNotClosedContextsAreReturned(
        websocket, context_id, another_context_id):
    await execute_command(
        websocket, {
            "method": "script.evaluate",
            "channel": "SOME_OTHER_CHANNEL",
            "params": {
                "expression": "console.log('SOME_MESSAGE')",
                "target": {
                    "context": context_id
                },
                "awaitPromise": True
            }
        })

    await execute_command(
        websocket, {
            "method": "script.evaluate",
            "channel": "SOME_OTHER_CHANNEL",
            "params": {
                "expression": "console.log('ANOTHER_MESSAGE')",
                "target": {
                    "context": another_context_id
                },
                "awaitPromise": True
            }
        })

    await execute_command(
        websocket, {
            "method": "browsingContext.close",
            "params": {
                "context": another_context_id
            }
        })

    command_id = await send_JSON_command(websocket, {
        "method": "session.subscribe",
        "params": {
            "events": ["log.entryAdded"]
        }
    })

    # Assert only message from not closed context is received.
    resp = await read_JSON_message(websocket)
    recursive_compare(
        {
            "method": "log.entryAdded",
            "params": {
                "level": "info",
                "source": {
                    "realm": any_value,
                    "context": context_id
                },
                "text": "SOME_MESSAGE",
                "timestamp": any_value,
                "stackTrace": any_value,
                "type": "console",
                "method": "log",
                "args": [{
                    "type": "string",
                    "value": "SOME_MESSAGE"
                }]
            }
        }, resp)

    # Assert no more events were buffered.
    resp = await read_JSON_message(websocket)
    recursive_compare({'id': command_id, 'result': any_value}, resp)
