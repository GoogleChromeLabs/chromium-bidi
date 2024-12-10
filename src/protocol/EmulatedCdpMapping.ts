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

/**
 * Emulated CDP events. These events are not native to the CDP but are synthesized by the
 * BiDi mapper for convenience and compatibility. They are intended to simplify handling
 * certain scenarios.
 */
export interface EmulatedCdpMapping {
  /**
   * Emulated CDP event emitted right before the `Network.requestWillBeSent` event
   * indicating that a new navigation is about to start.
   *
   * http://go/webdriver:detect-navigation-started#bookmark=id.64balpqrmadv
   */
  'Page.frameStartedNavigating': [
    {
      loaderId: string;
      url: string;
      // Frame id can be omitted for the top-level frame.
      frameId?: string;
    },
  ];
}
