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
import {expect} from 'chai';

import {Network} from '../../../protocol/protocol.js';

import {NetworkStorage} from './NetworkStorage.js';

describe('NetworkStorage', () => {
  it('requestStageFromPhase', () => {
    expect(
      NetworkStorage.requestStageFromPhase(
        Network.InterceptPhase.BeforeRequestSent
      )
    ).to.equal('Request');
    expect(
      NetworkStorage.requestStageFromPhase(
        Network.InterceptPhase.ResponseStarted
      )
    ).to.equal('Response');
    expect(() =>
      NetworkStorage.requestStageFromPhase(Network.InterceptPhase.AuthRequired)
    ).to.throw();
  });

  describe('getFetchEnableParams', () => {
    let networkStorage: NetworkStorage;

    beforeEach(() => {
      networkStorage = new NetworkStorage({} as any);
    });

    it('no intercepts', () => {
      expect(networkStorage.getFetchEnableParams()).to.deep.equal({
        handleAuthRequests: false,
        patterns: [],
      });
    });

    [
      {
        description: 'one url pattern',
        urlPatterns: ['http://example.com'],
        phases: [Network.InterceptPhase.BeforeRequestSent],
        expected: {
          handleAuthRequests: false,
          patterns: [
            {
              requestStage: 'Request',
              urlPattern: 'http://example.com',
            },
          ],
        },
      },
      {
        description: 'two url patterns',
        urlPatterns: ['http://example.com', 'http://example.org'],
        phases: [Network.InterceptPhase.ResponseStarted],
        expected: {
          handleAuthRequests: false,
          patterns: [
            {
              requestStage: 'Response',
              urlPattern: 'http://example.com',
            },
            {
              requestStage: 'Response',
              urlPattern: 'http://example.org',
            },
          ],
        },
      },
      {
        description: 'auth required phase',
        urlPatterns: ['http://example.org'],
        phases: [Network.InterceptPhase.AuthRequired],
        expected: {
          handleAuthRequests: true,
          patterns: [
            {
              urlPattern: 'http://example.org',
            },
          ],
        },
      },
      {
        description: 'auth required and request phases',
        urlPatterns: ['http://example.org'],
        phases: [
          Network.InterceptPhase.AuthRequired,
          Network.InterceptPhase.BeforeRequestSent,
        ],
        expected: {
          handleAuthRequests: true,
          patterns: [
            {
              urlPattern: 'http://example.org',
            },
            {
              requestStage: 'Request',
              urlPattern: 'http://example.org',
            },
          ],
        },
      },
      {
        description: 'two phases',
        urlPatterns: ['http://example.com'],
        phases: [
          Network.InterceptPhase.BeforeRequestSent,
          Network.InterceptPhase.ResponseStarted,
        ],
        expected: {
          handleAuthRequests: false,
          patterns: [
            {
              requestStage: 'Request',
              urlPattern: 'http://example.com',
            },
            {
              requestStage: 'Response',
              urlPattern: 'http://example.com',
            },
          ],
        },
      },
      {
        description: 'two patterns, two phases',
        urlPatterns: ['http://example.com', 'http://example.org'],
        phases: [
          Network.InterceptPhase.BeforeRequestSent,
          Network.InterceptPhase.ResponseStarted,
        ],
        expected: {
          handleAuthRequests: false,
          patterns: [
            {
              requestStage: 'Request',
              urlPattern: 'http://example.com',
            },
            {
              requestStage: 'Response',
              urlPattern: 'http://example.com',
            },
            {
              requestStage: 'Request',
              urlPattern: 'http://example.org',
            },
            {
              requestStage: 'Response',
              urlPattern: 'http://example.org',
            },
          ],
        },
      },
    ].forEach(({description, urlPatterns, phases, expected}) => {
      it(description, () => {
        networkStorage.addIntercept({
          urlPatterns,
          phases,
        });

        expect(networkStorage.getFetchEnableParams()).to.deep.equal(expected);
      });
    });
  });

  // TODO: add more tests.
  //   - addIntercept
  //   - removeIntercept
});
