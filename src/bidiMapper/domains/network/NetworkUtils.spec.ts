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
import {expect} from 'chai';
import type {Protocol} from 'devtools-protocol';

import type {Network} from '../../../protocol/protocol.js';

import * as networkUtils from './NetworkUtils.js';

describe('NetworkUtils', () => {
  describe('should compute response headers size', () => {
    it('empty', () => {
      const headers: Network.Header[] = [];
      const responseHeadersSize = networkUtils.computeHeadersSize(headers);

      expect(responseHeadersSize).to.equal(0);
    });

    it('non-empty', () => {
      const headers: Network.Header[] = [
        {
          name: 'Content-Type',
          value: {
            type: 'string',
            value: 'text/html',
          },
        },
        {
          name: 'Content-Length',
          value: {
            type: 'string',
            value: '123',
          },
        },
      ];
      const responseHeadersSize = networkUtils.computeHeadersSize(headers);

      expect(responseHeadersSize).to.equal(46);
    });
  });

  describe('should convert CDP network headers to Bidi network headers', () => {
    it('empty', () => {
      const cdpNetworkHeaders = {};
      const bidiNetworkHeaders =
        networkUtils.bidiNetworkHeadersFromCdpNetworkHeaders(cdpNetworkHeaders);

      expect(bidiNetworkHeaders).to.deep.equal([]);
    });

    it('non-empty', () => {
      const cdpNetworkHeaders = {
        'Content-Type': 'text/html',
        'Content-Length': '123',
      };
      const bidiNetworkHeaders =
        networkUtils.bidiNetworkHeadersFromCdpNetworkHeaders(cdpNetworkHeaders);

      expect(bidiNetworkHeaders).to.deep.equal([
        {
          name: 'Content-Type',
          value: {
            type: 'string',
            value: 'text/html',
          },
        },
        {
          name: 'Content-Length',
          value: {
            type: 'string',
            value: '123',
          },
        },
      ]);
    });
  });

  describe('should convert Bidi network headers to CDP network headers', () => {
    it('undefined', () => {
      const cdpNetworkHeaders =
        networkUtils.cdpNetworkHeadersFromBidiNetworkHeaders(undefined);

      expect(cdpNetworkHeaders).to.equal(undefined);
    });

    it('empty', () => {
      const bidiNetworkHeaders: Network.Header[] = [];
      const cdpNetworkHeaders =
        networkUtils.cdpNetworkHeadersFromBidiNetworkHeaders(
          bidiNetworkHeaders
        );

      expect(cdpNetworkHeaders).to.deep.equal({});
    });

    it('non-empty', () => {
      const bidiNetworkHeaders: Network.Header[] = [
        {
          name: 'Content-Type',
          value: {
            type: 'string',
            value: 'text/html',
          },
        },
        {
          name: 'Content-Length',
          value: {
            type: 'string',
            value: '123',
          },
        },
      ];
      const cdpNetworkHeaders =
        networkUtils.cdpNetworkHeadersFromBidiNetworkHeaders(
          bidiNetworkHeaders
        );

      expect(cdpNetworkHeaders).to.deep.equal({
        'Content-Type': 'text/html',
        'Content-Length': '123',
      });
    });
  });

  describe('should convert CDP fetch header entry array to Bidi network headers', () => {
    it('empty', () => {
      const cdpFetchHeaderEntryArray: Protocol.Fetch.HeaderEntry[] = [];
      const bidiNetworkHeaders =
        networkUtils.bidiNetworkHeadersFromCdpFetchHeaders(
          cdpFetchHeaderEntryArray
        );

      expect(bidiNetworkHeaders).to.deep.equal([]);
    });

    it('non-empty', () => {
      const cdpFetchHeaderEntryArray: Protocol.Fetch.HeaderEntry[] = [
        {
          name: 'Content-Type',
          value: 'text/html',
        },
        {
          name: 'Content-Length',
          value: '123',
        },
      ];
      const bidiNetworkHeaders =
        networkUtils.bidiNetworkHeadersFromCdpFetchHeaders(
          cdpFetchHeaderEntryArray
        );

      expect(bidiNetworkHeaders).to.deep.equal([
        {
          name: 'Content-Type',
          value: {
            type: 'string',
            value: 'text/html',
          },
        },
        {
          name: 'Content-Length',
          value: {
            type: 'string',
            value: '123',
          },
        },
      ]);
    });
  });

  describe('should convert Bidi network headers to CDP fetch header entry array', () => {
    it('undefined', () => {
      const cdpFetchHeaderEntryArray =
        networkUtils.cdpFetchHeadersFromBidiNetworkHeaders(undefined);

      expect(cdpFetchHeaderEntryArray).to.equal(undefined);
    });

    it('empty', () => {
      const bidiNetworkHeaders: Network.Header[] = [];
      const cdpFetchHeaderEntryArray =
        networkUtils.cdpFetchHeadersFromBidiNetworkHeaders(bidiNetworkHeaders);

      expect(cdpFetchHeaderEntryArray).to.deep.equal([]);
    });

    it('non-empty', () => {
      const bidiNetworkHeaders: Network.Header[] = [
        {
          name: 'Content-Type',
          value: {
            type: 'string',
            value: 'text/html',
          },
        },
        {
          name: 'Content-Length',
          value: {
            type: 'string',
            value: '123',
          },
        },
      ];
      const cdpFetchHeaderEntryArray =
        networkUtils.cdpFetchHeadersFromBidiNetworkHeaders(bidiNetworkHeaders);

      expect(cdpFetchHeaderEntryArray).to.deep.equal([
        {
          name: 'Content-Type',
          value: 'text/html',
        },
        {
          name: 'Content-Length',
          value: '123',
        },
      ]);
    });
  });

  describe('cdpFromSpecUrlPattern', () => {
    it('string type', () => {
      expect(
        networkUtils.cdpFromSpecUrlPattern({
          type: 'string',
          pattern: 'https://example.com',
        } satisfies Network.UrlPattern)
      ).to.equal('https://example.com');
    });

    it('pattern type', () => {
      expect(
        networkUtils.cdpFromSpecUrlPattern({
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
          networkUtils.buildUrlPatternString({
            type: 'pattern',
            protocol: '',
            hostname: 'example.com',
            port: '80',
          } satisfies Network.UrlPatternPattern)
        ).to.equal('example.com:80');
      });

      it('without colon', () => {
        expect(
          networkUtils.buildUrlPatternString({
            type: 'pattern',
            protocol: 'https',
            hostname: 'example.com',
            port: '80',
          } satisfies Network.UrlPatternPattern)
        ).to.equal('https://example.com:80');
      });

      it('with colon', () => {
        expect(
          networkUtils.buildUrlPatternString({
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
          networkUtils.buildUrlPatternString({
            type: 'pattern',
            protocol: 'https',
            hostname: 'example.com',
            port: '',
          } satisfies Network.UrlPatternPattern)
        ).to.equal('https://example.com');
      });

      it('standard', () => {
        expect(
          networkUtils.buildUrlPatternString({
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
          networkUtils.buildUrlPatternString({
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
          networkUtils.buildUrlPatternString({
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
          networkUtils.buildUrlPatternString({
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
          networkUtils.buildUrlPatternString({
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
          networkUtils.buildUrlPatternString({
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
          networkUtils.buildUrlPatternString({
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
        networkUtils.buildUrlPatternString({
          type: 'pattern',
        } satisfies Network.UrlPatternPattern)
      ).to.equal('*');
    });
  });

  describe('isSpecialScheme', () => {
    it('http', () => {
      expect(networkUtils.isSpecialScheme('http')).to.be.true;
    });

    it('sftp', () => {
      expect(networkUtils.isSpecialScheme('sftp')).to.be.false;
    });
  });

  describe('matchUrlPattern', () => {
    it('string type', () => {
      expect(
        networkUtils.matchUrlPattern(
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
          networkUtils.matchUrlPattern(
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
          networkUtils.matchUrlPattern(
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
