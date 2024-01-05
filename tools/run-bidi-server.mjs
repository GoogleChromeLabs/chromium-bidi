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
import {parseArgs} from 'node:util';
import {basename, join, resolve} from 'path';

import {packageDirectorySync} from 'pkg-dir';

// Changing the current work directory to the package directory.
process.chdir(packageDirectorySync());

function log(message) {
  // eslint-disable-next-line no-console
  console.log(`(${basename(process.argv[1])}) ${message}`);
}

const {values: argv} = parseArgs({
  options: {
    headful: {
      type: 'boolean',
      default: process.env.HEADLESS !== 'true',
    },
    help: {
      type: 'boolean',
      short: 'h',
      default: false,
    },
  },
});

let BROWSER_BIN = process.env.BROWSER_BIN;
let CHANNEL = process.env.CHANNEL || 'local';
if (CHANNEL === 'local') {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  BROWSER_BIN = spawnSync('node', [join('tools', 'install-browser.mjs')])
    .stdout.toString()
    .trim();
  // Need to pass valid CHANNEL to the command below
  CHANNEL = 'canary';
}

const env = {
  // Default values
  DEBUG: 'bidi:*',
  DEBUG_COLORS: 'false',
  DEBUG_DEPTH: '10',
  LOG_DIR: 'logs',

  NODE_OPTIONS: '--unhandled-rejections=strict',
  PORT: '8080',
  BROWSER_BIN,
  ...process.env,
};
env.LOG_FILE = join(
  env.LOG_DIR,
  `${new Date().toISOString().replace(/[:]/g, '-')}.log`
);

log(`Starting BiDi Server with DEBUG='${env.DEBUG}'...`);

mkdirSync(env.LOG_DIR, {recursive: true});

const subprocess = spawn(
  'node',
  [
    resolve(join('lib', 'cjs', 'bidiServer', 'index.js')),
    `--channel`,
    CHANNEL,
    argv.headful ? `--headful` : '',
  ],
  {
    stdio: ['inherit', 'pipe', 'pipe'],
    env,
  }
);

if (subprocess.stderr) {
  subprocess.stderr.pipe(process.stdout);
  subprocess.stderr.pipe(createWriteStream(env.LOG_FILE));
}

if (subprocess.stdout) {
  subprocess.stdout.pipe(process.stdout);
  subprocess.stdout.pipe(createWriteStream(env.LOG_FILE));
}

subprocess.on('exit', (status) => {
  process.exit(status || 0);
});
