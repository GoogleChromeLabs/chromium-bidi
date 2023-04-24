/**
 * Copyright 2021 Google LLC.
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
import Protocol from 'devtools-protocol';

import {
  BrowsingContext,
  CDP,
  Message,
  Script,
} from '../../../protocol/protocol.js';
import {CdpClient, CdpConnection} from '../../CdpConnection.js';
import {LoggerFn, LogType} from '../../../utils/log.js';
import {IEventManager} from '../events/EventManager.js';
import {Realm} from '../script/realm.js';
import {RealmStorage} from '../script/realmStorage.js';

import {BrowsingContextStorage} from './browsingContextStorage.js';
import {BrowsingContextImpl} from './browsingContextImpl.js';
import {CdpTarget} from './cdpTarget.js';
import {
  PreloadScriptStorage,
  CdpPreloadScript,
  BidiPreloadScript,
} from './PreloadScriptStorage.js';

export class BrowsingContextProcessor {
  readonly #browsingContextStorage: BrowsingContextStorage;
  readonly #cdpConnection: CdpConnection;
  readonly #eventManager: IEventManager;
  readonly #logger?: LoggerFn;
  readonly #realmStorage: RealmStorage;
  readonly #selfTargetId: string;
  readonly #preloadScriptStorage: PreloadScriptStorage;

  constructor(
    realmStorage: RealmStorage,
    cdpConnection: CdpConnection,
    selfTargetId: string,
    eventManager: IEventManager,
    browsingContextStorage: BrowsingContextStorage,
    logger?: LoggerFn
  ) {
    this.#browsingContextStorage = browsingContextStorage;
    this.#cdpConnection = cdpConnection;
    this.#eventManager = eventManager;
    this.#logger = logger;
    this.#realmStorage = realmStorage;
    this.#selfTargetId = selfTargetId;
    this.#preloadScriptStorage = new PreloadScriptStorage();

    this.#setEventListeners(this.#cdpConnection.browserClient());
  }

  /**
   * This method is called for each CDP session, since this class is responsible
   * for creating and destroying all targets and browsing contexts.
   */
  #setEventListeners(cdpClient: CdpClient) {
    cdpClient.on('Target.attachedToTarget', (params) => {
      this.#handleAttachedToTargetEvent(params, cdpClient);
    });
    cdpClient.on('Target.detachedFromTarget', (params) => {
      this.#handleDetachedFromTargetEvent(params);
    });

    cdpClient.on(
      'Page.frameAttached',
      (params: Protocol.Page.FrameAttachedEvent) => {
        this.#handleFrameAttachedEvent(params);
      }
    );
    cdpClient.on(
      'Page.frameDetached',
      (params: Protocol.Page.FrameDetachedEvent) => {
        this.#handleFrameDetachedEvent(params);
      }
    );
  }

  // { "method": "Page.frameAttached",
  //   "params": {
  //     "frameId": "0A639AB1D9A392DF2CE02C53CC4ED3A6",
  //     "parentFrameId": "722BB0526C73B067A479BED6D0DB1156" } }
  #handleFrameAttachedEvent(params: Protocol.Page.FrameAttachedEvent) {
    const parentBrowsingContext = this.#browsingContextStorage.findContext(
      params.parentFrameId
    );
    if (parentBrowsingContext !== undefined) {
      BrowsingContextImpl.create(
        parentBrowsingContext.cdpTarget,
        this.#realmStorage,
        params.frameId,
        params.parentFrameId,
        this.#eventManager,
        this.#browsingContextStorage,
        this.#logger
      );
    }
  }

  // { "method": "Page.frameDetached",
  //   "params": {
  //     "frameId": "0A639AB1D9A392DF2CE02C53CC4ED3A6",
  //     "reason": "swap" } }
  #handleFrameDetachedEvent(params: Protocol.Page.FrameDetachedEvent) {
    // In case of OOPiF no need in deleting BrowsingContext.
    if (params.reason === 'swap') {
      return;
    }
    this.#browsingContextStorage.findContext(params.frameId)?.delete();
  }

  // { "method": "Target.attachedToTarget",
  //   "params": {
  //     "sessionId": "EA999F39BDCABD7D45C9FEB787413BBA",
  //     "targetInfo": {
  //       "targetId": "722BB0526C73B067A479BED6D0DB1156",
  //       "type": "page",
  //       "title": "about:blank",
  //       "url": "about:blank",
  //       "attached": true,
  //       "canAccessOpener": false,
  //       "browserContextId": "1B5244080EC3FF28D03BBDA73138C0E2" },
  //     "waitingForDebugger": false } }
  #handleAttachedToTargetEvent(
    params: Protocol.Target.AttachedToTargetEvent,
    parentSessionCdpClient: CdpClient
  ) {
    const {sessionId, targetInfo} = params;

    const targetCdpClient = this.#cdpConnection.getCdpClient(sessionId);

    if (!this.#isValidTarget(targetInfo)) {
      // DevTools or some other not supported by BiDi target. Just release
      // debugger  and ignore them.
      targetCdpClient
        .sendCommand('Runtime.runIfWaitingForDebugger')
        .then(() =>
          parentSessionCdpClient.sendCommand('Target.detachFromTarget', params)
        );
      return;
    }

    this.#logger?.(
      LogType.browsingContexts,
      'AttachedToTarget event received:',
      JSON.stringify(params, null, 2)
    );

    this.#setEventListeners(targetCdpClient);

    const cdpTarget = CdpTarget.create(
      targetInfo.targetId,
      targetCdpClient,
      sessionId,
      this.#realmStorage,
      this.#eventManager
    );

    if (this.#browsingContextStorage.hasContext(targetInfo.targetId)) {
      // OOPiF.
      this.#browsingContextStorage
        .getContext(targetInfo.targetId)
        .updateCdpTarget(cdpTarget);
    } else {
      // New context.
      BrowsingContextImpl.create(
        cdpTarget,
        this.#realmStorage,
        targetInfo.targetId,
        null,
        this.#eventManager,
        this.#browsingContextStorage,
        this.#logger
      );
    }
  }

  // { "method": "Target.detachedFromTarget",
  //   "params": {
  //     "sessionId": "7EFBFB2A4942A8989B3EADC561BC46E9",
  //     "targetId": "19416886405CBA4E03DBB59FA67FF4E8" } }
  #handleDetachedFromTargetEvent(
    params: Protocol.Target.DetachedFromTargetEvent
  ) {
    // TODO: params.targetId is deprecated. Update this class to track using
    // params.sessionId instead.
    // https://github.com/GoogleChromeLabs/chromium-bidi/issues/60
    const contextId = params.targetId!;
    this.#browsingContextStorage.findContext(contextId)?.delete();
  }

  async #getRealm(target: Script.Target): Promise<Realm> {
    if ('realm' in target) {
      return this.#realmStorage.getRealm({
        realmId: target.realm,
      });
    }
    const context = this.#browsingContextStorage.getContext(target.context);
    return context.getOrCreateSandbox(target.sandbox);
  }

  process_browsingContext_getTree(
    params: BrowsingContext.GetTreeParameters
  ): BrowsingContext.GetTreeResult {
    const resultContexts =
      params.root === undefined
        ? this.#browsingContextStorage.getTopLevelContexts()
        : [this.#browsingContextStorage.getContext(params.root)];

    return {
      result: {
        contexts: resultContexts.map((c) =>
          c.serializeToBidiValue(params.maxDepth ?? Number.MAX_VALUE)
        ),
      },
    };
  }

  async process_browsingContext_create(
    params: BrowsingContext.CreateParameters
  ): Promise<BrowsingContext.CreateResult> {
    const browserCdpClient = this.#cdpConnection.browserClient();
    let referenceContext = undefined;
    if (params.referenceContext !== undefined) {
      referenceContext = this.#browsingContextStorage.getContext(
        params.referenceContext
      );
      if (!referenceContext.isTopLevelContext()) {
        throw new Message.InvalidArgumentException(
          `referenceContext should be a top-level context`
        );
      }
    }

    const result = await browserCdpClient.sendCommand('Target.createTarget', {
      url: 'about:blank',
      newWindow: params.type === 'window',
    });

    // Wait for the new tab to be loaded to avoid race conditions in the
    // `browsingContext` events, when the `browsingContext.domContentLoaded` and
    // `browsingContext.load` events from the initial `about:blank` navigation
    // are emitted after the next navigation is started.
    // Details: https://github.com/web-platform-tests/wpt/issues/35846
    const contextId = result.targetId;
    const context = this.#browsingContextStorage.getContext(contextId);
    await context.awaitLoaded();

    return {
      result: context.serializeToBidiValue(1),
    };
  }

  process_browsingContext_navigate(
    params: BrowsingContext.NavigateParameters
  ): Promise<BrowsingContext.NavigateResult> {
    const context = this.#browsingContextStorage.getContext(params.context);

    return context.navigate(
      params.url,
      params.wait === undefined ? 'none' : params.wait
    );
  }

  async process_browsingContext_captureScreenshot(
    params: BrowsingContext.CaptureScreenshotParameters
  ): Promise<BrowsingContext.CaptureScreenshotResult> {
    const context = this.#browsingContextStorage.getContext(params.context);
    return context.captureScreenshot();
  }

  async process_browsingContext_print(
    params: BrowsingContext.PrintParameters
  ): Promise<BrowsingContext.PrintResult> {
    const context = this.#browsingContextStorage.getContext(params.context);
    return context.print(params);
  }

  async process_script_addPreloadScript(
    params: Script.AddPreloadScriptParameters
  ): Promise<Script.AddPreloadScriptResult> {
    const cdpTargets = new Set<CdpTarget>(
      // TODO: flatten children and deduplicate.
      params.context === undefined || params.context === null
        ? this.#browsingContextStorage
            .getTopLevelContexts()
            .map((context) => context.cdpTarget)
        : [this.#browsingContextStorage.getContext(params.context).cdpTarget]
    );

    const cdpPreloadScripts: CdpPreloadScript[] = [];

    for (const cdpTarget of cdpTargets) {
      const cdpPreloadScriptId = await cdpTarget.addPreloadScript(
        // The spec provides a function, and CDP expects an evaluation.
        `(${params.functionDeclaration})();`,
        params.sandbox
      );
      cdpPreloadScripts.push({
        target: cdpTarget,
        preloadScriptId: cdpPreloadScriptId,
      });
    }

    const preloadScript: BidiPreloadScript =
      this.#preloadScriptStorage.addPreloadScripts(
        params.context ?? null,
        cdpPreloadScripts,
        params.functionDeclaration,
        params.sandbox
      );

    return {
      result: {
        script: preloadScript.id,
      },
    };
  }

  async process_script_removePreloadScript(
    params: Script.RemovePreloadScriptParameters
  ): Promise<Message.EmptyResult> {
    const bidiId = params.script;

    const scripts = this.#preloadScriptStorage.findPreloadScripts({
      id: bidiId,
    });

    if (scripts.length === 0) {
      throw new Message.NoSuchScriptException(
        `No preload script with BiDi ID '${bidiId}'`
      );
    }

    for (const script of scripts) {
      for (const cdpPreloadScript of script.cdpPreloadScripts) {
        const cdpTarget = cdpPreloadScript.target;
        const cdpPreloadScriptId = cdpPreloadScript.preloadScriptId;
        await cdpTarget.removePreloadScript(cdpPreloadScriptId);
      }
    }

    this.#preloadScriptStorage.removePreloadScripts({
      id: bidiId,
    });

    return {result: {}};
  }

  async process_script_evaluate(
    params: Script.EvaluateParameters
  ): Promise<Script.EvaluateResult> {
    const realm = await this.#getRealm(params.target);
    return realm.scriptEvaluate(
      params.expression,
      params.awaitPromise,
      params.resultOwnership ?? 'none'
    );
  }

  process_script_getRealms(
    params: Script.GetRealmsParameters
  ): Script.GetRealmsResult {
    if (params.context !== undefined) {
      // Make sure the context is known.
      this.#browsingContextStorage.getContext(params.context);
    }
    const realms = this.#realmStorage
      .findRealms({
        browsingContextId: params.context,
        type: params.type,
      })
      .map((realm: Realm) => realm.toBiDi());
    return {result: {realms}};
  }

  async process_script_callFunction(
    params: Script.CallFunctionParameters
  ): Promise<Script.CallFunctionResult> {
    const realm = await this.#getRealm(params.target);
    return realm.callFunction(
      params.functionDeclaration,
      params.this || {
        type: 'undefined',
      }, // `this` is `undefined` by default.
      params.arguments || [], // `arguments` is `[]` by default.
      params.awaitPromise,
      params.resultOwnership ?? 'none'
    );
  }

  async process_script_disown(
    params: Script.DisownParameters
  ): Promise<Script.DisownResult> {
    const realm = await this.#getRealm(params.target);
    await Promise.all(params.handles.map(async (h) => realm.disown(h)));
    return {result: {}};
  }

  async process_browsingContext_close(
    commandParams: BrowsingContext.CloseParameters
  ): Promise<Message.EmptyResult> {
    const browserCdpClient = this.#cdpConnection.browserClient();

    const context = this.#browsingContextStorage.getContext(
      commandParams.context
    );
    if (!context.isTopLevelContext()) {
      throw new Message.InvalidArgumentException(
        'A top-level browsing context cannot be closed.'
      );
    }

    const detachedFromTargetPromise = new Promise<void>((resolve) => {
      const onContextDestroyed = (
        eventParams: Protocol.Target.DetachedFromTargetEvent
      ) => {
        if (eventParams.targetId === commandParams.context) {
          browserCdpClient.off('Target.detachedFromTarget', onContextDestroyed);
          resolve();
        }
      };
      browserCdpClient.on('Target.detachedFromTarget', onContextDestroyed);
    });

    await browserCdpClient.sendCommand('Target.closeTarget', {
      targetId: commandParams.context,
    });

    // Sometimes CDP command finishes before `detachedFromTarget` event,
    // sometimes after. Wait for the CDP command to be finished, and then wait
    // for `detachedFromTarget` if it hasn't emitted.
    await detachedFromTargetPromise;

    return {result: {}};
  }

  #isValidTarget(target: Protocol.Target.TargetInfo) {
    if (target.targetId === this.#selfTargetId) {
      return false;
    }
    return ['page', 'iframe'].includes(target.type);
  }

  async process_cdp_sendCommand(params: CDP.SendCommandParams) {
    const client = params.cdpSession
      ? this.#cdpConnection.getCdpClient(params.cdpSession)
      : this.#cdpConnection.browserClient();
    const sendCdpCommandResult = await client.sendCommand(
      params.cdpMethod,
      params.cdpParams
    );
    return {
      result: sendCdpCommandResult,
      cdpSession: params.cdpSession,
    };
  }

  process_cdp_getSession(params: CDP.GetSessionParams) {
    const context = params.context;
    const sessionId =
      this.#browsingContextStorage.getContext(context).cdpTarget.cdpSessionId;
    if (sessionId === undefined) {
      return {result: {cdpSession: null}};
    }
    return {result: {cdpSession: sessionId}};
  }
}
