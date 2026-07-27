/**
 * Copyright 2023 Google LLC.
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

import {
  type BrowsingContext,
  ChromiumBidi,
  type EmptyResult,
  InvalidArgumentException,
  type Script,
} from '../../../protocol/protocol.js';
import type {LoggerFn} from '../../../utils/log.js';
import type {UserContextStorage} from '../browser/UserContextStorage.js';
import type {BrowsingContextImpl} from '../context/BrowsingContextImpl.js';
import type {BrowsingContextStorage} from '../context/BrowsingContextStorage.js';
import {type EventManager, EventManagerEvents} from '../session/EventManager.js';

import type {ClassicResponse} from '../../ClassicTransport.js';
import {PreloadScript} from './PreloadScript.js';
import type {PreloadScriptStorage} from './PreloadScriptStorage.js';
import type {Realm} from './Realm.js';
import type {RealmStorage} from './RealmStorage.js';

export class ScriptProcessor {
  readonly #eventManager: EventManager;
  readonly #browsingContextStorage: BrowsingContextStorage;
  readonly #realmStorage: RealmStorage;
  readonly #preloadScriptStorage;
  readonly #userContextStorage: UserContextStorage;
  readonly #logger?: LoggerFn;

  constructor(
    eventManager: EventManager,
    browsingContextStorage: BrowsingContextStorage,
    realmStorage: RealmStorage,
    preloadScriptStorage: PreloadScriptStorage,
    userContextStorage: UserContextStorage,
    logger?: LoggerFn,
  ) {
    this.#browsingContextStorage = browsingContextStorage;
    this.#realmStorage = realmStorage;
    this.#preloadScriptStorage = preloadScriptStorage;
    this.#userContextStorage = userContextStorage;
    this.#logger = logger;

    this.#eventManager = eventManager;
    this.#eventManager.addSubscribeHook(
      ChromiumBidi.Script.EventNames.RealmCreated,
      this.#onRealmCreatedSubscribeHook.bind(this),
    );
  }

  #onRealmCreatedSubscribeHook(
    contextId: BrowsingContext.BrowsingContext,
  ): Promise<void> {
    const context = this.#browsingContextStorage.getContext(contextId);
    const contextsToReport = [
      context,
      ...this.#browsingContextStorage.getContext(contextId).allChildren,
    ];

    const realms = new Set<Realm>();
    for (const reportContext of contextsToReport) {
      const realmsForContext = this.#realmStorage.findRealms({
        browsingContextId: reportContext.id,
      });
      for (const realm of realmsForContext) {
        realms.add(realm);
      }
    }

    for (const realm of realms) {
      this.#eventManager.registerEvent(
        {
          type: 'event',
          method: ChromiumBidi.Script.EventNames.RealmCreated,
          params: realm.realmInfo,
        },
        context.id,
      );
    }

    return Promise.resolve();
  }

  async addPreloadScript(
    params: Script.AddPreloadScriptParameters,
  ): Promise<Script.AddPreloadScriptResult> {
    if (params.userContexts?.length && params.contexts?.length) {
      throw new InvalidArgumentException(
        'Both userContexts and contexts cannot be specified.',
      );
    }

    const userContexts = await this.#userContextStorage.verifyUserContextIdList(
      params.userContexts ?? [],
    );

    const browsingContexts =
      this.#browsingContextStorage.verifyTopLevelContextsList(params.contexts);

    const preloadScript = new PreloadScript(params, this.#logger);
    this.#preloadScriptStorage.add(preloadScript);

    let contextsToRunIn: BrowsingContextImpl[] = [];
    if (userContexts.size) {
      contextsToRunIn = this.#browsingContextStorage
        .getTopLevelContexts()
        .filter((context) => {
          return userContexts.has(context.userContext);
        });
    } else if (browsingContexts.size) {
      contextsToRunIn = [...browsingContexts.values()];
    } else {
      contextsToRunIn = this.#browsingContextStorage.getTopLevelContexts();
    }

    const cdpTargets = new Set(
      contextsToRunIn.map((context) => context.cdpTarget),
    );

    await preloadScript.initInTargets(cdpTargets, false);

    return {
      script: preloadScript.id,
    };
  }

  async removePreloadScript(
    params: Script.RemovePreloadScriptParameters,
  ): Promise<EmptyResult> {
    const {script: id} = params;

    const script = this.#preloadScriptStorage.getPreloadScript(id);
    await script.remove();
    this.#preloadScriptStorage.remove(id);

    return {};
  }

  async callFunction(
    params: Script.CallFunctionParameters,
  ): Promise<Script.EvaluateResult> {
    const realm = await this.#getRealm(params.target);
    return await realm.callFunction(
      params.functionDeclaration,
      params.awaitPromise,
      params.this,
      params.arguments,
      params.resultOwnership,
      params.serializationOptions,
      params.userActivation,
    );
  }

  async evaluate(
    params: Script.EvaluateParameters,
  ): Promise<Script.EvaluateResult> {
    const realm = await this.#getRealm(params.target);
    return await realm.evaluate(
      params.expression,
      params.awaitPromise,
      params.resultOwnership,
      params.serializationOptions,
      params.userActivation,
    );
  }

  async disown(params: Script.DisownParameters): Promise<EmptyResult> {
    const realm = await this.#getRealm(params.target);
    await Promise.all(
      params.handles.map(async (handle) => await realm.disown(handle)),
    );
    return {};
  }

  getRealms(params: Script.GetRealmsParameters): Script.GetRealmsResult {
    if (params.context !== undefined) {
      // Make sure the context is known.
      this.#browsingContextStorage.getContext(params.context);
    }
    const realms = this.#realmStorage
      .findRealms({
        browsingContextId: params.context,
        type: params.type,
        isHidden: false,
      })
      .map((realm) => realm.realmInfo);
    return {realms};
  }

  async #getRealm(target: Script.Target): Promise<Realm> {
    if ('context' in target) {
      const context = this.#browsingContextStorage.getContext(target.context);
      return await context.getOrCreateUserSandbox(target.sandbox);
    }
    return this.#realmStorage.getRealm({
      realmId: target.realm,
      isHidden: false,
    });
  }

  async classicExecuteScript(
    script: string,
    argsInput?: unknown[],
  ): Promise<ClassicResponse> {
    const context = this.#browsingContextStorage.getActiveContext();
    if (!context) {
      return {
        status: 404,
        body: {
          value: {
            error: 'no such window',
            message: 'No active browsing context found',
            stacktrace: '',
          },
        },
      };
    }
    const realm = await context.getOrCreateUserSandbox(undefined);
    const functionDeclaration = `function() {\n${script}\n}`;
    const args = Array.isArray(argsInput)
      ? argsInput.map((a) => this.#serializeLocalValue(a))
      : [];

    const result = await this.#raceWithUserPrompt(realm, [
      functionDeclaration,
      false, // awaitPromise
      {type: 'undefined'},
      args,
      'none' as Script.ResultOwnership,
      {},
      true, // userActivation
    ]);

    if ('type' in result && result.type === 'promptOpened') {
      return {
        status: 200,
        body: {
          value: null,
        },
      };
    }

    if (result.type === 'exception') {
      const exceptionDetails = result.exceptionDetails;
      const exceptionVal = exceptionDetails.exception as any;
      const message =
        exceptionDetails.text ??
        exceptionVal?.description ??
        (exceptionVal?.value ? String(exceptionVal.value) : undefined) ??
        'JavaScript Error in executeScript';
      const stacktrace =
        exceptionDetails.stackTrace?.callFrames
          .map(
            (f) =>
              `${f.functionName}@${f.url}:${f.lineNumber}:${f.columnNumber}`,
          )
          .join('\n') ?? '';
      return {
        status: 500,
        body: {
          value: {
            error: 'javascript error',
            message,
            stacktrace,
          },
        },
      };
    }

    return {
      status: 200,
      body: {
        value: this.#deserializeRemoteValue(result.result),
      },
    };
  }

  async classicExecuteAsyncScript(
    script: string,
    argsInput?: unknown[],
    timeoutMs?: number | null,
  ): Promise<ClassicResponse> {
    const context = this.#browsingContextStorage.getActiveContext();
    if (!context) {
      return {
        status: 404,
        body: {
          value: {
            error: 'no such window',
            message: 'No active browsing context found',
            stacktrace: '',
          },
        },
      };
    }
    const realm = await context.getOrCreateUserSandbox(undefined);
    const functionDeclaration = `function() {
      return new Promise((resolve, reject) => {
        let timer;
        if (typeof ${timeoutMs ?? 'null'} === 'number' && ${timeoutMs ?? 'null'} >= 0) {
          timer = setTimeout(() => {
            reject(new Error('script timeout: Script evaluation timed out'));
          }, ${timeoutMs ?? 0});
        }
        const callback = (res) => {
          if (timer) clearTimeout(timer);
          resolve(res);
        };
        try {
          const func = function() {\n${script}\n};
          func.apply(this, [...arguments, callback]);
        } catch (e) {
          if (timer) clearTimeout(timer);
          reject(e);
        }
      });
    }`;
    const args = Array.isArray(argsInput)
      ? argsInput.map((a) => this.#serializeLocalValue(a))
      : [];

    const result = await this.#raceWithUserPrompt(realm, [
      functionDeclaration,
      true, // awaitPromise
      {type: 'undefined'},
      args,
      'none' as Script.ResultOwnership,
      {},
      true, // userActivation
    ]);

    if ('type' in result && result.type === 'promptOpened') {
      return {
        status: 200,
        body: {
          value: null,
        },
      };
    }

    if (result.type === 'exception') {
      const exceptionDetails = result.exceptionDetails;
      const exceptionVal = exceptionDetails.exception as any;
      const message =
        exceptionDetails.text ??
        exceptionVal?.description ??
        (exceptionVal?.value ? String(exceptionVal.value) : undefined) ??
        'JavaScript Error in executeAsyncScript';
      const stacktrace =
        exceptionDetails.stackTrace?.callFrames
          .map(
            (f) =>
              `${f.functionName}@${f.url}:${f.lineNumber}:${f.columnNumber}`,
          )
          .join('\n') ?? '';
      if (String(message).includes('script timeout')) {
        return {
          status: 500,
          body: {
            value: {
              error: 'script timeout',
              message: 'Script evaluation timed out',
              stacktrace,
            },
          },
        };
      }
      return {
        status: 500,
        body: {
          value: {
            error: 'javascript error',
            message,
            stacktrace,
          },
        },
      };
    }

    return {
      status: 200,
      body: {
        value: this.#deserializeRemoteValue(result.result),
      },
    };
  }

  async #raceWithUserPrompt(
    realm: Realm,
    callFunctionArgs: Parameters<Realm['callFunction']>,
  ): Promise<Script.EvaluateResult | {type: 'promptOpened'}> {
    let removeListener: () => void = () => {};
    const promptPromise = new Promise<{type: 'promptOpened'}>((resolve) => {
      const listener = (event: any) => {
        if (
          event.method ===
          ChromiumBidi.BrowsingContext.EventNames.UserPromptOpened
        ) {
          resolve({type: 'promptOpened'});
        }
      };
      this.#eventManager.on(EventManagerEvents.RegisteredEvent, listener);
      removeListener = () => {
        this.#eventManager.off(EventManagerEvents.RegisteredEvent, listener);
      };
    });

    try {
      return await Promise.race([
        realm.callFunction(...callFunctionArgs),
        promptPromise,
      ]);
    } finally {
      removeListener();
    }
  }

  #serializeLocalValue(val: unknown): Script.LocalValue {
    if (val === null || val === undefined) {
      return {type: 'null'};
    }
    if (typeof val === 'number') {
      if (Number.isNaN(val)) {
        return {type: 'number', value: 'NaN'};
      }
      if (!Number.isFinite(val)) {
        return {type: 'number', value: val < 0 ? '-Infinity' : 'Infinity'};
      }
      return {type: 'number', value: val};
    }
    if (typeof val === 'string') {
      return {type: 'string', value: val};
    }
    if (typeof val === 'boolean') {
      return {type: 'boolean', value: val};
    }
    if (Array.isArray(val)) {
      return {
        type: 'array',
        value: val.map((item) => this.#serializeLocalValue(item)),
      };
    }
    if (typeof val === 'object') {
      const rec = val as Record<string, unknown>;
      const elementId =
        rec['element-6066-11e4-a52e-4f735466cecf'] ??
        rec['ELEMENT'] ??
        rec['shadow-6066-11e4-a52e-4f735466cecf'];
      if (typeof elementId === 'string') {
        return {
          sharedId: elementId,
        };
      }
      const windowId =
        rec['window-fcc6-11e5-b4f8-330a88ab9d7f'] ??
        rec['frame-075b-4da1-b6ba-e579c2d3230a'];
      if (typeof windowId === 'string') {
        return {
          handle: windowId,
          sharedId: windowId,
        } as unknown as Script.LocalValue;
      }
      const objValue: [string, Script.LocalValue][] = [];
      for (const [k, v] of Object.entries(rec)) {
        objValue.push([k, this.#serializeLocalValue(v)]);
      }
      return {type: 'object', value: objValue};
    }
    return {type: 'undefined'};
  }

  #deserializeRemoteValue(remote: Script.RemoteValue): unknown {
    switch (remote.type) {
      case 'number':
      case 'string':
      case 'boolean':
        return remote.value;
      case 'null':
      case 'undefined':
        return null;
      case 'array':
      case 'set':
      case 'nodelist':
      case 'htmlcollection':
        return (remote.value ?? []).map((item: Script.RemoteValue) =>
          this.#deserializeRemoteValue(item),
        );
      case 'node':
        if ('sharedId' in remote && remote.sharedId) {
          if (remote.value?.nodeType === 11) {
            return {
              'shadow-6066-11e4-a52e-4f735466cecf': remote.sharedId,
            };
          }
          return {
            'element-6066-11e4-a52e-4f735466cecf': remote.sharedId,
            ELEMENT: remote.sharedId,
          };
        }
        return null;
      case 'window': {
        const contextId = remote.value.context;
        const ctx = this.#browsingContextStorage.findContext(contextId);
        const id = remote.handle ?? (remote as any).sharedId ?? contextId;
        if (!ctx || ctx.isTopLevelContext()) {
          return {
            'window-fcc6-11e5-b4f8-330a88ab9d7f': id,
          };
        }
        return {
          'frame-075b-4da1-b6ba-e579c2d3230a': id,
        };
      }
      case 'object':
      case 'map': {
        const result: Record<string, unknown> = {};
        for (const entry of remote.value ?? []) {
          if (Array.isArray(entry) && entry.length === 2) {
            const entryKey = entry[0] as any;
            const key =
              typeof entryKey === 'string'
                ? entryKey
                : 'value' in entryKey
                  ? entryKey.value
                  : String(entryKey.type);
            if (key !== undefined && key !== null) {
              result[String(key)] = this.#deserializeRemoteValue(
                entry[1] as Script.RemoteValue,
              );
            }
          }
        }
        return result;
      }
      default:
        return ('value' in remote ? (remote as any).value : null) ?? null;
    }
  }
}
