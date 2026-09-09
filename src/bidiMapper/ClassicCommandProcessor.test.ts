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

import {ClassicCommandProcessor} from './ClassicCommandProcessor.js';
import type {
  ClassicRequest,
  ClassicResponse,
  ClassicTransport,
} from './ClassicTransport.js';
import {ContextConfigStorage} from './modules/browser/ContextConfigStorage.js';
import {UserContextStorage} from './modules/browser/UserContextStorage.js';
import {BrowsingContextStorage} from './modules/context/BrowsingContextStorage.js';
import {PreloadScriptStorage} from './modules/script/PreloadScriptStorage.js';
import {RealmStorage} from './modules/script/RealmStorage.js';
import {EventManager} from './modules/session/EventManager.js';

class MockClassicTransport implements ClassicTransport {
  onMessage: ((request: ClassicRequest) => void) | null = null;
  lastSentResponse: ClassicResponse | null = null;
  closed = false;

  setOnMessage(onMessage: (request: ClassicRequest) => void): void {
    this.onMessage = onMessage;
  }

  sendMessage(response: ClassicResponse): void {
    this.lastSentResponse = response;
  }

  close(): void {
    this.closed = true;
  }
}

describe('ClassicCommandProcessor', () => {
  let processor: ClassicCommandProcessor;
  let transport: MockClassicTransport;
  let browsingContextStorage: BrowsingContextStorage;
  let realmStorage: RealmStorage;

  beforeEach(() => {
    browsingContextStorage = new BrowsingContextStorage();
    realmStorage = new RealmStorage();
    const preloadScriptStorage = new PreloadScriptStorage();
    const userContextStorage = new UserContextStorage({} as any);
    const contextConfigStorage = new ContextConfigStorage();
    const eventManager = new EventManager(
      browsingContextStorage,
      userContextStorage,
    );
    transport = new MockClassicTransport();
    processor = new ClassicCommandProcessor(
      eventManager,
      browsingContextStorage,
      realmStorage,
      preloadScriptStorage,
      userContextStorage,
      contextConfigStorage,
      {} as any,
      transport,
    );
  });

  it('should return 404 for unknown endpoint paths', async () => {
    const res = await processor.processCommand({
      id: 'test-1',
      method: 'GET',
      path: '/unknown/endpoint',
    });
    assert.equal(res.status, 404);
    assert.equal((res.body.value as any).error, 'unknown command');
  });

  it('should return 400 for execute/sync without a script string', async () => {
    const res = await processor.processCommand({
      id: 'test-2',
      method: 'POST',
      path: '/execute/sync',
      body: {args: []},
    });
    assert.equal(res.status, 400);
    assert.equal((res.body.value as any).error, 'invalid argument');
  });

  it('should return 404 no such window if there is no active context', async () => {
    const res = await processor.processCommand({
      id: 'test-3',
      method: 'POST',
      path: '/execute/sync',
      body: {script: 'return 1;', args: []},
    });
    assert.equal(res.status, 404);
    assert.equal((res.body.value as any).error, 'no such window');
  });

  it('should return 404 no such window for navigation endpoints when no active context', async () => {
    for (const path of ['/back', '/forward', '/refresh']) {
      const res = await processor.processCommand({
        id: `test-${path}`,
        method: 'POST',
        path,
      });
      assert.equal(res.status, 404);
      assert.equal((res.body.value as any).error, 'no such window');
    }
  });

  it('should return 404 no such window for document endpoints when no active context', async () => {
    for (const path of ['/title', '/source']) {
      const res = await processor.processCommand({
        id: `test-${path}`,
        method: 'GET',
        path,
      });
      assert.equal(res.status, 404);
      assert.equal((res.body.value as any).error, 'no such window');
    }
  });

  it('should return status ready on GET /status', async () => {
    const res = await processor.processCommand({
      id: 'test-status',
      method: 'GET',
      path: '/status',
    });
    assert.equal(res.status, 200);
    assert.isTrue((res.body.value as any).ready);
  });

  it('should return session result on POST /session and DELETE /session', async () => {
    const postRes = await processor.processCommand({
      id: 'test-session-post',
      method: 'POST',
      path: '/session',
    });
    assert.equal(postRes.status, 200);
    assert.equal((postRes.body.value as any).sessionId, 'default');

    const delRes = await processor.processCommand({
      id: 'test-session-del',
      method: 'DELETE',
      path: '/session',
    });
    assert.equal(delRes.status, 200);
    assert.isNull(delRes.body.value);
  });

  it('should return 404 no such window for window rect/state endpoints when no active context', async () => {
    for (const path of [
      '/window/rect',
      '/window/maximize',
      '/window/minimize',
      '/window/fullscreen',
    ]) {
      const method = path === '/window/rect' ? 'GET' : 'POST';
      const res = await processor.processCommand({
        id: `test-${path}`,
        method,
        path,
      });
      assert.equal(res.status, 404);
      assert.equal((res.body.value as any).error, 'no such window');
    }
  });

  it('should return 400 for POST /alert/text without a string text parameter', async () => {
    const res = await processor.processCommand({
      id: 'test-alert-text-invalid',
      method: 'POST',
      path: '/alert/text',
      body: {},
    });
    assert.equal(res.status, 400);
    assert.equal((res.body.value as any).error, 'invalid argument');
  });

  it('should return 404 no such window for cookie endpoints when no active context', async () => {
    for (const {method, path} of [
      {method: 'GET', path: '/cookie'},
      {method: 'POST', path: '/cookie'},
      {method: 'DELETE', path: '/cookie'},
      {method: 'GET', path: '/cookie/testCookie'},
      {method: 'DELETE', path: '/cookie/testCookie'},
    ]) {
      const res = await processor.processCommand({
        id: `test-cookie-${method}-${path}`,
        method,
        path,
        body: method === 'POST' ? {cookie: {name: 'test', value: 'val'}} : {},
      });
      assert.equal(res.status, 404);
      assert.equal((res.body.value as any).error, 'no such window');
    }
  });

  it('should return 404 no such window for element finding endpoints when no active context', async () => {
    for (const {method, path} of [
      {method: 'POST', path: '/element'},
      {method: 'POST', path: '/elements'},
      {method: 'GET', path: '/element/active'},
      {method: 'POST', path: '/element/e123/element'},
      {method: 'POST', path: '/element/e123/elements'},
      {method: 'GET', path: '/element/e123/shadow'},
      {method: 'POST', path: '/shadow/s123/element'},
      {method: 'POST', path: '/shadow/s123/elements'},
    ]) {
      const res = await processor.processCommand({
        id: `test-elem-${method}-${path}`,
        method,
        path,
        body: method === 'POST' ? {using: 'css selector', value: 'div'} : {},
      });
      assert.equal(res.status, 404);
      assert.equal((res.body.value as any).error, 'no such window');
    }
  });
});
