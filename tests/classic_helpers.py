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

import json
import os
import urllib.error
import urllib.request


def get_server_port() -> int:
    return int(os.getenv("PORT", 8080))


def http_post(path: str, data: dict | None = None) -> dict:
    url = f"http://localhost:{get_server_port()}{path}"
    payload = json.dumps(data or {}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json;charset=utf-8"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        try:
            return json.loads(body)
        except Exception:
            return {"error": str(e), "status": e.code, "body": body}


def http_delete(path: str) -> dict:
    url = f"http://localhost:{get_server_port()}{path}"
    req = urllib.request.Request(
        url,
        headers={"Content-Type": "application/json;charset=utf-8"},
        method="DELETE",
    )
    with urllib.request.urlopen(req) as response:
        return json.loads(response.read().decode("utf-8"))


def start_classic_session() -> tuple[str, str]:
    default_capabilities: dict[str, any] = {
        "goog:chromeOptions": {
            "args": [
                "--disable-background-networking",
                "--disable-background-timer-throttling",
                "--disable-backgrounding-occluded-windows",
            ]
        }
    }
    maybe_browser_bin = os.getenv("BROWSER_BIN")
    if maybe_browser_bin:
        default_capabilities["goog:chromeOptions"]["binary"] = maybe_browser_bin

    headless = os.getenv("HEADLESS", "true")
    if headless != "false":
        if headless == "old":
            default_capabilities["goog:chromeOptions"]["args"].extend(
                ["--hide-scrollbars", "--mute-audio"]
            )
        else:
            default_capabilities["goog:chromeOptions"]["args"].append("--headless=new")

    res = http_post("/session", {"capabilities": {"alwaysMatch": default_capabilities}})
    val = res["value"]
    return val["sessionId"], val["capabilities"]["webSocketUrl"]


def end_classic_session(session_id: str):
    try:
        http_delete(f"/session/{session_id}")
    except Exception:
        pass
