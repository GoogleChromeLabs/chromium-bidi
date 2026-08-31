# Copyright 2026 Google LLC.
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

import pytest
from classic_helpers import http_post


@pytest.mark.asyncio
async def test_classic_execute_script_basic(classic_session):
    session_id, _ = classic_session
    res = http_post(
        f"/session/{session_id}/execute/sync",
        {"script": "return 10 + 25;", "args": []},
    )
    assert "value" in res
    assert res["value"] == 35


@pytest.mark.asyncio
async def test_classic_execute_script_with_args(classic_session):
    session_id, _ = classic_session
    res = http_post(
        f"/session/{session_id}/execute/sync",
        {
            "script": "return arguments[0] + ' ' + arguments[1].name;",
            "args": ["Hello", {"name": "WebDriver"}],
        },
    )
    assert "value" in res
    assert res["value"] == "Hello WebDriver"


@pytest.mark.asyncio
async def test_classic_execute_script_exception(classic_session):
    session_id, _ = classic_session
    res = http_post(
        f"/session/{session_id}/execute/sync",
        {"script": "throw new Error('Test Classic Error');", "args": []},
    )
    assert "value" in res
    assert isinstance(res["value"], dict)
    assert res["value"].get("error") == "javascript error"
    assert "Test Classic Error" in res["value"].get("message", "")


@pytest.mark.asyncio
async def test_classic_execute_script_sequential(classic_session):
    session_id, _ = classic_session
    http_post(
        f"/session/{session_id}/execute/sync",
        {"script": "window.order = []; return true;", "args": []},
    )

    def run_first_script():
        return http_post(
            f"/session/{session_id}/execute/sync",
            {
                "script": "const start = Date.now(); while(Date.now() - start < 100) {}; window.order.push(1); return window.order;",
                "args": [],
            },
        )

    def run_second_script():
        return http_post(
            f"/session/{session_id}/execute/sync",
            {"script": "window.order.push(2); return window.order;", "args": []},
        )

    t1 = asyncio.to_thread(run_first_script)
    t2 = asyncio.to_thread(run_second_script)
    await asyncio.gather(t1, t2)

    res = http_post(
        f"/session/{session_id}/execute/sync",
        {"script": "return window.order;", "args": []},
    )
    assert res["value"] == [1, 2]
