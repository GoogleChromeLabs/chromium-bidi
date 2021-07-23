import { StubServer } from '../tests/stubServer.spec';

import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
chai.use(chaiAsPromised);

import * as sinon from 'sinon';

import { MessageRouter } from './router';

describe('MessageRouter', function () {
  it('can send a message without a sessionId', async function () {
    const mockCdpServer = new StubServer();
    const router = new MessageRouter(mockCdpServer);

    const message = JSON.stringify({ id: 0, method: 'Browser.getVersion' });
    router.sendMessage(message);

    sinon.assert.calledOnce(mockCdpServer.sendMessage);
    sinon.assert.calledWith(mockCdpServer.sendMessage, message);
  });

  it('can send a message with a sessionId', async function () {
    const mockCdpServer = new StubServer();
    const router = new MessageRouter(mockCdpServer);

    const message = JSON.stringify({
      sessionId: 'ABCD',
      id: 0,
      method: 'Page.enable',
    });
    router.sendMessage(message);

    sinon.assert.calledOnce(mockCdpServer.sendMessage);
    sinon.assert.calledWith(mockCdpServer.sendMessage, message);
  });

  it('routes event messages to the correct handler based on sessionId', async function () {
    const mockCdpServer = new StubServer();
    const router = new MessageRouter(mockCdpServer);

    const browserMessage = { method: 'Target.attachedToTarget' };
    const sessionAMessage = { sessionId: 'A', method: 'Page.frameNavigated' };
    const sessionBMessage = { sessionId: 'B', method: 'Page.loadEventFired' };
    const onMessage = mockCdpServer.getOnMessage();

    const browserCallback = sinon.fake();
    const sessionACallback = sinon.fake();
    const sessionBCallback = sinon.fake();

    // Register for browser message callbacks.
    router.addClient(null, browserCallback);

    // Verify that the browser callback receives the message.
    onMessage(JSON.stringify(browserMessage));
    sinon.assert.calledOnceWithExactly(browserCallback, browserMessage);
    browserCallback.resetHistory();

    // Register for messages for session A.
    router.addClient('A', sessionACallback);

    // Send another message for the browser and verify that only the browser callback receives it.
    onMessage(JSON.stringify(browserMessage));
    sinon.assert.notCalled(sessionACallback);
    sinon.assert.calledOnceWithExactly(browserCallback, browserMessage);
    browserCallback.resetHistory();

    // Send a message for session A and verify that it is received.
    onMessage(JSON.stringify(sessionAMessage));
    sinon.assert.notCalled(browserCallback);
    sinon.assert.calledOnceWithExactly(sessionACallback, sessionAMessage);
    sessionACallback.resetHistory();

    // Register for messages for session B.
    router.addClient('B', sessionBCallback);

    // Send a message for session B and verify that only the session B callback receives it.
    onMessage(JSON.stringify(sessionBMessage));
    sinon.assert.notCalled(browserCallback);
    sinon.assert.notCalled(sessionACallback);
    sinon.assert.calledOnceWithExactly(sessionBCallback, sessionBMessage);
    sessionBCallback.resetHistory();

    // Unregister clients and verify that messages are no longer received.
    router.removeClient('B', sessionBCallback);
    router.removeClient('A', sessionACallback);
    router.removeClient(null, browserCallback);

    onMessage(JSON.stringify(sessionBMessage));
    onMessage(JSON.stringify(sessionAMessage));
    onMessage(JSON.stringify(browserMessage));

    sinon.assert.notCalled(browserCallback);
    sinon.assert.notCalled(sessionACallback);
    sinon.assert.notCalled(sessionBCallback);
  });

  it('closes the transport connection when closed', async function () {
    const mockCdpServer = new StubServer();
    const router = new MessageRouter(mockCdpServer);
    router.close();
    sinon.assert.calledOnce(mockCdpServer.close);
  });
});
