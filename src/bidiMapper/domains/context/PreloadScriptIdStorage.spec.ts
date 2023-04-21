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

import {expect} from 'chai';
import sinon from 'sinon';

import {PreloadScriptIdStorage} from './PreloadScriptIdStorage';

const MOCKED_UUID_1 = 'a5cc4fe2-e17f-4091-a605-625ca189bd8e';
const MOCKED_UUID_2 = 'a5cc4fe2-e17f-4091-a605-625ca189bd8f';

describe('PreloadScriptIdStorage', () => {
  let preloadScriptIdStorage: PreloadScriptIdStorage;
  let stub: sinon.SinonStub;

  beforeEach(() => {
    preloadScriptIdStorage = new PreloadScriptIdStorage();
    stub = sinon
      .stub(crypto, 'randomUUID')
      .onFirstCall()
      .returns(MOCKED_UUID_1)
      .onSecondCall()
      .returns(MOCKED_UUID_2);
  });

  it('initial state', () => {
    expect(preloadScriptIdStorage.findEntries()).to.be.empty;
    expect(preloadScriptIdStorage.findEntries({})).to.be.empty;
    expect(
      preloadScriptIdStorage.findEntries({
        contextId: null,
      })
    ).to.be.empty;
  });

  describe('add preload script', () => {
    it('global context', () => {
      preloadScriptIdStorage.addPreloadScript(null, 'PRELOAD_SCRIPT_GLOBAL');

      expect(
        preloadScriptIdStorage.findEntries({contextId: null})
      ).to.deep.equal([
        {
          bidiPreloadScriptId: MOCKED_UUID_1,
          cdpPreloadScriptId: 'PRELOAD_SCRIPT_GLOBAL',
          contextId: null,
          scriptSource: undefined,
        },
      ]);

      expect(stub.calledOnceWithExactly()).to.be.true;
    });

    it('non-global context', () => {
      preloadScriptIdStorage.addPreloadScript('CONTEXT_1', 'PRELOAD_SCRIPT_1');
      preloadScriptIdStorage.addPreloadScript('CONTEXT_1', 'PRELOAD_SCRIPT_2');

      expect(
        preloadScriptIdStorage.findEntries({contextId: 'CONTEXT_1'})
      ).to.deep.equal([
        {
          bidiPreloadScriptId: MOCKED_UUID_1,
          cdpPreloadScriptId: 'PRELOAD_SCRIPT_1',
          contextId: 'CONTEXT_1',
          scriptSource: undefined,
        },
        {
          bidiPreloadScriptId: MOCKED_UUID_2,
          cdpPreloadScriptId: 'PRELOAD_SCRIPT_2',
          contextId: 'CONTEXT_1',
          scriptSource: undefined,
        },
      ]);

      expect(stub.calledTwice).to.be.true;
    });
  });

  [
    {desc: 'global context', context: null},
    {desc: 'non-global context', context: 'CONTEXT_1'},
  ].forEach(({desc, context}) => {
    describe('add preload scripts', () => {
      it(desc, () => {
        preloadScriptIdStorage.addPreloadScripts(context, [
          'PRELOAD_SCRIPT_1',
          'PRELOAD_SCRIPT_2',
        ]);

        expect(
          preloadScriptIdStorage.findEntries({contextId: context})
        ).to.deep.equal([
          {
            bidiPreloadScriptId: MOCKED_UUID_1,
            cdpPreloadScriptId: 'PRELOAD_SCRIPT_1',
            contextId: context,
            scriptSource: undefined,
          },
          {
            bidiPreloadScriptId: MOCKED_UUID_1,
            cdpPreloadScriptId: 'PRELOAD_SCRIPT_2',
            contextId: context,
            scriptSource: undefined,
          },
        ]);

        expect(stub.calledOnceWithExactly()).to.be.true;
      });
    });

    describe('remove preload scripts', () => {
      it(desc, () => {
        preloadScriptIdStorage.addPreloadScripts(context, [
          'PRELOAD_SCRIPT_1',
          'PRELOAD_SCRIPT_2',
        ]);

        preloadScriptIdStorage.removePreloadScript({
          contextId: context,
          bidiPreloadScriptId: MOCKED_UUID_1,
        });

        expect(preloadScriptIdStorage.findEntries({contextId: context})).to.be
          .empty;
      });
    });
  });

  [
    {desc: 'by context', filter: {context: null}},
    {
      desc: 'by preload script id',
      filter: {bidiPreloadScriptId: MOCKED_UUID_1},
    },
    {
      desc: 'by cdp script id',
      filter: {cdpPreloadScriptId: 'PRELOAD_SCRIPT'},
    },
    {desc: 'by source', filter: {scriptSource: '() => {}'}},
  ].forEach(({desc, filter}) => {
    describe('find entries', () => {
      it(desc, () => {
        preloadScriptIdStorage.addPreloadScripts(
          null,
          ['PRELOAD_SCRIPT'],
          '() => {}'
        );

        expect(preloadScriptIdStorage.findEntries(filter)).to.deep.equal([
          {
            bidiPreloadScriptId: MOCKED_UUID_1,
            cdpPreloadScriptId: 'PRELOAD_SCRIPT',
            contextId: null,
            scriptSource: '() => {}',
          },
        ]);
      });
    });

    describe('delete entries', () => {
      it(desc, () => {
        preloadScriptIdStorage.addPreloadScripts(null, ['PRELOAD_SCRIPT']);
        preloadScriptIdStorage.removePreloadScript(filter);

        expect(preloadScriptIdStorage.findEntries(filter)).to.be.empty;
      });
    });
  });

  afterEach(() => {
    sinon.restore();
  });
});
