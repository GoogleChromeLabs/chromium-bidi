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
import type {PreloadScriptStorage} from './modules/script/PreloadScriptStorage.js';
import type {RealmStorage} from './modules/script/RealmStorage.js';
import {ScriptProcessor} from './modules/script/ScriptProcessor.js';
import type {EventManager} from './modules/session/EventManager.js';

export class ClassicCommandProcessor {
  readonly #mutex = new Mutex();
  readonly #timeouts: {implicit: number; pageLoad: number; script: number | null} = {
    implicit: 0,
    pageLoad: 300000,
    script: 30000,
  };
  #scriptProcessor: ScriptProcessor;
  #browsingContextProcessor: BrowsingContextProcessor;
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
                  (key === 'script' && val === null) ||
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
            return this.#browsingContextProcessor.classicGetUrl();
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
      case '/frame': {
        switch (method) {
          case 'POST': {
            const params = body as {id?: unknown} | undefined;
            return this.#browsingContextProcessor.classicSwitchToFrame(
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
          default:
            break;
        }
        break;
      }
      default:
        break;
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
