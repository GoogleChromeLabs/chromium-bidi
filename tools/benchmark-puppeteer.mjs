#!/usr/bin/env node

/**
 * Copyright 2026 Google LLC.
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

import fs from 'fs';

import puppeteer from 'puppeteer';

import {
  calculateStats,
  printStats,
  printComparison,
  printCiComparison,
  RUNS,
  ITERATIONS_PER_RUN,
  WARMUP_ITERATIONS,
  BENCHMARK_HTML,
} from './benchmark-utils.mjs';
import {
  installAndGetChromePath,
  getBidiMapperPath,
} from './path-getter/path-getter.mjs';

async function runBenchmarkRun(launchOptions, chromePath, benchmark) {
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'shell',
    ...launchOptions,
  });

  try {
    const page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(BENCHMARK_HTML);

    // Warmup
    for (let i = 0; i < WARMUP_ITERATIONS; i++) {
      await benchmark.warmup(page, i);
    }

    // Measurement
    const latencies = [];
    for (let i = 0; i < ITERATIONS_PER_RUN; i++) {
      const start = performance.now();
      await benchmark.measure(page, i);
      const end = performance.now();
      latencies.push(end - start);
    }

    // Return all latencies for this run
    return latencies;
  } finally {
    await browser.close();
  }
}

const benchmarks = [
  {
    id: 'diff',
    name: 'Object Evaluation',
    warmup: async (page, i) => {
      await page.evaluate(
        (index, id) => {
          document.getElementById(id).innerText = `Warmup: ${index + 1}`;
        },
        i,
        'some-counter',
      );
    },
    measure: async (page, i) => {
      await page.evaluate(
        (index, id) => {
          // Change DOM.
          document.getElementById(id).innerText = `Iter: ${index + 1}`;
          // Return an object.
          return {
            iteration: index + 1,
            timestamp: Date.now(),
            someArray: [1, 2, 3],
            someObject: {a: 1, b: 2, c: 3},
            someString: 'hello',
            someNumber: 123,
            someBoolean: true,
            someNull: null,
            someUndefined: undefined,
          };
        },
        i,
        'some-counter',
      );
    },
  },
  {
    id: 'number',
    name: 'Number Evaluation',
    warmup: async (page) => {
      await page.evaluate(() => 1);
    },
    measure: async (page) => {
      await page.evaluate(() => 1);
    },
  },
  {
    id: 'nodes',
    name: '100 Nodes Evaluation',
    warmup: async (page) => {
      await page.evaluate(() => {
        let container = document.getElementById('container');
        if (!container) {
          container = document.createElement('div');
          container.id = 'container';
          document.body.appendChild(container);
        }
        container.innerHTML = '';
        for (let i = 0; i < 100; i++) {
          const node = document.createElement('div');
          node.innerText = `Node ${i}`;
          container.appendChild(node);
        }
      });
    },
    measure: async (page) => {
      await page.evaluate(() => {
        return Array.from(document.querySelectorAll('#container > div'));
      });
    },
  },
];

async function main() {
  // Verify if we are using the linked version of chromium-bidi.
  // Puppeteer installs chromium-bidi as a dependency in its own node_modules.
  // Node.js module resolution looks for the closest node_modules first, so it
  // will pick up the nested version instead of our `npm link`ed version in the root.
  // We remove the nested dependency to force Puppeteer to look up the tree
  // and discover the linked version in the root.
  const nestedChromiumBidiPaths = [
    'node_modules/puppeteer-core/node_modules/chromium-bidi',
    'node_modules/puppeteer/node_modules/chromium-bidi',
  ];
  for (const nestedChromiumBidiPath of nestedChromiumBidiPaths) {
    if (fs.existsSync(nestedChromiumBidiPath)) {
      console.log(
        `Removing nested chromium-bidi dependency at ${nestedChromiumBidiPath} to use linked version...`,
      );
      fs.rmSync(nestedChromiumBidiPath, {recursive: true, force: true});
    }
  }

  const chromePath = installAndGetChromePath(true);
  const bidiMapperPath = getBidiMapperPath();
  console.log(`Using Chrome: ${chromePath}`);
  console.log(`Using BiDi Mapper: ${bidiMapperPath}`);
  console.log(
    `Starting Benchmark: ${RUNS} runs x ${ITERATIONS_PER_RUN} iterations...`,
  );

  for (const benchmark of benchmarks) {
    console.log(`\nRunning Benchmark: ${benchmark.name}`);
    const stats = {
      cdp: [],
      bidi: [],
    };

    for (let i = 0; i < RUNS; i++) {
      process.stdout.write(`Run ${i + 1}/${RUNS}: `);

      // Run CDP.
      process.stdout.write(`running CDP... `);
      const cdpLatencies = await runBenchmarkRun({}, chromePath, benchmark);
      stats.cdp.push(...cdpLatencies);

      process.stdout.write(`running BiDi... `);
      const bidiLatencies = await runBenchmarkRun(
        {protocol: 'webDriverBiDi'},
        chromePath,
        benchmark,
      );
      stats.bidi.push(...bidiLatencies);

      console.log('Done.');
    }

    const cdpFinal = calculateStats(stats.cdp);
    const bidiFinal = calculateStats(stats.bidi);

    console.log(`\n=== Results: ${benchmark.name} (Mean of Runs) ===`);
    printStats('Puppeteer CDP', cdpFinal);
    printStats('Puppeteer BiDi', bidiFinal);

    // Comparisons
    console.log(`\n=== Comparison: ${benchmark.name} (BiDi vs CDP) ===`);
    printComparison(bidiFinal, cdpFinal);

    // Print metrics to the file for CI.
    // Use benchmark.id as the prefix for the metrics
    printCiComparison(benchmark.id, bidiFinal, cdpFinal, 'puppeteer');
  }
}

await main();
