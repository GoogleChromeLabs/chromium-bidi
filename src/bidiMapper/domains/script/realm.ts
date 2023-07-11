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

import type {Protocol} from 'devtools-protocol';

import {
  ChromiumBidi,
  type BrowsingContext,
  Script,
} from '../../../protocol/protocol.js';
import type {BrowsingContextStorage} from '../context/browsingContextStorage.js';
import type {IEventManager} from '../events/EventManager.js';
import type {ICdpClient} from '../../../cdp/cdpClient.js';
import {LogType, type LoggerFn} from '../../../utils/log.js';

import {SHARED_ID_DIVIDER, ScriptEvaluator} from './scriptEvaluator.js';
import type {RealmStorage} from './realmStorage.js';

export class Realm {
  readonly #realmStorage: RealmStorage;
  readonly #browsingContextStorage: BrowsingContextStorage;
  readonly #realmId: Script.Realm;
  readonly #browsingContextId: BrowsingContext.BrowsingContext;
  readonly #executionContextId: Protocol.Runtime.ExecutionContextId;
  readonly #origin: string;
  readonly #type: Script.RealmType;
  readonly #cdpClient: ICdpClient;
  readonly #eventManager: IEventManager;
  readonly #scriptEvaluator: ScriptEvaluator;
  readonly sandbox?: string;
  readonly cdpSessionId: string;

  readonly #logger?: LoggerFn;

