import { BrowsingContext, Message } from '../../bidiProtocolTypes';
import { IBidiServer } from '../../utils/bidiServer';

export interface IEventManager {
  sendEvent(
    event: Message.Event,
    contextId?: BrowsingContext.BrowsingContext
  ): Promise<void>;

  subscribe(
    events: string[],
    contextIds?: BrowsingContext.BrowsingContext[]
  ): Promise<void>;

  unsubscribe(
    event: string[],
    contextIds?: BrowsingContext.BrowsingContext[]
  ): Promise<void>;
}

export class EventManager implements IEventManager {
  // Prefill allowed list with binding events.
  private _globalSubscriptions: Set<string> = new Set<string>([
    'PROTO.script.called',
  ]);
  private _contextSubscriptions: Map<
    BrowsingContext.BrowsingContext,
    Set<string>
  > = new Map<BrowsingContext.BrowsingContext, Set<string>>();

  constructor(private _bidiServer: IBidiServer) {}

  async sendEvent(
    event: Message.Event,
    contextId?: BrowsingContext.BrowsingContext
  ): Promise<void> {
    if (this._shouldSendEvent(event.method, contextId)) {
      await this._bidiServer.sendMessage(event);
    }
  }

  private _shouldSendEvent(
    eventMethod: string,
    contextId?: BrowsingContext.BrowsingContext
  ): boolean {
    if (this._globalSubscriptions.has(eventMethod)) {
      return true;
    } else {
      return (
        contextId !== undefined &&
        this._contextSubscriptions.has(contextId) &&
        this._contextSubscriptions.get(contextId)!.has(eventMethod)
      );
    }
  }

  async subscribe(
    events: string[],
    contextIds?: BrowsingContext.BrowsingContext[]
  ): Promise<void> {
    // Global subscription
    for (let event of events) {
      if (contextIds === undefined) {
        this._globalSubscriptions.add(event);
      } else {
        for (let contextId of contextIds) {
          if (!this._contextSubscriptions.has(contextId))
            this._contextSubscriptions.set(contextId, new Set());
          this._contextSubscriptions.get(contextId)!.add(event);
        }
      }
    }
  }

  async unsubscribe(
    events: string[],
    contextIds?: BrowsingContext.BrowsingContext[]
  ): Promise<void> {
    throw new Error('EventManager.unsubscribe is not implemented');
  }
}
