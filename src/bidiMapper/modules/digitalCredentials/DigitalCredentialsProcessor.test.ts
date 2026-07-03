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

import {describe, it, beforeEach} from 'node:test';
import {assert} from 'chai';
import sinon from 'sinon';

import {
  InvalidArgumentException,
} from '../../../protocol/protocol.js';
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

  describe('parameter validation', () => {
    it("should throw InvalidArgumentException when action is 'respond' but protocol or response is missing", async () => {
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

    it("should throw InvalidArgumentException when action is not 'respond' but protocol or response is present", async () => {
      const actions = ['wait', 'decline', 'clear'] as const;
      for (const action of actions) {
        try {
          await processor.setVirtualWalletBehavior({
            action,
            protocol: 'webauthn',
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
        id: 'context_id',
        parentId: null,
        cdpTarget: mockTarget,
      } as unknown as BrowsingContextImpl;

      browsingContextStorage.getContext
        .withArgs('context_id')
        .returns(mockContext);
      browsingContextStorage.getAllContexts.returns([mockContext]);

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
            behavior: 'decline',
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
        id: 'context_1',
        parentId: null,
        cdpTarget: mockTarget1,
      } as unknown as BrowsingContextImpl;
      const mockContext2 = {
        id: 'context_2',
        parentId: null,
        cdpTarget: mockTarget2,
      } as unknown as BrowsingContextImpl;
      const mockContext3 = {
        id: 'context_3',
        parentId: null,
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
        behavior: 'respond',
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
      const newMockContext = {
        id: 'new_context',
        parentId: null,
        cdpTarget: newMockTarget,
      } as unknown as BrowsingContextImpl;

      browsingContextStorage.getAllContexts.returns([
        mockContext1,
        mockContext2,
        mockContext3,
        newMockContext,
      ]);

      await processor.applyBehavior(newMockContext);

      assert.isTrue(newMockCdpClient.sendCommand.calledOnce);
      assert.isTrue(
        newMockCdpClient.sendCommand.calledWith(
          'DigitalCredentials.setVirtualWalletBehavior',
          expectedCdpParams,
        ),
      );
    });

    it('should clear default behavior', async () => {
      const mockCdpClient = {sendCommand: sinon.stub().resolves({})};
      const mockTarget = {cdpClient: mockCdpClient} as unknown as CdpTarget;
      const mockContext = {
        id: 'context_1',
        parentId: null,
        cdpTarget: mockTarget,
      } as unknown as BrowsingContextImpl;

      browsingContextStorage.getAllContexts.returns([mockContext]);

      await processor.setVirtualWalletBehavior({
        action: 'decline',
      });

      assert.isTrue(mockCdpClient.sendCommand.calledOnce);

      await processor.setVirtualWalletBehavior({
        action: 'clear',
      });

      // It should call clear on the existing target because it had behavior applied
      assert.isTrue(mockCdpClient.sendCommand.calledTwice);
      assert.isTrue(
        mockCdpClient.sendCommand.secondCall.calledWith(
          'DigitalCredentials.setVirtualWalletBehavior',
          {
            action: 'clear',
            behavior: 'clear',
            protocol: undefined,
            response: undefined,
          },
        ),
      );

      const newMockCdpClient = {sendCommand: sinon.stub().resolves({})};
      const newMockTarget = {
        cdpClient: newMockCdpClient,
      } as unknown as CdpTarget;
      const newMockContext = {
        id: 'new_context',
        parentId: null,
        cdpTarget: newMockTarget,
      } as unknown as BrowsingContextImpl;

      browsingContextStorage.getAllContexts.returns([mockContext, newMockContext]);

      await processor.applyBehavior(newMockContext);

      // New target should NOT receive clear because it never had behavior applied
      assert.isFalse(newMockCdpClient.sendCommand.called);
    });

    it('should inherit behavior from parent context', async () => {
      const mockCdpClient = {sendCommand: sinon.stub().resolves({})};
      const mockTarget = {cdpClient: mockCdpClient} as unknown as CdpTarget;

      const parentContext = {
        id: 'parent_id',
        parentId: null,
        cdpTarget: mockTarget,
      } as unknown as BrowsingContextImpl;

      const childContext = {
        id: 'child_id',
        parentId: 'parent_id',
        cdpTarget: mockTarget,
      } as unknown as BrowsingContextImpl;

      browsingContextStorage.getContext
        .withArgs('parent_id')
        .returns(parentContext);
      browsingContextStorage.getContext
        .withArgs('child_id')
        .returns(childContext);
      browsingContextStorage.getAllContexts.returns([
        parentContext,
        childContext,
      ]);

      await processor.setVirtualWalletBehavior({
        context: 'parent_id',
        action: 'decline',
      });

      mockCdpClient.sendCommand.resetHistory();

      await processor.applyBehavior(childContext);

      assert.isTrue(mockCdpClient.sendCommand.calledOnce);
      assert.isTrue(
        mockCdpClient.sendCommand.calledWith(
          'DigitalCredentials.setVirtualWalletBehavior',
          {
            action: 'decline',
            behavior: 'decline',
            protocol: undefined,
            response: undefined,
          },
        ),
      );
    });
  });
});
