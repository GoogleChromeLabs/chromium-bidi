/**
 * Copyright 2022 Google LLC.
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

import * as chai from 'chai';
import { IdWrapper } from './idWrapper';

const expect = chai.expect;

describe('test IdWrapper', () => {
  it('wraps value with unique id', () => {
    const wrapper_1 = new IdWrapper('SOME_STRING_1');
    const wrapper_2 = new IdWrapper('SOME_STRING_2');

    expect(wrapper_1.id).to.equal(1);
    expect(wrapper_1.value).to.equal('SOME_STRING_1');
    expect(wrapper_2.id).to.equal(2);
    expect(wrapper_2.value).to.equal('SOME_STRING_2');
  });
});
