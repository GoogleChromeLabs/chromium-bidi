import { log } from '../utils/log';
const logCdp = log('cdp');

import { IServer } from '../utils/iServer';
import { CdpMessage } from './message';

export class MessageRouter {
  private _clients: Map<string | null, Set<(message: CdpMessage) => void>> =
    new Map();

  constructor(private _transport: IServer) {
    this._transport.setOnMessage(this._onMessage);
  }

  public addClient(
    sessionId: string | null,
    handler: (message: CdpMessage) => void
  ) {
    if (!this._clients.has(sessionId)) {
      this._clients.set(sessionId, new Set());
    }

    const sessionClients = this._clients.get(sessionId);
    sessionClients.add(handler);
  }

  public removeClient(
    sessionId: string | null,
    handler: (message: CdpMessage) => void
  ) {
    const sessionClients = this._clients.get(sessionId);
    if (sessionClients) {
      sessionClients.delete(handler);
    }
  }

  public sendMessage(message: string) {
    this._transport.sendMessage(message);
    logCdp('sent > ' + message);
  }

  public close() {
    this._transport.setOnMessage(null);
    this._clients.clear();
  }

  private _onMessage = async (message: string) => {
    logCdp('received < ' + message);

    const parsed: CdpMessage = JSON.parse(message);
    const sessionId = parsed.sessionId || null;
    const sessionClients = this._clients.get(sessionId);
    if (sessionClients) {
      for (const client of sessionClients) {
        client.call(null, parsed);
      }
    }
  };
}
