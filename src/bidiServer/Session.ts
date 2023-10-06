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

import {BrowserInstance} from './BrowserInstance';
import {uuidv4} from '../utils/uuid';

export class Session {
  #sessionId: string = uuidv4();
  #capabilities?: any;
  #browserInstance?: BrowserInstance;

  get sessionId(): string {
    return this.#sessionId;
  }

  get capabilities(): any {
    return this.#capabilities;
  }

  get browserInstance(): BrowserInstance | undefined {
    return this.#browserInstance;
  }

  set browserInstance(value: BrowserInstance) {
    if (this.#browserInstance !== undefined) {
      throw new Error('Browser is already running for the session.');
    }
    this.#browserInstance = value;
  }

  constructor(capabilities?: any, browserInstance?: BrowserInstance) {
    this.#capabilities = capabilities;
    this.#browserInstance = browserInstance;
  }
}
