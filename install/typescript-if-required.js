/**
 * Copyright 2021 Google Inc. All rights reserved.
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
// Copied from Puppeteer

const child_process = require('child_process');
const path = require('path');
const fs = require('fs');
const pkgDir = require('pkg-dir');
const { promisify } = require('util');

const exec = promisify(child_process.exec);
const fsAccess = promisify(fs.access);

const fileExists = async (filePath) =>
  fsAccess(filePath)
    .then(() => true)
    .catch(() => false);

async function compileTypeScript() {
  return exec('npm run build').catch((error) => {
    console.error('Error running TypeScript', error);
    process.exit(1);
  });
}

async function compileTypeScriptIfRequired() {
  const libPath = path.join(pkgDir.sync(__dirname), './src/.build/node');
  const libExists = await fileExists(libPath);
  if (libExists) return;

  console.log('Chromium BiDi:', 'Compiling TypeScript...');
  await compileTypeScript();
}

module.exports = compileTypeScriptIfRequired;
