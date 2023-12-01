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

import type {CdpClient} from '../../../cdp/CdpClient.js';
import type {Storage} from '../../../protocol/protocol.js';
import {
  Network,
  UnderspecifiedStoragePartitionException,
} from '../../../protocol/protocol.js';
import type {LoggerFn} from '../../../utils/log.js';
import {LogType} from '../../../utils/log.js';
import type {BrowsingContextStorage} from '../context/BrowsingContextStorage';
import {NetworkProcessor} from '../network/NetworkProcessor';

/**
 * Responsible for handling the `storage` domain.
 */
export class StorageProcessor {
  readonly #browserCdpClient: CdpClient;
  readonly #browsingContextStorage: BrowsingContextStorage;
  readonly #logger: LoggerFn | undefined;

  constructor(
    browserCdpClient: CdpClient,
    browsingContextStorage: BrowsingContextStorage,
    logger: LoggerFn | undefined
  ) {
    this.#browsingContextStorage = browsingContextStorage;
    this.#browserCdpClient = browserCdpClient;
    this.#logger = logger;
  }

  async getCookies(
    params: Storage.GetCookiesParameters
  ): Promise<Storage.GetCookiesResult> {
    const filterCookie = params.filter;
    const partitionKey = this.#extendStoragePartitionSpec(params);

    const cdpResponse = await this.#browserCdpClient.sendCommand(
      'Storage.getCookies',
      {}
    );
    const unsupportedPartitionKeys = Array.from(partitionKey.keys()).filter(
      (k) => k !== 'sourceOrigin'
    );
    if (unsupportedPartitionKeys.length > 0) {
      this.#logger?.(
        LogType.debugInfo,
        `Unsupported partition keys: ${unsupportedPartitionKeys}`
      );
    }

    if (!partitionKey.has('sourceOrigin')) {
      throw new UnderspecifiedStoragePartitionException(
        'sourceOrigin or cookie.domain should be set'
      );
    }

    const sourceOrigin = partitionKey.get('sourceOrigin');

    const filteredBiDiCookies = cdpResponse.cookies
      .filter(
        // CDP's partition key is the source origin.
        // TODO: check if this logic is correct.
        (c) => c.partitionKey === undefined || c.partitionKey === sourceOrigin
      )
      .map((c) => this.#cdpToBiDiCookie(c))
      .filter((c) => this.#match(c, filterCookie));

    return {
      cookies: filteredBiDiCookies,
      partitionKey: Object.fromEntries(partitionKey),
    };
  }

  #extendStoragePartitionSpec(
    params: Storage.GetCookiesParameters
  ): Map<string, string> {
    const partitionSpec = params.partition ?? {};
    const partitionKey = new Map<string, string>();

    if (typeof partitionSpec === 'string') {
      // Partition spec is a browsing context id.
      const browsingContextId: string = partitionSpec;
      const browsingContext =
        this.#browsingContextStorage.getContext(browsingContextId);
      const url = NetworkProcessor.parseUrlString(browsingContext?.url ?? '');
      // Cookie origin should not contain the port.
      // TODO: check if this logic is correct.
      partitionKey.set('sourceOrigin', `${url.protocol}//${url.hostname}`);
    } else {
      // Partition spec is a storage partition.
      const storagePartition: Storage.PartitionKey = partitionSpec;
      // Let partition key be partition spec.
      for (const [key, value] of Object.entries(storagePartition)) {
        partitionKey.set(key, value);
      }
      // TODO: For each name → default value in the default values for storage partition
      //  key attributes. If partition key[name] does not exist set partition key[name] to
      //  default value.

      if (!partitionKey.has('sourceOrigin')) {
        const cookieDomain = params.filter?.domain ?? null;
        if (cookieDomain !== null) {
          partitionKey.set('sourceOrigin', cookieDomain);
        }
      }
    }
    console.log('!!@@##');
    console.log(Object.fromEntries(partitionKey));
    return partitionKey;
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
    // TODO: add filter by domain.
    return (
      (filter.name === undefined || filter.name === cookie.name) &&
      // `value` contains fields `type` and `value`.
      (filter.value === undefined ||
        (filter.value.type === cookie.value.type &&
          filter.value.value === cookie.value.value)) &&
      (filter.path === undefined || filter.path === cookie.path) &&
      (filter.size === undefined || filter.size === cookie.size) &&
      (filter.httpOnly === undefined || filter.httpOnly === cookie.httpOnly) &&
      (filter.secure === undefined || filter.secure === cookie.secure) &&
      (filter.sameSite === undefined || filter.sameSite === cookie.sameSite) &&
      (filter.expiry === undefined || filter.expiry === cookie.expiry)
    );
  }
}
