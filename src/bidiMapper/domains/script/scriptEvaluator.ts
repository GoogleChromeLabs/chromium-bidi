/**
 * Copyright 2022 Google LLC.
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Protocol } from 'devtools-protocol';
import { CommonDataTypes, Script } from '../protocol/bidiProtocolTypes';
import { Realm } from './realm';
import { InvalidArgumentException } from '../protocol/error';

export class ScriptEvaluator {
  // As `script.evaluate` wraps call into serialization script, `lineNumber`
  // should be adjusted.
  static readonly #evaluateStacktraceLineOffset = 0;
  static readonly #callFunctionStacktraceLineOffset = 1;

  // Keeps track of `handle`s and their realms sent to client.
  static readonly #knownHandlesToRealm: Map<string, string> = new Map();

  /**
   * Serializes a given CDP object into BiDi, keeping references in the
   * target's `globalThis`.
   * @param cdpObject CDP remote object to be serialized.
   * @param resultOwnership indicates desired OwnershipModel.
   * @param realm
   */
  public static async serializeCdpObject(
    cdpObject: Protocol.Runtime.RemoteObject,
    resultOwnership: Script.OwnershipModel,
    realm: Realm
  ): Promise<CommonDataTypes.RemoteValue> {
    // First try to parse the CDP RemoteObject without extra CDP call.
    const parsed = this.#tryParseCdpRemoteValue(cdpObject, 1);
    if (parsed !== undefined) {
      if (resultOwnership === 'none') {
        if (cdpObject.objectId !== undefined) {
          realm.cdpClient.Runtime.releaseObject({
            objectId: cdpObject.objectId,
          });
        }
      } else {
        if (cdpObject.objectId !== undefined) {
          parsed.handle = cdpObject.objectId;
        }
      }
      return parsed;
    }

    // Fall back to the serialization via CDP call.
    const cdpWebDriverValue: Protocol.Runtime.CallFunctionOnResponse =
      await realm.cdpClient.Runtime.callFunctionOn({
        functionDeclaration: String((obj: unknown) => obj),
        awaitPromise: false,
        arguments: [cdpObject],
        generateWebDriverValue: true,
        executionContextId: realm.executionContextId,
      });
    return await this.#cdpWebDriverValueToBidi(
      cdpWebDriverValue,
      realm,
      resultOwnership
    );
  }

  /**
   * Gets the string representation of an object. This is equivalent to
   * calling toString() on the object value.
   * @param cdpObject CDP remote object representing an object.
   * @param realm
   * @returns string The stringified object.
   */
  public static async stringifyObject(
    cdpObject: Protocol.Runtime.RemoteObject,
    realm: Realm
  ): Promise<string> {
    let stringifyResult = await realm.cdpClient.Runtime.callFunctionOn({
      functionDeclaration: String(function (
        obj: Protocol.Runtime.RemoteObject
      ) {
        return String(obj);
      }),
      awaitPromise: false,
      arguments: [cdpObject],
      returnByValue: true,
      executionContextId: realm.executionContextId,
    });
    return stringifyResult.result.value;
  }

  public static async callFunction(
    realm: Realm,
    functionDeclaration: string,
    _this: Script.ArgumentValue,
    _arguments: Script.ArgumentValue[],
    awaitPromise: boolean,
    resultOwnership: Script.OwnershipModel
  ): Promise<Script.ScriptResult> {
    const callFunctionAndSerializeScript = `(...args)=>{ return _callFunction((\n${functionDeclaration}\n), args);
      function _callFunction(f, args) {
        const deserializedThis = args.shift();
        const deserializedArgs = args;
        return f.apply(deserializedThis, deserializedArgs);
      }}`;

    const thisAndArgumentsList = [
      await this.#deserializeToCdpArg(_this, realm),
    ];
    thisAndArgumentsList.push(
      ...(await Promise.all(
        _arguments.map(async (a) => {
          return await this.#deserializeToCdpArg(a, realm);
        })
      ))
    );

    let cdpCallFunctionResult: Protocol.Runtime.CallFunctionOnResponse;
    try {
      cdpCallFunctionResult = await realm.cdpClient.Runtime.callFunctionOn({
        functionDeclaration: callFunctionAndSerializeScript,
        awaitPromise,
        arguments: thisAndArgumentsList, // this, arguments.
        generateWebDriverValue: true,
        executionContextId: realm.executionContextId,
      });
    } catch (e: any) {
      // Heuristic to determine if the problem is in the argument.
      // The check can be done on the `deserialization` step, but this approach
      // helps to save round-trips.
      if (
        e.code === -32000 &&
        [
          'Could not find object with given id',
          'Argument should belong to the same JavaScript world as target object',
        ].includes(e.message)
      ) {
        throw new InvalidArgumentException('Handle was not found.');
      }
      throw e;
    }

    if (cdpCallFunctionResult.exceptionDetails) {
      // Serialize exception details.
      return {
        exceptionDetails: await this.#serializeCdpExceptionDetails(
          cdpCallFunctionResult.exceptionDetails,
          this.#callFunctionStacktraceLineOffset,
          resultOwnership,
          realm
        ),
        realm: realm.realmId,
      };
    }
    return {
      result: await ScriptEvaluator.#cdpWebDriverValueToBidi(
        cdpCallFunctionResult,
        realm,
        resultOwnership
      ),
      realm: realm.realmId,
    };
  }

  static realmDestroyed(realm: Realm) {
    return Array.from(this.#knownHandlesToRealm.entries())
      .filter(([h, r]) => r === realm.realmId)
      .map(([h, r]) => this.#knownHandlesToRealm.delete(h));
  }

  static async disown(realm: Realm, handle: string) {
    // Disowning an object from different realm does nothing.
    if (ScriptEvaluator.#knownHandlesToRealm.get(handle) !== realm.realmId) {
      return;
    }
    try {
      await realm.cdpClient.Runtime.releaseObject({ objectId: handle });
    } catch (e: any) {
      // Heuristic to determine if the problem is in the unknown handler.
      // Ignore the error if so.
      if (!(e.code === -32000 && e.message === 'Invalid remote object id')) {
        throw e;
      }
    }
    this.#knownHandlesToRealm.delete(handle);
  }

  static async #serializeCdpExceptionDetails(
    cdpExceptionDetails: Protocol.Runtime.ExceptionDetails,
    lineOffset: number,
    resultOwnership: Script.OwnershipModel,
    realm: Realm
  ): Promise<Script.ExceptionDetails> {
    const stackTrace = this.getBiDiStackTrace(
      cdpExceptionDetails.stackTrace,
      lineOffset
    );

    const exception = await this.serializeCdpObject(
      // Exception should always be there.
      cdpExceptionDetails.exception!,
      resultOwnership,
      realm
    );

    const text = await this.getExceptionText(cdpExceptionDetails, realm);

    return {
      exception,
      columnNumber: cdpExceptionDetails.columnNumber,
      // As `script.evaluate` wraps call into serialization script, so
      // `lineNumber` should be adjusted.
      lineNumber: cdpExceptionDetails.lineNumber - lineOffset,
      stackTrace,
      text: text || cdpExceptionDetails.text,
    };
  }

  static getBiDiStackTrace(
    stackTrace: Script.StackTrace | undefined,
    lineOffset: number
  ): Script.StackTrace {
    const callFrames =
      stackTrace?.callFrames.map((frame) => ({
        url: frame.url,
        functionName: frame.functionName,
        // As `script.evaluate` wraps call into serialization script, so
        // `lineNumber` should be adjusted.
        lineNumber: frame.lineNumber - lineOffset,
        columnNumber: frame.columnNumber,
      })) || [];
    return { callFrames };
  }

  /**
   * Heuristic to get the exception description without extra CDP round trip to
   * avoid BiDi message delay.
   * @param cdpExceptionDetails CDP exception details to be stringified.
   * @param realm is used in case of the preview is not available, and additional CDP round-trip is required.
   */
  static async getExceptionText(
    cdpExceptionDetails: Protocol.Runtime.ExceptionDetails,
    realm: Realm | undefined
  ): Promise<string> {
    let exception = cdpExceptionDetails.exception;

    // Something unexpected happened. Return raw exception details.
    if (exception === undefined) {
      return JSON.stringify(cdpExceptionDetails);
    }

    // Exception has a description.
    if (exception.description !== undefined) {
      return exception.description.toString();
    }

    // Exception is a primitive with value.
    if (exception.value !== undefined) {
      return '' + exception.value;
    }

    // Exception has a handle. Make a CDP call to stringify it.
    if (
      realm !== undefined &&
      exception.objectId !== undefined &&
      exception.type !== undefined
    ) {
      return await realm.stringifyObject(
        { objectId: exception.objectId, type: exception.type },
        realm
      );
    }

    // Something unexpected happened. Return raw exception details.
    return JSON.stringify(cdpExceptionDetails);
  }

  static async #cdpWebDriverValueToBidi(
    cdpValue:
      | Protocol.Runtime.CallFunctionOnResponse
      | Protocol.Runtime.EvaluateResponse,
    realm: Realm,
    resultOwnership: Script.OwnershipModel
  ): Promise<CommonDataTypes.RemoteValue> {
    // This relies on the CDP to implement proper BiDi serialization, except
    // objectIds+handles.
    const cdpWebDriverValue = cdpValue.result.webDriverValue!;
    if (!cdpValue.result.objectId) {
      return cdpWebDriverValue as CommonDataTypes.RemoteValue;
    }

    const objectId = cdpValue.result.objectId;
    const bidiValue = cdpWebDriverValue as any;

    if (resultOwnership === 'root') {
      bidiValue.handle = objectId;
      // Remember all the handles sent to client.
      this.#knownHandlesToRealm.set(objectId, realm.realmId);
    } else {
      await realm.cdpClient.Runtime.releaseObject({ objectId });
    }

    return bidiValue as CommonDataTypes.RemoteValue;
  }

  public static async scriptEvaluate(
    realm: Realm,
    expression: string,
    awaitPromise: boolean,
    resultOwnership: Script.OwnershipModel
  ): Promise<Script.ScriptResult> {
    let cdpEvaluateResult = await realm.cdpClient.Runtime.evaluate({
      contextId: realm.executionContextId,
      expression,
      awaitPromise,
      generateWebDriverValue: true,
    });

    if (cdpEvaluateResult.exceptionDetails) {
      // Serialize exception details.
      return {
        exceptionDetails: await this.#serializeCdpExceptionDetails(
          cdpEvaluateResult.exceptionDetails,
          this.#evaluateStacktraceLineOffset,
          resultOwnership,
          realm
        ),
        realm: realm.realmId,
      };
    }

    return {
      result: await ScriptEvaluator.#cdpWebDriverValueToBidi(
        cdpEvaluateResult,
        realm,
        resultOwnership
      ),
      realm: realm.realmId,
    };
  }

  static async #deserializeToCdpArg(
    argumentValue: Script.ArgumentValue,
    realm: Realm
  ): Promise<Protocol.Runtime.CallArgument> {
    if ('handle' in argumentValue) {
      return { objectId: argumentValue.handle };
    }
    switch (argumentValue.type) {
      // Primitive Protocol Value
      // https://w3c.github.io/webdriver-bidi/#data-types-protocolValue-primitiveProtocolValue
      case 'undefined': {
        return { unserializableValue: 'undefined' };
      }
      case 'null': {
        return { unserializableValue: 'null' };
      }
      case 'string': {
        return { value: argumentValue.value };
      }
      case 'number': {
        if (argumentValue.value === 'NaN') {
          return { unserializableValue: 'NaN' };
        } else if (argumentValue.value === '-0') {
          return { unserializableValue: '-0' };
        } else if (argumentValue.value === '+Infinity') {
          return { unserializableValue: '+Infinity' };
        } else if (argumentValue.value === 'Infinity') {
          return { unserializableValue: 'Infinity' };
        } else if (argumentValue.value === '-Infinity') {
          return { unserializableValue: '-Infinity' };
        } else {
          return {
            value: argumentValue.value,
          };
        }
      }
      case 'boolean': {
        return { value: !!argumentValue.value };
      }
      case 'bigint': {
        return {
          unserializableValue: `BigInt(${JSON.stringify(argumentValue.value)})`,
        };
      }

      // Local Value
      // https://w3c.github.io/webdriver-bidi/#data-types-protocolValue-LocalValue
      case 'date': {
        return {
          unserializableValue: `new Date(Date.parse(${JSON.stringify(
            argumentValue.value
          )}))`,
        };
      }
      case 'regexp': {
        return {
          unserializableValue: `new RegExp(${JSON.stringify(
            argumentValue.value.pattern
          )}, ${JSON.stringify(argumentValue.value.flags)})`,
        };
      }
      case 'map': {
        // TODO(sadym): if non of the nested keys and values has remote
        //  reference, serialize to `unserializableValue` without CDP roundtrip.
        const keyValueArray = await this.#flattenKeyValuePairs(
          argumentValue.value,
          realm
        );
        let argEvalResult = await realm.cdpClient.Runtime.callFunctionOn({
          functionDeclaration: String(function (
            ...args: Protocol.Runtime.CallArgument[]
          ) {
            const result = new Map();
            for (let i = 0; i < args.length; i += 2) {
              result.set(args[i], args[i + 1]);
            }
            return result;
          }),
          awaitPromise: false,
          arguments: keyValueArray,
          returnByValue: false,
          executionContextId: realm.executionContextId,
        });

        // TODO(sadym): dispose nested objects.

        return { objectId: argEvalResult.result.objectId };
      }
      case 'object': {
        // TODO(sadym): if non of the nested keys and values has remote
        //  reference, serialize to `unserializableValue` without CDP roundtrip.
        const keyValueArray = await this.#flattenKeyValuePairs(
          argumentValue.value,
          realm
        );

        let argEvalResult = await realm.cdpClient.Runtime.callFunctionOn({
          functionDeclaration: String(function (
            ...args: Protocol.Runtime.CallArgument[]
          ) {
            const result: Record<
              string | number | symbol,
              Protocol.Runtime.CallArgument
            > = {};

            for (let i = 0; i < args.length; i += 2) {
              // Key should be either `string`, `number`, or `symbol`.
              const key = args[i] as string | number | symbol;
              result[key] = args[i + 1];
            }
            return result;
          }),
          awaitPromise: false,
          arguments: keyValueArray,
          returnByValue: false,
          executionContextId: realm.executionContextId,
        });

        // TODO(sadym): dispose nested objects.

        return { objectId: argEvalResult.result.objectId };
      }
      case 'array': {
        // TODO(sadym): if non of the nested items has remote reference,
        //  serialize to `unserializableValue` without CDP roundtrip.
        const args = await ScriptEvaluator.#flattenValueList(
          argumentValue.value,
          realm
        );

        let argEvalResult = await realm.cdpClient.Runtime.callFunctionOn({
          functionDeclaration: String(function (...args: unknown[]) {
            return args;
          }),
          awaitPromise: false,
          arguments: args,
          returnByValue: false,
          executionContextId: realm.executionContextId,
        });

        // TODO(sadym): dispose nested objects.

        return { objectId: argEvalResult.result.objectId };
      }
      case 'set': {
        // TODO(sadym): if non of the nested items has remote reference,
        //  serialize to `unserializableValue` without CDP roundtrip.
        const args = await this.#flattenValueList(argumentValue.value, realm);

        let argEvalResult = await realm.cdpClient.Runtime.callFunctionOn({
          functionDeclaration: String(function (...args: unknown[]) {
            return new Set(args);
          }),
          awaitPromise: false,
          arguments: args,
          returnByValue: false,
          executionContextId: realm.executionContextId,
        });
        return { objectId: argEvalResult.result.objectId };
      }

      // TODO(sadym): dispose nested objects.

      default:
        throw new Error(
          `Value ${JSON.stringify(argumentValue)} is not deserializable.`
        );
    }
  }

  static async #flattenKeyValuePairs(
    value: CommonDataTypes.MappingLocalValue,
    realm: Realm
  ): Promise<Protocol.Runtime.CallArgument[]> {
    const keyValueArray: Protocol.Runtime.CallArgument[] = [];
    for (let pair of value) {
      const key = pair[0];
      const value = pair[1];

      let keyArg, valueArg;

      if (typeof key === 'string') {
        // Key is a string.
        keyArg = { value: key };
      } else {
        // Key is a serialized value.
        keyArg = await this.#deserializeToCdpArg(key, realm);
      }

      valueArg = await this.#deserializeToCdpArg(value, realm);

      keyValueArray.push(keyArg);
      keyValueArray.push(valueArg);
    }
    return keyValueArray;
  }

  static async #flattenValueList(
    list: CommonDataTypes.ListLocalValue,
    realm: Realm
  ): Promise<Protocol.Runtime.CallArgument[]> {
    const result: Protocol.Runtime.CallArgument[] = [];

    for (let value of list) {
      result.push(await this.#deserializeToCdpArg(value, realm));
    }

    return result;
  }

  // Try to parse CDP remote value to avoid CDP round-trips.
  static #tryParseCdpRemoteValue(
    cdpObject: Protocol.Runtime.RemoteObject | undefined,
    maxDepth: number
  ): CommonDataTypes.RemoteValue | undefined {
    if (cdpObject === undefined) {
      return undefined;
    }
    switch (cdpObject.type) {
      case 'undefined':
        return { type: 'undefined' };
      case 'string':
        // Preview value has description instead of value.
        return {
          type: 'string',
          value: cdpObject.value ?? cdpObject.description,
        };
      case 'number':
        let numberValue: string | number | undefined =
          cdpObject.value ??
          cdpObject.unserializableValue ??
          // Preview value has description instead of value and unserializableValue.
          cdpObject.description;

        if (!isNaN(Number(numberValue))) {
          numberValue = Number(numberValue);
        }

        if (numberValue === -0) {
          numberValue = '-0';
        }
        if (numberValue === Infinity) {
          numberValue = 'Infinity';
        }
        if (numberValue === -Infinity) {
          numberValue = '-Infinity';
        }
        if (numberValue === NaN) {
          numberValue = 'NaN';
        }

        if (numberValue !== undefined) {
          return {
            type: 'number',
            value: numberValue,
          };
        }

      case 'bigint':
        // Trim last 'n' symbol
        const value = (
          cdpObject.unserializableValue ?? cdpObject.value
        )?.replaceAll('n', '');
        if (value !== undefined) {
          return {
            type: 'bigint',
            value,
          };
        }
      case 'boolean':
        return {
          type: 'boolean',
          value: cdpObject.value,
        };
      case 'function':
        return {
          type: 'function',
        };
      case 'symbol':
        return {
          type: 'symbol',
        };
      case 'object':
        if (maxDepth == 0) {
          // Object is nested in preview, and no need in serialization.
          if (
            cdpObject.value === 'Object' ||
            cdpObject.description === 'Object'
          ) {
            return { type: 'object' };
          }
        }
        // {
        //   type: 'object',
        //   className: 'Object',
        //   description: 'Object',
        //   objectId: '-6798027118796624854.1.1',
        //   preview: {
        //     type: 'object',
        //     description: 'Object',
        //     overflow: false,
        //     properties: [
        //       {
        //         name: 'foo',
        //         type: 'object',
        //         value: 'Object',
        //       },
        //       {
        //         name: 'qux',
        //         type: 'string',
        //         value: 'quux',
        //       },
        //     ],
        //   },
        // };
        if (cdpObject.description === 'Object') {
          const value = cdpObject.preview?.properties?.map((p) => [
            p.name,
            this.#tryParseCdpRemoteValue(
              p as Protocol.Runtime.RemoteObject,
              maxDepth - 1
            ),
          ]);
          // Check if all the values deserialized.
          if (
            value !== undefined &&
            value.filter(
              (v) => v === undefined || v[0] === undefined || v[1] === undefined
            ).length == 0
          ) {
            return {
              type: 'object',
              value,
            };
          }
        }
        switch (cdpObject.subtype) {
          case 'null':
            return { type: 'null' };
          case 'promise':
            return { type: 'promise' };
          case 'weakmap':
            return { type: 'weakmap' };
          case 'weakset':
            return { type: 'weakset' };
          case 'proxy':
            return { type: 'proxy' };
          case 'typedarray':
            return { type: 'typedarray' };
          case 'error':
            return { type: 'error' };
          case 'regexp':
            // {
            //   type: 'object',
            //   subtype: 'regexp',
            //   className: 'RegExp',
            //   description: '/ab+c/i',
            //   objectId: '-136234030541836609.1.1',
            //   preview: {
            //     type: 'object',
            //     subtype: 'regexp',
            //     description: '/ab+c/i',
            //     overflow: true,
            //     properties: [
            //       {
            //         name: 'lastIndex',
            //         type: 'number',
            //         value: '0',
            //       },
            //       {
            //         name: 'dotAll',
            //         type: 'boolean',
            //         value: 'false',
            //       },
            //       {
            //         name: 'flags',
            //         type: 'string',
            //         value: 'i',
            //       },
            //       {
            //         name: 'global',
            //         type: 'boolean',
            //         value: 'false',
            //       },
            //       { name: 'hasIndices', type: 'boolean', value: 'false' },
            //     ],
            //   },
            // };
            if (maxDepth == 0) {
              return { type: 'regexp' };
            }
            if (cdpObject.description !== undefined) {
              // const regex = new RegExp(cdpObject.description);
              const firstSlash = cdpObject.description.indexOf('/');
              const lastSlash = cdpObject.description.lastIndexOf('/');
              const pattern = cdpObject.description.substring(
                firstSlash + 1,
                lastSlash
              );
              const flags = cdpObject.description.substring(lastSlash + 1);
              return {
                type: 'regexp',
                value: {
                  pattern,
                  ...(flags === '' ? {} : { flags }),
                },
              };
            }
          case 'array':
            if (maxDepth == 0) {
              return { type: 'array' };
            }
          // {
          //   type: 'object',
          //   subtype: 'map',
          //   className: 'Map',
          //   description: 'Map(2)',
          //   objectId: '-830751083908063883.1.3',
          //   preview: {
          //     type: 'object',
          //     subtype: 'map',
          //     description: 'Map(2)',
          //     overflow: false,
          //     properties: [
          //       {
          //         name: 'size',
          //         type: 'number',
          //         value: '2',
          //       },
          //     ],
          //     entries: [
          //       {
          //         key: {
          //           type: 'string',
          //           description: 'foo',
          //           overflow: false,
          //           properties: [],
          //         },
          //         value: {
          //           type: 'object',
          //           description: 'Object',
          //           overflow: false,
          //           properties: [],
          //         },
          //       },
          //       {
          //         key: {
          //           type: 'string',
          //           description: 'qux',
          //           overflow: false,
          //           properties: [],
          //         },
          //         value: {
          //           type: 'string',
          //           description: 'quux',
          //           overflow: false,
          //           properties: [],
          //         },
          //       },
          //     ],
          //   },
          // };
          case 'map':
            if (maxDepth == 0) {
              return { type: 'map' };
            }

            const value = cdpObject.preview?.entries?.map((e) => {
              let key = this.#tryParseCdpRemoteValue(
                e?.key as Protocol.Runtime.RemoteObject,
                maxDepth - 1
              );
              if (key?.type === 'string' || key?.type === 'number') {
                key = key?.value;
              }
              const val = this.#tryParseCdpRemoteValue(
                e?.value as Protocol.Runtime.RemoteObject,
                maxDepth - 1
              );
              return [key, val];
            });
            // Check if all the values deserialized.
            if (
              value !== undefined &&
              value.filter(
                (v) =>
                  v === undefined || v[0] === undefined || v[1] === undefined
              ).length == 0
            ) {
              return {
                type: 'map',
                value,
              };
            }

            // {
            //   "type": "object",
            //   "subtype": "array",
            //   "className": "Array",
            //   "description": "Array(4)",
            //   "objectId": "1623266726298348871.1.1",
            //   "preview": {
            //     "type": "object",
            //     "subtype": "array",
            //     "description": "Array(4)",
            //     "overflow": false,
            //     "properties": [
            //       {
            //         "name": "0",
            //         "type": "number",
            //         "value": "1"
            //       },
            //       {
            //         "name": "1",
            //         "type": "string",
            //         "value": "a"
            //       },
            //       {
            //         "name": "2",
            //         "type": "object",
            //         "value": "Object"
            //       },
            //       {
            //         "name": "3",
            //         "type": "object",
            //         "value": "Array(2)",
            //         "subtype": "array"
            //       }
            //     ]
            //   }
            // }
            if (
              cdpObject.preview !== undefined &&
              cdpObject.preview.properties !== undefined
            ) {
              const value = cdpObject.preview.properties.map((p) =>
                this.#tryParseCdpRemoteValue(
                  p as Protocol.Runtime.RemoteObject,
                  maxDepth - 1
                )
              );
              // Check if all the values deserialized.
              if (value.filter((v) => v === undefined).length == 0) {
                return {
                  type: 'array',
                  value,
                };
              }
            }
          case 'set':
            if (maxDepth == 0) {
              return { type: 'set' };
            }
            // {
            //   type: 'object',
            //   subtype: 'set',
            //   className: 'Set',
            //   description: 'Set(4)',
            //   objectId: '-2164266287133224452.1.1',
            //   preview: {
            //     type: 'object',
            //     subtype: 'set',
            //     description: 'Set(4)',
            //     overflow: false,
            //     properties: [
            //       {
            //         name: 'size',
            //         type: 'number',
            //         value: '4',
            //       },
            //     ],
            //     entries: [
            //       {
            //         value: {
            //           type: 'number',
            //           description: '1',
            //           overflow: false,
            //           properties: [],
            //         },
            //       },
            //       {
            //         value: {
            //           type: 'string',
            //           description: 'a',
            //           overflow: false,
            //           properties: [],
            //         },
            //       },
            //       {
            //         value: {
            //           type: 'object',
            //           description: 'Object',
            //           overflow: false,
            //           properties: [
            //             {
            //               name: 'foo',
            //               type: 'string',
            //               value: 'bar',
            //             },
            //           ],
            //         },
            //       },
            //       {
            //         value: {
            //           type: 'object',
            //           subtype: 'array',
            //           description: 'Array(2)',
            //           overflow: false,
            //           properties: [
            //             {
            //               name: '0',
            //               type: 'number',
            //               value: '2',
            //             },
            //             {
            //               name: '1',
            //               type: 'object',
            //               value: 'Array(2)',
            //               subtype: 'array',
            //             },
            //           ],
            //         },
            //       },
            //     ],
            //   },
            // };
            if (
              cdpObject.preview !== undefined &&
              cdpObject.preview.entries !== undefined
            ) {
              const value = cdpObject.preview.entries.map((p) =>
                this.#tryParseCdpRemoteValue(
                  p?.value as Protocol.Runtime.RemoteObject,
                  maxDepth - 1
                )
              );
              // Check if all the values deserialized.
              if (value.filter((v) => v === undefined).length == 0) {
                return {
                  type: 'set',
                  value,
                };
              }
            }
        }
    }

    return undefined;
  }
}
