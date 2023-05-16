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

import pytest
from test_helpers import (ANY_SHARED_ID, execute_command, read_JSON_message,
                          send_JSON_command, subscribe)

TEST_SERIALIZATION_DATA = {
    "argnames": "eval, expected_result",
    "argvalues": [
        ("undefined", {
            "type": "undefined"
        }), ("'someStr'", {
            "type": "string",
            "value": "someStr"
        }), ("''", {
            "type": "string",
            "value": ""
        }), (123, {
            "type": "number",
            "value": 123
        }), (0.56, {
            "type": "number",
            "value": 0.56
        }), ("Infinity", {
            "type": "number",
            "value": "Infinity"
        }), ("-Infinity", {
            "type": "number",
            "value": "-Infinity"
        }), ("-0", {
            "type": "number",
            "value": "-0"
        }), ("NaN", {
            "type": "number",
            "value": "NaN"
        }), ("true", {
            "type": "boolean",
            "value": True
        }), ("false", {
            "type": "boolean",
            "value": False
        }),
        ("12345678901234567890n", {
            "type": "bigint",
            "value": "12345678901234567890"
        }),
        ("new Date('2020-07-19T07:34:56.789+01:00')", {
            "type": "date",
            "value": "2020-07-19T06:34:56.789Z"
        }), ("function(){}", {
            "type": "function"
        }), ("Promise.resolve(1)", {
            "type": "promise"
        }), ("new WeakMap()", {
            "type": "weakmap"
        }), ("new WeakSet()", {
            "type": "weakset"
        }), ("new Proxy({}, {})", {
            "type": "proxy"
        }), ("new Int32Array()", {
            "type": "typedarray"
        }),
        ("{'foo': {'bar': 'baz'}, 'qux': 'quux'}", {
            "type": "object",
            "value": [[
                "foo", {
                    "type": "object",
                    "value": [["bar", {
                        "type": "string",
                        "value": "baz"
                    }]]
                }
            ], ["qux", {
                "type": "string",
                "value": "quux"
            }]]
        }),
        ("[1, 'a', {foo: 'bar'}, [2,[3,4]]]", {
            "type": "array",
            "value": [{
                "type": "number",
                "value": 1
            }, {
                "type": "string",
                "value": "a"
            }, {
                "type": "object",
                "value": [["foo", {
                    "type": "string",
                    "value": "bar"
                }]]
            }, {
                "type": "array",
                "value": [{
                    "type": "number",
                    "value": 2,
                }, {
                    "type": "array",
                    "value": [{
                        "type": 'number',
                        "value": 3,
                    }, {
                        "type": "number",
                        "value": 4,
                    }]
                }]
            }]
        }),
        ("new Set([1, 'a', {foo: 'bar'}, [2,[3,4]]])", {
            "type": "set",
            "value": [{
                "type": "number",
                "value": 1
            }, {
                "type": "string",
                "value": "a"
            }, {
                "type": "object",
                "value": [["foo", {
                    "type": "string",
                    "value": "bar"
                }]]
            }, {
                "type": "array",
                "value": [{
                    "type": "number",
                    "value": 2,
                }, {
                    "type": "array",
                    "value": [{
                        "type": 'number',
                        "value": 3,
                    }, {
                        "type": "number",
                        "value": 4,
                    }]
                }]
            }]
        }), ("Symbol('foo')", {
            "type": "symbol",
        }), ("this.window", {
            "type": "window",
        }), ("new Error('Woops!')", {
            "type": "error",
        }), ("new URL('https://example.com')", {
            "type": "object",
        }),
        ("(()=>{"
         "    document.body.innerHTML="
         "      '<div some_attr_name=\\\'some_attr_value\\\'>some text<h2>some another text</h2></div>';"
         "    return document.querySelector('body > div');"
         "})()", {
             "type": "node",
             "value": {
                 "nodeType": 1,
                 "localName": "div",
                 "namespaceURI": "http://www.w3.org/1999/xhtml",
                 "childNodeCount": 2,
                 "attributes": {
                     "some_attr_name": "some_attr_value"
                 }
             },
             "sharedId": ANY_SHARED_ID
         }),
        ("(()=>{"
         "     const foo={a: []};"
         "     const bar=[1,2];"
         "     const result={1: foo, 2: foo, 3: bar, 4: bar};"
         "     result.self=result;"
         "     return result;"
         " })()", {
             "type": "object",
             "internalId": "3",
             "value": [[{
                 "type": "number",
                 "value": 1
             }, {
                 "type": "object",
                 "value": [["a", {
                     "type": "array",
                     "value": []
                 }]],
                 "internalId": "1"
             }],
                       [{
                           "type": "number",
                           "value": 2
                       }, {
                           "type": "object",
                           "internalId": "1"
                       }],
                       [{
                           "type": "number",
                           "value": 3
                       }, {
                           "type": "array",
                           "value": [{
                               "type": "number",
                               "value": 1
                           }, {
                               "type": "number",
                               "value": 2
                           }],
                           "internalId": "2"
                       }],
                       [{
                           "type": "number",
                           "value": 4
                       }, {
                           "type": "array",
                           "internalId": "2"
                       }], ["self", {
                           "type": "object",
                           "internalId": "3"
                       }]],
         })
    ]
}


@pytest.mark.parametrize(**TEST_SERIALIZATION_DATA)
@pytest.mark.asyncio
async def test_serialization_evaluate(websocket, context_id, eval,
                                      expected_result):
    response = await execute_command(
        websocket, {
            "method": "script.evaluate",
            "params": {
                "expression": f"({eval})",
                "target": {
                    "context": context_id
                },
                "awaitPromise": False,
            }
        })
    assert response["result"] == expected_result


@pytest.mark.parametrize(**TEST_SERIALIZATION_DATA)
@pytest.mark.asyncio
async def test_serialization_callFunction(websocket, context_id, eval,
                                          expected_result):
    response = await execute_command(
        websocket, {
            "method": "script.callFunction",
            "params": {
                "functionDeclaration": f"()=>({eval})",
                "target": {
                    "context": context_id
                },
                "awaitPromise": False,
            }
        })
    assert response["result"] == expected_result


@pytest.mark.parametrize(**TEST_SERIALIZATION_DATA)
@pytest.mark.asyncio
async def test_serialization_log(websocket, context_id, eval, expected_result):
    await subscribe(websocket, "log.entryAdded")

    await send_JSON_command(
        websocket, {
            "method": "script.evaluate",
            "params": {
                "expression": f"console.log({eval})",
                "target": {
                    "context": context_id
                },
                "awaitPromise": False,
            }
        })

    response = await read_JSON_message(websocket)
    assert response["method"] == "log.entryAdded"
    assert response["params"]["args"][0] == expected_result
