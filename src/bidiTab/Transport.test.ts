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

import type {ClassicRequest} from '../bidiMapper/BidiMapper.js';

import {WindowClassicTransport} from './Transport.js';

describe('WindowClassicTransport', () => {
  let transport: WindowClassicTransport;
  let sentResponses: string[];

  beforeEach(() => {
    sentResponses = [];
    (globalThis as any).window = {
      sendClassicResponse: (res: string) => sentResponses.push(res),
    };
    transport = new WindowClassicTransport();
  });

  afterEach(() => {
    transport.close();
    delete (globalThis as any).window;
  });

  it('receives messages from window.onClassicMessage and dispatches them', () => {
    let received: ClassicRequest | null = null;
    transport.setOnMessage((req) => {
      received = req;
    });

    (globalThis as any).window.onClassicMessage(
      JSON.stringify({
        id: '1',
        method: 'POST',
        path: '/execute/sync',
        body: {},
      }),
    );

    const req = received as unknown as ClassicRequest | null;
    assert.isNotNull(req);
    assert.equal(req?.id, '1');
    assert.equal(req?.method, 'POST');
    assert.equal(req?.path, '/execute/sync');
  });

  it('sends responses to window.sendClassicResponse', () => {
    transport.sendMessage({
      id: '1',
      status: 200,
      body: {value: 'result'},
    });
    assert.equal(sentResponses.length, 1);
    const parsed = JSON.parse(sentResponses[0]!);
    assert.equal(parsed.id, '1');
    assert.equal(parsed.status, 200);
    assert.equal(parsed.body.value, 'result');
  });
});
