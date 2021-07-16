import { CdpClient } from './cdpClient';
import { ServerBinding } from './iServer';
import { mock, instance, verify } from 'ts-mockito';

describe('CdpClient tests.', async () => {
  it('given CdpClient, when `sendMessage` is called, then cdpBindings should be called with proper values', async () => {
    const someMessage = {
      someAttribute: 'someValue',
    };
    const expectedMessageStr = JSON.stringify({
      ...someMessage,
      id: 0,
    });

    const mockBinding = mock(ServerBinding);
    const cdpClient = new CdpClient(instance(mockBinding));

    cdpClient.sendMessage(someMessage);

    verify(mockBinding.sendMessage(expectedMessageStr)).called();
  });
});
