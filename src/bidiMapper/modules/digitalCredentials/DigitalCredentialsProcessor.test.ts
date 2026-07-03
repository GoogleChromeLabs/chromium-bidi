/**
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
 */

import {describe, it, beforeEach, afterEach} from 'node:test';

import {assert} from 'chai';
import sinon from 'sinon';

import {InvalidArgumentException} from '../../../protocol/protocol.js';
import type {CdpTarget} from '../cdp/CdpTarget.js';
import type {BrowsingContextImpl} from '../context/BrowsingContextImpl.js';
import {BrowsingContextStorage} from '../context/BrowsingContextStorage.js';

import {DigitalCredentialsProcessor} from './DigitalCredentialsProcessor.js';

describe('DigitalCredentialsProcessor', () => {
  let browsingContextStorage: sinon.SinonStubbedInstance<BrowsingContextStorage>;
  let processor: DigitalCredentialsProcessor;

  beforeEach(() => {
    browsingContextStorage = sinon.createStubInstance(BrowsingContextStorage);
    processor = new DigitalCredentialsProcessor(browsingContextStorage);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('parameter validation', () => {
    it("should throw InvalidArgumentException if action is 'respond' but protocol or response is missing", async () => {
      try {
        await processor.setVirtualWalletBehavior({
          action: 'respond',
        });
        assert.fail('Expected InvalidArgumentException to be thrown');
      } catch (error) {
        assert.instanceOf(error, InvalidArgumentException);
        assert.strictEqual(
          (error as Error).message,
          "Protocol and response are required when action is 'respond'",
        );
      }

      try {
        await processor.setVirtualWalletBehavior({
          action: 'respond',
          protocol: 'webauthn',
        });
        assert.fail('Expected InvalidArgumentException to be thrown');
      } catch (error) {
        assert.instanceOf(error, InvalidArgumentException);
        assert.strictEqual(
          (error as Error).message,
          "Protocol and response are required when action is 'respond'",
        );
      }

      try {
        await processor.setVirtualWalletBehavior({
          action: 'respond',
          response: {},
        });
        assert.fail('Expected InvalidArgumentException to be thrown');
      } catch (error) {
        assert.instanceOf(error, InvalidArgumentException);
        assert.strictEqual(
          (error as Error).message,
          "Protocol and response are required when action is 'respond'",
        );
      }
    });

    it("should throw InvalidArgumentException if action is not 'respond' but protocol or response is provided", async () => {
      for (const action of ['decline', 'wait', 'clear'] as const) {
        try {
          await processor.setVirtualWalletBehavior({
            action,
            protocol: 'webauthn',
          });
          assert.fail('Expected InvalidArgumentException to be thrown');
        } catch (error) {
          assert.instanceOf(error, InvalidArgumentException);
          assert.strictEqual(
            (error as Error).message,
            "Protocol and response are only allowed when action is 'respond'",
          );
        }

        try {
          await processor.setVirtualWalletBehavior({
            action,
            response: {},
          });
          assert.fail('Expected InvalidArgumentException to be thrown');
        } catch (error) {
          assert.instanceOf(error, InvalidArgumentException);
          assert.strictEqual(
            (error as Error).message,
            "Protocol and response are only allowed when action is 'respond'",
          );
        }
      }
    });
  });

  describe('context-specific behavior', () => {
    it('should send CDP command to the specific context target', async () => {
      const mockCdpClient = {
        sendCommand: sinon.stub().resolves({}),
      };
      const mockTarget = {
        cdpClient: mockCdpClient,
      } as unknown as CdpTarget;
      const mockContext = {
        cdpTarget: mockTarget,
      } as unknown as BrowsingContextImpl;

      browsingContextStorage.getContext
        .withArgs('context_id')
        .returns(mockContext);

      await processor.setVirtualWalletBehavior({
        context: 'context_id',
        action: 'decline',
      });

      assert.isTrue(mockCdpClient.sendCommand.calledOnce);
      assert.isTrue(
        mockCdpClient.sendCommand.calledWith(
          'DigitalCredentials.setVirtualWalletBehavior',
          {
            action: 'decline',
            protocol: undefined,
            response: undefined,
          },
        ),
      );
    });
  });

  describe('session-default behavior', () => {
    it('should send CDP command to all active targets and store default', async () => {
      const mockCdpClient1 = {sendCommand: sinon.stub().resolves({})};
      const mockCdpClient2 = {sendCommand: sinon.stub().resolves({})};
      const mockTarget1 = {cdpClient: mockCdpClient1} as unknown as CdpTarget;
      const mockTarget2 = {cdpClient: mockCdpClient2} as unknown as CdpTarget;
      const mockContext1 = {
        cdpTarget: mockTarget1,
      } as unknown as BrowsingContextImpl;
      const mockContext2 = {
        cdpTarget: mockTarget2,
      } as unknown as BrowsingContextImpl;

      const mockContext3 = {
        cdpTarget: mockTarget1,
      } as unknown as BrowsingContextImpl;

      browsingContextStorage.getAllContexts.returns([
        mockContext1,
        mockContext2,
        mockContext3,
      ]);

      await processor.setVirtualWalletBehavior({
        action: 'respond',
        protocol: 'openid4vp',
        response: {token: 'abc'},
      });

      assert.isTrue(mockCdpClient1.sendCommand.calledOnce);
      assert.isTrue(mockCdpClient2.sendCommand.calledOnce);

      const expectedCdpParams = {
        action: 'respond',
        protocol: 'openid4vp',
        response: {token: 'abc'},
      };
      assert.isTrue(
        mockCdpClient1.sendCommand.calledWith(
          'DigitalCredentials.setVirtualWalletBehavior',
          expectedCdpParams,
        ),
      );
      assert.isTrue(
        mockCdpClient2.sendCommand.calledWith(
          'DigitalCredentials.setVirtualWalletBehavior',
          expectedCdpParams,
        ),
      );

      const newMockCdpClient = {sendCommand: sinon.stub().resolves({})};
      const newMockTarget = {
        cdpClient: newMockCdpClient,
      } as unknown as CdpTarget;

      await processor.onCdpTargetCreated(newMockTarget);

      assert.isTrue(newMockCdpClient.sendCommand.calledOnce);
      assert.isTrue(
        newMockCdpClient.sendCommand.calledWith(
          'DigitalCredentials.setVirtualWalletBehavior',
          expectedCdpParams,
        ),
      );
    });

    it('should clear default behavior', async () => {
      browsingContextStorage.getAllContexts.returns([]);

      await processor.setVirtualWalletBehavior({
        action: 'decline',
      });

      await processor.setVirtualWalletBehavior({
        action: 'clear',
      });

      const newMockCdpClient = {sendCommand: sinon.stub().resolves({})};
      const newMockTarget = {
        cdpClient: newMockCdpClient,
      } as unknown as CdpTarget;

      await processor.onCdpTargetCreated(newMockTarget);

      assert.isFalse(newMockCdpClient.sendCommand.called);
    });
  });
});
