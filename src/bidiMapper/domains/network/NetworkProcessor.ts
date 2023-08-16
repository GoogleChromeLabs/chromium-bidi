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
  type Network,
  type EmptyResult,
  UnknownCommandException,
  InvalidArgumentException,
} from '../../../protocol/protocol.js';
import {uuidv4} from '../../../utils/uuid.js';
import type {ICdpConnection} from '../../bidiMapper.js';

import type {NetworkStorage} from './NetworkStorage.js';

/** Dispatches Network domain commands. */
export class NetworkProcessor {
  readonly #cdpConnection: ICdpConnection;
  readonly #networkStorage: NetworkStorage;

  // TODO: Pass the correct cdpTarget, then use cdpTarget.cdpClient.
  constructor(networkStorage: NetworkStorage, cdpConnection: ICdpConnection) {
    this.#cdpConnection = cdpConnection;
    this.#networkStorage = networkStorage;
    console.log(this.#cdpConnection);
  }

  async addIntercept(
    params: Network.AddInterceptParameters
  ): Promise<Network.AddInterceptResult> {
    if (params.phases.length === 0) {
      throw new InvalidArgumentException(
        'At least one phase must be specified.'
      );
    }

    const intercept = uuidv4();

    const urlPatterns: string[] = params.urlPatterns ?? [];
    const parsedPatterns: string[] = urlPatterns.map((urlPattern) => {
      return urlPattern; // TODO: Parse the pattern.
    });

    this.#networkStorage.addIntercept(intercept, {
      urlPatterns: parsedPatterns,
      phases: params.phases,
    });

    // TODO: Call `Fetch.enable` via Browsing Context / Cdp Target.
    // TODO: Add try/catch. Remove the intercept if `Fetch.enable` fails.

    return {
      intercept,
    };
  }

  continueRequest(_params: Network.ContinueRequestParameters): EmptyResult {
    throw new UnknownCommandException('Not implemented yet.');
  }

  continueResponse(_params: Network.ContinueResponseParameters): EmptyResult {
    throw new UnknownCommandException('Not implemented yet.');
  }

  continueWithAuth(_params: Network.ContinueWithAuthParameters): EmptyResult {
    throw new UnknownCommandException('Not implemented yet.');
  }

  failRequest(_params: Network.FailRequestParameters): EmptyResult {
    throw new UnknownCommandException('Not implemented yet.');
  }

  provideResponse(_params: Network.ProvideResponseParameters): EmptyResult {
    throw new UnknownCommandException('Not implemented yet.');
  }

  async removeIntercept(
    params: Network.RemoveInterceptParameters
  ): Promise<EmptyResult> {
    this.#networkStorage.removeIntercept(params.intercept);

    // TODO: Call `Fetch.disable` via Browsing Context / Cdp Target.
    // TODO: Pass the correct cdpTarget, then use cdpTarget.cdpClient.
    // TODO: May need to call `enable` again for leftover intercept entries.
    // TODO: Add try/catch. Remove the intercept if `Fetch.disable` fails.

    return {};
  }
}
