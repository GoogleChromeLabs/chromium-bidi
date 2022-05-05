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
    let asd = (await this.#cdpClient.Runtime.callFunctionOn({
      functionDeclaration: String((obj: any) => obj),
      awaitPromise: true,
      arguments: [cdpObject],
      generateWebDriverValue: true,
      objectId: await this.#getDummyContextId(),
    } as any)) as any;
    return ScriptEvaluator.#cdpToBidiValue(asd);
  }

  /**
   * Gets the string representation of an object. This is equivalent to
   * calling toString() on the object value.
   * @param cdpObject CDP remote object representing an object.
   * @returns string The stringified object.
   */
  async stringifyObject(cdpObject: Protocol.Runtime.RemoteObject) {
    let stringifyResult = (await this.#cdpClient.Runtime.callFunctionOn({
      functionDeclaration: String(function (obj: unknown) {
        return String(obj);
      }),
      awaitPromise: true,
      arguments: [cdpObject],
      returnByValue: true,
      objectId: await this.#getDummyContextId(),
    } as any)) as any;
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
    const cdpCallFunctionResult = await this.#executeCallFunction(
      functionDeclaration,
      _this,
      args,
      awaitPromise
    );

    return cdpCallFunctionResult as any;
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

    console.log('!!@@## cdpValue', JSON.stringify(cdpValue));

    if (cdpValue.result.objectId) {
      bidiValue.objectId = cdpValue.result.objectId;
    }

    console.log('!!@@## bidiValue', JSON.stringify(bidiValue));
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

  static async #deserializeToCdpArg(serializedValue: any): Promise<any> {
    if (serializedValue.objectId) {
      return { objectId: serializedValue.objectId };
    }
    switch (serializedValue.type) {
      // case '':
      //   return { value: arg };

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
          return { unserializableValue: `Number(${serializedValue.value})` };
        }
      }
      case 'boolean': {
        return { unserializableValue: 'serializedValue.value' };
      }
      case 'bigint': {
        // TODO: implement.
        throw new Error(
          `Deserialization of type ${serializedValue.type} is not yet implemented.`
        );
      }

      // Local Value
      // https://w3c.github.io/webdriver-bidi/#data-types-protocolValue-LocalValue
      case 'array': {
        throw new Error(
          `Deserialization of type ${serializedValue.type} is not yet implemented.`
        );
        // const result = [];
        // for (let val of serializedValue.value) {
        //   result.push(deserialize(val));
        // }
        // return result;
      }
      case 'date': {
        // TODO: implement.
        throw new Error(
          `Deserialization of type ${serializedValue.type} is not yet implemented.`
        );
      }
      case 'map': {
        // TODO: implement.
        throw new Error(
          `Deserialization of type ${serializedValue.type} is not yet implemented.`
        );
      }
      case 'object': {
        throw new Error(
          `Deserialization of type ${serializedValue.type} is not yet implemented.`
        );
        // const result = {};
        // for (let val of serializedValue.value) {
        //   // TODO sadym: implement key deserialization.
        //   result[val[0]] = deserialize(val[1]);
        // }
        // return result;
      }
      case 'regexp': {
        // TODO: implement.
        throw new Error(
          `Deserialization of type ${serializedValue.type} is not yet implemented.`
        );
      }
      case 'set': {
        // TODO: implement.
        throw new Error(
          `Deserialization of type ${serializedValue.type} is not yet implemented.`
        );
      }
      case 'PROTO.binding': {
        throw new Error(
          `Deserialization of type ${serializedValue.type} is not yet implemented.`
        );
        //   return (...args)=>{
        //     const serializedArgs = args.map(a => serialize(a));
        //     const callbackPayload = JSON.stringify({
        //       arguments: serializedArgs,
        //       id: serializedValue.id
        //     });
        //     getCdpBinding()(callbackPayload);
        //   }
      }

      default:
        throw new Error(`Type ${serializedValue.type} is not deserializable.`);
    }

    //   default:
    //     throw new Error(`Type ${serializedValue.type} is not deserializable.`);
    // }
  }

  async #executeCallFunction(
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

    const dd = [await ScriptEvaluator.#deserializeToCdpArg(_this)];
    dd.push(
      ...(await Promise.all(
        args.map(async (a) => {
          return await ScriptEvaluator.#deserializeToCdpArg(a);
        })
      ))
    );

    console.log('!!@@## _executeCallFunction', JSON.stringify(dd));

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

  // TODO(sadym): implement.
  // #handleBindingCalledEvent() {
  //   this.#cdpClient.Runtime.on('bindingCalled', async (params) => {
  //     if (params.name === this.#callbackName) {
  //       const payload = JSON.parse(params.payload);
  //       await this.#bidiServer.sendMessage({
  //         method: 'PROTO.script.called',
  //         params: {
  //           arguments: payload.arguments,
  //           id: payload.id,
  //         },
  //       });
  //     }
  //   });
  // }
}
