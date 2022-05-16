/**
 * Copyright 2022 Google LLC.
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
      if (parts.length != 3 || parts[0].length == 0 || parts[2].length == 0)
        throw new InvalidArgumentErrorResponse(
          `Wrong 'event' format ${JSON.stringify(event)}.`
        );

      return event as string;
    }
  }
}
