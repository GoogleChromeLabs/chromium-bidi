/**
 * Copyright 2026 Google LLC.
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

import {LogType, type LoggerFn} from '../utils/log.js';
import {Mutex} from '../utils/Mutex.js';

import type {CdpClient} from '../cdp/CdpClient.js';
import {Session} from '../protocol/protocol.js';

import {
  type ClassicRequest,
  type ClassicResponse,
  type ClassicTransport,
  ClassicException,
} from './ClassicTransport.js';
import type {ContextConfigStorage} from './modules/browser/ContextConfigStorage.js';
import type {UserContextStorage} from './modules/browser/UserContextStorage.js';
import {BrowsingContextProcessor} from './modules/context/BrowsingContextProcessor.js';
import type {BrowsingContextStorage} from './modules/context/BrowsingContextStorage.js';
import {InputProcessor} from './modules/input/InputProcessor.js';
import type {PreloadScriptStorage} from './modules/script/PreloadScriptStorage.js';
import type {RealmStorage} from './modules/script/RealmStorage.js';
import {ScriptProcessor} from './modules/script/ScriptProcessor.js';
import type {EventManager} from './modules/session/EventManager.js';
import {StorageProcessor} from './modules/storage/StorageProcessor.js';

export class ClassicCommandProcessor {
  readonly #mutex = new Mutex();
  readonly #timeouts: {
    implicit: number;
    pageLoad: number;
    script: number | null;
  } = {
    implicit: 0,
    pageLoad: 300000,
    script: 30000,
  };
  #scriptProcessor: ScriptProcessor;
  #browsingContextProcessor: BrowsingContextProcessor;
  #storageProcessor: StorageProcessor;
  #inputProcessor: InputProcessor;
  #transport: ClassicTransport;
  #logger?: LoggerFn;

  constructor(
    eventManager: EventManager,
    browsingContextStorage: BrowsingContextStorage,
    realmStorage: RealmStorage,
    preloadScriptStorage: PreloadScriptStorage,
    userContextStorage: UserContextStorage,
    contextConfigStorage: ContextConfigStorage,
    browserCdpClient: CdpClient,
    transport: ClassicTransport,
    logger?: LoggerFn,
  ) {
    this.#transport = transport;
    this.#logger = logger;

    contextConfigStorage.updateGlobalConfig({
      userPromptHandler: {
        default: Session.UserPromptHandlerType.Ignore,
        alert: Session.UserPromptHandlerType.Ignore,
        confirm: Session.UserPromptHandlerType.Ignore,
        prompt: Session.UserPromptHandlerType.Ignore,
      },
    });

    this.#scriptProcessor = new ScriptProcessor(
      eventManager,
      browsingContextStorage,
      realmStorage,
      preloadScriptStorage,
      userContextStorage,
      logger,
    );
    this.#browsingContextProcessor = new BrowsingContextProcessor(
      browserCdpClient,
      browsingContextStorage,
      userContextStorage,
      contextConfigStorage,
      eventManager,
    );
    this.#storageProcessor = new StorageProcessor(
      browserCdpClient,
      browsingContextStorage,
      logger,
    );
    this.#inputProcessor = new InputProcessor(browsingContextStorage, () =>
      this.#browsingContextProcessor.classicGetActiveContext(),
    );
    this.#transport.setOnMessage(
      (request) => void this.#handleMessage(request),
    );
  }

  async #handleMessage(request: ClassicRequest): Promise<void> {
    try {
      const response = await this.processCommand(request);
      await this.#transport.sendMessage(response);
    } catch (error: unknown) {
      this.#logger?.(LogType.debugError)?.(
        'Classic command processing failed',
        error,
      );
      const err = error instanceof Error ? error : new Error(String(error));
      void this.#transport.sendMessage({
        id: request.id,
        status: 500,
        body: {
          value: {
            error: 'unknown error',
            message: err.message,
            stacktrace: err.stack ?? '',
          },
        },
      });
    }
  }

  async processCommand(request: ClassicRequest): Promise<ClassicResponse> {
    return await this.#mutex.run(async () => {
      try {
        const {status, body} = await this.#executeCommand(
          request.method.toUpperCase(),
          request.path,
          request.body,
        );
        return {
          id: request.id,
          status,
          body,
        };
      } catch (e: unknown) {
        if (e instanceof ClassicException) {
          let status = 500;
          if (e.error === 'invalid argument') {
            status = 400;
          } else if (
            e.error === 'no such window' ||
            e.error === 'unknown command'
          ) {
            status = 404;
          }
          return e.toErrorResponse(request.id, status);
        }
        const err = e instanceof Error ? e : new Error(String(e));
        return {
          id: request.id,
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
    });
  }

  async #executeCommand(
    method: string,
    path: string,
    body: unknown,
  ): Promise<ClassicResponse> {
    switch (path) {
      case '/status': {
        if (method === 'GET') {
          return {
            status: 200,
            body: {
              value: {
                ready: true,
                message: 'ready',
              },
            },
          };
        }
        break;
      }
      case '/session': {
        switch (method) {
          case 'POST':
            return {
              status: 200,
              body: {
                value: {
                  sessionId: 'default',
                  capabilities: {},
                },
              },
            };
          case 'DELETE':
            return {
              status: 200,
              body: {value: null},
            };
          default:
            break;
        }
        break;
      }
      case '/timeouts': {
        switch (method) {
          case 'GET':
            return {
              status: 200,
              body: {
                value: this.#timeouts,
              },
            };
          case 'POST': {
            const params = body as Record<string, unknown> | undefined;
            if (!params || typeof params !== 'object') {
              return {
                status: 400,
                body: {
                  value: {
                    error: 'invalid argument',
                    message: 'Timeouts parameters must be an object',
                    stacktrace: '',
                  },
                },
              };
            }
            for (const key of ['implicit', 'pageLoad', 'script'] as const) {
              if (key in params) {
                const val = params[key];
                const isValid =
                  ((key === 'script' || key === 'pageLoad') && val === null) ||
                  (typeof val === 'number' &&
                    val >= 0 &&
                    Number.isFinite(val) &&
                    Number.isInteger(val));
                if (!isValid) {
                  return {
                    status: 400,
                    body: {
                      value: {
                        error: 'invalid argument',
                        message: `Invalid timeout value for ${key}`,
                        stacktrace: '',
                      },
                    },
                  };
                }
              }
            }
            for (const key of ['implicit', 'pageLoad', 'script'] as const) {
              if (key in params) {
                (this.#timeouts as any)[key] = params[key];
              }
            }
            return {
              status: 200,
              body: {
                value: null,
              },
            };
          }
          default:
            break;
        }
        break;
      }
      case '/execute/sync':
      case '/execute':
      case '/execute_script': {
        switch (method) {
          case 'POST': {
            const params = body as
              | {script?: unknown; args?: unknown}
              | undefined;
            if (!params || typeof params.script !== 'string') {
              return {
                status: 400,
                body: {
                  value: {
                    error: 'invalid argument',
                    message: 'Script parameter must be a string',
                    stacktrace: '',
                  },
                },
              };
            }
            return await this.#scriptProcessor.classicExecuteScript(
              params.script,
              Array.isArray(params.args) ? params.args : [],
            );
          }
          default:
            break;
        }
        break;
      }
      case '/execute/async':
      case '/execute_async_script': {
        switch (method) {
          case 'POST': {
            const params = body as
              | {script?: unknown; args?: unknown}
              | undefined;
            if (!params || typeof params.script !== 'string') {
              return {
                status: 400,
                body: {
                  value: {
                    error: 'invalid argument',
                    message: 'Script parameter must be a string',
                    stacktrace: '',
                  },
                },
              };
            }
            return await this.#scriptProcessor.classicExecuteAsyncScript(
              params.script,
              Array.isArray(params.args) ? params.args : [],
              this.#timeouts.script,
            );
          }
          default:
            break;
        }
        break;
      }
      case '/url': {
        switch (method) {
          case 'GET':
            return await this.#browsingContextProcessor.classicGetUrl();
          case 'POST': {
            const params = body as {url?: unknown} | undefined;
            return await this.#browsingContextProcessor.classicNavigate(
              params?.url,
            );
          }
          default:
            break;
        }
        break;
      }
      case '/back': {
        switch (method) {
          case 'POST':
            return await this.#browsingContextProcessor.classicBack();
          default:
            break;
        }
        break;
      }
      case '/forward': {
        switch (method) {
          case 'POST':
            return await this.#browsingContextProcessor.classicForward();
          default:
            break;
        }
        break;
      }
      case '/refresh': {
        switch (method) {
          case 'POST':
            return await this.#browsingContextProcessor.classicRefresh();
          default:
            break;
        }
        break;
      }
      case '/title': {
        switch (method) {
          case 'GET':
            return await this.#browsingContextProcessor.classicGetTitle();
          default:
            break;
        }
        break;
      }
      case '/source': {
        switch (method) {
          case 'GET':
            return await this.#browsingContextProcessor.classicGetPageSource();
          default:
            break;
        }
        break;
      }
      case '/window':
      case '/window/handle': {
        switch (method) {
          case 'GET':
            return this.#browsingContextProcessor.classicGetWindowHandle();
          case 'POST': {
            const params = body as
              | {handle?: unknown; name?: unknown}
              | undefined;
            return this.#browsingContextProcessor.classicSwitchToWindow(
              params?.handle ?? params?.name,
            );
          }
          case 'DELETE':
            return await this.#browsingContextProcessor.classicCloseWindow();
          default:
            break;
        }
        break;
      }
      case '/window/handles': {
        switch (method) {
          case 'GET':
            return this.#browsingContextProcessor.classicGetWindowHandles();
          default:
            break;
        }
        break;
      }
      case '/window/new': {
        switch (method) {
          case 'POST': {
            const params = body as {type?: unknown} | undefined;
            return await this.#browsingContextProcessor.classicNewWindow(
              params?.type,
            );
          }
          default:
            break;
        }
        break;
      }
      case '/window/rect': {
        switch (method) {
          case 'GET':
            return await this.#browsingContextProcessor.classicGetWindowRect();
          case 'POST':
            return await this.#browsingContextProcessor.classicSetWindowRect(
              body,
            );
          default:
            break;
        }
        break;
      }
      case '/window/maximize': {
        switch (method) {
          case 'POST':
            return await this.#browsingContextProcessor.classicMaximizeWindow();
          default:
            break;
        }
        break;
      }
      case '/window/minimize': {
        switch (method) {
          case 'POST':
            return await this.#browsingContextProcessor.classicMinimizeWindow();
          default:
            break;
        }
        break;
      }
      case '/window/fullscreen': {
        switch (method) {
          case 'POST':
            return await this.#browsingContextProcessor.classicFullscreenWindow();
          default:
            break;
        }
        break;
      }
      case '/frame': {
        switch (method) {
          case 'POST': {
            const params = body as {id?: unknown} | undefined;
            return await this.#browsingContextProcessor.classicSwitchToFrame(
              params ? (params.id === undefined ? null : params.id) : null,
            );
          }
          default:
            break;
        }
        break;
      }
      case '/frame/parent': {
        switch (method) {
          case 'POST':
            return this.#browsingContextProcessor.classicSwitchToParentFrame();
          default:
            break;
        }
        break;
      }
      case '/alert/accept': {
        switch (method) {
          case 'POST':
            return await this.#browsingContextProcessor.classicHandleAlert(
              true,
            );
          default:
            break;
        }
        break;
      }
      case '/alert/dismiss': {
        switch (method) {
          case 'POST':
            return await this.#browsingContextProcessor.classicHandleAlert(
              false,
            );
          default:
            break;
        }
        break;
      }
      case '/alert/text': {
        switch (method) {
          case 'GET':
            return this.#browsingContextProcessor.classicGetAlertText();
          case 'POST':
            return await this.#browsingContextProcessor.classicSendAlertText(
              body,
            );
          default:
            break;
        }
        break;
      }
      case '/cookie': {
        switch (method) {
          case 'GET':
            return await this.#storageProcessor.classicGetAllCookies();
          case 'POST':
            return await this.#storageProcessor.classicAddCookie(body);
          case 'DELETE':
            return await this.#storageProcessor.classicDeleteAllCookies();
          default:
            break;
        }
        break;
      }
      case '/element': {
        switch (method) {
          case 'POST':
            return await this.#browsingContextProcessor.classicFindElement(
              body,
            );
          default:
            break;
        }
        break;
      }
      case '/elements': {
        switch (method) {
          case 'POST':
            return await this.#browsingContextProcessor.classicFindElements(
              body,
            );
          default:
            break;
        }
        break;
      }
      case '/element/active': {
        switch (method) {
          case 'GET':
            return await this.#browsingContextProcessor.classicGetActiveElement();
          default:
            break;
        }
        break;
      }
      case '/screenshot': {
        switch (method) {
          case 'GET':
            return await this.#browsingContextProcessor.classicTakeScreenshot();
          default:
            break;
        }
        break;
      }
      case '/actions': {
        switch (method) {
          case 'POST':
            return await this.#inputProcessor.classicPerformActions(body);
          case 'DELETE':
            return await this.#inputProcessor.classicReleaseActions();
          default:
            break;
        }
        break;
      }
      case '/print': {
        switch (method) {
          case 'POST':
            return await this.#browsingContextProcessor.classicPrintPage(body);
          default:
            break;
        }
        break;
      }
      default:
        break;
    }
    if (path.startsWith('/cookie/')) {
      const cookieName = decodeURIComponent(path.substring('/cookie/'.length));
      switch (method) {
        case 'GET':
          return await this.#storageProcessor.classicGetNamedCookie(cookieName);
        case 'DELETE':
          return await this.#storageProcessor.classicDeleteCookie(cookieName);
        default:
          break;
      }
    }

    const elemMatch = path.match(
      /^\/element\/([^/]+)\/(element|elements|shadow)$/,
    );
    if (elemMatch) {
      const elementId = decodeURIComponent(elemMatch[1]!);
      const subAction = elemMatch[2];
      if (method === 'POST' && subAction === 'element') {
        return await this.#browsingContextProcessor.classicFindElement(
          body,
          elementId,
        );
      }
      if (method === 'POST' && subAction === 'elements') {
        return await this.#browsingContextProcessor.classicFindElements(
          body,
          elementId,
        );
      }
      if (method === 'GET' && subAction === 'shadow') {
        return await this.#browsingContextProcessor.classicGetElementShadowRoot(
          elementId,
        );
      }
    }

    const elemSubMatch = path.match(
      /^\/element\/([^/]+)\/(selected|text|name|rect|enabled|computedlabel|computedrole|screenshot|click|clear|value)$/,
    );
    if (elemSubMatch) {
      const elementId = decodeURIComponent(elemSubMatch[1]!);
      const subAction = elemSubMatch[2];
      if (method === 'GET') {
        switch (subAction) {
          case 'selected':
            return await this.#browsingContextProcessor.classicIsElementSelected(
              elementId,
            );
          case 'text':
            return await this.#browsingContextProcessor.classicGetElementText(
              elementId,
            );
          case 'name':
            return await this.#browsingContextProcessor.classicGetElementTagName(
              elementId,
            );
          case 'rect':
            return await this.#browsingContextProcessor.classicGetElementRect(
              elementId,
            );
          case 'enabled':
            return await this.#browsingContextProcessor.classicIsElementEnabled(
              elementId,
            );
          case 'computedlabel':
            return await this.#browsingContextProcessor.classicGetComputedLabel(
              elementId,
            );
          case 'computedrole':
            return await this.#browsingContextProcessor.classicGetComputedRole(
              elementId,
            );
          case 'screenshot':
            return await this.#browsingContextProcessor.classicTakeElementScreenshot(
              elementId,
            );
          default:
            break;
        }
      } else if (method === 'POST') {
        switch (subAction) {
          case 'click':
            return await this.#browsingContextProcessor.classicElementClick(
              elementId,
            );
          case 'clear':
            return await this.#browsingContextProcessor.classicElementClear(
              elementId,
            );
          case 'value': {
            const bodyObj =
              typeof body === 'object' && body !== null
                ? (body as Record<string, unknown>)
                : undefined;
            const textParam = bodyObj
              ? (bodyObj['text'] ??
                (Array.isArray(bodyObj['value'])
                  ? (bodyObj['value'] as string[]).join('')
                  : bodyObj['value']))
              : undefined;
            if (typeof textParam !== 'string') {
              return {
                status: 400,
                body: {
                  value: {
                    error: 'invalid argument',
                    message: 'text or value must be a string',
                    stacktrace: '',
                  },
                },
              };
            }
            return await this.#browsingContextProcessor.classicElementValue(
              elementId,
              textParam,
            );
          }
          default:
            break;
        }
      }
    }

    const elemParamMatch = path.match(
      /^\/element\/([^/]+)\/(attribute|property|css)\/([^/]+)$/,
    );
    if (elemParamMatch && method === 'GET') {
      const elementId = decodeURIComponent(elemParamMatch[1]!);
      const subAction = elemParamMatch[2];
      const paramName = decodeURIComponent(elemParamMatch[3]!);
      switch (subAction) {
        case 'attribute':
          return await this.#browsingContextProcessor.classicGetElementAttribute(
            elementId,
            paramName,
          );
        case 'property':
          return await this.#browsingContextProcessor.classicGetElementProperty(
            elementId,
            paramName,
          );
        case 'css':
          return await this.#browsingContextProcessor.classicGetElementCSSValue(
            elementId,
            paramName,
          );
        default:
          break;
      }
    }

    const shadowMatch = path.match(/^\/shadow\/([^/]+)\/(element|elements)$/);
    if (shadowMatch) {
      const shadowId = decodeURIComponent(shadowMatch[1]!);
      const subAction = shadowMatch[2];
      if (method === 'POST' && subAction === 'element') {
        return await this.#browsingContextProcessor.classicFindElement(
          body,
          shadowId,
          true,
        );
      }
      if (method === 'POST' && subAction === 'elements') {
        return await this.#browsingContextProcessor.classicFindElements(
          body,
          shadowId,
          true,
        );
      }
    }

    const cookieMatch = path.match(/^\/cookie\/([^/]+)$/);
    if (cookieMatch) {
      const cookieName = decodeURIComponent(cookieMatch[1]!);
      if (method === 'GET') {
        return await this.#storageProcessor.classicGetNamedCookie(cookieName);
      }
      if (method === 'DELETE') {
        return await this.#storageProcessor.classicDeleteCookie(cookieName);
      }
    }
    return {
      status: 404,
      body: {
        value: {
          error: 'unknown command',
          message: `Unknown classic command ${method} ${path}`,
          stacktrace: '',
        },
      },
    };
  }
}
