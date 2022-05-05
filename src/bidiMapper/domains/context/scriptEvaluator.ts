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
import { CdpClient } from '../../../cdp';
import { Script } from '../../bidiProtocolTypes';

export class ScriptEvaluator {
  #cdpClient: CdpClient;
  // As `script.evaluate` wraps call into serialization script, `lineNumber`
  // should be adjusted.
  readonly #evaluateStacktraceLineOffset = 0;
  readonly #callFunctionStacktraceLineOffset = 1;

  private constructor(_cdpClient: CdpClient) {
    this.#cdpClient = _cdpClient;
  }

  public static create(cdpClient: CdpClient) {
    return new ScriptEvaluator(cdpClient);
  }

  /**
   * Serializes a given CDP object into BiDi, keeping references in the
   * target's `globalThis`.
   * @param cdpObject CDP remote object to be serialized.
   */
  public async serializeCdpObject(cdpObject: Protocol.Runtime.RemoteObject) {
    let cdpWebDriverValue = (await this.#cdpClient.Runtime.callFunctionOn({
      functionDeclaration: String((obj: any) => obj),
      awaitPromise: true,
      arguments: [cdpObject],
      generateWebDriverValue: true,
      objectId: await this.#getDummyContextId(),
    } as any)) as any;
    return ScriptEvaluator.#cdpToBidiValue(cdpWebDriverValue);
  }

  /**
   * Gets the string representation of an object. This is equivalent to
   * calling toString() on the object value.
   * @param cdpObject CDP remote object representing an object.
   * @returns string The stringified object.
   */
  async stringifyObject(cdpObject: Protocol.Runtime.RemoteObject) {
    let stringifyResult = await this.#cdpClient.Runtime.callFunctionOn({
      functionDeclaration: String(function (obj: unknown) {
        return String(obj);
      }),
      awaitPromise: true,
      arguments: [cdpObject],
      returnByValue: true,
      objectId: await this.#getDummyContextId(),
    });
    return stringifyResult.result.value;
  }

  // TODO sadym: `dummyContextObject` needed for the running context.
  // Use the proper `executionContextId` instead:
  // https://github.com/GoogleChromeLabs/chromium-bidi/issues/52
  async #getDummyContextId(): Promise<string> {
    const dummyContextObject = await this.#cdpClient.Runtime.evaluate({
      expression: '(()=>{return {}})()',
    });
    return dummyContextObject.result.objectId!;
  }

  public async callFunction(
    functionDeclaration: string,
    _this: Script.ArgumentValue,
    args: Script.ArgumentValue[],
    awaitPromise: boolean
  ): Promise<Script.CallFunctionResult> {
    const callFunctionAndSerializeScript = `(...args)=>{ return _callFunction((\n${functionDeclaration}\n), args);
      function _callFunction(f, args) {
        const deserializedThis = args.shift();
        const deserializedArgs = args;
        return f.apply(deserializedThis, deserializedArgs);
      }}`;

    const dd = [await this.#deserializeToCdpArg(_this)];
    dd.push(
      ...(await Promise.all(
        args.map(async (a) => {
          return await this.#deserializeToCdpArg(a);
        })
      ))
    );

    let cdpCallFunctionResult = (await this.#cdpClient.Runtime.callFunctionOn({
      functionDeclaration: callFunctionAndSerializeScript,
      awaitPromise,
      arguments: dd, // this, arguments.
      generateWebDriverValue: true,
      objectId: await this.#getDummyContextId(),
    } as any)) as any;

    if (cdpCallFunctionResult.exceptionDetails) {
      // Serialize exception details.
      return await this.#serializeCdpExceptionDetails(
        cdpCallFunctionResult.exceptionDetails,
        this.#callFunctionStacktraceLineOffset
      );
    }

    cdpCallFunctionResult = ScriptEvaluator.#cdpToBidiValue(
      cdpCallFunctionResult
    );

    return { result: cdpCallFunctionResult as any };
  }

  async #serializeCdpExceptionDetails(
    cdpExceptionDetails: Protocol.Runtime.ExceptionDetails,
    lineOffset: number
  ) {
    const callFrames = cdpExceptionDetails.stackTrace?.callFrames.map(
      (frame) => ({
        url: frame.url,
        functionName: frame.functionName,
        // As `script.evaluate` wraps call into serialization script, so
        // `lineNumber` should be adjusted.
        lineNumber: frame.lineNumber - lineOffset,
        columnNumber: frame.columnNumber,
      })
    );

    const exception = await this.serializeCdpObject(
      // Exception should always be there.
      cdpExceptionDetails.exception!
    );

    const text = await this.stringifyObject(cdpExceptionDetails.exception!);

    return {
      exceptionDetails: {
        exception,
        columnNumber: cdpExceptionDetails.columnNumber,
        // As `script.evaluate` wraps call into serialization script, so
        // `lineNumber` should be adjusted.
        lineNumber: cdpExceptionDetails.lineNumber - lineOffset,
        stackTrace: {
          callFrames: callFrames || [],
        },
        text: text || cdpExceptionDetails.text,
      },
    };
  }

  static #cdpToBidiValue(cdpValue: any): any {
    const bidiValue = (cdpValue.result as any).webDriverValue;
    if (cdpValue.result.objectId) {
      bidiValue.objectId = cdpValue.result.objectId;
    }
    return bidiValue;
  }

  public async scriptEvaluate(
    expression: string,
    awaitPromise: boolean
  ): Promise<Script.EvaluateResult> {
    let cdpEvaluateResult = await this.#cdpClient.Runtime.evaluate({
      expression,
      awaitPromise,
      generateWebDriverValue: true,
    } as any);

    if (cdpEvaluateResult.exceptionDetails) {
      // Serialize exception details.
      return await this.#serializeCdpExceptionDetails(
        cdpEvaluateResult.exceptionDetails,
        this.#evaluateStacktraceLineOffset
      );
    }

    return {
      result: ScriptEvaluator.#cdpToBidiValue(cdpEvaluateResult),
    };
  }

  async #deserializeToCdpArg(serializedValue: any): Promise<any> {
    if (serializedValue.objectId) {
      return { objectId: serializedValue.objectId };
    }
    switch (serializedValue.type) {
      // Primitive Protocol Value
      // https://w3c.github.io/webdriver-bidi/#data-types-protocolValue-primitiveProtocolValue
      case 'undefined': {
        return { unserializableValue: 'undefined' };
      }
      case 'null': {
        return { unserializableValue: 'null' };
      }
      case 'string': {
        return { value: serializedValue.value };
      }
      case 'number': {
        if (serializedValue.value === 'NaN') {
          return { unserializableValue: 'NaN' };
        } else if (serializedValue.value === '-0') {
          return { unserializableValue: '-0' };
        } else if (serializedValue.value === '+Infinity') {
          return { unserializableValue: '+Infinity' };
        } else if (serializedValue.value === 'Infinity') {
          return { unserializableValue: 'Infinity' };
        } else if (serializedValue.value === '-Infinity') {
          return { unserializableValue: '-Infinity' };
        } else {
          return {
            value: serializedValue.value,
          };
        }
      }
      case 'boolean': {
        return { value: !!serializedValue.value };
      }
      case 'bigint': {
        return {
          unserializableValue: `BigInt(${serializedValue.value})`,
        };
      }

      // Local Value
      // https://w3c.github.io/webdriver-bidi/#data-types-protocolValue-LocalValue
      case 'array': {
        const args = await Promise.all(
          (serializedValue.value as []).map(
            async (c) => await this.#deserializeToCdpArg(c)
          )
        );

        let argEvalResult = await this.#cdpClient.Runtime.callFunctionOn({
          functionDeclaration: String(function (...args: unknown[]) {
            return args;
          }),
          awaitPromise: true,
          arguments: args,
          returnByValue: false,
          objectId: await this.#getDummyContextId(),
        });
        return { objectId: argEvalResult.result.objectId };
      }
      case 'date': {
        return {
          unserializableValue: `new Date(Date.parse(${JSON.stringify(
            serializedValue.value
          )}))`,
        };
      }
      case 'map': {
        // Has value.length * 2 length, contains key followed by value.
        const keyValueArray: any = [];

        for (let i = 0; i < (serializedValue.value as []).length; i++) {
          const pair = (serializedValue.value as [])[i];
          const key = pair[0];
          const value = pair[1];

          let keyArg, valueArg;

          // @ts-ignore
          if (key.type) {
            // Key is a serialized value.
            keyArg = await this.#deserializeToCdpArg(key);
          } else {
            // Key is a primitive.
            keyArg = { value: key };
          }

          valueArg = await this.#deserializeToCdpArg(value);

          keyValueArray.push(keyArg);
          keyValueArray.push(valueArg);
        }

        let argEvalResult = await this.#cdpClient.Runtime.callFunctionOn({
          functionDeclaration: String(function (...args: unknown[]) {
            const result = new Map();
            for (let i = 0; i < args.length; i += 2) {
              // @ts-ignore
              result.set(args[i], args[i + 1]);
            }
            return result;
          }),
          awaitPromise: true,
          arguments: keyValueArray,
          returnByValue: false,
          objectId: await this.#getDummyContextId(),
        });
        return { objectId: argEvalResult.result.objectId };
      }
      case 'object': {
        // Has value.length * 2 length, contains key followed by value.
        const keyValueArray: any = [];

        for (let i = 0; i < (serializedValue.value as []).length; i++) {
          const pair = (serializedValue.value as [])[i];
          const key = pair[0];
          const value = pair[1];

          let keyArg, valueArg;

          // @ts-ignore
          if (key.type) {
            // Key is a serialized value.
            keyArg = await this.#deserializeToCdpArg(key);
          } else {
            // Key is a primitive.
            keyArg = { value: key };
          }

          valueArg = await this.#deserializeToCdpArg(value);

          keyValueArray.push(keyArg);
          keyValueArray.push(valueArg);
        }

        let argEvalResult = await this.#cdpClient.Runtime.callFunctionOn({
          functionDeclaration: String(function (...args: unknown[]) {
            const result = {};
            for (let i = 0; i < args.length; i += 2) {
              // @ts-ignore
              result[args[i]] = args[i + 1];
            }
            return result;
          }),
          awaitPromise: true,
          arguments: keyValueArray,
          returnByValue: false,
          objectId: await this.#getDummyContextId(),
        });
        return { objectId: argEvalResult.result.objectId };
      }
      case 'regexp': {
        return {
          unserializableValue: `new RegExp(${JSON.stringify(
            serializedValue.value.pattern
          )}, ${JSON.stringify(serializedValue.value.flags)})`,
        };
      }
      case 'set': {
        const args = await Promise.all(
          (serializedValue.value as []).map(
            async (c) => await this.#deserializeToCdpArg(c)
          )
        );

        let argEvalResult = await this.#cdpClient.Runtime.callFunctionOn({
          functionDeclaration: String(function (...args: unknown[]) {
            return new Set(args);
          }),
          awaitPromise: true,
          arguments: args,
          returnByValue: false,
          objectId: await this.#getDummyContextId(),
        });
        return { objectId: argEvalResult.result.objectId };
      }

      default:
        throw new Error(`Type ${serializedValue.type} is not deserializable.`);
    }
  }
}
