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
import { assert, createStubInstance, SinonStubbedInstance } from 'sinon';

export class Stub {
  // Returns mock object of a given type.
  static stub<T>(constructor: new (...args) => T): StubbedClass<T> {
    return createStubInstance(constructor) as any as StubbedClass<T>;
  }

  // Returns a handler was assigned to mock by calling `setOnMessage`.
  static getOnMessage<
    T extends {
      setOnMessage(messageHandler: (string) => void): void;
    }
  >(mock: StubbedClass<T>): (string) => void {
    Stub.assert.calledOnce(mock.setOnMessage);
    const onMessage = mock.setOnMessage.getCall(0).args[0] as any as (
      string
    ) => void;
    return onMessage;
  }

  // Export `assert` to simplify imports.
  static assert = assert;
}
type StubbedClass<T> = SinonStubbedInstance<T> & T;
