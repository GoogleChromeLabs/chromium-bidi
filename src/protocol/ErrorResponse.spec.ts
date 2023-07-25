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

import * as exceptionClasses from './ErrorResponse.js';
import {ErrorCode} from './webdriver-bidi.js';

describe('Exception', () => {
  Object.keys(ErrorCode).forEach((errorCodeKey: string) => {
    const errorCode = ErrorCode[errorCodeKey as keyof typeof ErrorCode];

    it(`should have an exception class for ErrorCode.${errorCode}`, () => {
      // Exception class name should be in PascalCase, e.g. InvalidArgumentException
      const exceptionClassName = `${errorCode
        .split(' ')
        .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
        .join('')}Exception`;

      expect(exceptionClasses).to.have.property(exceptionClassName);
      const ExceptionClass = (exceptionClasses as any)[exceptionClassName];

      const instance = new ExceptionClass('my message', 'my stacktrace');
      expect(instance).to.have.property('error', errorCode);
      expect(instance).to.have.property('message', 'my message');
      expect(instance).to.have.property('stacktrace', 'my stacktrace');
    });
  });
});
