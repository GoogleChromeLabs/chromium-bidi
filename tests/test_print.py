# Copyright 2023 Google LLC.
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

import base64
from difflib import SequenceMatcher

import pytest
from test_helpers import execute_command, goto_url


def assert_strings_similar(str1: str, str2: str, threshold: float):
    similarity_ratio = SequenceMatcher(None, str1, str2).ratio()
    assert similarity_ratio >= threshold, "Strings are not similar enough."


def save_pdf(pdf_bytes_or_str: bytes | str, output_file: str):
    pdf_bytes = pdf_bytes_or_str if isinstance(
        pdf_bytes_or_str, bytes) else base64.b64decode(pdf_bytes_or_str,
                                                       validate=True)
    if pdf_bytes[0:4] != b'%PDF':
        raise ValueError('Missing the PDF file signature')

    with open(output_file, 'wb') as f:
        f.write(pdf_bytes)


@pytest.mark.asyncio
async def test_print(websocket, context_id, html):
    await goto_url(websocket, context_id, html())

    result = await execute_command(
        websocket, {
            "method": "browsingContext.print",
            "params": {
                "context": context_id,
                "page": {
                    "width": 100,
                    "height": 100,
                },
                "scale": 1.0,
            }
        })

    # 'data' is not deterministic, ~a dozen characters differ between runs.
    assert_strings_similar(
        result["data"],
        'JVBERi0xLjQKJdPr6eEKMSAwIG9iago8PC9DcmVhdG9yIChDaHJvbWl1bSkKL1Byb2R1Y2VyIChTa2lhL1BERiBtMTE3KQovQ3JlYXRpb25EYXRlIChEOjIwMjMwNjI4MTUzMTQ3KzAwJzAwJykKL01vZERhdGUgKEQ6MjAyMzA2MjgxNTMxNDcrMDAnMDAnKT4+CmVuZG9iagozIDAgb2JqCjw8L0xlbmd0aCAwPj4gc3RyZWFtCgplbmRzdHJlYW0KZW5kb2JqCjIgMCBvYmoKPDwvVHlwZSAvUGFnZQovUmVzb3VyY2VzIDw8L1Byb2NTZXQgWy9QREYgL1RleHQgL0ltYWdlQiAvSW1hZ2VDIC9JbWFnZUldPj4KL01lZGlhQm94IFswIDAgOTA3LjkxOTk4IDkwNy45MTk5OF0KL0NvbnRlbnRzIDMgMCBSCi9TdHJ1Y3RQYXJlbnRzIDAKL1BhcmVudCA0IDAgUj4+CmVuZG9iago0IDAgb2JqCjw8L1R5cGUgL1BhZ2VzCi9Db3VudCAxCi9LaWRzIFsyIDAgUl0+PgplbmRvYmoKNSAwIG9iago8PC9UeXBlIC9DYXRhbG9nCi9QYWdlcyA0IDAgUj4+CmVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMTUgMDAwMDAgbiAKMDAwMDAwMDIwMiAwMDAwMCBuIAowMDAwMDAwMTU1IDAwMDAwIG4gCjAwMDAwMDAzNzcgMDAwMDAgbiAKMDAwMDAwMDQzMiAwMDAwMCBuIAp0cmFpbGVyCjw8L1NpemUgNgovUm9vdCA1IDAgUgovSW5mbyAxIDAgUj4+CnN0YXJ0eHJlZgo0NzkKJSVFT0YK',
        threshold=0.95)
