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
        events: this.parseEventsList(params.events),
        // Don't add `contexts` if it's not defined.
        ...(params.contexts !== undefined && {
          contexts:
            BrowsingContextParser.BrowsingContextParser.parseOptionalList(
              params.contexts
            ),
        }),
      };
    }

    public static parseEventsList(events: any): string[] {
      if (events === undefined)
        throw new InvalidArgumentErrorResponse('EventsList should be defined.');
      if (!Array.isArray(events))
        throw new InvalidArgumentErrorResponse(
          `EventsList should be an array. ${JSON.stringify(events)}.`
        );
      return events.map((e) => this.parseEvent(e));
    }

    public static parseEvent(event: any): string {
      if (event === undefined)
        throw new InvalidArgumentErrorResponse(
          `Event should not be undefined.`
        );

      if (typeof event !== 'string' && !(event instanceof String))
        throw new InvalidArgumentErrorResponse(
          `Event should be a string. ${JSON.stringify(event)}.`
        );

      const parts = event.split('.');
      // It can be either 2, or 3 parts in case of having `PROTO.` prefix.
      if (parts.length < 2)
        throw new InvalidArgumentErrorResponse(
          `Event should contain ".": ${JSON.stringify(event)}.`
        );

      return event as string;
    }
  }
}
