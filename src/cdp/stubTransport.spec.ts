/**
 * Copyright 2021 Google LLC.
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

import {assert, spy, SinonSpy} from 'sinon';
import {ITransport} from '../utils/transport.js';

type TypedSpy<T extends (...args: any[]) => any> = SinonSpy<
  Parameters<T>,
  ReturnType<T>
>;

function typedSpy<T extends SinonSpy>() {
  return spy() as T;
}

export class StubTransport implements ITransport {
  setOnMessage: TypedSpy<ITransport['setOnMessage']>;
  sendMessage: TypedSpy<ITransport['sendMessage']>;
  close: TypedSpy<ITransport['close']>;

  private _getOnMessage(): (string: string) => void {
    assert.called(this.setOnMessage);
    return this.setOnMessage.getCall(0).args[0];
  }

  public async emulateIncomingMessage(messageObject: unknown) {
    this._getOnMessage()(JSON.stringify(messageObject));
    // `setTimeout` allows the message to be processed.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  constructor() {
    this.sendMessage = typedSpy();
    this.setOnMessage = typedSpy();
    this.close = typedSpy();
  }
}