  constructor(
    realmStorage: RealmStorage,
    browsingContextStorage: BrowsingContextStorage,
    realmId: Script.Realm,
    browsingContextId: BrowsingContext.BrowsingContext,
    executionContextId: Protocol.Runtime.ExecutionContextId,
    origin: string,
    type: Script.RealmType,
    sandbox: string | undefined,
    cdpSessionId: string,
    cdpClient: ICdpClient,
    eventManager: IEventManager,
    logger?: LoggerFn
  ) {
    this.#realmId = realmId;
    this.#browsingContextId = browsingContextId;
    this.#executionContextId = executionContextId;
    this.sandbox = sandbox;
    this.#origin = origin;
    this.#type = type;
    this.cdpSessionId = cdpSessionId;
    this.#cdpClient = cdpClient;
    this.#realmStorage = realmStorage;
    this.#browsingContextStorage = browsingContextStorage;
    this.#eventManager = eventManager;
    this.#scriptEvaluator = new ScriptEvaluator(this.#eventManager);
    this.#logger = logger;

    this.#realmStorage.addRealm(this);

    this.#eventManager.registerEvent(
      {
        method: ChromiumBidi.Script.EventNames.RealmCreated,
        params: this.toBiDi(),
      },
      this.browsingContextId
    );
  }

  async #releaseObject(handle: Script.Handle) {
    try {
      await this.cdpClient.sendCommand('Runtime.releaseObject', {
        objectId: handle,
      });
    } catch (error: any) {
      // Heuristic to determine if the problem is in the unknown handler.
      // Ignore the error if so.
      if (
        !(
          error.code === -32000 &&
          (error as Error).message === 'Invalid remote object id'
        )
      ) {
        throw error;
      }
    }
  }

  async disown(handle: Script.Handle) {
    // Disowning an object from different realm does nothing.
    if (this.#realmStorage.knownHandlesToRealm.get(handle) !== this.realmId) {
      return;
    }

    await this.#releaseObject(handle);

    this.#realmStorage.knownHandlesToRealm.delete(handle);
  }

  cdpToBidiValue(
    cdpValue:
      | Protocol.Runtime.CallFunctionOnResponse
      | Protocol.Runtime.EvaluateResponse,
    resultOwnership: Script.ResultOwnership
  ): Script.RemoteValue {
    const deepSerializedValue = cdpValue.result.deepSerializedValue!;
    const bidiValue = this.deepSerializedToBiDi(deepSerializedValue);

    if (cdpValue.result.objectId) {
      const objectId = cdpValue.result.objectId;
      if (resultOwnership === Script.ResultOwnership.Root) {
        // Extend BiDi value with `handle` based on required `resultOwnership`
        // and  CDP response but not on the actual BiDi type.
        (bidiValue as any).handle = objectId;
        // Remember all the handles sent to client.
        this.#realmStorage.knownHandlesToRealm.set(objectId, this.realmId);
      } else {
        // No need to await for the object to be released.
        void this.#releaseObject(objectId).catch((error) =>
          this.#logger?.(LogType.system, error)
        );
      }
    }

    return bidiValue;
  }

  deepSerializedToBiDi(
    webDriverValue: Protocol.Runtime.DeepSerializedValue
  ): Script.RemoteValue {
    // This relies on the CDP to implement proper BiDi serialization, except
    // backendNodeId/sharedId and `platformobject`.
    const result = webDriverValue as any;

    if (Object.hasOwn(result, 'weakLocalObjectReference')) {
      result.internalId = `${result.weakLocalObjectReference}`;
      delete result['weakLocalObjectReference'];
    }

    // Platform object is a special case. It should have only `{type: object}`
    // without `value` field.
    if (result.type === 'platformobject') {
      return {type: 'object'} as Script.RemoteValue;
    }

    if (
      result.type === 'object' &&
      ['generator', 'iterator'].includes(result.subtype)
    ) {
      return {type: result.subtype};
    }

    const bidiValue = result.value;
    if (bidiValue === undefined) {
      return result;
    }

    if (result.type === 'node') {
      if (Object.hasOwn(bidiValue, 'backendNodeId')) {
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        result.sharedId = `${this.navigableId}${SHARED_ID_DIVIDER}${bidiValue.backendNodeId}`;
        delete bidiValue['backendNodeId'];
      }
      if (Object.hasOwn(bidiValue, 'children')) {
        for (const i in bidiValue.children) {
          bidiValue.children[i] = this.deepSerializedToBiDi(
            bidiValue.children[i]
          );
        }
      }
      if (
        Object.hasOwn(bidiValue, 'shadowRoot') &&
        bidiValue.shadowRoot !== null
      ) {
        bidiValue.shadowRoot = this.deepSerializedToBiDi(bidiValue.shadowRoot);
      }
    }

    // Recursively update the nested values.
    if (
      ['array', 'set', 'htmlcollection', 'nodelist'].includes(
        webDriverValue.type
      )
    ) {
      for (const i in bidiValue) {
        bidiValue[i] = this.deepSerializedToBiDi(bidiValue[i]);
      }
    }
    if (['object', 'map'].includes(webDriverValue.type)) {
      for (const i in bidiValue) {
        bidiValue[i] = [
          this.deepSerializedToBiDi(bidiValue[i][0]),
          this.deepSerializedToBiDi(bidiValue[i][1]),
        ];
      }
    }

    return result;
  }

  toBiDi(): Script.RealmInfo {
    return {
      realm: this.realmId,
      origin: this.origin,
      type: this.type,
      context: this.browsingContextId,
      ...(this.sandbox === undefined ? {} : {sandbox: this.sandbox}),
    };
  }

  get realmId(): Script.Realm {
    return this.#realmId;
  }

  get navigableId(): string {
    return (
      this.#browsingContextStorage.findContext(this.#browsingContextId)
        ?.navigableId ?? 'UNKNOWN'
    );
  }

  get browsingContextId(): BrowsingContext.BrowsingContext {
    return this.#browsingContextId;
  }

  get executionContextId(): Protocol.Runtime.ExecutionContextId {
    return this.#executionContextId;
  }

  get origin(): string {
    return this.#origin;
  }

  get type(): Script.RealmType {
    return this.#type;
  }

  get cdpClient(): ICdpClient {
    return this.#cdpClient;
  }

  async callFunction(
    functionDeclaration: string,
    _this: Script.LocalValue,
    _arguments: Script.LocalValue[],
    awaitPromise: boolean,
    resultOwnership: Script.ResultOwnership,
    serializationOptions: Script.SerializationOptions
  ): Promise<Script.EvaluateResult> {
    const context = this.#browsingContextStorage.getContext(
      this.browsingContextId
    );
    await context.awaitUnblocked();

    return this.#scriptEvaluator.callFunction(
      this,
      functionDeclaration,
      _this,
      _arguments,
      awaitPromise,
      resultOwnership,
      serializationOptions
    );
  }

  async scriptEvaluate(
    expression: string,
    awaitPromise: boolean,
    resultOwnership: Script.ResultOwnership,
    serializationOptions: Script.SerializationOptions
  ): Promise<Script.EvaluateResult> {
    const context = this.#browsingContextStorage.getContext(
      this.browsingContextId
    );
    await context.awaitUnblocked();

    return this.#scriptEvaluator.scriptEvaluate(
      this,
      expression,
      awaitPromise,
      resultOwnership,
      serializationOptions
    );
  }

  /**
   * Serializes a given CDP object into BiDi, keeping references in the
   * target's `globalThis`.
   */
  async serializeCdpObject(
    cdpRemoteObject: Protocol.Runtime.RemoteObject,
    resultOwnership: Script.ResultOwnership
  ): Promise<Script.RemoteValue> {
    const arg = Realm.cdpRemoteObjectToCallArgument(cdpRemoteObject);

    const cdpWebDriverValue: Protocol.Runtime.CallFunctionOnResponse =
      await this.cdpClient.sendCommand('Runtime.callFunctionOn', {
        functionDeclaration: String((obj: unknown) => obj),
        awaitPromise: false,
        arguments: [arg],
        serializationOptions: {
          serialization: 'deep',
        },
        executionContextId: this.executionContextId,
      });
    return this.cdpToBidiValue(cdpWebDriverValue, resultOwnership);
  }

  static cdpRemoteObjectToCallArgument(
    cdpRemoteObject: Protocol.Runtime.RemoteObject
  ): Protocol.Runtime.CallArgument {
    if (cdpRemoteObject.objectId !== undefined) {
      return {objectId: cdpRemoteObject.objectId};
    }
    if (cdpRemoteObject.unserializableValue !== undefined) {
      return {unserializableValue: cdpRemoteObject.unserializableValue};
    }
    return {value: cdpRemoteObject.value};
  }

  /**
   * Gets the string representation of an object. This is equivalent to
   * calling `toString()` on the object value.
   */
  async stringifyObject(
    cdpObject: Protocol.Runtime.RemoteObject
  ): Promise<string> {
    const result = await this.cdpClient.sendCommand('Runtime.callFunctionOn', {
      functionDeclaration: String((object: Protocol.Runtime.RemoteObject) =>
        String(object)
      ),
      awaitPromise: false,
      arguments: [cdpObject],
      returnByValue: true,
      executionContextId: this.executionContextId,
    });
    return result.result.value;
  }

  dispose() {
    this.#eventManager.registerEvent(
      {
        method: ChromiumBidi.Script.EventNames.RealmDestroyed,
        params: {
          realm: this.realmId,
        },
      },
      this.browsingContextId
    );
  }
}
