/*
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
 *
 */

import {CdpClient} from '../../CdpConnection';
import {LogManager} from '../log/logManager';
import {RealmStorage} from '../script/realmStorage';
import {IEventManager} from '../events/EventManager';

export class CdpTarget {
  #targetId: string;
  #cdpClient: CdpClient;
  #eventManager: IEventManager;
  #cdpSessionId: string;
  #realmStorage: RealmStorage;

  constructor(
    targetId: string,
    cdpClient: CdpClient,
    cdpSessionId: string,
    realmStorage: RealmStorage,
    eventManager: IEventManager
  ) {
    this.#targetId = targetId;
    this.#cdpClient = cdpClient;
    this.#cdpSessionId = cdpSessionId;
    this.#eventManager = eventManager;
    this.#realmStorage = realmStorage;
  }

  get targetId(): string {
    return this.#targetId;
  }

  get cdpClient(): CdpClient {
    return this.#cdpClient;
  }

  get cdpSessionId(): string {
    return this.#cdpSessionId;
  }

  async unblock() {
    LogManager.create(
      this.#realmStorage,
      this.#cdpClient,
      this.#cdpSessionId,
      this.#eventManager
    );
    await this.#cdpClient.sendCommand('Runtime.enable');
    await this.#cdpClient.sendCommand('Page.enable');
    await this.#cdpClient.sendCommand('Page.setLifecycleEventsEnabled', {
      enabled: true,
    });
    await this.#cdpClient.sendCommand('Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: true,
      flatten: true,
    });

    await this.#cdpClient.sendCommand('Runtime.runIfWaitingForDebugger');
  }
}
