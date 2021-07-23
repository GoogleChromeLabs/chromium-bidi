import { StubServer } from '../tests/stubServer.spec';

import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
chai.use(chaiAsPromised);

import * as sinon from 'sinon';

import { MessageRouter } from './router';

describe('MessageRouter', function () {
    describe('sendMessage()', function() {
        it('can send a message without a sessionId', async function () {
            const mockCdpServer = new StubServer();
            const router = new MessageRouter(mockCdpServer);

            const message = JSON.stringify({ id: 0, method: "Browser.getVersion" });
            router.sendMessage(message);

            sinon.assert.calledOnce(mockCdpServer.sendMessage);
            sinon.assert.calledWith(mockCdpServer.sendMessage, message);
        });

        it('can send a message with a sessionId', async function () {
            const mockCdpServer = new StubServer();
            const router = new MessageRouter(mockCdpServer);

            const message = JSON.stringify({ sessionId: "ABCD", id: 0, method: "Page.enable" });
            router.sendMessage(message);

            sinon.assert.calledOnce(mockCdpServer.sendMessage);
            sinon.assert.calledWith(mockCdpServer.sendMessage, message);
        });
    });

    describe('addClient()', function() {

    });

    describe('removeClient()', function() {

    });

    describe('close()', function() {

    });
});
