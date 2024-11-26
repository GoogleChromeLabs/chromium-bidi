/*
 *  Copyright 2024 Google LLC.
 *  Copyright (c) Microsoft Corporation.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 *
 */

import {UnknownErrorException} from '../../../protocol/protocol.js';
import {Deferred} from '../../../utils/Deferred.js';
import {urlMatchesAboutBlank} from '../../../utils/UrlHelpers.js';
import {uuidv4} from '../../../utils/uuid.js';

export class Navigation {
  readonly expectFrameRequestedNavigation: boolean;
  readonly navigationId = uuidv4();
  url: string;
  deferred = new Deferred<void>();
  readonly initialNavigation: boolean;

  constructor(
    url: string,
    expectFrameRequestedNavigation: boolean,
    previousNavigation: Navigation | null,
  ) {
    this.initialNavigation =
      (previousNavigation?.initialNavigation ?? true) &&
      urlMatchesAboutBlank(url);
    this.url = url;
    this.expectFrameRequestedNavigation = expectFrameRequestedNavigation;
  }

  cancel(reason: string): void {
    if (this.deferred.isFinished) {
      // Nothing to do.
      return;
    }
    this.deferred.reject(new UnknownErrorException(reason));
  }

  finish(): void {
    this.deferred.resolve();
  }
}
