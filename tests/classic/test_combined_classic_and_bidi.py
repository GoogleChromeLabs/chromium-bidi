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

import pytest
import websockets
from classic_helpers import http_post
from test_helpers import execute_command


@pytest.mark.asyncio
async def test_interleaved_classic_and_bidi(classic_session):
    session_id, ws_url = classic_session
    async with websockets.connect(ws_url) as ws:
        # 1. Get browsing contexts via BiDi
        tree_res = await execute_command(
            ws, {"method": "browsingContext.getTree", "params": {}}
        )
        contexts = tree_res["contexts"]
        assert len(contexts) > 0
        context_id = contexts[0]["context"]

        # 2. Set a JavaScript variable using BiDi script.evaluate
        eval_res = await execute_command(
            ws,
            {
                "method": "script.evaluate",
                "params": {
                    "expression": "window.sharedVar = 'set_by_bidi'",
                    "target": {"context": context_id},
                    "awaitPromise": False,
                },
            },
        )
        assert "result" in eval_res
        assert eval_res["result"]["value"] == "set_by_bidi"

        # 3. Read the variable via WebDriver Classic HTTP command
        classic_res = http_post(
            f"/session/{session_id}/execute/sync",
            {
                "script": "return window.sharedVar + ' & read_by_classic';",
                "args": [],
            },
        )
        assert classic_res["value"] == "set_by_bidi & read_by_classic"

        # 4. Modify a variable via WebDriver Classic HTTP command
        http_post(
            f"/session/{session_id}/execute/sync",
            {"script": "window.classicCounter = 100;", "args": []},
        )

        # 5. Read back the modification using BiDi script.evaluate over WebSocket
        eval_res2 = await execute_command(
            ws,
            {
                "method": "script.evaluate",
                "params": {
                    "expression": "window.classicCounter + 50",
                    "target": {"context": context_id},
                    "awaitPromise": False,
                },
            },
        )
        assert "result" in eval_res2
        assert eval_res2["result"]["value"] == 150
