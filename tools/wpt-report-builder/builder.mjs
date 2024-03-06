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
import child_process from 'child_process';
import fs from 'fs';

import {escapeHtml, generateReport} from './formatter.mjs';

function getCurrentCommit() {
  if (process.env.GITHUB_SHA) {
    // If triggered by GitHub Actions, use the commit SHA provided by GitHub.
    return process.env.GITHUB_SHA;
  }
  return child_process.execSync('git rev-parse HEAD').toString().trim();
}

function readReport(filePath) {
  const rawReport = fs.readFileSync(filePath);
  return JSON.parse(rawReport);
}

function getReportPath() {
  return process.argv.slice(2)[0];
}

function getOutputPath() {
  return process.argv.slice(2)[1];
}

function getAllTests() {
  const rawCommandResult = child_process
    .execSync(
      // Magic command line that makes required pytest imports and gets the list of
      // tests. Details: go/webdriver:wpt-total-test-count.
      '(cd ./wpt/webdriver/tests/bidi; PYTHONPATH="$( pwd )/../../../tools/webdriver:$( pwd )/../../../tools/third_party/websockets/src:$( pwd ):$( pwd )../../../tools/webdriver/webdriver/bidi/modules/permissions.py:$( pwd )/../../.."  pytest --collect-only --rootdir=../../.. -o=\'python_files=*.py\' --quiet)'
    )
    .toString();

  const tests = [];
  rawCommandResult.split('\n').forEach((line) => {
    if (line.startsWith('webdriver/tests/bidi')) {
      const [testPath, ...testNameParts] = line.split('::');
      const testName = testNameParts.join('::');
      tests.push({
        path: `/${testPath}/${escapeHtml(testName)}`,
        name: testName,
        status: 'SKIPPED',
        message: null,
      });
    }
  });
  return tests;
}

if (process.argv.slice(2).length !== 2) {
  console.error(
    'Should be run from the root folder of the project.\nUsage: node tools/wpt-report-builder/builder.mjs <reportPath> <outputPath>'
  );
  process.exit(1);
}

fs.writeFileSync(
  getOutputPath(),
  generateReport(readReport(getReportPath()), getAllTests(), getCurrentCommit())
);
