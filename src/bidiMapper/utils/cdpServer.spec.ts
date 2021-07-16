/**
 * Copyright 2021 Google Inc. All rights reserved.
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
import { CdpClient } from './cdpClient';
import { ServerBinding } from './Server/ServerBinding';
import { Stub } from './Tests/stub.spec';
import { assert } from 'chai';

describe('CdpClient tests.', async () => {
  it(`given CdpClient, when 'sendMessage' is called, then cdpBindings should be
      called with proper values`, async () => {
    const someMessage = {
      someAttribute: 'someValue',
    };
    const expectedMessageStr = JSON.stringify({
      ...someMessage,
      id: 0,
    });

    const mockCdpBinding = Stub.stub(ServerBinding);

    const cdpClient = new CdpClient(mockCdpBinding);
    cdpClient.sendMessage(someMessage);

    Stub.assert.calledOnceWithExactly(
      mockCdpBinding.sendMessage,
      expectedMessageStr
    );
  });

  it(`given 'sendMessage' is called, when CDP command is done, then
      'sendMessage' promise is resolved`, async () => {
    const mockCdpBinding = Stub.stub(ServerBinding);
    const cdpClient = new CdpClient(mockCdpBinding);

    // Get handler 'onMessage' to notify 'cdpClient' about new CDP messages.
    const onMessage = Stub.getOnMessage(mockCdpBinding);

    // Send CDP command and store result promise.
    const commandPromise = cdpClient.sendMessage({});
    // Verify CDP command was sent.
    Stub.assert.calledOnce(mockCdpBinding.sendMessage);

    // Notify 'cdpClient' the CDP command is finished.
    onMessage(JSON.stringify({ id: 0 }));

    // Assert 'cdpClient' resolved message promise.
    await commandPromise;
  });

  it(`given 'sendMessage' is called 2 times, when CDP commands are done, then
      each 'sendMessage' promise is resolved with proper results`, async () => {
    const mockCdpBinding = Stub.stub(ServerBinding);
    const cdpClient = new CdpClient(mockCdpBinding);
    const expectedResult1 = { someResult: 1 };
    const expectedResult2 = { anotherResult: 2 };
    const commandResult1 = { id: 0, result: expectedResult1 };
    const commandResult2 = { id: 1, result: expectedResult2 };

    // Get handler 'onMessage' to notify 'cdpClient' about new CDP messages.
    const onMessage = Stub.getOnMessage(mockCdpBinding);

    // Send 2 CDP commands and store result promise.
    const commandPromise1 = cdpClient.sendMessage({});
    const commandPromise2 = cdpClient.sendMessage({});

    // Verify CDP command was sent.
    Stub.assert.calledTwice(mockCdpBinding.sendMessage);

    // Notify 'cdpClient' the command2 is finished.
    onMessage(JSON.stringify(commandResult2));
    // Assert second message promise is resolved.
    const actualResult2 = await commandPromise2;

    // Notify 'cdpClient' the command1 is finished.
    onMessage(JSON.stringify(commandResult1));
    // Assert first message promise is resolved.
    const actualResult1 = await commandPromise1;

    assert.deepEqual(actualResult1, expectedResult1);
    assert.deepEqual(actualResult2, expectedResult2);
  });
});
