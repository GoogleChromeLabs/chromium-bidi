#  Copyright 2026 Google LLC.
#  Copyright (c) Microsoft Corporation.
#
#  Licensed under the Apache License, Version 2.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.

import asyncio
import json
import os
import sys
import time

import websockets
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service

ITERATIONS = 5000


async def run_bidi_benchmark(ws_url, context_id):
    async with websockets.connect(ws_url) as ws:
        # Initialize session? NO, session.new is not needed if we attach to the browser session?
        # Actually, webSocketUrl gives us a session.
        # But we might need to increment ID.

        start_time = time.time()
        for i in range(ITERATIONS):
            cmd_id = i + 1
            cmd = {
                "id": cmd_id,
                "method": "script.evaluate",
                "params": {
                    "expression": f"document.getElementById('bidi-counter').innerText = 'Iter: {i + 1}';",
                    "target": {
                        "context": context_id
                    },
                    "awaitPromise": False
                }
            }
            await ws.send(json.dumps(cmd))
            # We must wait for response to strictly mimic synchronous benchmark behaviors or await completion
            # The Java test uses bidiModule.evaluateFunction which awaits result.
            await ws.recv()

        end_time = time.time()
        return (end_time - start_time) * 1000


def run_benchmark():
    # Filter known bad path causing version mismatch
    bad_path = "/Users/sadym/work/chromium/src/out/Default"
    if bad_path in os.environ.get("PATH", ""):
        print(f"Removing {bad_path} from PATH to avoid version mismatch.")
        os.environ["PATH"] = os.environ["PATH"].replace(bad_path,
                                                        "").replace("::", ":")

    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.set_capability("webSocketUrl", True)

    browser_bin = os.getenv("BROWSER_BIN")
    if browser_bin:
        options.binary_location = browser_bin
        print(f"Using binary: {browser_bin}")

    service = Service()

    try:
        driver = webdriver.Chrome(service=service, options=options)
    except Exception as e:
        print(f"Failed to start driver: {e}")
        import shutil
        current_chromedriver = shutil.which("chromedriver")
        print(f"Current chromedriver in PATH: {current_chromedriver}")
        sys.exit(1)

    try:
        browser_name = "Chrome"
        print(f"\n=== Testing Browser: {browser_name} ===")

        driver.get("about:blank")

        # Setup UI
        driver.execute_script("""
            document.body.innerHTML = `
            <div style='font-family:Segoe UI, sans-serif; padding:20px; background:#f4f7f6;'>
              <h2>${browserName} Protocol Benchmark</h2>
              <div style='display:flex; gap:15px;'>
                <div id='classic-box' style='flex:1; padding:15px; background:white; border-left:5px solid #e74c3c;'>Classic HTTP<div id='classic-counter' style='font-size:24px;'>0</div><div id='classic-res'>-</div></div>
                <div id='bidi-box' style='flex:1; padding:15px; background:white; border-left:5px solid #2ecc71;'>WebDriver BiDi<div id='bidi-counter' style='font-size:24px;'>0</div><div id='bidi-res'>-</div></div>
                <div id='cdp-box' style='flex:1; padding:15px; background:white; border-left:5px solid #3498db;'>CDP (Legacy WS)<div id='cdp-counter' style='font-size:24px;'>0</div><div id='cdp-res'>-</div></div>
              </div>
            </div>`;
        """.replace("${browserName}", browser_name))

        handle = driver.current_window_handle

        # 1. Classic Benchmark
        start_classic = time.time()
        for i in range(ITERATIONS):
            driver.execute_script(
                f"document.getElementById('classic-counter').innerText = 'Iter: {i + 1}';"
            )
        end_classic = time.time()
        classic_total = (end_classic - start_classic) * 1000
        classic_avg = classic_total / ITERATIONS

        driver.execute_script(
            f"document.getElementById('classic-res').innerText = 'Avg: {classic_avg:.4f} ms/call';"
        )

        # 2. BiDi Benchmark
        try:
            ws_url = driver.capabilities.get("webSocketUrl")
            if not ws_url:
                raise Exception("No webSocketUrl found in capabilities")

            # Use asyncio.run
            bidi_total = asyncio.run(run_bidi_benchmark(ws_url, handle))
            bidi_avg = bidi_total / ITERATIONS
            driver.execute_script(
                f"document.getElementById('bidi-res').innerText = 'Avg: {bidi_avg:.4f} ms/call';"
            )
        except Exception as e:
            print(f"BiDi Benchmark Failed: {e}")
            import traceback
            traceback.print_exc()
            bidi_avg = 0

        # 3. CDP Benchmark
        try:
            cdp_start = time.time()
            for i in range(ITERATIONS):
                driver.execute_cdp_cmd(
                    "Runtime.evaluate", {
                        "expression": f"document.getElementById('cdp-counter').innerText = 'Iter: {i + 1}';"
                    })
            cdp_end = time.time()
            cdp_total = (cdp_end - cdp_start) * 1000
            cdp_avg = cdp_total / ITERATIONS
            driver.execute_script(
                f"document.getElementById('cdp-res').innerText = 'Avg: {cdp_avg:.4f} ms/call';"
            )
        except Exception as e:
            print(f"CDP Benchmark Failed: {e}")
            cdp_avg = 0

        print(
            f"[{browser_name}] Classic: {classic_avg:.4f} | BiDi: {bidi_avg:.4f} | CDP: {cdp_avg:.4f} ms/call"
        )
        print(f"PERF_METRIC:Classic:{classic_avg:.4f}")
        print(f"PERF_METRIC:BiDi:{bidi_avg:.4f}")
        print(f"PERF_METRIC:CDP:{cdp_avg:.4f}")

    finally:
        driver.quit()


if __name__ == "__main__":
    run_benchmark()
