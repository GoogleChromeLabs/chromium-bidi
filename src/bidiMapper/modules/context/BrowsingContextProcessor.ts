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
import type {Protocol} from 'devtools-protocol';

import type {CdpClient} from '../../../cdp/CdpClient.js';
import {
  BrowsingContext,
  ChromiumBidi,
  InvalidArgumentException,
  type EmptyResult,
  NoSuchUserContextException,
  Script,
  NoSuchAlertException,
  NoSuchHandleException,
  NoSuchElementException,
  UnsupportedOperationException,
} from '../../../protocol/protocol.js';
import {CdpErrorConstants} from '../../../utils/cdpErrorConstants.js';
import type {ContextConfig} from '../browser/ContextConfig.js';
import type {ContextConfigStorage} from '../browser/ContextConfigStorage.js';
import type {UserContextStorage} from '../browser/UserContextStorage.js';
import type {EventManager} from '../session/EventManager.js';

import type {ClassicResponse} from '../../ClassicTransport.js';

import type {BrowsingContextImpl} from './BrowsingContextImpl.js';
import type {BrowsingContextStorage} from './BrowsingContextStorage.js';

export class BrowsingContextProcessor {
  readonly #browserCdpClient: CdpClient;
  readonly #browsingContextStorage: BrowsingContextStorage;
  readonly #contextConfigStorage: ContextConfigStorage;
  readonly #eventManager: EventManager;
  readonly #userContextStorage: UserContextStorage;

