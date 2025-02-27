/**
 * Copyright 2023 Google LLC.
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

import type * as Cdp from './cdp.js';
import type * as WebDriverBidiBluetooth from './generated/webdriver-bidi-bluetooth.js';
import type * as WebDriverBidiPermissions from './generated/webdriver-bidi-permissions.js';
import type * as WebDriverBidi from './generated/webdriver-bidi.js';

export type EventNames =
  // keep-sorted start
  | Cdp.EventNames
  | `${BiDiModule}`
  | `${Bluetooth.EventNames}`
  | `${BrowsingContext.EventNames}`
  | `${Log.EventNames}`
  | `${Network.EventNames}`
  | `${Script.EventNames}`;
// keep-sorted end

export enum BiDiModule {
  // keep-sorted start
  Bluetooth = 'bluetooth',
  Browser = 'browser',
  BrowsingContext = 'browsingContext',
  Cdp = 'goog:cdp',
  DeprecatedCdp = 'cdp',
  Input = 'input',
  Log = 'log',
  Network = 'network',
  Script = 'script',
  Session = 'session',
  // keep-sorted end
}

export namespace Script {
  export enum EventNames {
    // keep-sorted start
    Message = 'script.message',
    RealmCreated = 'script.realmCreated',
    RealmDestroyed = 'script.realmDestroyed',
    // keep-sorted end
  }
}

export namespace Log {
  export enum EventNames {
    LogEntryAdded = 'log.entryAdded',
  }
}

export namespace BrowsingContext {
  export enum EventNames {
    // keep-sorted start
    ContextCreated = 'browsingContext.contextCreated',
    ContextDestroyed = 'browsingContext.contextDestroyed',
    DomContentLoaded = 'browsingContext.domContentLoaded',
    DownloadWillBegin = 'browsingContext.downloadWillBegin',
    FragmentNavigated = 'browsingContext.fragmentNavigated',
    HistoryUpdated = 'browsingContext.historyUpdated',
    Load = 'browsingContext.load',
    NavigationAborted = 'browsingContext.navigationAborted',
    NavigationCommitted = 'browsingContext.navigationCommitted',
    NavigationFailed = 'browsingContext.navigationFailed',
    NavigationStarted = 'browsingContext.navigationStarted',
    UserPromptClosed = 'browsingContext.userPromptClosed',
    UserPromptOpened = 'browsingContext.userPromptOpened',
    // keep-sorted end
  }
}

export namespace Network {
  export enum EventNames {
    // keep-sorted start
    AuthRequired = 'network.authRequired',
    BeforeRequestSent = 'network.beforeRequestSent',
    FetchError = 'network.fetchError',
    ResponseCompleted = 'network.responseCompleted',
    ResponseStarted = 'network.responseStarted',
    // keep-sorted end
  }
}

export namespace Bluetooth {
  export enum EventNames {
    RequestDevicePromptUpdated = 'bluetooth.requestDevicePromptUpdated',
  }
}

type ExternalSpecCommand<T> = {
  // id is defined by the main WebDriver BiDi spec and extension specs do
  // not re-define it. Therefore, it's not part of generated types.
  id: WebDriverBidi.JsUint;
} & T;

export type Command = (
  | WebDriverBidi.Command
  | Cdp.Command
  | ExternalSpecCommand<WebDriverBidiPermissions.PermissionsCommand>
  | ExternalSpecCommand<WebDriverBidiBluetooth.Bluetooth.HandleRequestDevicePrompt>
  | ExternalSpecCommand<WebDriverBidiBluetooth.Bluetooth.SimulateAdapter>
  | ExternalSpecCommand<WebDriverBidiBluetooth.Bluetooth.SimulatePreconnectedPeripheral>
  | ExternalSpecCommand<WebDriverBidiBluetooth.Bluetooth.SimulateAdvertisement>
) & {channel: BidiPlusChannel};

export type CommandResponse =
  | WebDriverBidi.CommandResponse
  | Cdp.CommandResponse;

export type BluetoothEvent = {
  type: 'event';
} & (WebDriverBidiBluetooth.Bluetooth.RequestDevicePromptUpdated &
  WebDriverBidi.Extensible);
export type Event = WebDriverBidi.Event | Cdp.Event | BluetoothEvent;

export const EVENT_NAMES = new Set([
  // keep-sorted start
  ...Object.values(BiDiModule),
  ...Object.values(Bluetooth.EventNames),
  ...Object.values(BrowsingContext.EventNames),
  ...Object.values(Log.EventNames),
  ...Object.values(Network.EventNames),
  ...Object.values(Script.EventNames),
  // keep-sorted end
]);

export type ResultData = WebDriverBidi.ResultData | Cdp.ResultData;

// TODO: replace with optional string once legacy `channel` is removed.
export type BidiPlusChannel =
  | {
      'goog:channel': string;
      channel?: never;
    }
  | {
      'goog:channel'?: never;
      channel: string;
    }
  | {
      'goog:channel'?: never;
      channel?: never;
    };

export type Message = (WebDriverBidi.Message | Cdp.Message | BluetoothEvent) & {
  channel?: string;
  'goog:channel'?: string;
};
