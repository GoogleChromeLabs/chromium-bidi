/**
 * Copyright 2024 Google LLC.
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

/**
 * @fileoverview Used as an alias to `UrlPattern.ts` to reduce the
 * size of Chromium-BiDi when used the tab.
 * See rollup.config.mjs
 */
import type {URLPattern as URLPatternType} from 'urlpattern-polyfill/dist/types.js';

const URLPattern = (globalThis as any).URLPattern as typeof URLPatternType;

if (!URLPattern) {
  throw new Error('Unable to find URLPattern');
}

export {URLPattern};