  constructor(
    browserCdpClient: CdpClient,
    browsingContextStorage: BrowsingContextStorage,
    userContextStorage: UserContextStorage,
    contextConfigStorage: ContextConfigStorage,
    eventManager: EventManager,
  ) {
    this.#contextConfigStorage = contextConfigStorage;
    this.#userContextStorage = userContextStorage;
    this.#browserCdpClient = browserCdpClient;
    this.#browsingContextStorage = browsingContextStorage;
    this.#eventManager = eventManager;
    this.#eventManager.addSubscribeHook(
      ChromiumBidi.BrowsingContext.EventNames.ContextCreated,
      this.#onContextCreatedSubscribeHook.bind(this),
    );
  }

  getTree(
    params: BrowsingContext.GetTreeParameters,
  ): BrowsingContext.GetTreeResult {
    const resultContexts =
      params.root === undefined
        ? this.#browsingContextStorage.getTopLevelContexts()
        : [this.#browsingContextStorage.getContext(params.root)];

    return {
      contexts: resultContexts.map((c) =>
        c.serializeToBidiValue(params.maxDepth ?? Number.MAX_VALUE),
      ),
    };
  }

  async create(
    params: BrowsingContext.CreateParameters,
  ): Promise<BrowsingContext.CreateResult> {
    let referenceContext: BrowsingContextImpl | undefined;
    let userContext = 'default';
    if (params.referenceContext !== undefined) {
      referenceContext = this.#browsingContextStorage.getContext(
        params.referenceContext,
      );
      if (!referenceContext.isTopLevelContext()) {
        throw new InvalidArgumentException(
          `referenceContext should be a top-level context`,
        );
      }
      userContext = referenceContext.userContext;
    }

    if (params.userContext !== undefined) {
      userContext = params.userContext;
    }

    const existingContexts = this.#browsingContextStorage
      .getAllContexts()
      .filter((context) => context.userContext === userContext);

    let newWindow = false;
    switch (params.type) {
      case BrowsingContext.CreateType.Tab:
        newWindow = false;
        break;
      case BrowsingContext.CreateType.Window:
        newWindow = true;
        break;
    }

    if (!existingContexts.length) {
      // If there are no contexts in the given user context, we need to set
      // newWindow to true as newWindow=false will be rejected.
      newWindow = true;
    }

    let result: Protocol.Target.CreateTargetResponse;

    try {
      result = await this.#browserCdpClient.sendCommand('Target.createTarget', {
        url: 'about:blank',
        newWindow,
        browserContextId: userContext === 'default' ? undefined : userContext,
        background: params.background === true,
      });
    } catch (err) {
      if (
        // See https://source.chromium.org/chromium/chromium/src/+/main:chrome/browser/devtools/protocol/target_handler.cc;l=90;drc=e80392ac11e48a691f4309964cab83a3a59e01c8
        (err as Error).message.startsWith(
          'Failed to find browser context with id',
        ) ||
        // See https://source.chromium.org/chromium/chromium/src/+/main:headless/lib/browser/protocol/target_handler.cc;l=49;drc=e80392ac11e48a691f4309964cab83a3a59e01c8
        (err as Error).message === 'browserContextId'
      ) {
        throw new NoSuchUserContextException(
          `The context ${userContext} was not found`,
        );
      }
      throw err;
    }

    // Wait for the new target to be attached and to be added to the browsing context
    // storage.
    const context = await this.#browsingContextStorage.waitForContext(
      result.targetId,
    );
    // Wait for the new tab to be loaded to avoid race conditions in the
    // `browsingContext` events, when the `browsingContext.domContentLoaded` and
    // `browsingContext.load` events from the initial `about:blank` navigation
    // are emitted after the next navigation is started.
    // Details: https://github.com/web-platform-tests/wpt/issues/35846
    await context.lifecycleLoaded();

    return {context: context.id};
  }

  navigate(
    params: BrowsingContext.NavigateParameters,
  ): Promise<BrowsingContext.NavigateResult> {
    const context = this.#browsingContextStorage.getContext(params.context);

    return context.navigate(
      params.url,
      params.wait ?? BrowsingContext.ReadinessState.None,
    );
  }

  reload(params: BrowsingContext.ReloadParameters): Promise<EmptyResult> {
    const context = this.#browsingContextStorage.getContext(params.context);

    return context.reload(
      params.ignoreCache ?? false,
      params.wait ?? BrowsingContext.ReadinessState.None,
    );
  }

  async activate(
    params: BrowsingContext.ActivateParameters,
  ): Promise<EmptyResult> {
    const context = this.#browsingContextStorage.getContext(params.context);
    if (!context.isTopLevelContext()) {
      throw new InvalidArgumentException(
        'Activation is only supported on the top-level context',
      );
    }
    await context.activate();
    this.#browsingContextStorage.setActiveContextId(context.id);
    return {};
  }

  async captureScreenshot(
    params: BrowsingContext.CaptureScreenshotParameters,
  ): Promise<BrowsingContext.CaptureScreenshotResult> {
    const context = this.#browsingContextStorage.getContext(params.context);
    return await context.captureScreenshot(params);
  }

  async print(
    params: BrowsingContext.PrintParameters,
  ): Promise<BrowsingContext.PrintResult> {
    const context = this.#browsingContextStorage.getContext(params.context);
    return await context.print(params);
  }

  async setViewport(
    params: BrowsingContext.SetViewportParameters,
  ): Promise<EmptyResult> {
    // Check the The viewport size limits is not checked by protocol parser, so we need to validate
    // it manually:
    // https://crsrc.org/c/content/browser/devtools/protocol/emulation_handler.cc;drc=f49e23d8e2bd190b42ec62284b8be10dcccd0446;l=660
    const maxDimensionSize = 10_000_000;
    if (
      (params.viewport?.height ?? 0) > maxDimensionSize ||
      (params.viewport?.width ?? 0) > maxDimensionSize
    ) {
      throw new UnsupportedOperationException(
        `Viewport dimension over ${maxDimensionSize} are not supported`,
      );
    }

    const config: ContextConfig = {};
    // `undefined` means no changes should be done to the config.
    if (params.devicePixelRatio !== undefined) {
      config.devicePixelRatio = params.devicePixelRatio;
    }
    if (params.viewport !== undefined) {
      config.viewport = params.viewport;
    }

    const impactedTopLevelContexts =
      await this.#getRelatedTopLevelBrowsingContexts(
        params.context,
        params.userContexts,
      );

    for (const userContextId of params.userContexts ?? []) {
      this.#contextConfigStorage.updateUserContextConfig(userContextId, config);
    }

    if (params.context !== undefined) {
      this.#contextConfigStorage.updateBrowsingContextConfig(
        params.context,
        config,
      );
    }

    await Promise.all(
      impactedTopLevelContexts.map(async (context) => {
        const config = this.#contextConfigStorage.getActiveConfig(
          context.id,
          context.userContext,
        );
        await context.setViewport(
          config.viewport ?? null,
          config.devicePixelRatio ?? null,
          config.screenOrientation ?? null,
        );
      }),
    );

    return {};
  }

  /**
   * Returns a list of top-level browsing context ids.
   */
  async #getRelatedTopLevelBrowsingContexts(
    browsingContextId?: string,
    userContextIds?: string[],
  ): Promise<BrowsingContextImpl[]> {
    if (browsingContextId === undefined && userContextIds === undefined) {
      throw new InvalidArgumentException(
        'Either userContexts or context must be provided',
      );
    }

    if (browsingContextId !== undefined && userContextIds !== undefined) {
      throw new InvalidArgumentException(
        'userContexts and context are mutually exclusive',
      );
    }

    if (browsingContextId !== undefined) {
      const context =
        this.#browsingContextStorage.getContext(browsingContextId);
      if (!context.isTopLevelContext()) {
        throw new InvalidArgumentException(
          'Emulating viewport is only supported on the top-level context',
        );
      }
      return [context];
    }

    // Verify that all user contexts exist.
    await this.#userContextStorage.verifyUserContextIdList(userContextIds!);

    const result = [];
    for (const userContextId of userContextIds!) {
      const topLevelBrowsingContexts = this.#browsingContextStorage
        .getTopLevelContexts()
        .filter(
          (browsingContext) => browsingContext.userContext === userContextId,
        );
      result.push(...topLevelBrowsingContexts);
    }
    // Remove duplicates. Compare `BrowsingContextImpl` by reference is correct here, as
    // `browsingContextStorage` returns the same instance for the same id.
    return [...new Set(result).values()];
  }

  async traverseHistory(
    params: BrowsingContext.TraverseHistoryParameters,
  ): Promise<BrowsingContext.TraverseHistoryResult> {
    const context = this.#browsingContextStorage.getContext(params.context);
    if (!context) {
      throw new InvalidArgumentException(
        `No browsing context with id ${params.context}`,
      );
    }
    if (!context.isTopLevelContext()) {
      throw new InvalidArgumentException(
        'Traversing history is only supported on the top-level context',
      );
    }
    await context.traverseHistory(params.delta);
    return {};
  }

  async handleUserPrompt(
    params: BrowsingContext.HandleUserPromptParameters,
  ): Promise<EmptyResult> {
    const context = this.#browsingContextStorage.getContext(params.context);
    try {
      await context.handleUserPrompt(params.accept, params.userText);
    } catch (error: any) {
      // Heuristically determine the error
      // https://source.chromium.org/chromium/chromium/src/+/main:content/browser/devtools/protocol/page_handler.cc;l=1085?q=%22No%20dialog%20is%20showing%22&ss=chromium
      if (error.message?.includes('No dialog is showing')) {
        throw new NoSuchAlertException('No dialog is showing');
      }
      throw error;
    }
    return {};
  }

  async close(params: BrowsingContext.CloseParameters): Promise<EmptyResult> {
    const context = this.#browsingContextStorage.getContext(params.context);

    if (!context.isTopLevelContext()) {
      throw new InvalidArgumentException(
        `Non top-level browsing context ${context.id} cannot be closed.`,
      );
    }
    // Parent session of a page target session can be a `browser` or a `tab` session.
    const parentCdpClient = context.cdpTarget.parentCdpClient;
    try {
      const detachedFromTargetPromise = new Promise<void>((resolve) => {
        const onContextDestroyed = (
          event: Protocol.Target.DetachedFromTargetEvent,
        ) => {
          if (event.targetId === params.context) {
            parentCdpClient.off(
              'Target.detachedFromTarget',
              onContextDestroyed,
            );
            resolve();
          }
        };
        parentCdpClient.on('Target.detachedFromTarget', onContextDestroyed);
      });

      try {
        if (params.promptUnload) {
          await context.close();
        } else {
          await parentCdpClient.sendCommand('Target.closeTarget', {
            targetId: params.context,
          });
        }
      } catch (error: any) {
        // Swallow error that arise from the session being destroyed. Rely on the
        // `detachedFromTargetPromise` event to be resolved.
        if (!parentCdpClient.isCloseError(error)) {
          throw error;
        }
      }
      // Sometimes CDP command finishes before `detachedFromTarget` event,
      // sometimes after. Wait for the CDP command to be finished, and then wait
      // for `detachedFromTarget` if it hasn't emitted.
      await detachedFromTargetPromise;
    } catch (error: any) {
      // Swallow error that arise from the page being destroyed
      // Example is navigating to faulty SSL certificate
      if (
        !(
          error.code === CdpErrorConstants.GENERIC_ERROR &&
          error.message === 'Not attached to an active page'
        )
      ) {
        throw error;
      }
    }

    return {};
  }

  async locateNodes(
    params: BrowsingContext.LocateNodesParameters,
  ): Promise<BrowsingContext.LocateNodesResult> {
    const context = this.#browsingContextStorage.getContext(params.context);
    return await context.locateNodes(params);
  }

  async classicGetActiveContext(): Promise<BrowsingContextImpl | undefined> {
    const activeContext = this.#browsingContextStorage.getActiveContext();
    if (!activeContext) {
      return undefined;
    }
    let current: BrowsingContextImpl | null = activeContext;
    while (current && !current.isTopLevelContext()) {
      try {
        const realm = await current.getOrCreateUserSandbox(undefined);
        const evalResult = await realm.evaluate(
          'window.frameElement === null',
          false,
          Script.ResultOwnership.None,
          {},
          false,
        );
        if (
          evalResult.type !== 'success' ||
          (evalResult.result.type === 'boolean' &&
            evalResult.result.value === true)
        ) {
          return undefined;
        }
      } catch {
        return undefined;
      }
      current = current.parent;
    }
    return activeContext;
  }

  async classicGetUrl(): Promise<ClassicResponse> {
    const context = await this.classicGetActiveContext();
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
    return {
      status: 200,
      body: {
        value: context.url,
      },
    };
  }

  async classicNavigate(urlInput: unknown): Promise<ClassicResponse> {
    if (typeof urlInput !== 'string') {
      return {
        status: 400,
        body: {
          value: {
            error: 'invalid argument',
            message: 'url parameter must be a string',
            stacktrace: '',
          },
        },
      };
    }
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
    try {
      await context.navigate(
        urlInput,
        'complete' as BrowsingContext.ReadinessState,
      );
      return {
        status: 200,
        body: {value: null},
      };
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      return {
        status: 500,
        body: {
          value: {
            error: 'unknown error',
            message: err.message,
            stacktrace: err.stack ?? '',
          },
        },
      };
    }
  }

  async classicBack(): Promise<ClassicResponse> {
    const context = await this.classicGetActiveContext();
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
    try {
      await context.traverseHistory(-1);
      return {
        status: 200,
        body: {value: null},
      };
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      return {
        status: 500,
        body: {
          value: {
            error: 'unknown error',
            message: err.message,
            stacktrace: err.stack ?? '',
          },
        },
      };
    }
  }

  async classicForward(): Promise<ClassicResponse> {
    const context = await this.classicGetActiveContext();
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
    try {
      await context.traverseHistory(1);
      return {
        status: 200,
        body: {value: null},
      };
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      return {
        status: 500,
        body: {
          value: {
            error: 'unknown error',
            message: err.message,
            stacktrace: err.stack ?? '',
          },
        },
      };
    }
  }

  async classicRefresh(): Promise<ClassicResponse> {
    const context = await this.classicGetActiveContext();
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
    try {
      await context.reload(false, 'complete' as BrowsingContext.ReadinessState);
      return {
        status: 200,
        body: {value: null},
      };
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      return {
        status: 500,
        body: {
          value: {
            error: 'unknown error',
            message: err.message,
            stacktrace: err.stack ?? '',
          },
        },
      };
    }
  }

  async classicGetTitle(): Promise<ClassicResponse> {
    const context = await this.classicGetActiveContext();
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
    try {
      const realm = await context.getOrCreateUserSandbox(undefined);
      const evalResult = await realm.evaluate(
        'document.title',
        false,
        Script.ResultOwnership.None,
        {},
        false,
      );
      let title = '';
      if (
        evalResult.type === 'success' &&
        evalResult.result.type === 'string'
      ) {
        title = evalResult.result.value;
      }
      return {
        status: 200,
        body: {value: title},
      };
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      return {
        status: 500,
        body: {
          value: {
            error: 'unknown error',
            message: err.message,
            stacktrace: err.stack ?? '',
          },
        },
      };
    }
  }

  async classicGetPageSource(): Promise<ClassicResponse> {
    const context = await this.classicGetActiveContext();
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
    try {
      const realm = await context.getOrCreateUserSandbox(undefined);
      const evalResult = await realm.evaluate(
        'document.documentElement ? document.documentElement.outerHTML : ""',
        false,
        Script.ResultOwnership.None,
        {},
        false,
      );
      let source = '';
      if (
        evalResult.type === 'success' &&
        evalResult.result.type === 'string'
      ) {
        source = evalResult.result.value;
      }
      return {
        status: 200,
        body: {value: source},
      };
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      return {
        status: 500,
        body: {
          value: {
            error: 'unknown error',
            message: err.message,
            stacktrace: err.stack ?? '',
          },
        },
      };
    }
  }

  async classicGetWindowRect(): Promise<ClassicResponse> {
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
    try {
      const {bounds} = await this.#browserCdpClient.sendCommand(
        'Browser.getWindowForTarget',
        {targetId: context.cdpTarget.id},
      );
      return {
        status: 200,
        body: {
          value: {
            x: bounds.left ?? 0,
            y: bounds.top ?? 0,
            width: bounds.width ?? 0,
            height: bounds.height ?? 0,
          },
        },
      };
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      return {
        status: 500,
        body: {
          value: {
            error: 'unknown error',
            message: err.message,
            stacktrace: err.stack ?? '',
          },
        },
      };
    }
  }

  async classicSetWindowRect(rectInput: unknown): Promise<ClassicResponse> {
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
    try {
      const params = (rectInput as Record<string, unknown> | undefined) ?? {};
      const {windowId} = await this.#browserCdpClient.sendCommand(
        'Browser.getWindowForTarget',
        {targetId: context.cdpTarget.id},
      );

      const bounds: Protocol.Browser.Bounds = {
        windowState: 'normal',
      };
      if (typeof params['width'] === 'number') {
        bounds.width = Math.floor(params['width']);
      }
      if (typeof params['height'] === 'number') {
        bounds.height = Math.floor(params['height']);
      }
      if (typeof params['x'] === 'number') {
        bounds.left = Math.floor(params['x']);
      }
      if (typeof params['y'] === 'number') {
        bounds.top = Math.floor(params['y']);
      }

      await this.#browserCdpClient.sendCommand('Browser.setWindowBounds', {
        windowId,
        bounds,
      });

      const {bounds: newBounds} = await this.#browserCdpClient.sendCommand(
        'Browser.getWindowForTarget',
        {targetId: context.cdpTarget.id},
      );
      return {
        status: 200,
        body: {
          value: {
            x: newBounds.left ?? 0,
            y: newBounds.top ?? 0,
            width: newBounds.width ?? 0,
            height: newBounds.height ?? 0,
          },
        },
      };
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      return {
        status: 500,
        body: {
          value: {
            error: 'unknown error',
            message: err.message,
            stacktrace: err.stack ?? '',
          },
        },
      };
    }
  }

  async #classicSetWindowState(
    state: Protocol.Browser.WindowState,
  ): Promise<ClassicResponse> {
    const context = this.#browsingContextStorage.getActiveTopLevelContext();
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
    try {
      const {windowId} = await this.#browserCdpClient.sendCommand(
        'Browser.getWindowForTarget',
        {targetId: context.cdpTarget.id},
      );
      await this.#browserCdpClient.sendCommand('Browser.setWindowBounds', {
        windowId,
        bounds: {windowState: state},
      });
      const {bounds: newBounds} = await this.#browserCdpClient.sendCommand(
        'Browser.getWindowForTarget',
        {targetId: context.cdpTarget.id},
      );
      return {
        status: 200,
        body: {
          value: {
            x: newBounds.left ?? 0,
            y: newBounds.top ?? 0,
            width: newBounds.width ?? 0,
            height: newBounds.height ?? 0,
          },
        },
      };
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      return {
        status: 500,
        body: {
          value: {
            error: 'unknown error',
            message: err.message,
            stacktrace: err.stack ?? '',
          },
        },
      };
    }
  }

  async classicMaximizeWindow(): Promise<ClassicResponse> {
    return await this.#classicSetWindowState('maximized');
  }

  async classicMinimizeWindow(): Promise<ClassicResponse> {
    return await this.#classicSetWindowState('minimized');
  }

  async classicFullscreenWindow(): Promise<ClassicResponse> {
    return await this.#classicSetWindowState('fullscreen');
  }

  async classicFindElement(
    input: unknown,
    startElementId?: string,
    isShadowRoot = false,
  ): Promise<ClassicResponse> {
    const params = input as {using?: unknown; value?: unknown} | undefined;
    if (
      typeof params?.using !== 'string' ||
      typeof params?.value !== 'string'
    ) {
      return {
        status: 400,
        body: {
          value: {
            error: 'invalid argument',
            message: 'using and value parameters must be strings',
            stacktrace: '',
          },
        },
      };
    }
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
    try {
      if (startElementId) {
        const realm = await context.getOrCreateUserSandbox(undefined);
        const checkResult = await realm.callFunction(
          isShadowRoot
            ? '(node) => node instanceof ShadowRoot'
            : '(node) => node instanceof Element',
          false,
          {type: 'undefined'},
          [{sharedId: startElementId}],
          Script.ResultOwnership.None,
          {},
          false,
        );
        if (
          checkResult.type !== 'success' ||
          checkResult.result.type !== 'boolean' ||
          checkResult.result.value !== true
        ) {
          return {
            status: 404,
            body: {
              value: {
                error: isShadowRoot ? 'no such shadow root' : 'no such element',
                message: isShadowRoot
                  ? `Node ${startElementId} is not a ShadowRoot`
                  : `Node ${startElementId} is not an Element`,
                stacktrace: '',
              },
            },
          };
        }
      }

      const locator = this.#classicToBidiLocator(params.using, params.value);
      const startNodes:
        | [Script.SharedReference, ...Script.SharedReference[]]
        | undefined = startElementId ? [{sharedId: startElementId}] : undefined;
      const result = await context.locateNodes({
        context: context.id,
        locator,
        startNodes,
        maxNodeCount: 1,
      });
      if (!result.nodes.length || !result.nodes[0]?.sharedId) {
        return {
          status: 404,
          body: {
            value: {
              error: 'no such element',
              message: `Element not found using ${params.using}: ${params.value}`,
              stacktrace: '',
            },
          },
        };
      }
      return {
        status: 200,
        body: {
          value: {
            'element-6066-11e4-a52e-4f735466cecf': result.nodes[0].sharedId,
          },
        },
      };
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      return {
        status: 400,
        body: {
          value: {
            error: 'invalid argument',
            message: err.message,
            stacktrace: err.stack ?? '',
          },
        },
      };
    }
  }

  async classicFindElements(
    input: unknown,
    startElementId?: string,
    isShadowRoot = false,
  ): Promise<ClassicResponse> {
    const params = input as {using?: unknown; value?: unknown} | undefined;
    if (
      typeof params?.using !== 'string' ||
      typeof params?.value !== 'string'
    ) {
      return {
        status: 400,
        body: {
          value: {
            error: 'invalid argument',
            message: 'using and value parameters must be strings',
            stacktrace: '',
          },
        },
      };
    }
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
    try {
      if (startElementId) {
        const realm = await context.getOrCreateUserSandbox(undefined);
        const checkResult = await realm.callFunction(
          isShadowRoot
            ? '(node) => node instanceof ShadowRoot'
            : '(node) => node instanceof Element',
          false,
          {type: 'undefined'},
          [{sharedId: startElementId}],
          Script.ResultOwnership.None,
          {},
          false,
        );
        if (
          checkResult.type !== 'success' ||
          checkResult.result.type !== 'boolean' ||
          checkResult.result.value !== true
        ) {
          return {
            status: 404,
            body: {
              value: {
                error: isShadowRoot ? 'no such shadow root' : 'no such element',
                message: isShadowRoot
                  ? `Node ${startElementId} is not a ShadowRoot`
                  : `Node ${startElementId} is not an Element`,
                stacktrace: '',
              },
            },
          };
        }
      }

      const locator = this.#classicToBidiLocator(params.using, params.value);
      const startNodes:
        | [Script.SharedReference, ...Script.SharedReference[]]
        | undefined = startElementId ? [{sharedId: startElementId}] : undefined;
      const result = await context.locateNodes({
        context: context.id,
        locator,
        startNodes,
      });
      const elements = result.nodes
        .filter((node) => node.sharedId)
        .map((node) => ({
          'element-6066-11e4-a52e-4f735466cecf': node.sharedId!,
        }));
      return {
        status: 200,
        body: {
          value: elements,
        },
      };
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      return {
        status: 400,
        body: {
          value: {
            error: 'invalid argument',
            message: err.message,
            stacktrace: err.stack ?? '',
          },
        },
      };
    }
  }

  #classicToBidiLocator(using: string, value: string): BrowsingContext.Locator {
    switch (using) {
      case 'css selector':
        return {type: 'css', value};
      case 'xpath':
        return {type: 'xpath', value};
      case 'tag name':
        return {type: 'css', value};
      case 'link text':
        return {type: 'innerText', value, matchType: 'full'};
      case 'partial link text':
        return {type: 'innerText', value, matchType: 'partial'};
      case 'id':
        return {type: 'css', value: `[id="${value.replace(/"/g, '\\"')}"]`};
      case 'name':
        return {type: 'css', value: `[name="${value.replace(/"/g, '\\"')}"]`};
      case 'class name':
        return {type: 'css', value: `.${value.replace(/ /g, '.')}`};
      default:
        throw new InvalidArgumentException(
          `Unsupported locator strategy: ${using}`,
        );
    }
  }

  async classicGetActiveElement(): Promise<ClassicResponse> {
    const context = await this.classicGetActiveContext();
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
    try {
      const realm = await context.getOrCreateUserSandbox(undefined);
      const evalResult = await realm.evaluate(
        'document.activeElement',
        false,
        Script.ResultOwnership.None,
        {},
        false,
      );
      if (
        evalResult.type === 'success' &&
        evalResult.result.type === 'node' &&
        evalResult.result.sharedId
      ) {
        return {
          status: 200,
          body: {
            value: {
              'element-6066-11e4-a52e-4f735466cecf': evalResult.result.sharedId,
            },
          },
        };
      }
      return {
        status: 404,
        body: {
          value: {
            error: 'no such element',
            message: 'Active element not found',
            stacktrace: '',
          },
        },
      };
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      return {
        status: 500,
        body: {
          value: {
            error: 'unknown error',
            message: err.message,
            stacktrace: err.stack ?? '',
          },
        },
      };
    }
  }

  async classicGetElementShadowRoot(
    elementId: string,
  ): Promise<ClassicResponse> {
    const context = await this.classicGetActiveContext();
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
    try {
      const realm = await context.getOrCreateUserSandbox(undefined);
      const evalResult = await realm.callFunction(
        '(element) => { const sr = element.shadowRoot; return (sr && sr.mode === "open") ? sr : null; }',
        false,
        {type: 'undefined'},
        [{sharedId: elementId}],
        Script.ResultOwnership.None,
        {},
        false,
      );
      if (
        evalResult.type === 'success' &&
        evalResult.result.type === 'node' &&
        evalResult.result.sharedId
      ) {
        return {
          status: 200,
          body: {
            value: {
              'shadow-6066-11e4-a52e-4f735466cecf': evalResult.result.sharedId,
            },
          },
        };
      }
      return {
        status: 404,
        body: {
          value: {
            error: 'no such shadow root',
            message: `Shadow root not found for element ${elementId}`,
            stacktrace: '',
          },
        },
      };
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      return {
        status: 404,
        body: {
          value: {
            error: 'no such element',
            message: err.message,
            stacktrace: err.stack ?? '',
          },
        },
      };
    }
  }

  classicGetWindowHandle(): ClassicResponse {
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
    return {
      status: 200,
      body: {
        value: context.id,
      },
    };
  }

  classicGetWindowHandles(): ClassicResponse {
    return {
      status: 200,
      body: {
        value: this.#browsingContextStorage
          .getTopLevelContexts()
          .map((c) => c.id),
      },
    };
  }

  async classicNewWindow(typeHint: unknown): Promise<ClassicResponse> {
    try {
      const type =
        typeHint === 'window'
          ? BrowsingContext.CreateType.Window
          : BrowsingContext.CreateType.Tab;
      const res = await this.create({
        type,
        referenceContext: undefined,
        userContext: 'default',
        background: false,
      });
      return {
        status: 200,
        body: {
          value: {
            handle: res.context,
            type: typeHint === 'window' ? 'window' : 'tab',
          },
        },
      };
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      return {
        status: 500,
        body: {
          value: {
            error: 'unknown error',
            message: err.message,
            stacktrace: err.stack ?? '',
          },
        },
      };
    }
  }

  async classicCloseWindow(): Promise<ClassicResponse> {
    const context = this.#browsingContextStorage.getActiveTopLevelContext();
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
    try {
      await this.close({context: context.id});
      const remaining = this.#browsingContextStorage.getTopLevelContexts();
      if (remaining.length > 0) {
        this.#browsingContextStorage.setActiveContextId(remaining[0]?.id);
      } else {
        this.#browsingContextStorage.setActiveContextId(undefined);
      }
      return {
        status: 200,
        body: {
          value: remaining.map((c) => c.id),
        },
      };
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      return {
        status: 500,
        body: {
          value: {
            error: 'unknown error',
            message: err.message,
            stacktrace: err.stack ?? '',
          },
        },
      };
    }
  }

  classicSwitchToWindow(handleInput: unknown): ClassicResponse {
    if (typeof handleInput !== 'string') {
      return {
        status: 400,
        body: {
          value: {
            error: 'invalid argument',
            message: 'handle must be a string',
            stacktrace: '',
          },
        },
      };
    }
    const target = this.#browsingContextStorage
      .getTopLevelContexts()
      .find((c) => c.id === handleInput);
    if (!target) {
      return {
        status: 404,
        body: {
          value: {
            error: 'no such window',
            message: `Window handle ${handleInput} not found`,
            stacktrace: '',
          },
        },
      };
    }
    this.#browsingContextStorage.setActiveContextId(target.id);
    return {
      status: 200,
      body: {value: null},
    };
  }

  async classicSwitchToFrame(frameInput: unknown): Promise<ClassicResponse> {
    const active =
      this.#browsingContextStorage.getActiveContext() ??
      this.#browsingContextStorage.getActiveTopLevelContext();
    if (!active) {
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
    if (frameInput === null || frameInput === undefined) {
      this.#browsingContextStorage.setActiveContextId(active.top.id);
      return {
        status: 200,
        body: {value: null},
      };
    }
    const children = active.directChildren;
    if (typeof frameInput === 'number') {
      if (frameInput < 0 || frameInput >= children.length) {
        return {
          status: 404,
          body: {
            value: {
              error: 'no such frame',
              message: `Frame index ${frameInput} out of bounds`,
              stacktrace: '',
            },
          },
        };
      }
      this.#browsingContextStorage.setActiveContextId(children[frameInput]?.id);
      return {
        status: 200,
        body: {value: null},
      };
    }
    if (typeof frameInput === 'object' && frameInput !== null) {
      const elementId =
        (frameInput as Record<string, string>)[
          'element-6066-11e4-a52e-4f735466cecf'
        ] ?? (frameInput as Record<string, string>)['sharedId'];
      if (elementId) {
        try {
          const realm = await active.getOrCreateUserSandbox(undefined);
          const result = await realm.callFunction(
            '(element) => Array.from(window.frames).indexOf(element.contentWindow)',
            false,
            {type: 'undefined'},
            [{sharedId: elementId}],
            Script.ResultOwnership.None,
            {},
            false,
          );
          if (
            result.type === 'success' &&
            result.result.type === 'number' &&
            typeof result.result.value === 'number' &&
            result.result.value >= 0 &&
            result.result.value < children.length
          ) {
            const childContext = children[result.result.value];
            if (childContext) {
              this.#browsingContextStorage.setActiveContextId(childContext.id);
              return {
                status: 200,
                body: {value: null},
              };
            }
          }
        } catch {
          // Fallthrough
        }
      }
    }
    return {
      status: 404,
      body: {
        value: {
          error: 'no such frame',
          message: `Frame ${JSON.stringify(frameInput)} not found`,
          stacktrace: '',
        },
      },
    };
  }

  classicSwitchToParentFrame(): ClassicResponse {
    const active = this.#browsingContextStorage.getActiveContext();
    if (!active) {
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
    if (active.parent) {
      this.#browsingContextStorage.setActiveContextId(active.parent.id);
    } else {
      this.#browsingContextStorage.setActiveContextId(active.id);
    }
    return {
      status: 200,
      body: {value: null},
    };
  }

  async classicHandleAlert(accept: boolean): Promise<ClassicResponse> {
    const active = this.#browsingContextStorage.getActiveContext();
    if (!active) {
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
    try {
      await active.handleUserPrompt(accept);
      return {
        status: 200,
        body: {value: null},
      };
    } catch {
      return {
        status: 404,
        body: {
          value: {
            error: 'no such alert',
            message: 'No user prompt is currently showing',
            stacktrace: '',
          },
        },
      };
    }
  }

  classicGetAlertText(): ClassicResponse {
    const active = this.#browsingContextStorage.getActiveContext();
    if (!active || active.activeUserPromptMessage === undefined) {
      return {
        status: 404,
        body: {
          value: {
            error: 'no such alert',
            message: 'No user prompt is currently showing',
            stacktrace: '',
          },
        },
      };
    }
    return {
      status: 200,
      body: {
        value: active.activeUserPromptMessage,
      },
    };
  }

  async classicSendAlertText(textInput: unknown): Promise<ClassicResponse> {
    const params = textInput as {text?: unknown} | undefined;
    if (typeof params?.text !== 'string') {
      return {
        status: 400,
        body: {
          value: {
            error: 'invalid argument',
            message: 'text parameter must be a string',
            stacktrace: '',
          },
        },
      };
    }
    const active = this.#browsingContextStorage.getActiveContext();
    if (!active) {
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
    try {
      await active.handleUserPrompt(undefined, params.text);
      return {
        status: 200,
        body: {value: null},
      };
    } catch {
      return {
        status: 404,
        body: {
          value: {
            error: 'no such alert',
            message: 'No user prompt is currently showing',
            stacktrace: '',
          },
        },
      };
    }
  }

  #onContextCreatedSubscribeHook(
    contextId: BrowsingContext.BrowsingContext,
  ): Promise<void> {
    const context = this.#browsingContextStorage.getContext(contextId);
    const contextsToReport = [
      context,
      ...this.#browsingContextStorage.getContext(contextId).allChildren,
    ];
    contextsToReport.forEach((context) => {
      this.#eventManager.registerEvent(
        {
          type: 'event',
          method: ChromiumBidi.BrowsingContext.EventNames.ContextCreated,
          params: context.serializeToBidiValue(),
        },
        context.id,
      );
    });
    return Promise.resolve();
  }

  async #classicEvaluateOnElement(
    elementId: string,
    expression: string,
    args: Script.LocalValue[] = [],
  ): Promise<ClassicResponse> {
    const context = await this.classicGetActiveContext();
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
    try {
      const realm = await context.getOrCreateUserSandbox(undefined);
      const checkNodeResult = await realm.callFunction(
        '(node) => { if (!node) return 1; if (node.nodeType !== 1) return 2; return 0; }',
        false,
        {type: 'undefined'},
        [{sharedId: elementId}],
        Script.ResultOwnership.None,
        {},
        false,
      );
      if (
        checkNodeResult.type !== 'success' ||
        checkNodeResult.result.type !== 'number' ||
        checkNodeResult.result.value !== 0
      ) {
        return {
          status: 404,
          body: {
            value: {
              error: 'no such element',
              message: `Element ${elementId} not found`,
              stacktrace: '',
            },
          },
        };
      }

      const evalResult = await realm.callFunction(
        expression,
        false,
        {type: 'undefined'},
        [{sharedId: elementId}, ...args],
        Script.ResultOwnership.None,
        {},
        false,
      );

      if (evalResult.type === 'success') {
        if (evalResult.result.type === 'string') {
          try {
            const parsed = JSON.parse(evalResult.result.value);
            return {
              status: 200,
              body: {value: parsed},
            };
          } catch {
            return {
              status: 200,
              body: {value: evalResult.result.value},
            };
          }
        }
        let val: unknown = null;
        if ('value' in evalResult.result) {
          val = evalResult.result.value;
        }
        return {
          status: 200,
          body: {value: val},
        };
      }

      return {
        status: 500,
        body: {
          value: {
            error: 'unknown error',
            message: 'Failed to evaluate script on element',
            stacktrace: '',
          },
        },
      };
    } catch (e: unknown) {
      if (
        e instanceof NoSuchHandleException ||
        e instanceof InvalidArgumentException
      ) {
        return {
          status: 404,
          body: {
            value: {
              error: 'no such element',
              message: `Element ${elementId} not found`,
              stacktrace: '',
            },
          },
        };
      }
      const err = e instanceof Error ? e : new Error(String(e));
      return {
        status: 500,
        body: {
          value: {
            error: 'unknown error',
            message: err.message,
            stacktrace: err.stack ?? '',
          },
        },
      };
    }
  }

  async classicIsElementSelected(elementId: string): Promise<ClassicResponse> {
    return await this.#classicEvaluateOnElement(
      elementId,
      '(element) => JSON.stringify((() => { if (element.tagName === "OPTION") return element.selected; if (element.tagName === "INPUT" && (element.type === "checkbox" || element.type === "radio")) return element.checked; return false; })())',
    );
  }

  async classicGetElementAttribute(
    elementId: string,
    name: string,
  ): Promise<ClassicResponse> {
    return await this.#classicEvaluateOnElement(
      elementId,
      '(element, attrName) => JSON.stringify((() => { if (!element.hasAttribute(attrName)) return null; return element.getAttribute(attrName); })())',
      [{type: 'string', value: name}],
    );
  }

  async classicGetElementProperty(
    elementId: string,
    name: string,
  ): Promise<ClassicResponse> {
    return await this.#classicEvaluateOnElement(
      elementId,
      '(element, propName) => JSON.stringify((() => { const val = element[propName]; return val === undefined ? null : val; })())',
      [{type: 'string', value: name}],
    );
  }

  async classicGetElementCSSValue(
    elementId: string,
    propertyName: string,
  ): Promise<ClassicResponse> {
    return await this.#classicEvaluateOnElement(
      elementId,
      '(element, prop) => JSON.stringify((() => { return window.getComputedStyle(element).getPropertyValue(prop); })())',
      [{type: 'string', value: propertyName}],
    );
  }

  async classicGetElementText(elementId: string): Promise<ClassicResponse> {
    return await this.#classicEvaluateOnElement(
      elementId,
      '(element) => JSON.stringify((() => { if (element.ownerDocument && element.ownerDocument.contentType && element.ownerDocument.contentType.includes("xml")) { return element.textContent ?? ""; } return element.innerText ?? element.textContent ?? ""; })())',
    );
  }

  async classicGetElementTagName(elementId: string): Promise<ClassicResponse> {
    return await this.#classicEvaluateOnElement(
      elementId,
      '(element) => JSON.stringify((() => { return element.tagName; })())',
    );
  }

  async classicGetElementRect(elementId: string): Promise<ClassicResponse> {
    return await this.#classicEvaluateOnElement(
      elementId,
      '(element) => JSON.stringify((() => { const rect = element.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }; })())',
    );
  }

  async classicIsElementEnabled(elementId: string): Promise<ClassicResponse> {
    return await this.#classicEvaluateOnElement(
      elementId,
      '(element) => JSON.stringify((() => { if ("disabled" in element) return !element.disabled; return true; })())',
    );
  }

  async classicGetComputedLabel(elementId: string): Promise<ClassicResponse> {
    return await this.#classicEvaluateOnElement(
      elementId,
      '(element) => JSON.stringify((() => { return element.computedName ?? ""; })())',
    );
  }

  async classicGetComputedRole(elementId: string): Promise<ClassicResponse> {
    return await this.#classicEvaluateOnElement(
      elementId,
      '(element) => JSON.stringify((() => { return element.computedRole ?? ""; })())',
    );
  }

  async classicTakeScreenshot(): Promise<ClassicResponse> {
    const context = await this.classicGetActiveContext();
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
    try {
      const result = await context.top.captureScreenshot({
        context: context.top.id,
        origin: 'viewport',
      });
      return {
        status: 200,
        body: {
          value: result.data,
        },
      };
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      return {
        status: 500,
        body: {
          value: {
            error: 'unknown error',
            message: err.message,
            stacktrace: err.stack ?? '',
          },
        },
      };
    }
  }

  async classicTakeElementScreenshot(
    elementId: string,
  ): Promise<ClassicResponse> {
    const context = await this.classicGetActiveContext();
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
    try {
      const realm = await context.getOrCreateUserSandbox(undefined);
      const checkNodeResult = await realm.callFunction(
        `(node) => {
          if (!node) return 1;
          if (node.nodeType !== 1) return 2;
          let curr = node;
          while (curr) {
            if (curr.style) {
              curr.style.scrollBehavior = 'auto';
            }
            curr = curr.parentElement;
          }
          node.scrollIntoView({block: 'center', inline: 'center', behavior: 'instant'});
          return 0;
        }`,
        false,
        {type: 'undefined'},
        [{sharedId: elementId}],
        Script.ResultOwnership.None,
        {},
        false,
      );
      if (
        checkNodeResult.type !== 'success' ||
        checkNodeResult.result.type !== 'number' ||
        checkNodeResult.result.value !== 0
      ) {
        return {
          status: 404,
          body: {
            value: {
              error: 'no such element',
              message: `Element ${elementId} not found`,
              stacktrace: '',
            },
          },
        };
      }

      const result = await context.top.captureScreenshot({
        context: context.top.id,
        clip: {
          type: 'element',
          element: {sharedId: elementId},
        },
      });

      return {
        status: 200,
        body: {
          value: result.data,
        },
      };
    } catch (e: unknown) {
      if (
        e instanceof NoSuchHandleException ||
        e instanceof InvalidArgumentException ||
        e instanceof NoSuchElementException
      ) {
        return {
          status: 404,
          body: {
            value: {
              error: 'no such element',
              message: `Element ${elementId} not found`,
              stacktrace: '',
            },
          },
        };
      }
      const err = e instanceof Error ? e : new Error(String(e));
      return {
        status: 500,
        body: {
          value: {
            error: 'unknown error',
            message: err.message,
            stacktrace: err.stack ?? '',
          },
        },
      };
    }
  }

  async classicElementClick(elementId: string): Promise<ClassicResponse> {
    return await this.#classicEvaluateOnElement(
      elementId,
      `(element) => JSON.stringify((() => {
        let curr = element;
        while (curr) {
          if (curr.style) {
            curr.style.scrollBehavior = 'auto';
          }
          curr = curr.parentElement;
        }
        element.scrollIntoView({block: 'center', inline: 'center', behavior: 'instant'});
        element.click();
        return null;
      })())`,
    );
  }

  async classicElementClear(elementId: string): Promise<ClassicResponse> {
    return await this.#classicEvaluateOnElement(
      elementId,
      `(element) => JSON.stringify((() => {
        let curr = element;
        while (curr) {
          if (curr.style) {
            curr.style.scrollBehavior = 'auto';
          }
          curr = curr.parentElement;
        }
        element.scrollIntoView({block: 'center', inline: 'center', behavior: 'instant'});
        element.focus();
        if (element.isContentEditable) {
          element.innerHTML = '';
          element.blur();
          return null;
        }
        if ('value' in element) {
          element.value = '';
          element.dispatchEvent(new Event('input', {bubbles: true}));
          element.dispatchEvent(new Event('change', {bubbles: true}));
          element.blur();
          return null;
        }
        element.blur();
        return null;
      })())`,
    );
  }

  async classicElementValue(
    elementId: string,
    text: string,
  ): Promise<ClassicResponse> {
    return await this.#classicEvaluateOnElement(
      elementId,
      '(element, valText) => JSON.stringify((() => { element.focus(); if ("value" in element) { element.value += valText; element.dispatchEvent(new Event("input", {bubbles: true})); element.dispatchEvent(new Event("change", {bubbles: true})); return null; } if (element.isContentEditable) { element.innerText += valText; return null; } return null; })())',
      [{type: 'string', value: text}],
    );
  }
}
