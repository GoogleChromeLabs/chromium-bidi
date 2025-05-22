#   Copyright 2025 Google LLC.
#   Copyright (c) Microsoft Corporation.
#
#   Licensed under the Apache License, Version 2.0 (the "License");
#   you may not use this file except in compliance with the License.
#   You may obtain a copy of the License at
#
#       http://www.apache.org/licenses/LICENSE-2.0
#
#   Unless required by applicable law or agreed to in writing, software
#   distributed under the License is distributed on an "AS IS" BASIS,
#   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#   See the License for the specific language governing permissions and
#   limitations under the License.
#

import pytest
from test_helpers import (ANY_TIMESTAMP, ANY_UUID, goto_url, send_JSON_command,
                          subscribe, wait_for_event)

CONTENT = "SOME_FILE_CONTENT"
FILENAME = 'some_file_name.txt'


@pytest.fixture(params=['data', 'http'])
def file_url(url_download, request):
    """Return a URL that triggers a download."""
    if request.param == 'data':
        return f"data:text/plain;charset=utf-8,{CONTENT}"

    return url_download(FILENAME, CONTENT)


@pytest.mark.asyncio
async def test_browsing_context_download_will_begin(websocket, context_id,
                                                    file_url, html):
    page_url = html(
        f"""<a id="download_link" href="{file_url}" download="{FILENAME}">Download</a>"""
    )
    await goto_url(websocket, context_id, page_url)

    await subscribe(websocket, ["browsingContext.downloadWillBegin"])

    await send_JSON_command(
        websocket, {
            'method': 'script.evaluate',
            'params': {
                'expression': 'download_link.click();',
                'awaitPromise': True,
                'target': {
                    'context': context_id,
                },
                'userActivation': True
            }
        })

    event = await wait_for_event(websocket,
                                 "browsingContext.downloadWillBegin")

    assert event == {
        'method': 'browsingContext.downloadWillBegin',
        'params': {
            'context': context_id,
            'navigation': ANY_UUID,
            'suggestedFilename': FILENAME,
            'timestamp': ANY_TIMESTAMP,
            'url': file_url
        },
        'type': 'event',
    }


@pytest.mark.asyncio
async def test_browsing_context_download_finished(websocket,
                                                  test_headless_mode,
                                                  context_id, file_url, html):
    if test_headless_mode == "old":
        pytest.xfail("Old headless cancels downloads")

    page_url = html(
        f"""<a id="download_link" href="{file_url}" download="{FILENAME}">Download</a>"""
    )
    await goto_url(websocket, context_id, page_url)

    await subscribe(websocket, [
        "browsingContext.downloadWillBegin", "browsingContext.downloadFinished"
    ])

    await send_JSON_command(
        websocket, {
            'method': 'script.evaluate',
            'params': {
                'expression': 'download_link.click();',
                'awaitPromise': True,
                'target': {
                    'context': context_id,
                },
                'userActivation': True
            }
        })

    event = await wait_for_event(websocket,
                                 "browsingContext.downloadWillBegin")

    assert event == {
        'method': 'browsingContext.downloadWillBegin',
        'params': {
            'context': context_id,
            'navigation': ANY_UUID,
            'suggestedFilename': FILENAME,
            'timestamp': ANY_TIMESTAMP,
            'url': file_url
        },
        'type': 'event',
    }

    navigation_id = event['params']['navigation']

    event = await wait_for_event(websocket, "browsingContext.downloadFinished")
    assert event == {
        'method': 'browsingContext.downloadFinished',
        'params': {
            'context': context_id,
            'navigation': navigation_id,
            'status': 'complete',
            'filepath': None,
            'timestamp': ANY_TIMESTAMP,
            'url': file_url
        },
        'type': 'event',
    }
