/*
 *  Copyright 2025 Google LLC.
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
 */

import {expect} from 'chai';

import {
  InvalidArgumentException,
  type Session,
  UnknownErrorException,
  UnsupportedOperationException,
} from '../../../protocol/protocol.js';

import {asserProxyHost, getProxyStr} from './BrowserProcessor.js';

describe('BrowserProcessor', () => {
  describe('getProxyStr', () => {
    it('should return undefined for "direct" proxyType', () => {
      const proxyConfig: Session.ProxyConfiguration = {proxyType: 'direct'};
      expect(getProxyStr(proxyConfig)).to.be.undefined;
    });

    it('should return undefined for "system" proxyType', () => {
      const proxyConfig: Session.ProxyConfiguration = {proxyType: 'system'};
      expect(getProxyStr(proxyConfig)).to.be.undefined;
    });

    it('should throw UnsupportedOperationException for "pac" proxyType', () => {
      const proxyConfig: Session.ProxyConfiguration = {
        proxyType: 'pac',
        proxyAutoconfigUrl: 'some_url',
      };
      expect(() => getProxyStr(proxyConfig)).to.throw(
        UnsupportedOperationException,
      );
    });

    it('should throw UnsupportedOperationException for "autodetect" proxyType', () => {
      const proxyConfig: Session.ProxyConfiguration = {proxyType: 'autodetect'};
      expect(() => getProxyStr(proxyConfig)).to.throw(
        UnsupportedOperationException,
      );
    });

    describe('manual proxyType', () => {
      it('should return undefined if no specific proxies are provided', () => {
        const proxyConfig: Session.ProxyConfiguration = {proxyType: 'manual'};
        expect(getProxyStr(proxyConfig)).to.be.undefined;
      });

      it('should correctly format httpProxy', () => {
        const proxyConfig: Session.ProxyConfiguration = {
          proxyType: 'manual',
          httpProxy: 'localhost:8080',
        };
        expect(getProxyStr(proxyConfig)).to.equal('http=localhost:8080');
      });

      it('should correctly format sslProxy', () => {
        const proxyConfig: Session.ProxyConfiguration = {
          proxyType: 'manual',
          sslProxy: 'secure.proxy:443',
        };
        expect(getProxyStr(proxyConfig)).to.equal('https=secure.proxy:443');
      });

      describe('socksProxy', () => {
        it('should correctly format socksProxy with valid socksVersion', () => {
          const proxyConfig: Session.ProxyConfiguration = {
            proxyType: 'manual',
            socksProxy: 'socks.server:1080',
            socksVersion: 5,
          };
          expect(getProxyStr(proxyConfig)).to.equal(
            'socks=socks5://socks.server:1080',
          );
        });

        it('should correctly format socksProxy with socksVersion 0', () => {
          const proxyConfig: Session.ProxyConfiguration = {
            proxyType: 'manual',
            socksProxy: 'socks.server:1080',
            socksVersion: 0,
          };
          expect(getProxyStr(proxyConfig)).to.equal(
            'socks=socks0://socks.server:1080',
          );
        });

        it('should throw InvalidArgumentException if socksProxy is undefined while socksVersion is not', () => {
          const proxyConfig: Session.ProxyConfiguration = {
            proxyType: 'manual',
            socksVersion: 5,
          };
          expect(() => getProxyStr(proxyConfig)).to.throw(
            InvalidArgumentException,
          );
        });

        it('should throw InvalidArgumentException if socksVersion is undefined', () => {
          const proxyConfig: Session.ProxyConfiguration = {
            proxyType: 'manual',
            socksProxy: 'socks.server:1080',
          };
          expect(() => getProxyStr(proxyConfig)).to.throw(
            InvalidArgumentException,
          );
        });

        it('should throw InvalidArgumentException if socksVersion is not a number', () => {
          const proxyConfig: Session.ProxyConfiguration = {
            proxyType: 'manual',
            socksProxy: 'socks.server:1080',
            socksVersion: '5' as any, // Force incorrect type
          };
          expect(() => getProxyStr(proxyConfig)).to.throw(
            InvalidArgumentException,
          );
        });

        it('should throw InvalidArgumentException if socksVersion is not an integer', () => {
          const proxyConfig: Session.ProxyConfiguration = {
            proxyType: 'manual',
            socksProxy: 'socks.server:1080',
            socksVersion: 5.5,
          };
          expect(() => getProxyStr(proxyConfig)).to.throw(
            InvalidArgumentException,
          );
        });

        it('should throw InvalidArgumentException if socksVersion is less than 0', () => {
          const proxyConfig: Session.ProxyConfiguration = {
            proxyType: 'manual',
            socksProxy: 'socks.server:1080',
            socksVersion: -1,
          };
          expect(() => getProxyStr(proxyConfig)).to.throw(
            InvalidArgumentException,
          );
        });

        it('should throw InvalidArgumentException if socksVersion is greater than 255', () => {
          const proxyConfig: Session.ProxyConfiguration = {
            proxyType: 'manual',
            socksProxy: 'socks.server:1080',
            socksVersion: 256,
          };
          expect(() => getProxyStr(proxyConfig)).to.throw(
            InvalidArgumentException,
          );
        });
      });

      it('should correctly format multiple proxies', () => {
        const proxyConfig: Session.ProxyConfiguration = {
          proxyType: 'manual',
          httpProxy: 'http.proxy:80',
          sslProxy: 'https.proxy:443',
          socksProxy: 'socks.proxy:1080',
          socksVersion: 4,
        };
        const expected =
          'http=http.proxy:80;https=https.proxy:443;socks=socks4://socks.proxy:1080';
        expect(getProxyStr(proxyConfig)).to.equal(expected);
      });

      it('should correctly format multiple proxies in different order', () => {
        const proxyConfig: Session.ProxyConfiguration = {
          proxyType: 'manual',
          socksProxy: 'socks.proxy:1080',
          socksVersion: 5,
          httpProxy: 'http.proxy:80',
        };
        // Order of servers in the output string is defined by the function's implementation
        const expected = 'http=http.proxy:80;socks=socks5://socks.proxy:1080';
        expect(getProxyStr(proxyConfig)).to.equal(expected);
      });
    });

    it('should throw UnknownErrorException for an unknown proxyType', () => {
      const proxyConfig: Session.ProxyConfiguration = {
        proxyType: 'unknown_type' as any,
      };
      expect(() => getProxyStr(proxyConfig)).to.throw(UnknownErrorException);
    });
  });
  describe('assertHttpProxy', () => {
    it('should not throw for valid proxy formats', () => {
      expect(() => asserProxyHost('localhost')).to.not.throw();
      expect(() => asserProxyHost('localhost:8080')).to.not.throw();
      expect(() => asserProxyHost('127.0.0.1')).to.not.throw();
      expect(() => asserProxyHost('127.0.0.1:8080')).to.not.throw();
      expect(() => asserProxyHost('[::1]')).to.not.throw();
      expect(() => asserProxyHost('[::1]:8080')).to.not.throw();
      expect(() => asserProxyHost('user:pass@localhost:8080')).to.not.throw();
    });

    it('should throw InvalidArgumentException for proxy with scheme', () => {
      expect(() => asserProxyHost('http://localhost')).to.throw(
        InvalidArgumentException,
      );
    });

    it('should throw InvalidArgumentException for proxy with invalid port', () => {
      expect(() => asserProxyHost('localhost:invalid')).to.throw(
        InvalidArgumentException,
      );
    });

    it('should throw InvalidArgumentException for port out of range', () => {
      expect(() => asserProxyHost('localhost:-1')).to.throw(
        InvalidArgumentException,
      );
      expect(() => asserProxyHost('localhost:65536')).to.throw(
        InvalidArgumentException,
      );
      expect(() => asserProxyHost('localhost:1.1')).to.throw(
        InvalidArgumentException,
      );
    });

    it('should throw InvalidArgumentException for proxy with path', () => {
      expect(() => asserProxyHost('localhost/path')).to.throw(
        InvalidArgumentException,
      );
    });

    it('should throw InvalidArgumentException for proxy with search params', () => {
      expect(() => asserProxyHost('localhost?foo=bar')).to.throw(
        InvalidArgumentException,
      );
    });

    it('should throw InvalidArgumentException for proxy with hash', () => {
      expect(() => asserProxyHost('localhost#hash')).to.throw(
        InvalidArgumentException,
      );
    });
  });
});
