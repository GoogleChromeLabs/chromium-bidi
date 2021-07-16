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

describe('CdpClient tests.', async () => {
  it('given CdpClient, when `sendMessage` is called, then cdpBindings should be called with proper values', async () => {
    const someMessage = {
      someAttribute: 'someValue',
    };
    const expectedMessageStr = JSON.stringify({
      ...someMessage,
      id: 0,
    });

    const mockServerBinding = Stub.stub(ServerBinding);

    const cdpClient = new CdpClient(mockServerBinding);
    cdpClient.sendMessage(someMessage);

    Stub.assert.calledOnceWithExactly(
      mockServerBinding.sendMessage,
      expectedMessageStr
    );
  });
});
