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

from uuid import uuid4

import pytest
import pytest_asyncio
from anys import ANY_STR
from test_helpers import (ANY_TIMESTAMP, ANY_UUID, execute_command, goto_url,
                          send_JSON_command, subscribe, wait_for_event)

CONTENT = "SOME_FILE_CONTENT " + str(uuid4())


@pytest_asyncio.fixture
async def prepare_context(websocket, html, downloadable_url, filename):
    async def prepare_context(target_context_id, url=downloadable_url):
        page_url = html(
            f"""<a id="download_link" href="{url}" download="{filename}">Download</a>"""
        )
        await goto_url(websocket, target_context_id, page_url)

        await subscribe(websocket, [
            "browsingContext.downloadWillBegin", "browsingContext.downloadEnd"
        ])

    return prepare_context


@pytest_asyncio.fixture
async def trigger_download(websocket):
    async def trigger_download(target_context_id):
        await send_JSON_command(
            websocket, {
                'method': 'script.evaluate',
                'params': {
                    'expression': 'download_link.click();',
                    'awaitPromise': True,
                    'target': {
                        'context': target_context_id,
                    },
                    'userActivation': True
                }
            })

    return trigger_download


@pytest_asyncio.fixture(params=['default', 'new'],
                        ids=["Default user context", "Custom user context"])
async def target_user_context_id(request, create_user_context):
    if request.param == 'default':
        return 'default'
    return await create_user_context()


@pytest_asyncio.fixture
async def target_context_id(target_user_context_id, context_id,
                            create_context):
    if target_user_context_id == 'default':
        return context_id

    return await create_context(target_user_context_id)


# @pytest.fixture(params=['data'])
@pytest.fixture(params=['data', 'http'])
def downloadable_url(url_download, request, filename):
    """Return a URL that triggers a download."""
    if request.param == 'data':
        return f"data:text/plain;charset=utf-8,{CONTENT}"

    return url_download(filename, CONTENT)


@pytest.fixture
def filename():
    return str(uuid4()) + '.txt'


@pytest.mark.asyncio
async def test_browsing_context_download_will_begin(websocket,
                                                    target_context_id,
                                                    downloadable_url, filename,
                                                    prepare_context,
                                                    trigger_download):
    await prepare_context(target_context_id)
    await trigger_download(target_context_id)

    event = await wait_for_event(websocket,
                                 "browsingContext.downloadWillBegin")

    assert event == {
        'method': 'browsingContext.downloadWillBegin',
        'params': {
            'context': target_context_id,
            'navigation': ANY_UUID,
            'suggestedFilename': filename,
            'timestamp': ANY_TIMESTAMP,
            'url': downloadable_url
        },
        'type': 'event',
    }


@pytest.mark.asyncio
async def test_browsing_context_download_finished_complete(
        websocket, test_headless_mode, target_context_id, downloadable_url,
        filename, prepare_context, trigger_download, target_user_context_id):
    await prepare_context(target_context_id)
    await trigger_download(target_context_id)

    event = await wait_for_event(websocket,
                                 "browsingContext.downloadWillBegin")

    assert event == {
        'method': 'browsingContext.downloadWillBegin',
        'params': {
            'context': target_context_id,
            'navigation': ANY_UUID,
            'suggestedFilename': filename,
            'timestamp': ANY_TIMESTAMP,
            'url': downloadable_url
        },
        'type': 'event',
    }

    navigation_id = event['params']['navigation']

    event = await wait_for_event(websocket, "browsingContext.downloadEnd")

    if test_headless_mode == "old":
        pytest.xfail("Old headless cancels downloads")

    if target_user_context_id != 'default':
        pytest.xfail(
            "Custom user contexts requires explicitly set download destination folder"
        )

    assert event == {
        'method': 'browsingContext.downloadEnd',
        'params': {
            'context': target_context_id,
            'navigation': navigation_id,
            'status': 'complete',
            'filepath': ANY_STR,
            'timestamp': ANY_TIMESTAMP,
            'url': downloadable_url
        },
        'type': 'event',
    }

    # Assert suggested name is used.
    assert event["params"]["filepath"].endswith(filename)

    # Assert the file content is correct.
    with open(event["params"]["filepath"], encoding='utf-8') as file:
        file_content = file.read()
    assert file_content == CONTENT


@pytest.mark.asyncio
async def test_browsing_context_download_finished_canceled(
        websocket, test_headless_mode, url_hang_forever_download,
        target_context_id, get_cdp_session_id, prepare_context,
        trigger_download):
    cdp_session_id = await get_cdp_session_id(target_context_id)

    await prepare_context(target_context_id, url_hang_forever_download())
    await trigger_download(target_context_id)

    event = await wait_for_event(websocket,
                                 "browsingContext.downloadWillBegin")

    assert event == {
        'method': 'browsingContext.downloadWillBegin',
        'params': {
            'context': target_context_id,
            'navigation': ANY_UUID,
            'suggestedFilename': ANY_STR,
            'timestamp': ANY_TIMESTAMP,
            'url': ANY_STR,
        },
        'type': 'event',
    }

    navigation_id = event['params']['navigation']

    if test_headless_mode != "old":
        # Cancel download via CDP. Old headless cancels it automatically.
        await send_JSON_command(
            websocket, {
                "method": "goog:cdp.sendCommand",
                "params": {
                    "method": "Browser.cancelDownload",
                    "params": {
                        "guid": navigation_id
                    },
                    "session": cdp_session_id
                }
            })

    event = await wait_for_event(
        websocket,
        "browsingContext.downloadEnd",
    )
    assert event == {
        'method': 'browsingContext.downloadEnd',
        'params': {
            'context': target_context_id,
            'navigation': navigation_id,
            'status': 'canceled',
            'timestamp': ANY_TIMESTAMP,
            'url': url_hang_forever_download(),
        },
        'type': 'event',
    }


