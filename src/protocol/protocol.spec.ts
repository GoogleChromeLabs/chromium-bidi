/**
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

import {expect} from 'chai';

import {Message} from '../protocol/protocol.js';

describe('error codes', () => {
  [
    {
      name: 'invalid argument',
      exception: Message.InvalidArgumentException,
    },
    {
      name: 'invalid session id',
      exception: Message.InvalidSessionIdException,
    },
    {
      name: 'no such alert',
      exception: Message.NoSuchAlertException,
    },
    {
      name: 'no such frame',
      exception: Message.NoSuchFrameException,
    },
    {
      name: 'no such node',
      exception: Message.NoSuchNodeException,
    },
    {
      name: 'no such script',
      exception: Message.NoSuchScriptException,
    },
    {
      name: 'session not created',
      exception: Message.SessionNotCreatedException,
    },
    {
      name: 'unknown command',
      exception: Message.UnknownCommandException,
    },
    {
      name: 'unknown error',
      exception: Message.UnknownErrorException,
    },
    {
      name: 'unsupported operation',
      exception: Message.UnsupportedOperationException,
    },
  ].forEach((tc) => {
    it(`${tc.name} throws correct exception`, () => {
      const exception = new tc.exception('MY_ERROR');
      expect(exception.toErrorResponse(1)).to.deep.equal({
        error: tc.name,
        id: 1,
        message: 'MY_ERROR',
        stacktrace: undefined,
      });
    });
  });
});
