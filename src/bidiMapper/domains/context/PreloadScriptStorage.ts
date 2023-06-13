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
 */
import {uuidv4} from '../../../utils/uuid.js';
import {type CommonDataTypes, type Script} from '../../../protocol/protocol.js';

import {type CdpTarget} from './cdpTarget.js';

export type BidiPreloadScript = {
  /** BiDi ID, an automatically generated UUID. */
  id: string;
  /** CDP preload scripts. */
  cdpPreloadScripts: CdpPreloadScript[];
  /** The script itself, in a format expected by the spec i.e. a function. */
  functionDeclaration: string;
  /** The script sandbox / world name. */
  sandbox?: string;
  /** Browsing context ID. */
  contextId: CommonDataTypes.BrowsingContext | null;
};

/** BidiPreloadScripts can be filtered by either context ID or BiDi ID. */
export type BidiPreloadScriptFilter = Partial<
  Pick<BidiPreloadScript, 'contextId'> & Pick<BidiPreloadScript, 'id'>
> & {contextIds?: (CommonDataTypes.BrowsingContext | null)[]};

export type CdpPreloadScript = {
  /** CDP target. Includes session ID and target ID. */
  target: CdpTarget;
  /** CDP preload script ID. */
  preloadScriptId: Script.PreloadScript;
};

/** CdpPreloadScripts can be filtered by CDP session ID or target ID. */
export type CdpPreloadScriptFilter = {
  /** CDP session ID. */
  sessionId?: string;
  /** CDP target ID. */
  targetId?: string;
};

/**
 * Container class for preload scripts.
 *
 * BiDi IDs are generated by the server and are unique within the context.
 *
 * CDP preload script IDs are generated by the client and are unique
 * within the session.
 *
 * The mapping between BiDi and CDP preload script IDs is 1:many.
 * BiDi IDs are needed by the mapper to keep track of potential multiple CDP IDs
 * in the client.
 *
 * This class does not concern itself with the validity of the IDs.
 */
export class PreloadScriptStorage {
  /** Tracks all BiDi preload scripts.  */
  readonly #scripts = new Set<BidiPreloadScript>();

  /** Finds all entries that match the given filter. */
  findPreloadScripts(filter?: BidiPreloadScriptFilter): BidiPreloadScript[] {
    if (!filter) {
      return [...this.#scripts];
    }

    return [...this.#scripts].filter((script) => {
      if (filter.id !== undefined && filter.id !== script.id) {
        return false;
      }
      if (
        filter.contextId !== undefined &&
        filter.contextId !== script.contextId
      ) {
        return false;
      }
      if (
        filter.contextIds !== undefined &&
        !filter.contextIds.includes(script.contextId)
      ) {
        return false;
      }
      return true;
    });
  }

  /**
   * Keeps track of the given CDP preload scripts associated with the given
   * browsing context ID.
   *
   * @param contextId Browsing context ID, or null for global context.
   * @param cdpPreloadScripts CDP preload scripts.
   * @param functionDeclaration The script itself, in a format expected by the spec
   *   i.e. a function.
   */
  addPreloadScripts(
    contextId: CommonDataTypes.BrowsingContext | null,
    cdpPreloadScripts: CdpPreloadScript[],
    functionDeclaration: string,
    sandbox?: string
  ): BidiPreloadScript {
    // Generate a random ID.
    const bidiId: string = uuidv4();

    const preloadScript = {
      id: bidiId,
      contextId,
      cdpPreloadScripts,
      functionDeclaration,
      sandbox,
    };

    this.#scripts.add(preloadScript);

    return preloadScript;
  }

  /**
   * Keeps track of the given CDP preload script in the given BiDi preload
   * script.
   */
  appendCdpPreloadScript(
    script: BidiPreloadScript,
    cdpPreloadScript: CdpPreloadScript
  ) {
    script.cdpPreloadScripts.push(cdpPreloadScript);
  }

  /** Deletes all BiDi preload script entries that match the given filter. */
  removeBiDiPreloadScripts(filter?: BidiPreloadScriptFilter) {
    for (const preloadScript of this.findPreloadScripts(filter)) {
      this.#scripts.delete(preloadScript);
    }
  }

  /** Deletes all CDP preload script entries that match the given filter. */
  removeCdpPreloadScripts(filter?: CdpPreloadScriptFilter) {
    for (const preloadScript of this.#scripts) {
      preloadScript.cdpPreloadScripts = preloadScript.cdpPreloadScripts.filter(
        (cdpPreloadScript) => {
          if (
            filter?.targetId !== undefined &&
            filter.targetId !== cdpPreloadScript.target.targetId
          ) {
            return true;
          }
          if (
            filter?.sessionId !== undefined &&
            filter.sessionId !== cdpPreloadScript.target.cdpSessionId
          ) {
            return true;
          }
          return false;
        }
      );
    }
  }
}
