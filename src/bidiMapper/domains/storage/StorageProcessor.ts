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
 */
import type {Protocol} from 'devtools-protocol';

import type {ICdpClient} from '../../../cdp/CdpClient.js';
import type {Storage} from '../../../protocol/protocol.js';
import {Network} from '../../../protocol/protocol.js';
import type {LoggerFn} from '../../../utils/log.js';

/**
 * Responsible for handling the `storage` domain.
 */
export class StorageProcessor {
  readonly #browserCdpClient: ICdpClient;
  readonly #logger: LoggerFn | undefined;

  constructor(browserCdpClient: ICdpClient, logger: LoggerFn | undefined) {
    this.#browserCdpClient = browserCdpClient;
    this.#logger = logger;
  }

  async getCookies(
    params: Storage.GetCookiesParameters
  ): Promise<Storage.GetCookiesResult> {
    const filterCookie = params.filter;

    const cdpResponse = await this.#browserCdpClient.sendCommand(
      'Storage.getCookies',
      {}
    );
    const filteredBiDiCookies = cdpResponse.cookies
      .map((c) => this.#cdpToBiDiCookie(c))
      .filter((c) => this.#match(c, filterCookie));

    return {
      cookies: filteredBiDiCookies,
      // TODO: add partition key.
      partitionKey: {},
    };
  }

  #cdpToBiDiCookie(cookie: Protocol.Network.Cookie): Network.Cookie {
    return {
      name: cookie.name,
      value: {type: 'string', value: cookie.value},
      domain: cookie.domain,
      path: cookie.path,
      size: cookie.size,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: StorageProcessor.#convertSameSite(cookie.sameSite),
      expiry: cookie.expires,
    };
  }

  // TODO: check what to return is the `sameSite` is not set.
  static #convertSameSite(
    sameSite: Protocol.Network.CookieSameSite | undefined
  ): Network.SameSite {
    return sameSite === 'Strict'
      ? Network.SameSite.Strict
      : sameSite === 'Lax'
      ? Network.SameSite.Lax
      : Network.SameSite.None;
  }

  #match(cookie: Network.Cookie, filter?: Storage.CookieFilter): boolean {
    if (filter === undefined) {
      return true;
    }
    return (
      (filter.name === undefined || filter.name === cookie.name) &&
      // `value` contains fields `type` and `value`.
      (filter.value === undefined ||
        (filter.value.type === cookie.value.type &&
          filter.value.value === cookie.value.value)) &&
      (filter.domain === undefined || filter.domain === cookie.domain) &&
      (filter.path === undefined || filter.path === cookie.path) &&
      (filter.size === undefined || filter.size === cookie.size) &&
      (filter.httpOnly === undefined || filter.httpOnly === cookie.httpOnly) &&
      (filter.secure === undefined || filter.secure === cookie.secure) &&
      (filter.sameSite === undefined || filter.sameSite === cookie.sameSite) &&
      (filter.expiry === undefined || filter.expiry === cookie.expiry)
    );
  }
}