@pytest.mark.asyncio
async def test_browsing_context_download_behavior_deny(websocket,
                                                       target_context_id,
                                                       downloadable_url,
                                                       prepare_context,
                                                       trigger_download):
    await prepare_context(target_context_id)

    await execute_command(
        websocket, {
            'method': 'browser.setDownloadBehavior',
            'params': {
                'downloadBehavior': {
                    'type': 'denied'
                }
            }
        })

    await trigger_download(target_context_id)

    event = await wait_for_event(websocket,
                                 "browsingContext.downloadWillBegin")
    assert event == {
        'method': 'browsingContext.downloadWillBegin',
        'params': {
            'context': target_context_id,
            'navigation': ANY_UUID,
            'suggestedFilename': ANY_STR,
            'timestamp': ANY_TIMESTAMP,
            'url': downloadable_url,
        },
        'type': 'event',
    }
    navigation_id = event['params']['navigation']

    event = await wait_for_event(
        websocket,
        "browsingContext.downloadEnd",
    )
    assert event == {
        'method': 'browsingContext.downloadEnd',
        'params': {
            'context': target_context_id,
            'navigation': navigation_id,
            'status': 'canceled',
            'timestamp': ANY_TIMESTAMP,
            'url': downloadable_url,
        },
        'type': 'event',
    }


@pytest.mark.asyncio
async def test_browsing_context_download_behavior_allowed(
        websocket, target_context_id, downloadable_url, prepare_context,
        trigger_download, target_user_context_id):
    await prepare_context(target_context_id)

    await execute_command(
        websocket, {
            'method': 'browser.setDownloadBehavior',
            'params': {
                'downloadBehavior': {
                    'type': 'allowed',
                }
            }
        })

    await trigger_download(target_context_id)

    event = await wait_for_event(websocket,
                                 "browsingContext.downloadWillBegin")
    assert event == {
        'method': 'browsingContext.downloadWillBegin',
        'params': {
            'context': target_context_id,
            'navigation': ANY_UUID,
            'suggestedFilename': ANY_STR,
            'timestamp': ANY_TIMESTAMP,
            'url': downloadable_url,
        },
        'type': 'event',
    }
    navigation_id = event['params']['navigation']

    if target_user_context_id != 'default':
        pytest.xfail(
            "Custom user contexts requires explicitly set download destination folder"
        )

    event = await wait_for_event(
        websocket,
        "browsingContext.downloadEnd",
    )
    assert event == {
        'method': 'browsingContext.downloadEnd',
        'params': {
            'context': target_context_id,
            'navigation': navigation_id,
            'filepath': ANY_STR,
            'status': 'complete',
            'timestamp': ANY_TIMESTAMP,
            'url': downloadable_url,
        },
        'type': 'event',
    }


@pytest.mark.asyncio
async def test_browsing_context_download_behavior_destination_folder(
        websocket, target_context_id, downloadable_url, tmp_path,
        prepare_context, trigger_download):
    await prepare_context(target_context_id)

    await execute_command(
        websocket, {
            'method': 'browser.setDownloadBehavior',
            'params': {
                'downloadBehavior': {
                    'type': 'allowed',
                    'destinationFolder': str(tmp_path)
                }
            }
        })

    await trigger_download(target_context_id)

    event = await wait_for_event(websocket,
                                 "browsingContext.downloadWillBegin")

    assert event == {
        'method': 'browsingContext.downloadWillBegin',
        'params': {
            'context': target_context_id,
            'navigation': ANY_UUID,
            'suggestedFilename': ANY_STR,
            'timestamp': ANY_TIMESTAMP,
            'url': downloadable_url,
        },
        'type': 'event',
    }
    navigation_id = event['params']['navigation']

    event = await wait_for_event(
        websocket,
        "browsingContext.downloadEnd",
    )
    assert event == {
        'method': 'browsingContext.downloadEnd',
        'params': {
            'context': target_context_id,
            'navigation': navigation_id,
            'filepath': ANY_STR,
            'status': 'complete',
            'timestamp': ANY_TIMESTAMP,
            'url': downloadable_url,
        },
        'type': 'event',
    }

    assert event["params"]["filepath"].startswith(str(tmp_path))
    # Assert the file content is correct.
    with open(event["params"]["filepath"], encoding='utf-8') as file:
        file_content = file.read()
    assert file_content == CONTENT
