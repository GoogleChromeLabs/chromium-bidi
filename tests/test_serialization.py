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

from _helpers import *


# Testing serialization.
async def assertSerialization(websocket, context_id, js_str_object,
      expected_serialized_object):
    result = await execute_command(websocket, {
        "method": "script.evaluate",
        "params": {
            "expression": f"({js_str_object})",
            "target": {"context": context_id}}})

    # Compare ignoring `objectId`.
    recursiveCompare(expected_serialized_object, result, ["objectId"])


# Testing serialization.
async def assertDeserializationAndSerialization(websocket, context_id,
      serialized_object,
      expected_serialized_object=None):
    if expected_serialized_object is None:
        expected_serialized_object = serialized_object

    result = await execute_command(websocket, {
        "method": "script.callFunction",
        "params": {
            "functionDeclaration": "(arg)=>{return arg}",
            "this": {
                "type": "undefined"},
            "args": [serialized_object],
            "awaitPromise": False,
            "target": {"context": context_id}}})
    # Compare ignoring `objectId`.
    recursiveCompare(expected_serialized_object, result, ["objectId"])


@pytest.mark.asyncio
async def test_deserialization_serialization_undefined(websocket, context_id):
    await assertDeserializationAndSerialization(websocket, context_id,
                                                {"type": "undefined"})


@pytest.mark.asyncio
async def test_deserialization_serialization_null(websocket, context_id):
    await assertDeserializationAndSerialization(websocket, context_id,
                                                {"type": "null"})


# TODO: test escaping, null bytes string, lone surrogates.
@pytest.mark.asyncio
async def test_deserialization_serialization_string(websocket, context_id):
    await assertDeserializationAndSerialization(websocket, context_id, {
        "type": "string",
        "value": "someStr"})


@pytest.mark.asyncio
async def test_deserialization_serialization_number(websocket, context_id):
    await assertDeserializationAndSerialization(websocket, context_id, {
        "type": "number",
        "value": 123})
    await assertDeserializationAndSerialization(websocket, context_id, {
        "type": "number",
        "value": 0.56})


@pytest.mark.asyncio
async def test_deserialization_serialization_specialNumber(websocket,
      context_id):
    await assertDeserializationAndSerialization(websocket, context_id, {
        "type": "number",
        "value": "Infinity"})
    await assertDeserializationAndSerialization(websocket, context_id, {
        "type": "number",
        "value": "-Infinity"})
    await assertDeserializationAndSerialization(websocket, context_id, {
        "type": "number",
        "value": "-0"})
    await assertDeserializationAndSerialization(websocket, context_id, {
        "type": "number",
        "value": "NaN"})


@pytest.mark.asyncio
async def test_deserialization_serialization_bool(websocket, context_id):
    await assertDeserializationAndSerialization(websocket, context_id, {
        "type": "boolean",
        "value": True})
    await assertDeserializationAndSerialization(websocket, context_id, {
        "type": "boolean",
        "value": False})


@pytest.mark.asyncio
async def test_serialization_function(websocket, context_id):
    await assertSerialization(websocket, context_id,
                              "function(){}", {
                                  "type": "function",
                                  "objectId": "__any_value__"
                              })


@pytest.mark.asyncio
async def test_serialization_object(websocket, context_id):
    await assertSerialization(websocket, context_id,
                              "{'foo': {'bar': 'baz'}, 'qux': 'quux'}", {
                                  "type": "object",
                                  "objectId": "__any_value__",
                                  "value": [[
                                      "foo", {
                                          "type": "object"}], [
                                      "qux", {
                                          "type": "string",
                                          "value": "quux"}]]})


@pytest.mark.asyncio
async def test_deserialization_serialization_object(websocket, context_id):
    await assertDeserializationAndSerialization(websocket, context_id,
                                                {
                                                    "type": "object",
                                                    "value": [[
                                                        "foo", {
                                                            "type": "object",
                                                            "value": []}
                                                    ], [{
                                                        "type": "string",
                                                        "value": "qux"
                                                    }, {
                                                        "type": "string",
                                                        "value": "quux"}]]},
                                                {
                                                    "type": "object",
                                                    "objectId": "__any_value__",
                                                    "value": [[
                                                        "foo", {
                                                            "type": "object"}
                                                    ], [
                                                        "qux", {
                                                            "type": "string",
                                                            "value": "quux"}]]})


