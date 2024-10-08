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

import {mkdirSync, writeFileSync} from 'fs';
import {dirname} from 'path';

/**
 * Outputs the dummy package.json file to the path specified
 * by the first argument.
 */
mkdirSync(dirname(process.argv[2]), {recursive: true});
writeFileSync(process.argv[2], `{"type": "module"}`);
