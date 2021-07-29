import { StubServer } from '../tests/stubServer.spec';

import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
chai.use(chaiAsPromised);

import * as sinon from 'sinon';

import { MessageRouter } from './router';

const SOME_SESSION_ID = 'ABCD';
const ANOTHER_SESSION_ID = 'EFGH';

describe('MessageRouter', function () {
  it('can send a message without a sessionId', async function () {
    const mockCdpServer = new StubServer();
    const router = new MessageRouter(mockCdpServer);

    const browserMessage = JSON.stringify({
      id: 0,
      method: 'Browser.getVersion',
    });
    router.sendMessage(browserMessage);

    sinon.assert.calledOnceWithExactly(
      mockCdpServer.sendMessage,
      browserMessage
    );
    mockCdpServer.sendMessage.resetHistory();

    const sessionMessage = JSON.stringify({
      sessionId: SOME_SESSION_ID,
      id: 1,
      method: 'Page.enable',
    });
    router.sendMessage(sessionMessage);

    sinon.assert.calledOnceWithExactly(
      mockCdpServer.sendMessage,
      sessionMessage
    );
  });

  it('routes event messages to the correct handler based on sessionId', async function () {
    const mockCdpServer = new StubServer();
    const router = new MessageRouter(mockCdpServer);

    const browserMessage = { method: 'Target.attachedToTarget' };
    const sessionMessage = {
      sessionId: SOME_SESSION_ID,
      method: 'Page.frameNavigated',
    };
    const othersessionMessage = {
      sessionId: ANOTHER_SESSION_ID,
      method: 'Page.loadEventFired',
    };
    const onMessage = mockCdpServer.getOnMessage();

    const browserCallback = sinon.fake();
    const sessionCallback = sinon.fake();
    const otherSessionCallback = sinon.fake();

    // Register for browser message callbacks.
    router.addClient(null, browserCallback);

    // Verify that the browser callback receives the message.
    onMessage(JSON.stringify(browserMessage));
    sinon.assert.calledOnceWithExactly(browserCallback, browserMessage);
    browserCallback.resetHistory();

    // Register for messages for session A.
    router.addClient(SOME_SESSION_ID, sessionCallback);

    // Send another message for the browser and verify that only the browser callback receives it.
    // Verifies that adding another client doesn't affect routing for existing clients.
    onMessage(JSON.stringify(browserMessage));
    sinon.assert.notCalled(sessionCallback);
    sinon.assert.calledOnceWithExactly(browserCallback, browserMessage);
    browserCallback.resetHistory();

    // Send a message for session A and verify that it is received.
    onMessage(JSON.stringify(sessionMessage));
    sinon.assert.notCalled(browserCallback);
    sinon.assert.calledOnceWithExactly(sessionCallback, sessionMessage);
    sessionCallback.resetHistory();

    // Register for messages for session B.
    router.addClient(ANOTHER_SESSION_ID, otherSessionCallback);

    // Send a message for session B and verify that only the session B callback receives it.
    // Verifies that a message is sent only to the session client it is intended for.
    onMessage(JSON.stringify(othersessionMessage));
    sinon.assert.notCalled(browserCallback);
    sinon.assert.notCalled(sessionCallback);
    sinon.assert.calledOnceWithExactly(
      otherSessionCallback,
      othersessionMessage
    );
    otherSessionCallback.resetHistory();

    // Unregister clients and verify that messages are no longer received.
    router.removeClient(ANOTHER_SESSION_ID, otherSessionCallback);
    router.removeClient(SOME_SESSION_ID, sessionCallback);
    router.removeClient(null, browserCallback);

    onMessage(JSON.stringify(othersessionMessage));
    onMessage(JSON.stringify(sessionMessage));
    onMessage(JSON.stringify(browserMessage));

    sinon.assert.notCalled(browserCallback);
    sinon.assert.notCalled(sessionCallback);
    sinon.assert.notCalled(otherSessionCallback);
  });

  it('closes the transport connection when closed', async function () {
    const mockCdpServer = new StubServer();
    const router = new MessageRouter(mockCdpServer);
    router.close();
    sinon.assert.calledOnce(mockCdpServer.close);
  });
});
