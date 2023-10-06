/*
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
 *
 */

import {Session} from './Session';
import {BrowserInstance} from './BrowserInstance';

export class SessionManager {
  #sessions: Map<string, Session> = new Map();

  createSession(
    capabilities?: any,
    browserInstance?: BrowserInstance
  ): Session {
    if (this.#sessions.size > 0) {
      throw new Error('Only one session is supported');
    }
    const session = new Session(capabilities, browserInstance);
    this.#sessions.set(session.sessionId, session);
    return session;
  }

  closeSession(sessionId: string) {
    this.#sessions.get(sessionId)?.browserInstance?.close();
    this.#sessions.delete(sessionId);
  }

  getSession(sessionId: string): Session | undefined {
    return this.#sessions.get(sessionId);
  }
}
