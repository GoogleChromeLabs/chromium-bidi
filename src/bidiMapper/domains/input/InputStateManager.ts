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

import {Message} from '../../../protocol/protocol.js';
import {BrowsingContextImpl} from '../context/browsingContextImpl.js';

import {InputState} from './InputState.js';

export class InputStateManager {
  #states = new WeakMap<BrowsingContextImpl, InputState>();

  get(context: BrowsingContextImpl) {
    if (!context.isTopLevelContext()) {
      throw new Message.UnknownErrorException('Internal error');
    }
    let state = this.#states.get(context);
    if (!state) {
      state = new InputState();
      this.#states.set(context, state);
    }
    return state;
  }

  delete(context: BrowsingContextImpl) {
    this.#states.delete(context);
  }
}
