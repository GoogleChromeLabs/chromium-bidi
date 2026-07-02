/*
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
 *
 */

import {describe, it} from 'node:test';
import {expect} from 'chai';
import sinon from 'sinon';
import type {SinonStub} from 'sinon';

import type {CdpClient} from '../../../cdp/CdpClient.js';

import {CdpTarget} from './CdpTarget.js';

function createCdpTarget(defaultUserAgent: string): {
  target: CdpTarget;
  sendCommand: SinonStub;
} {
  const sendCommand = sinon.stub().resolves({});
  const cdpClient = {
    sendCommand,
  } as unknown as CdpClient;

  return {
    target: new CdpTarget(
      'target-id',
      cdpClient,
      cdpClient,
      cdpClient,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      'default',
      defaultUserAgent,
      undefined,
    ),
    sendCommand,
  };
}

describe('CdpTarget', () => {
  describe('setDeviceMetricsOverride', () => {
    it('sets mobile device metrics for Android targets', async () => {
      const {target, sendCommand} = createCdpTarget(
        'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36',
      );

      await target.setDeviceMetricsOverride(
        {width: 320, height: 640},
        2,
        null,
        null,
      );

      expect(sendCommand.firstCall.args).to.deep.equal([
        'Emulation.setDeviceMetricsOverride',
        {
          width: 320,
          height: 640,
          deviceScaleFactor: 2,
          screenOrientation: undefined,
          mobile: true,
          screenWidth: undefined,
          screenHeight: undefined,
          scrollbarType: 'default',
        },
      ]);
    });

    it('keeps desktop targets in non-mobile device metrics mode', async () => {
      const {target, sendCommand} = createCdpTarget(
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
      );

      await target.setDeviceMetricsOverride(
        {width: 800, height: 600},
        1,
        null,
        null,
      );

      expect(sendCommand.firstCall.args).to.deep.equal([
        'Emulation.setDeviceMetricsOverride',
        {
          width: 800,
          height: 600,
          deviceScaleFactor: 1,
          screenOrientation: undefined,
          mobile: false,
          screenWidth: undefined,
          screenHeight: undefined,
          scrollbarType: 'default',
        },
      ]);
    });
  });
});
