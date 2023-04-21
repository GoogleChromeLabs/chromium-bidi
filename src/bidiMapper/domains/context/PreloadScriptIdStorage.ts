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
import crypto from 'crypto';

import {CommonDataTypes, Script} from '../../../protocol/protocol';

export type PreloadScriptIdEntry = {
  /** Browsing context ID. */
  contextId: CommonDataTypes.BrowsingContext | null;
  /** BiDi preload script ID, automatically generated. */
  bidiPreloadScriptId: Script.PreloadScript;
  /** CDP preload script ID. */
  cdpPreloadScriptId: Script.PreloadScript;
  /** The script itself, in a format expected by the spec i.e. a function. */
  scriptSource?: string;
};

export type PreloadScriptIdEntryFilter = Partial<PreloadScriptIdEntry>;

/**
 * Container class for preload scripts.
 *
 * BiDi preload script IDs are generated by the server and are unique within the
 * context.
 *
 * CDP preload script IDs are generated by the client and are unique
 * within the context.
 *
 * The mapping between BiDi and CDP preload script IDs is 1:many.
 * BiDi IDs are needed by the mapper to keep track of potential multiple CDP IDs
 * in the client.
 *
 * This class does not concern itself with the validity of the IDs.
 */
export class PreloadScriptIdStorage {
  /** Tracks all preload script ID entries.  */
  readonly #entries = new Set<PreloadScriptIdEntry>();

  /** Finds all entries that match the given filter. */
  findEntries(filter?: PreloadScriptIdEntryFilter): PreloadScriptIdEntry[] {
    return Array.from(this.#entries).filter((entry) => {
      if (
        filter?.contextId !== undefined &&
        filter?.contextId !== entry.contextId
      ) {
        return false;
      }
      if (
        filter?.bidiPreloadScriptId !== undefined &&
        filter?.bidiPreloadScriptId !== entry.bidiPreloadScriptId
      ) {
        return false;
      }
      if (
        filter?.cdpPreloadScriptId !== undefined &&
        filter?.cdpPreloadScriptId !== entry.cdpPreloadScriptId
      ) {
        return false;
      }
      if (
        filter?.scriptSource !== undefined &&
        filter?.scriptSource !== entry.scriptSource
      ) {
        return false;
      }
      return true;
    });
  }

  /** Deletes all entries that match the given filter. */
  #deleteEntries(filter: PreloadScriptIdEntryFilter) {
    for (const entry of this.findEntries(filter)) {
      this.#entries.delete(entry);
    }
  }

  /**
   * Keeps track of the given CDP preload script ID associated with the given
   * browsing context ID.
   *
   * @param contextId Browsing context ID, or null for global context.
   * @param cdpPreloadScriptId CDP preload script ID.
   * @param scriptSource The script itself, in a format expected by the spec
   *   i.e. a function.
   * @return A generated BiDi preload script ID.
   */
  addPreloadScript(
    contextId: CommonDataTypes.BrowsingContext | null,
    cdpPreloadScriptId: Script.PreloadScript,
    scriptSource?: string
  ): Script.PreloadScript {
    return this.addPreloadScripts(
      contextId,
      [cdpPreloadScriptId],
      scriptSource
    );
  }

  /**
   * Keeps track of the given CDP preload script IDs associated with the given
   * browsing context ID.
   *
   * @param contextId Browsing context ID, or null for global context.
   * @param cdpPreloadScriptIds CDP preload script IDs.
   * @param scriptSource The script itself, in a format expected by the spec
   *   i.e. a function.
   * @return A generated BiDi preload script ID.
   */
  addPreloadScripts(
    contextId: CommonDataTypes.BrowsingContext | null,
    cdpPreloadScriptIds: Script.PreloadScript[],
    scriptSource?: string
  ): Script.PreloadScript {
    // Generate a random BiDi preload script ID.
    const bidiPreloadScriptId = crypto.randomUUID();

    for (const cdpPreloadScriptId of cdpPreloadScriptIds) {
      this.#entries.add({
        contextId,
        bidiPreloadScriptId,
        cdpPreloadScriptId,
        scriptSource,
      });
    }

    return bidiPreloadScriptId;
  }

  /** Removes all entries that match the given filter. */
  removePreloadScript(filter: PreloadScriptIdEntryFilter) {
    this.#deleteEntries(filter);
  }
}
