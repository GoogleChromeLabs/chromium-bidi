import { CdpServer } from './cdpServer';
import { ServerBinding } from './iServer';
import { mock, instance, verify } from 'ts-mockito';

describe('CdpServer tests.', async () => {
  it('given CdpServer, when `sendMessage` is called, then cdpBindings should be called with proper values', async () => {
    const someMessage = {
      someAttribute: 'someValue',
    };
    const expectedMessageStr = JSON.stringify({
      ...someMessage,
      id: 0,
    });

    const mockBinding = mock(ServerBinding);
    const cdpServer = new CdpServer(instance(mockBinding));

    cdpServer.sendMessage(someMessage);

    verify(mockBinding.sendMessage(expectedMessageStr)).called();
  });
});
