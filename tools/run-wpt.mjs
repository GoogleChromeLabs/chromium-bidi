#!/usr/bin/env node

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

import {execSync, spawnSync} from 'child_process';
import {parseArgs} from 'node:util';
import {join, resolve} from 'path';

import {packageDirectorySync} from 'pkg-dir';

// Changing the current work directory to the package directory.
process.chdir(packageDirectorySync());

function log(message) {
  // eslint-disable-next-line no-console
  console.log(`(${process.argv[1]}) ${message}`);
}

function usage() {
  log(
    `Usage:
      [BROWSER_BIN=<path, default: download pinned chrome>]
      [CHROMEDRIVER=<true | default: false>]
      [HEADLESS=<true | default: false>]
      [MANIFEST=<default: 'MANIFEST.json'>]
      [RUN_TESTS=<default: true | false>]
      [TIMEOUT_MULTIPLIER=<number, default: 4>]
      [THIS_CHUNK=<number, default: 1>]
      [TOTAL_CHUNKS=<number, default: 1>]
      [UPDATE_EXPECTATIONS=<true | default: false>]
      [VERBOSE==<true | default: false>]
      [WPT_REPORT=<default: 'wptreport.json'>]
      [WPT_METADATA=<default: 'wpt-metadata/$\{ 'chromedriver' | 'mapper' }/$\{ 'headless' | 'headful' }>]
      ${process.argv[1]} [webdriver/tests/bidi/[...]]`
  );
}

function parseCommandLine() {
  const {values} = parseArgs({
    options: {
      help: {
        type: 'boolean',
        short: 'h',
        default: false,
      },
    },
  });

  if (values.help) {
    usage();
    process.exit(0);
  }

  return values;
}

function parseEnvVariables() {
  const env = {
    // Whether to use Chromedriver with mapper.
    CHROMEDRIVER: 'false',
    // Whether to start the server in headless or headful mode.
    HEADLESS: 'true',
    // The path to the WPT manifest file.
    MANIFEST: 'MANIFEST.json',
    // The browser product to test.
    PRODUCT: 'chrome',
    // Weather to run the tests. `false` value is useful for updating expectations
    // based on the WPT report.
    RUN_TESTS: 'true',
    // Multiplier relative to standard test timeout to use.
    TIMEOUT_MULTIPLIER: '4',
    // The current chunk number. Required for shard testing.
    THIS_CHUNK: '1',
    // The total number of chunks. Required for shard testing.
    TOTAL_CHUNKS: '1',
    // Whether to update the WPT expectations after running the tests.
    UPDATE_EXPECTATIONS: 'false',
    // Whether to enable verbose logging.
    VERBOSE: 'false',
    // The path to the WPT report file.
    WPT_REPORT: 'wptreport.json',
  };

  // Only set WPT_METADATA if it's not already set.
  env.WPT_METADATA = join(
    'wpt-metadata',
    env.CHROMEDRIVER === 'true' ? 'chromedriver' : 'mapper',
    env.HEADLESS === 'true' ? 'headless' : 'headful'
  );

  if (!process.env.BROWSER_BIN) {
    env.BROWSER_BIN = execSync(`node ${join('tools', 'install-browser.mjs')}`)
      .toString()
      .trim();
  }

  return {
    ...env,
    ...process.env,
  };
}

