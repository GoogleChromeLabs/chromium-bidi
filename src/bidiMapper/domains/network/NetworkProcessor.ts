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
import type {Network, EmptyResult} from '../../../protocol/protocol.js';

import {NetworkStorage} from './NetworkStorage.js';

export class NetworkProcessor {
  #networkStorage: NetworkStorage = new NetworkStorage();

  addIntercept(
    _params: Network.AddInterceptParameters
  ): Network.AddInterceptResult {
    return {
      // TODO: populate.
      intercept: '',
    };
  }

  continueRequest(_params: Network.ContinueRequestParameters): EmptyResult {
    return {};
  }

  continueResponse(_params: Network.ContinueResponseParameters): EmptyResult {
    return {};
  }

  continueWithAuth(_params: Network.ContinueWithAuthParameters): EmptyResult {
    return {};
  }

  failRequest(_params: Network.FailRequestParameters): EmptyResult {
    return {};
  }

  provideResponse(_params: Network.ProvideResponseParameters): EmptyResult {
    return {};
  }

  removeIntercept(_params: Network.RemoveInterceptParameters): EmptyResult {
    return {};
  }
}
