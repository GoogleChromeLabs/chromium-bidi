/*
 * Copyright 2025 Google LLC.
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

import {expect} from 'chai';

import {ContextConfig} from './ContextConfig.js';
import {ContextConfigStorage} from './ContextConfigStorage.js';

describe('ContextConfigStorage', () => {
  let storage: ContextConfigStorage;
  const USER_CONTEXT_1 = 'some user context';
  const BROWSER_CONTEXT_1 = 'some browsing context';

  beforeEach(() => {
    storage = new ContextConfigStorage();
  });

  describe('getActiveConfig', () => {
    it('should return the global config if no other configs are set', () => {
      storage.updateGlobalConfig({
        acceptInsecureCerts: true,
        prerenderingDisabled: true,
      });
      const expected = new ContextConfig();
      expected.acceptInsecureCerts = true;
      expected.prerenderingDisabled = true;
      expect(storage.getActiveConfig()).to.deep.equal(expected);
    });

    it('should override global config with user context config', () => {
      storage.updateGlobalConfig({
        acceptInsecureCerts: true,
        prerenderingDisabled: true,
      });
      storage.updateUserContextConfig(USER_CONTEXT_1, {
        acceptInsecureCerts: false,
      });
      const expected = new ContextConfig();
      expected.acceptInsecureCerts = false;
      expected.prerenderingDisabled = true;
      expect(storage.getActiveConfig(undefined, USER_CONTEXT_1)).to.deep.equal(
        expected,
      );
    });

    it('should override global and user context configs with browsing context config', () => {
      storage.updateGlobalConfig({
        acceptInsecureCerts: false,
        prerenderingDisabled: true,
      });
      storage.updateUserContextConfig(USER_CONTEXT_1, {
        acceptInsecureCerts: false,
        prerenderingDisabled: false,
      });
      storage.updateBrowsingContextConfig(BROWSER_CONTEXT_1, {
        acceptInsecureCerts: true,
      });
      const expected = new ContextConfig();
      expected.acceptInsecureCerts = true;
      expected.prerenderingDisabled = false;
      expect(
        storage.getActiveConfig(BROWSER_CONTEXT_1, USER_CONTEXT_1),
      ).to.deep.equal(expected);
    });

    it('should not override with undefined from user context config', () => {
      storage.updateGlobalConfig({
        acceptInsecureCerts: true,
        prerenderingDisabled: true,
      });
      storage.updateUserContextConfig(USER_CONTEXT_1, {
        acceptInsecureCerts: undefined,
        prerenderingDisabled: false,
      });
      const expected = new ContextConfig();
      expected.acceptInsecureCerts = true;
      expected.prerenderingDisabled = false;
      expect(storage.getActiveConfig(undefined, USER_CONTEXT_1)).to.deep.equal(
        expected,
      );
    });

    it('should not override with undefined from browsing context config', () => {
      storage.updateGlobalConfig({
        acceptInsecureCerts: true,
        prerenderingDisabled: true,
      });
      storage.updateUserContextConfig(USER_CONTEXT_1, {
        acceptInsecureCerts: false,
        prerenderingDisabled: false,
      });
      storage.updateBrowsingContextConfig(BROWSER_CONTEXT_1, {
        acceptInsecureCerts: undefined,
        prerenderingDisabled: true,
      });
      const expected = new ContextConfig();
      expected.acceptInsecureCerts = false;
      expected.prerenderingDisabled = true;
      expect(
        storage.getActiveConfig(BROWSER_CONTEXT_1, USER_CONTEXT_1),
      ).to.deep.equal(expected);
    });

    it('should not override with undefined from either user or browsing context config', () => {
      storage.updateGlobalConfig({
        acceptInsecureCerts: true,
        prerenderingDisabled: true,
      });
      storage.updateUserContextConfig(USER_CONTEXT_1, {
        acceptInsecureCerts: undefined,
        prerenderingDisabled: false,
      });
      storage.updateBrowsingContextConfig(BROWSER_CONTEXT_1, {
        acceptInsecureCerts: undefined,
        prerenderingDisabled: undefined,
      });
      const expected = new ContextConfig();
      expected.acceptInsecureCerts = true;
      expected.prerenderingDisabled = false;
      expect(
        storage.getActiveConfig(BROWSER_CONTEXT_1, USER_CONTEXT_1),
      ).to.deep.equal(expected);
    });
  });
});