@pytest.mark.asyncio
async def test_deserialization_serialization_map(websocket, context_id):
    await assertDeserializationAndSerialization(websocket, context_id,
                                                {
                                                    "type": "map",
                                                    "value": [[
                                                        "foo", {
                                                            "type": "object",
                                                            "value": []}
                                                    ], [{
                                                        "type": "string",
                                                        "value": "qux"
                                                    }, {
                                                        "type": "string",
                                                        "value": "quux"}]]},
                                                {
                                                    "type": "map",
                                                    "objectId": "__any_value__",
                                                    "value": [[
                                                        "foo", {
                                                            "type": "object"}
                                                    ], [
                                                        "qux", {
                                                            "type": "string",
                                                            "value": "quux"}]]})


@pytest.mark.asyncio
async def test_deserialization_serialization_array(websocket, context_id):
    await assertDeserializationAndSerialization(websocket, context_id,
                                                {
                                                    "type": "array",
                                                    "value": [{
                                                        "type": "number",
                                                        "value": 1
                                                    }, {
                                                        "type": "string",
                                                        "value": "a"
                                                    }]}, {
                                                    "type": "array",
                                                    "objectId": "__any_value__",
                                                    "value": [{
                                                        "type": "number",
                                                        "value": 1
                                                    }, {
                                                        "type": "string",
                                                        "value": "a"
                                                    }]}, )


@pytest.mark.asyncio
async def test_serialization_array(websocket, context_id):
    await assertSerialization(websocket, context_id,
                              "[1, 'a', {foo: 'bar'}, [2,[3,4]]]", {
                                  "type": "array",
                                  "objectId": "__any_value__",
                                  "value": [{
                                      "type": "number",
                                      "value": 1
                                  }, {
                                      "type": "string",
                                      "value": "a"
                                  }, {
                                      "type": "object"
                                  }, {
                                      "type": "array"}]})


@pytest.mark.asyncio
async def test_deserialization_serialization_set(websocket, context_id):
    await assertDeserializationAndSerialization(websocket, context_id,
                                                {
                                                    "type": "set",
                                                    "value": [{
                                                        "type": "number",
                                                        "value": 1
                                                    }, {
                                                        "type": "string",
                                                        "value": "a"
                                                    }]}, {
                                                    "type": "set",
                                                    "objectId": "__any_value__",
                                                    "value": [{
                                                        "type": "number",
                                                        "value": 1
                                                    }, {
                                                        "type": "string",
                                                        "value": "a"
                                                    }]}, )


@pytest.mark.asyncio
async def test_serialization_set(websocket, context_id):
    await assertSerialization(websocket, context_id,
                              "new Set([1, 'a', {foo: 'bar'}, [2,[3,4]]])", {
                                  "type": "set",
                                  "objectId": "__any_value__",
                                  "value": [{
                                      "type": "number",
                                      "value": 1
                                  }, {
                                      "type": "string",
                                      "value": "a"
                                  }, {
                                      "type": "object"
                                  }, {
                                      "type": "array"}]})


@pytest.mark.asyncio
# TODO(sadym): remove trailing `n`.
# https://github.com/GoogleChromeLabs/chromium-bidi/issues/122
async def test_deserialization_serialization_bigint(websocket, context_id):
    await assertDeserializationAndSerialization(websocket, context_id, {
        "type": "bigint",
        "value": "12345678901234567890n"})


@pytest.mark.asyncio
# Not implemented yet.
async def _ignore_test_serialization_symbol(websocket, context_id):
    await assertSerialization(websocket, context_id,
                              "Symbol('foo')", {
                                  "type": "symbol",
                                  "PROTO.description": "foo",
                                  "objectId": "__any_value__"
                              })


@pytest.mark.asyncio
async def test_deserialization_serialization_regExp(websocket, context_id):
    await assertDeserializationAndSerialization(websocket, context_id,
                                                {
                                                    "type": "regexp",
                                                    "value": {
                                                        "pattern": "ab+c",
                                                        "flags": "i"
                                                    }
                                                }, {
                                                    "type": "regexp",
                                                    "objectId": "__any_value__",
                                                    "value": {
                                                        "pattern": "ab+c",
                                                        "flags": "i"
                                                    }
                                                })


# TODO(sadym): Add value check after
# https://github.com/w3c/webdriver-bidi/issues/202
@pytest.mark.asyncio
async def test_deserialization_serialization_date(websocket, context_id):
    serialized_date = {
        "type": "date",
        "value": "2020-07-19T07:34:56.789+01:00"}

    result = await execute_command(websocket, {
        "method": "script.callFunction",
        "params": {
            "functionDeclaration": "(arg)=>{return arg}",
            "this": {
                "type": "undefined"},
            "args": [serialized_date],
            "awaitPromise": False,
            "target": {"context": context_id}}})

    assert result["type"] == "date"
    # assert result["type"] == "date"


