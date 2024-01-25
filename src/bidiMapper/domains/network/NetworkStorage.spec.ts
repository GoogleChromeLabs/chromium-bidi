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

import type {Network} from '../../../protocol/protocol.js';

import {NetworkStorage} from './NetworkStorage.js';

describe('NetworkStorage', () => {
  describe('cdpFromSpecUrlPattern', () => {
    it('string type', () => {
      expect(
        NetworkStorage.cdpFromSpecUrlPattern({
          type: 'string',
          pattern: 'https://example.com',
        } satisfies Network.UrlPattern)
      ).to.equal('https://example.com');
    });

    it('pattern type', () => {
      expect(
        NetworkStorage.cdpFromSpecUrlPattern({
          type: 'pattern',
          protocol: 'https',
          hostname: 'example.com',
          port: '80',
          pathname: '/foo',
          search: 'bar=baz',
        } satisfies Network.UrlPattern)
      ).to.equal('https://example.com:80/foo?bar=baz');
    });
  });

  describe('buildUrlPatternString', () => {
    describe('protocol', () => {
      it('empty', () => {
        expect(
          NetworkStorage.buildUrlPatternString({
            type: 'pattern',
            protocol: '',
            hostname: 'example.com',
            port: '80',
          } satisfies Network.UrlPatternPattern)
        ).to.equal('example.com:80');
      });

      it('without colon', () => {
        expect(
          NetworkStorage.buildUrlPatternString({
            type: 'pattern',
            protocol: 'https',
            hostname: 'example.com',
            port: '80',
          } satisfies Network.UrlPatternPattern)
        ).to.equal('https://example.com:80');
      });

      it('with colon', () => {
        expect(
          NetworkStorage.buildUrlPatternString({
            type: 'pattern',
            protocol: 'https:',
            hostname: 'example.com',
            port: '80',
          } satisfies Network.UrlPatternPattern)
        ).to.equal('https://example.com:80');
      });
    });

    describe('port', () => {
      it('empty', () => {
        expect(
          NetworkStorage.buildUrlPatternString({
            type: 'pattern',
            protocol: 'https',
            hostname: 'example.com',
            port: '',
          } satisfies Network.UrlPatternPattern)
        ).to.equal('https://example.com');
      });

      it('standard', () => {
        expect(
          NetworkStorage.buildUrlPatternString({
            type: 'pattern',
            protocol: 'https',
            hostname: 'example.com',
            port: '80',
          } satisfies Network.UrlPatternPattern)
        ).to.equal('https://example.com:80');
      });
    });

    describe('pathname', () => {
      it('empty', () => {
        expect(
          NetworkStorage.buildUrlPatternString({
            type: 'pattern',
            protocol: 'https',
            hostname: 'example.com',
            port: '80',
            pathname: '',
          } satisfies Network.UrlPatternPattern)
        ).to.equal('https://example.com:80');
      });

      it('without slash', () => {
        expect(
          NetworkStorage.buildUrlPatternString({
            type: 'pattern',
            protocol: 'https',
            hostname: 'example.com',
            port: '80',
            pathname: 'foo',
          } satisfies Network.UrlPatternPattern)
        ).to.equal('https://example.com:80/foo');
      });

      it('with slash', () => {
        expect(
          NetworkStorage.buildUrlPatternString({
            type: 'pattern',
            protocol: 'https',
            hostname: 'example.com',
            port: '80',
            pathname: '/foo',
          } satisfies Network.UrlPatternPattern)
        ).to.equal('https://example.com:80/foo');
      });
    });

    describe('search', () => {
      it('empty', () => {
        expect(
          NetworkStorage.buildUrlPatternString({
            type: 'pattern',
            protocol: 'https',
            hostname: 'example.com',
            port: '80',
            search: '',
          } satisfies Network.UrlPatternPattern)
        ).to.equal('https://example.com:80');
      });

      it('without question mark', () => {
        expect(
          NetworkStorage.buildUrlPatternString({
            type: 'pattern',
            protocol: 'https',
            hostname: 'example.com',
            port: '80',
            search: 'bar=baz',
          } satisfies Network.UrlPatternPattern)
        ).to.equal('https://example.com:80?bar=baz');
      });

      it('with question mark', () => {
        expect(
          NetworkStorage.buildUrlPatternString({
            type: 'pattern',
            protocol: 'https',
            hostname: 'example.com',
            port: '80',
            search: '?bar=baz',
          } satisfies Network.UrlPatternPattern)
        ).to.equal('https://example.com:80?bar=baz');
      });
    });

    it('empty', () => {
      expect(
        NetworkStorage.buildUrlPatternString({
          type: 'pattern',
        } satisfies Network.UrlPatternPattern)
      ).to.equal('*');
    });
  });

  describe('isSpecialScheme', () => {
    it('http', () => {
      expect(NetworkStorage.isSpecialScheme('http')).to.be.true;
    });

    it('sftp', () => {
      expect(NetworkStorage.isSpecialScheme('sftp')).to.be.false;
    });
  });

  describe('matchUrlPattern', () => {
    it('string type', () => {
      expect(
        NetworkStorage.matchUrlPattern(
          {
            type: 'string',
            pattern: 'https://example.com',
          } satisfies Network.UrlPattern,
          'https://example.com'
        )
      ).to.be.true;
    });

    describe('pattern type', () => {
      it('positive match', () => {
        expect(
          NetworkStorage.matchUrlPattern(
            {
              type: 'pattern',
              protocol: 'https',
              hostname: 'example.com',
            } satisfies Network.UrlPattern,
            'https://example.com/aa'
          )
        ).to.be.true;
      });

      it('negative match', () => {
        expect(
          NetworkStorage.matchUrlPattern(
            {
              type: 'pattern',
              protocol: 'https',
              hostname: 'example.com',
            } satisfies Network.UrlPattern,
            'https://example.org/aa'
          )
        ).to.be.false;
      });
    });
  });
});
