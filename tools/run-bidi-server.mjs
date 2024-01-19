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

import {spawn, spawnSync} from 'child_process';
import {createWriteStream, mkdirSync} from 'fs';
import {basename, join, resolve} from 'path';

import {packageDirectorySync} from 'pkg-dir';

// Changing the current work directory to the package directory.
process.chdir(packageDirectorySync());

function log(message) {
  // eslint-disable-next-line no-console
  console.log(`(${basename(process.argv[1])}) ${message}`);
}

function usage() {
  log(
    `Usage:
        [BROWSER_BIN=<path, default: download pinned chrome>]
        [CHANNEL=<stable | beta | canary | dev>]
        [CHROMEDRIVER=<true | default: false>]
        [CHROMEDRIVER_BIN=<path, default: download pinned chrome>]
        [DEBUG=*]
        [DEBUG_COLORS=<yes | no>]
        [HEADLESS=<default: true | false>]
        [LOG_DIR=logs]
        [NODE_OPTIONS=--unhandled-rejections=strict]
        [PORT=8080]
        ${process.argv[1]}
        [--channel,-c=<channel, default: CHANNEL environment variable>]
        [--headless=<true | false, default: HEADLESS environment variable>]
        [--verbose,-v<true | default: false>]
      `
  );
}

if (
  process.argv.length > 2 &&
  (process.argv.includes('-h') || process.argv.includes('--help'))
) {
  usage();
  process.exit(0);
}

let BROWSER_BIN = process.env.BROWSER_BIN;
let CHANNEL = process.env.CHANNEL || 'local';
let CHROMEDRIVER = process.env.CHROMEDRIVER || 'false';
let CHROMEDRIVER_BIN = process.env.CHROMEDRIVER_BIN;
// DEBUG = (empty string) is allowed.
const DEBUG = process.env.DEBUG ?? 'bidi:*';
const DEBUG_COLORS = process.env.DEBUG_COLORS || 'false';
const DEBUG_DEPTH = process.env.DEBUG_DEPTH || '10';
let HEADLESS = process.env.HEADLESS | 'true';
const LOG_DIR = process.env.LOG_DIR || 'logs';
const LOG_FILE =
  process.env.LOG_FILE ||
  join(
    LOG_DIR,
    `${new Date().toISOString().replace(/[:]/g, '-')}.${
      CHROMEDRIVER === 'true' ? 'chromedriver' : 'mapper'
    }.log`
  );
const NODE_OPTIONS =
  process.env.NODE_OPTIONS || '--unhandled-rejections=strict';
const PORT = process.env.PORT || '8080';
let VERBOSE = process.env.VERBOSE || 'false';

// Parse arguments.
const restArgs = process.argv.slice(2);
for (const arg of restArgs) {
  const argParts = arg.split('=');
  switch (argParts[0]) {
    case '--headless':
      if (CHROMEDRIVER === 'true') {
        log(
          `WARNING! Chromedriver '--headless' is not supported via CLI. It can only be set via capabilities.`
        );
      }
      HEADLESS = argParts[1] || 'true';
      break;
    case '-c':
    case '--channel':
      if (argParts[1] === undefined) {
        log(`Missing channel value in ${arg}.`);
        usage();
        process.exit(1);
      }
      CHANNEL = argParts[1];
      break;
    case '-v':
    case '--verbose':
      VERBOSE = argParts[1] || 'true';
      break;
    default:
      log(`Unknown argument ${arg}.`);
      usage();
      process.exit(1);
  }
}

if (CHANNEL === 'local') {
  if (!BROWSER_BIN) {
    // Download pinned chrome.
    BROWSER_BIN = spawnSync('node', [join('tools', 'install-browser.mjs')])
      .stdout.toString()
      .trim();
  }

  if (CHROMEDRIVER === 'true') {
    if (!CHROMEDRIVER_BIN) {
      // Download pinned chromedriver.
      CHROMEDRIVER_BIN = spawnSync('node', [
        join('tools', 'install-browser.mjs'),
        '--chromedriver',
      ])
        .stdout.toString()
        .trim();
    }
  }

  // Need to pass valid CHANNEL to the command below
  CHANNEL = 'canary';
}

mkdirSync(LOG_DIR, {recursive: true});

let runParams;
if (CHROMEDRIVER === 'true') {
  runParams = {
    file: CHROMEDRIVER_BIN,
    args: [
      `--port=${PORT}`,
      `--bidi-mapper-path=${resolve(join('lib', 'iife', 'mapperTab.js'))}`,
      // `--log-path=${LOG_FILE}`,
      // `--append-log`,
      `--readable-timestamp`,
      ...(VERBOSE === 'true' ? ['--verbose', '--replayable'] : []),
    ],
    env: {},
  };
} else {
  runParams = {
    file: 'node',
    args: [
      resolve(join('lib', 'cjs', 'bidiServer', 'index.js')),
      `--channel`,
      CHANNEL,
      `--headless`,
      HEADLESS,
      `--verbose`,
      VERBOSE,
      ...process.argv.slice(2),
    ],
    env: {
      ...process.env,
      // keep-sorted start
      BROWSER_BIN,
      DEBUG,
      DEBUG_COLORS,
      DEBUG_DEPTH,
      NODE_OPTIONS,
      PORT,
      // keep-sorted end
      ...(VERBOSE === 'true' ? ['DEBUG=*', 'DEBUG_DEPTH=999'] : []),
    },
  };
}

log(`Starting ${CHROMEDRIVER === 'true' ? 'ChromeDriver' : 'Mapper'}...`);

if (VERBOSE === 'true') {
  log(`Environment variables: `, runParams.env);
  log(`Command: ${runParams.file} ${runParams.args.join(' ')}`);
}

const subprocess = spawn(runParams.file, runParams.args, {
  stdio: ['inherit', 'pipe', 'pipe'],
  env: runParams.env,
});

if (subprocess.stderr) {
  subprocess.stderr.pipe(process.stdout);
  subprocess.stderr.pipe(createWriteStream(LOG_FILE));
}

if (subprocess.stdout) {
  subprocess.stdout.pipe(process.stdout);
  subprocess.stdout.pipe(createWriteStream(LOG_FILE));
}

subprocess.on('exit', (status) => {
  process.exit(status || 0);
});