@pytest.mark.asyncio
# Not implemented yet.
async def _ignore_test_serialization_windowProxy(websocket, context_id):
    await assertSerialization(websocket, context_id,
                              "this.window", {
                                  "type": "window",
                                  "objectId": "__any_value__"
                              })


@pytest.mark.asyncio
# Not implemented yet.
async def _ignore_test_serialization_error(websocket, context_id):
    await assertSerialization(websocket, context_id,
                              "new Error('Woops!')", {
                                  "type": "error",
                                  "objectId": "__any_value__"
                              })


# TODO: add `NodeProperties` after serialization MaxDepth logic specified:
# https://github.com/w3c/webdriver-bidi/issues/86.
@pytest.mark.asyncio
# Not implemented yet.
async def _ignore_test_serialization_node(websocket, context_id):
    await goto_url(websocket, context_id,
                   "data:text/html,<div some_attr_name='some_attr_value' ><h2>test</h2></div>")

    # Send command.
    await send_JSON_command(websocket, {
        "id": 47,
        "method": "PROTO.browsingContext.waitForSelector",
        "params": {
            "selector": "body > div",
            "context": context_id}})

    # Assert command done.
    resp = await read_JSON_message(websocket)
    assert resp["id"] == 47
    object_id = resp["result"]["objectId"]

    await send_JSON_command(websocket, {
        "id": 48,
        "method": "script.evaluate",
        "params": {
            "expression": "element => element",
            # TODO: send properly serialized element according to
            # https://w3c.github.io/webdriver-bidi/#data-types-remote-value.
            "args": [{
                "objectId": object_id}],
            "target": {"context": context_id}}})

    # Assert result.
    resp = await read_JSON_message(websocket)
    recursiveCompare({
        "id": 48,
        "result": {
            "type": "node",
            "objectId": "__any_value__",
            "value": {
                "nodeType": 1,
                "nodeValue": None,
                "localName": "div",
                "namespaceURI": "http://www.w3.org/1999/xhtml",
                "childNodeCount": 1,
                "children": [{
                    "type": "node",
                    "objectId": "__any_value__"}],
                "attributes": [{
                    "name": "some_attr_name",
                    "value": "some_attr_value"}]}}},
        resp, ["objectId"])

# @pytest.mark.asyncio
# async def test_serialization_weakMap(websocket):

# @pytest.mark.asyncio
# async def test_serialization_weakSet(websocket):

# @pytest.mark.asyncio
# async def test_serialization_iterator(websocket):

# @pytest.mark.asyncio
# async def test_serialization_generator(websocket):

# @pytest.mark.asyncio
# async def test_serialization_proxy(websocket):

# @pytest.mark.asyncio
# async def test_serialization_promise(websocket):

# @pytest.mark.asyncio
# async def test_serialization_typedArray(websocket):

