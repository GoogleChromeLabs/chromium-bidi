import fs from 'fs/promises';
import path from 'path';
import * as chai from 'chai';

describe('Evaluator', function () {
    let EVALUATOR: any;

    // Get EVALUATOR.
    before(async function () {
        const eval_text = await fs.readFile(
            path.join(__dirname, './eval.es'),
            'utf8'
        );

        EVALUATOR = eval(eval_text);
    });

    function checkSerializeAndDeserialize(originalObject: any, serializedObj: any) {
        // Check serialise.
        chai.assert.deepEqual(
            EVALUATOR.serialize(originalObject),
            serializedObj);
        // Check deserialise.
        chai.assert.deepEqual(
            EVALUATOR.deserialize(serializedObj),
            originalObject);
    }

    describe('number', function () {
        it(`natural number`, function () {
            checkSerializeAndDeserialize(
                42,
                {
                    type: 'number',
                    value: 42
                }
            );
        });
        it(`NaN`, function () {
            it(`serialize`, function () {
                checkSerializeAndDeserialize(
                    NaN,
                    {
                        type: 'number',
                        value: 'NaN'
                    });
            });
        });
        it(`-0`, function () {
            it(`serialize`, function () {
                checkSerializeAndDeserialize(
                    -0,
                    {
                        type: 'number',
                        value: '-0'
                    });
            });
        });
        it(`-Infinity`, function () {
            it(`serialize`, function () {
                checkSerializeAndDeserialize(
                    -Infinity,
                    {
                        type: 'number',
                        value: '-Infinity'
                    });
            });
        });
        it(`+Infinity`, function () {
            it(`serialize`, function () {
                checkSerializeAndDeserialize(
                    +Infinity,
                    {
                        type: 'number',
                        value: '+Infinity'
                    });
            });
        });
    });
    it('undefined', function () {
        checkSerializeAndDeserialize(
            undefined,
            {
                type: 'undefined'
            }
        );
    });
    it('boolean', function () {
        checkSerializeAndDeserialize(
            false,
            {
                type: 'boolean',
                value: false
            }
        );
        checkSerializeAndDeserialize(
            true,
            {
                type: 'boolean',
                value: true
            }
        );
    });
    describe('string', function () {
        it('normal string', function () {
            checkSerializeAndDeserialize(
                'SOME_STRING_HERE',
                {
                    type: 'string',
                    value: 'SOME_STRING_HERE'
                }
            );
        });
        it('empty string', function () {
            checkSerializeAndDeserialize(
                '',
                {
                    type: 'string',
                    value: ''
                }
            );
        });
    });
    describe('object', function () {
        it('normal obejct', function () {
            const obj = {
                SOME_PROPERTY: 'SOME_VALUE'
            };

            const serialisedObj = EVALUATOR.serialize(obj);

            // Assert only expected properties.
            chai.assert.deepEqual(Object.keys(serialisedObj), ['type', 'objectId']);
            // Assert type.
            chai.assert.equal(serialisedObj.type, 'object');

            const deserialisedObj = EVALUATOR.deserialize(serialisedObj);
            chai.assert.strictEqual(deserialisedObj, obj);

        });
    });
});
