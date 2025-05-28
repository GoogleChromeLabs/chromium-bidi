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

import {type BrowsingContext, ChromiumBidi, type EmptyResult, InvalidArgumentException, type Script,} from '../../../protocol/protocol.js';
import type {LoggerFn} from '../../../utils/log.js';
import type {UserContextStorage} from '../browser/UserContextStorage.js';
import type {BrowsingContextImpl} from '../context/BrowsingContextImpl.js';
import type {BrowsingContextStorage} from '../context/BrowsingContextStorage.js';
import type {EventManager} from '../session/EventManager.js';

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
        isHidden: false
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
}
