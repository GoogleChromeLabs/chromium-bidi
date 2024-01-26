/*
 * Copyright 2024 Google LLC.
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

import {
  InvalidArgumentException,
  UnsupportedOperationException,
} from '../../../protocol/ErrorResponse';
import {Network, type Storage} from '../../../protocol/protocol.js';

const CDP_SPECIFIC_PREFIX = 'goog:';

/**
 * Utility class for presenting BiDi `network.Cookie` and it's conversion with
 *  CDP's `Network.Cookie` and `Network.CookieParam`.
 *  * https://w3c.github.io/webdriver-bidi/#type-network-Cookie
 *  * https://chromedevtools.github.io/devtools-protocol/tot/Network/#type-Cookie
 *  * https://chromedevtools.github.io/devtools-protocol/tot/Network/#type-CookieParam
 */
export class Cookie {
  /**
   * Converts from CDP Network domain cookie to BiDi network cookie.
   * @param {Protocol.Network.Cookie} cookie
   * @return {Network.Cookie}
   */
  static cdpToBiDiCookie(cookie: Protocol.Network.Cookie): Network.Cookie {
    const result: Network.Cookie = {
      name: cookie.name,
      value: {type: 'string', value: cookie.value},
      domain: cookie.domain,
      path: cookie.path,
      size: cookie.size,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite:
        cookie.sameSite === undefined
          ? Network.SameSite.None
          : this.#sameSiteCdpToBiDi(cookie.sameSite),
      ...(cookie.expires >= 0 ? {expiry: cookie.expires} : undefined),
    };

    // Extending with CDP-specific properties with `goog:` prefix.
    result[`${CDP_SPECIFIC_PREFIX}session`] = cookie.session;
    result[`${CDP_SPECIFIC_PREFIX}priority`] = cookie.priority;
    result[`${CDP_SPECIFIC_PREFIX}sameParty`] = cookie.sameParty;
    result[`${CDP_SPECIFIC_PREFIX}sourceScheme`] = cookie.sourceScheme;
    result[`${CDP_SPECIFIC_PREFIX}sourcePort`] = cookie.sourcePort;
    if (cookie.partitionKey !== undefined) {
      result[`${CDP_SPECIFIC_PREFIX}partitionKey`] = cookie.partitionKey;
    }
    if (cookie.partitionKeyOpaque !== undefined) {
      result[`${CDP_SPECIFIC_PREFIX}partitionKeyOpaque`] =
        cookie.partitionKeyOpaque;
    }
    return result;
  }

  /**
   * Converts from BiDi set network cookie params to CDP Network domain cookie.
   * @param {Storage.SetCookieParameters} params
   * @param {Storage.PartitionKey} partitionKey
   * @return {Protocol.Network.CookieParam}
   */
  static bidiToCdpCookie(
    params: Storage.SetCookieParameters,
    partitionKey: Storage.PartitionKey
  ): Protocol.Network.CookieParam {
    if (params.cookie.value.type !== 'string') {
      // CDP supports only string values in cookies.
      throw new UnsupportedOperationException(
        'Only string cookie values are supported'
      );
    }
    const deserializedValue = params.cookie.value.value;
    const result: Protocol.Network.CookieParam = {
      name: params.cookie.name,
      value: deserializedValue,
      domain: params.cookie.domain,
      path: params.cookie.path ?? '/',
      secure: params.cookie.secure ?? false,
      httpOnly: params.cookie.httpOnly ?? false,
      // CDP's `partitionKey` is the BiDi's `partition.sourceOrigin`.
      ...(partitionKey.sourceOrigin !== undefined && {
        partitionKey: partitionKey.sourceOrigin,
      }),
      ...(params.cookie.expiry !== undefined && {
        expires: params.cookie.expiry,
      }),
      ...(params.cookie.sameSite !== undefined && {
        sameSite: this.#sameSiteBiDiToCdp(params.cookie.sameSite),
      }),
    };

    // Extending with CDP-specific properties with `goog:` prefix.
    if (params.cookie[`${CDP_SPECIFIC_PREFIX}url`] !== undefined) {
      result.url = params.cookie[`${CDP_SPECIFIC_PREFIX}url`];
    }
    if (params.cookie[`${CDP_SPECIFIC_PREFIX}priority`] !== undefined) {
      result.priority = params.cookie[`${CDP_SPECIFIC_PREFIX}priority`];
    }
    if (params.cookie[`${CDP_SPECIFIC_PREFIX}sameParty`] !== undefined) {
      result.sameParty = params.cookie[`${CDP_SPECIFIC_PREFIX}sameParty`];
    }
    if (params.cookie[`${CDP_SPECIFIC_PREFIX}sourceScheme`] !== undefined) {
      result.sourceScheme = params.cookie[`${CDP_SPECIFIC_PREFIX}sourceScheme`];
    }
    if (params.cookie[`${CDP_SPECIFIC_PREFIX}sourcePort`] !== undefined) {
      result.sourcePort = params.cookie[`${CDP_SPECIFIC_PREFIX}sourcePort`];
    }

    return result;
  }

  static #sameSiteCdpToBiDi(
    sameSite: Protocol.Network.CookieSameSite
  ): Network.SameSite {
    switch (sameSite) {
      case 'Strict':
        return Network.SameSite.Strict;
      case 'None':
        return Network.SameSite.None;
      case 'Lax':
        return Network.SameSite.Lax;
      default:
        // Defaults to `Lax`:
        // https://web.dev/articles/samesite-cookies-explained#samesitelax_by_default
        return Network.SameSite.Lax;
    }
  }

  static #sameSiteBiDiToCdp(
    sameSite: Network.SameSite
  ): Protocol.Network.CookieSameSite {
    switch (sameSite) {
      case Network.SameSite.Strict:
        return 'Strict';
      case Network.SameSite.Lax:
        return 'Lax';
      case Network.SameSite.None:
        return 'None';
    }
    throw new InvalidArgumentException(`Unknown 'sameSite' value ${sameSite}`);
  }
}