# @pytest.mark.asyncio
# async def test_serialization_arrayBuffer(websocket):
#
# describe('Evaluator', function () {
#     let EVALUATOR: {
#     serialize: (x: any) => CommonDataTypes.RemoteValue,
#                            deserialize: (x: CommonDataTypes.RemoteReference | CommonDataTypes.LocalValue) => any
# };
#
# // Get EVALUATOR.
#     before(async function () {
#     const eval_text = (await fs.readFile(
#     path.join(__dirname, './eval.es'),
#     'utf8'
# )).toString();
#
# EVALUATOR = eval(eval_text);
# });
#
# describe('serialize + deserialize', function () {
#     function checkSerializeAndDeserialize(originalObject: any,
# expectedSerializedObj: CommonDataTypes.RemoteValue,
# excluding: string[] = []) {
#                           // Check serialize.
#     const serializedOrigianlObj = EVALUATOR.serialize(originalObject);
# if (excluding.length > 0) {
#     chai.assert.deepEqualExcludingEvery(
#     serializedOrigianlObj,
#     expectedSerializedObj as any,
#                              excluding);
#
# } else {
#     chai.assert.deepEqual(
#     serializedOrigianlObj,
#     expectedSerializedObj);
# }
#
# // Check deserialize.
#     const deserializedSerializedOrigianlObj = EVALUATOR.deserialize(serializedOrigianlObj)
# chai.assert.strictEqual(
#     deserializedSerializedOrigianlObj,
#     originalObject);
# }
#
# describe('number', function () {
#     it(`natural number`, function () {
#     checkSerializeAndDeserialize(
#         42,
#         {
#             type: 'number',
#             value: 42
#         }
#     );
# });
# it(`NaN`, function () {
#     it(`serialize`, function () {
#     checkSerializeAndDeserialize(
#         NaN,
#         {
#             type: 'number',
#             value: 'NaN'
#         });
# });
# });
# it(`-0`, function () {
#     it(`serialize`, function () {
#     checkSerializeAndDeserialize(
#         -0,
#         {
#             type: 'number',
#             value: '-0'
#         });
# });
# });
# it(`-Infinity`, function () {
#     it(`serialize`, function () {
#     checkSerializeAndDeserialize(
#         -Infinity,
#         {
#             type: 'number',
#             value: '-Infinity'
#         });
# });
# });
# it(`+Infinity`, function () {
#     it(`serialize`, function () {
#     checkSerializeAndDeserialize(
#         +Infinity,
#         {
#             type: 'number',
#             value: '+Infinity'
#         });
# });
# });
# });
# it('undefined', function () {
#     checkSerializeAndDeserialize(
#         undefined,
#         {
#             type: 'undefined'
#         }
#     );
# });
# it('boolean', function () {
#     checkSerializeAndDeserialize(
#         false,
#         {
#             type: 'boolean',
#             value: false
#         }
#     );
# checkSerializeAndDeserialize(
#     true,
#     {
#         type: 'boolean',
#         value: true
#     }
# );
# });
# describe('string', function () {
#     it('normal string', function () {
#     checkSerializeAndDeserialize(
#         'SOME_STRING_HERE',
#         {
#             type: 'string',
#             value: 'SOME_STRING_HERE'
#         }
#     );
# });
# it('empty string', function () {
#     checkSerializeAndDeserialize(
#         '',
#         {
#             type: 'string',
#             value: ''
#         }
#     );
# });
# });
# describe('object', function () {
#     it('flat object', function () {
#     checkSerializeAndDeserialize(
#         {
#             SOME_PROPERTY: 'SOME_VALUE'
#         },
#         {
#             type: 'object',
#             value: [[
#                 "SOME_PROPERTY",
#                 {
#                     type: "string",
#                     value: "SOME_VALUE"
#                 }]],
#             objectId: '__any_value__'
#         },
#         ["objectId"]
#     );
# });
# it('nested objects', function () {
#     checkSerializeAndDeserialize(
#         {
#             'foo': {
#                 'bar': 'baz'
#             },
#             'qux': 'quux'
#         },
#         {
#             "type": "object",
#             "objectId": "__any_value__",
#             "value": [[
#                 "foo", {
#                     "type": "object",
#                     "objectId": "__any_value__"
#                 }], [
#                 "qux", {
#                     "type": "string",
#                     "value": "quux"
#                 }]]
#         },
#         ["objectId"]
#     );
# });
# });
# it('function', function () {
#     checkSerializeAndDeserialize(
#         function () { },
#                     {
#                         type: 'function',
#                         objectId: '__any_value__'
#                     },
#                     ["objectId"]
# );
# });
# it('array', function () {
#     checkSerializeAndDeserialize(
#         [1, 'a', { foo: 'bar' }, [2, [3, 4]]],
#         {
#             type: "array",
#             objectId: "__any_value__",
#             value: [{
#                 type: "number",
#                 value: 1
#             }, {
#                 type: "string",
#                 value: "a"
#             }, {
#                 type: "object",
#                 objectId: "__any_value__"
#             }, {
#                 type: "array",
#                 objectId: "__any_value__"
#             }]
#         }, ["objectId"]
#     );
# });
# it('promise', function () {
#     checkSerializeAndDeserialize(
#         Promise.resolve(),
#         {
#             type: 'promise',
#             objectId: '__any_value__'
#         },
#         ["objectId"]
#     );
# });
# });
# describe('deserialize', function () {
#     it('array + nested object', function () {
#     const deserializedOrigianlObj = EVALUATOR.deserialize({
#     type: "array",
#     value: [{
#         type: "number",
#         value: 1
#     }, {
#         type: "string",
#         value: "a"
#     }, {
#         type: "object",
#         value: [[
#             "foo", {
#                 type: "string",
#                 value: "bar"
#             }]]
#     }, {
#         type: "array",
#         value: [
#             {
#                 type: "number",
#                 value: 2
#             }, {
#                 type: "array",
#                 value: [
#                     {
#                         type: "number",
#                         value: 3
#                     }, {
#                         type: "number",
#                         value: 4
#                     },]
#             },]
#     }]
# });
#
# chai.assert.deepEqual(
#     deserializedOrigianlObj,
#     [1, 'a', { foo: 'bar' }, [2, [3, 4]]]
# );
# });
# });
# });
