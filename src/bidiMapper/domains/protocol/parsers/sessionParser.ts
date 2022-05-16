import { Session as SessionType } from '../bidiProtocolTypes';
import { InvalidArgumentErrorResponse } from '../error';
import { BrowsingContextParser } from './browsingContextParser';

export namespace SessionParser {
  export class SubscribeParamsParser {
    static parse(params: any): SessionType.SubscribeParameters {
      return {
        contexts: BrowsingContextParser.BrowsingContextParser.parseOptionalList(
          params.contexts
        ),
        events: this.parseEventsList(params.events),
      };
    }

    public static parseEventsList(events: any): string[] {
      if (events === undefined)
        throw new InvalidArgumentErrorResponse("Missing parameter 'events'.");
      if (!Array.isArray(events))
        throw new InvalidArgumentErrorResponse(
          `Wrong 'events' format. Not an array. ${JSON.stringify(events)}.`
        );
      return events.map((e) => this.parseEvent(e));
    }

    public static parseEvent(event: any): string {
      if (!event || !(event instanceof String))
        throw new InvalidArgumentErrorResponse(
          `Wrong 'event' format ${JSON.stringify(event)}.`
        );

      const parts = event.split('.');
      if (parts.length != 3 || parts[0].length > 0 || parts[2].length > 0)
        throw new InvalidArgumentErrorResponse(
          `Wrong 'event' format ${JSON.stringify(event)}.`
        );

      return event as string;
    }
  }
}
