# Copyright 2025 Google LLC.
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
from test_helpers import (ANY_SHARED_ID, AnyExtending, execute_command,
                          goto_url, send_JSON_command, subscribe,
                          wait_for_event)


@pytest.mark.asyncio
async def test_file_dialog_opened_event(websocket, context_id, html):
    await goto_url(websocket, context_id, html("<input id=input type=file>"))

    await subscribe(websocket, ["input.fileDialogOpened"])

    await send_JSON_command(
        websocket, {
            "method": "script.evaluate",
            "params": {
                "expression": "input.click()",
                "target": {
                    "context": context_id,
                },
                "awaitPromise": False,
                "userActivation": True
            }
        })

    response = await wait_for_event(websocket, 'input.fileDialogOpened')
    assert response == {
        'method': 'input.fileDialogOpened',
        'params': {
            'context': context_id,
            'element': {
                'sharedId': ANY_SHARED_ID,
            },
            'multiple': False,
        },
        'type': 'event',
    }
    shared_id = response['params']['element']['sharedId']

    # Assert the `sharedId` is correct one:
    response = await execute_command(
        websocket, {
            "method": "script.callFunction",
            "params": {
                "functionDeclaration": "(element)=>element",
                "awaitPromise": True,
                "target": {
                    "context": context_id,
                },
                "arguments": [{
                    "sharedId": shared_id,
                }],
            }
        })

    assert response == AnyExtending({
        "type": "success",
        "result": {
            'sharedId': shared_id,
            'type': 'node',
            'value': {
                'localName': 'input',
                'attributes': {
                    'type': 'file',
                }
            }
        }
    })


@pytest.mark.asyncio
@pytest.mark.parametrize('capabilities', [
    {
        'unhandledPromptBehavior': 'dismiss'
    },
    {
        'unhandledPromptBehavior': 'dismiss and notify'
    },
    {
        'unhandledPromptBehavior': {
            'default': 'dismiss'
        }
    },
    {
        'unhandledPromptBehavior': {
            'file': 'dismiss',
            'default': 'ignore'
        }
    },
    {
        'unhandledPromptBehavior': 'accept'
    },
    {
        'unhandledPromptBehavior': 'accept and notify'
    },
    {
        'unhandledPromptBehavior': {
            'default': 'accept'
        }
    },
    {
        'unhandledPromptBehavior': {
            'file': 'accept',
            'default': 'ignore'
        }
    },
],
                         indirect=True)
async def test_file_unhandled_prompt_behavior_cancel(websocket, context_id,
                                                     url_example):
    await goto_url(websocket, context_id, url_example)

    resp = await execute_command(
        websocket, {
            "method": "script.evaluate",
            "params": {
                "expression": "window.showOpenFilePicker()",
                "target": {
                    "context": context_id,
                },
                "awaitPromise": True,
                "userActivation": True
            }
        })

    assert resp == AnyExtending({
        "type": "exception",
        "exceptionDetails": {
            "text": "AbortError: Failed to execute 'showOpenFilePicker' on 'Window': Intercepted by Page.setInterceptFileChooserDialog()."
        }
    })


@pytest.mark.asyncio
@pytest.mark.parametrize('capabilities', [{}, {
    'unhandledPromptBehavior': 'ignore'
}, {
    'unhandledPromptBehavior': {
        'default': 'ignore'
    }
}, {
    'unhandledPromptBehavior': {
        'file': 'ignore',
        'default': 'dismiss'
    }
}],
                         indirect=True)
async def test_file_unhandled_prompt_behavior_ignore(websocket, context_id,
                                                     url_example):
    """
    The test exploits the fact that the file picker dialog can't be opened
    twice. This is used as an indicator that the dialog was shown.
    """
    await goto_url(websocket, context_id, url_example)

    resp = await execute_command(
        websocket, {
            "method": "script.evaluate",
            "params": {
                "expression": "Promise.all([window.showOpenFilePicker(),window.showOpenFilePicker()])",
                "target": {
                    "context": context_id,
                },
                "awaitPromise": True,
                "userActivation": True
            }
        })

    assert resp == AnyExtending({
        "type": "exception",
        "exceptionDetails": {
            "text": "NotAllowedError: Failed to execute 'showOpenFilePicker' on 'Window': File picker already active."
        }
    })
