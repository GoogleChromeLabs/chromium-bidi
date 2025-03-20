/**
 * Copyright 2025 Google LLC.
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

import type {CdpClient} from '../../../cdp/CdpClient.js';
import {
  type Autofill,
  type EmptyResult,
  UnsupportedOperationException,
} from '../../../protocol/protocol.js';

/**
 * Responsible for handling the `autofill` module.
 */
export class AutofillProcessor {
  readonly #browserCdpClient: CdpClient;

  constructor(browserCdpClient: CdpClient) {
    this.#browserCdpClient = browserCdpClient;
  }

  /**
   * Triggers autofill for a specific element with the provided field data.
   *
   * @param params Parameters for the autofill.trigger command
   * @returns An empty result
   */
  async triggerById(params: Autofill.TriggerParameters): Promise<EmptyResult> {
    try {
      // await this.#browserCdpClient.sendCommand('Autofill.trigger', {
      //   fieldId: Number(params.element.sharedId),
      //   frameId: undefined,
      //   card: {
      //     /**
      //      * 16-digit credit card number.
      //      */
      //     number: '1111222233334444',
      //     /**
      //      * Name of the credit card owner.
      //      */
      //     name: 'string',
      //     /**
      //      * 2-digit expiry month.
      //      */
      //     expiryMonth: '01',
      //     /**
      //      * 4-digit expiry year.
      //      */
      //     expiryYear: '30',
      //     /**
      //      * 3-digit card verification code.
      //      */
      //     cvc: '123',
      //   },
      // });
      await this.#browserCdpClient.sendCommand('Autofill.triggerById' as any, {
        elementId: params.element.sharedId,
        field: {
          name: params.field.name,
          value: params.field.value,
        },
      });

      return {};
    } catch (err) {
      if ((err as Error).message.includes('command was not found')) {
        throw new UnsupportedOperationException(
          'Autofill triggering is not supported by this browser',
        );
      }
      throw err;
    }
  }

  /**
   * Triggers autofill for a specific element with the provided field data.
   *
   * @param params Parameters for the autofill.trigger command
   * @returns An empty result
   */
  async setAddresses(params: Autofill.AddressParameters): Promise<EmptyResult> {
    try {
      await this.#browserCdpClient.sendCommand('Autofill.setAddresses', {
        addresses: [
          {
            fields: params.fields,
            // fields: [
            //   {
            //     name: 'name',
            //     value: 'John Doe',
            //   },
            // ],
          },
        ],
      });

      return {};
    } catch (err) {
      if ((err as Error).message.includes('command was not found')) {
        throw new UnsupportedOperationException(
          'Autofill setting addresses is not supported by this browser',
        );
      }
      throw err;
    }
  }
}