function runWptTest({
  BROWSER_BIN,
  CHROMEDRIVER,
  HEADLESS,
  MANIFEST,
  PRODUCT,
  RUN_TESTS,
  THIS_CHUNK,
  TIMEOUT_MULTIPLIER,
  TOTAL_CHUNKS,
  VERBOSE,
  WPT_METADATA,
  WPT_REPORT,
}) {
  if (RUN_TESTS !== 'true') {
    return 0;
  }

  const wptBinary = resolve(join('wpt', 'wpt'));
  const mapperPath = join('lib', 'iife', 'mapperTab.js');
  const chromeDriverLogs = join('logs', 'chromedriver.log');

  const wptRunArgs = [
    '--binary',
    BROWSER_BIN,
    `--webdriver-arg=--headless=${HEADLESS}`,
    '--log-wptreport',
    WPT_REPORT,
    '--manifest',
    MANIFEST,
    '--metadata',
    WPT_METADATA,
    '--no-manifest-download',
    '--skip-implementation-status',
    'backlog',
    '--timeout-multiplier',
    TIMEOUT_MULTIPLIER,
    '--run-by-dir',
    '1',
    '--total-chunks',
    TOTAL_CHUNKS,
    '--this-chunk',
    THIS_CHUNK,
    '--chunk-type',
    'hash',
  ];

  if (VERBOSE === 'true') {
    // WPT logs.
    wptRunArgs.push(
      '--debug-test',
      '--log-mach',
      '-',
      '--log-mach-level',
      'info'
    );
  }

  if (HEADLESS === 'true') {
    log('Running WPT in headless mode...');
    wptRunArgs.push('--binary-arg=--headless=new');
  } else {
    log('Running WPT in headful mode...');
  }

  if (CHROMEDRIVER === 'true') {
    log('Using chromedriver with mapper...');

    wptRunArgs.push(
      '--install-webdriver',
      `--webdriver-arg=--bidi-mapper-path=${mapperPath}`,
      `--webdriver-arg=--log-path=${chromeDriverLogs}`,
      `--webdriver-arg=--log-level=${VERBOSE === 'true' ? 'ALL' : 'INFO'}`,
      '--yes'
    );
  } else {
    log('Using pure mapper...');
    wptRunArgs.push('--webdriver-binary', join('tools', 'run-bidi-server.mjs'));
  }

  const restArgs = process.argv.slice(2);
  let test =
    restArgs[restArgs.length - 1] ?? join('webdriver', 'tests', 'bidi');

  // Canonicalize the test path.
  test = test
    .replace('wpt-metadata/', '')
    .replace('mapper/headless/', '')
    .replace('mapper/headful/', '')
    .replace('chromedriver/headless/', '')
    .replace('.ini', '');

  log(`Running "${test}" with "${BROWSER_BIN}"...`);

  wptRunArgs.push(
    // All arguments except the first one (the command) and the last one (the test) are the flags.
    ...process.argv.slice(2, process.argv.length - 1),
    PRODUCT,
    // The last argument is the test.
    test
  );

  const wptProcess = spawnSync(wptBinary, ['run', ...wptRunArgs], {
    stdio: 'inherit',
  });

  return wptProcess.status ?? 0;
}

function runUpdateExpectations({
  UPDATE_EXPECTATIONS,
  PRODUCT,
  MANIFEST,
  WPT_METADATA,
  WPT_REPORT,
}) {
  if (UPDATE_EXPECTATIONS !== 'true') {
    return 0;
  }

  log('Updating WPT expectations...');
  const wptBinary = resolve(join('wpt', 'wpt'));

  const updateProcess = spawnSync(
    wptBinary,
    [
      'update-expectations',
      '--properties-file',
      './update_properties.json',
      '--product',
      PRODUCT,
      '--manifest',
      MANIFEST,
      '--metadata',
      WPT_METADATA,
      WPT_REPORT,
    ],
    {stdio: 'inherit'}
  );

  return updateProcess.status ?? 0;
}

parseCommandLine();
const env = parseEnvVariables();
const wptStatus = runWptTest(env);
const expectationsStatus = runUpdateExpectations(env);

// If WPT tests themselves or the expectations update failed, return failure.
let exitCode = 0;
if (wptStatus !== 0) {
  log(`WPT test run failed: ${wptStatus}`);
  exitCode = wptStatus;
}
if (expectationsStatus !== 0) {
  log(`Update expectations failed: ${expectationsStatus}`);
  exitCode = expectationsStatus;
}

process.exit(exitCode);
