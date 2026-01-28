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

import {
  Builder,
  ScriptManager,
} from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

import {
  installAndGetChromePath,
  installAndGetChromeDriverPath,
  getBidiMapperPath,
} from './path-getter/path-getter.mjs';

const RUNS = parseInt(process.env.RUNS) || 100;
const ITERATIONS_PER_RUN = parseInt(process.env.ITERATIONS) || 100;
const WARMUP_ITERATIONS = Math.max(2, 0.1 * ITERATIONS_PER_RUN);
const T_CRIT_95_LARGE_N = 1.96;

const BENCHMARK_HTML = `
<div style='font-family:Segoe UI, sans-serif; padding:20px; background:#f4f7f6;'>
  <h2>Protocol Benchmark</h2>
  <div style='display:flex; gap:15px;'>
    <div id='some-box' style='flex:1; padding:15px; background:white; border-left:5px solid #3498db;'>
      Some counter<div id='some-counter' style='font-size:24px;'>0</div><div id='some-res'>-</div>
    </div>
  </div>
</div>`;

/**
 * Calculates the Standard Error for a specific percentile using rank-based confidence intervals.
 * @param {number[]} sortedLatencies
 * @param {number} percentile (between 0 and 1, e.g., 0.1 for P10, 0.5 for Median)
 * @returns {number} The estimated Standard Error.
 */
function calculateRankBasedStandardError(sortedLatencies, percentile) {
  const count = sortedLatencies.length;
  // Standard Error of the Index
  const seIndex = Math.sqrt(count * percentile * (1 - percentile));

  // 95% Confidence Interval Indices
  let lowerIndex = Math.floor(count * percentile - T_CRIT_95_LARGE_N * seIndex);
  let upperIndex = Math.ceil(count * percentile + T_CRIT_95_LARGE_N * seIndex);

  // Clamp indices to valid range.
  lowerIndex = Math.max(0, lowerIndex);
  upperIndex = Math.min(count - 1, upperIndex);

  const lowerValue = sortedLatencies[lowerIndex];
  const upperValue = sortedLatencies[upperIndex];

  // Approximate Standard Error: (Upper - Lower) / (2 * Z)
  return (upperValue - lowerValue) / (2 * T_CRIT_95_LARGE_N);
}

/**
 * Calculates statistical metrics for a set of benchmark run means.
 */
function calculateStats(latencies) {
  latencies.sort((a, b) => a - b);
  const count = latencies.length;
  const totalSum = latencies.reduce((sum, val) => sum + val, 0);

  const mean = totalSum / count;
  const min = latencies[0];
  const max = latencies[count - 1];
  const median = latencies[Math.floor(count * 0.5)];
  const p10 = latencies[Math.floor(count * 0.1)];
  const p90 = latencies[Math.floor(count * 0.9)];

  const variance =
    latencies.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
    (count - 1);
  const stdDev = Math.sqrt(variance);
  const rsd = (stdDev / mean) * 100;
  const standardErrorMean = stdDev / Math.sqrt(count);
  const tCrit = T_CRIT_95_LARGE_N;
  const marginOfErrorMean = tCrit * standardErrorMean;
  const ciRsdMean = (marginOfErrorMean / mean) * 100;

  const standardErrorMedian = calculateRankBasedStandardError(latencies, 0.5);
  const marginOfErrorMedian = tCrit * standardErrorMedian;
  const ciRsdMedian = (marginOfErrorMedian / median) * 100;

  const standardErrorP10 = calculateRankBasedStandardError(latencies, 0.1);
  const marginOfErrorP10 = tCrit * standardErrorP10;
  const ciRsdP10 = (marginOfErrorP10 / p10) * 100;

  const standardErrorP90 = calculateRankBasedStandardError(latencies, 0.9);
  const marginOfErrorP90 = tCrit * standardErrorP90;
  const ciRsdP90 = (marginOfErrorP90 / p90) * 100;

  return {
    mean,
    median,
    min,
    max,
    stdDev,
    rsd,
    standardErrorMean,
    marginOfErrorMean,
    ciRsdMean,
    standardErrorMedian,
    marginOfErrorMedian,
    ciRsdMedian,
    p10,
    standardErrorP10,
    marginOfErrorP10,
    ciRsdP10,
    p90,
    standardErrorP90,
    marginOfErrorP90,
    ciRsdP90,
  };
}

async function runIteration(mode, i, context, benchmarkAction) {
  const script = `(${benchmarkAction.toString()})(${i}, 'some-counter')`;
  if (mode === 'classic') {
    await context.driver.executeScript(script);
    // await context.driver.executeScript(benchmarkAction, i, 'some-counter');
  } else if (mode === 'cdp') {
    await context.cdpSession.send('Runtime.evaluate', {
      expression: script,
      serializationOptions: {serialization: 'deep'},
    });
  } else if (mode === 'bidi') {
    await context.scriptManager.callFunctionInBrowsingContext(
      context.bidiContextId,
      script,
      false, // awaitPromise
    );
  }
}

async function runBenchmarkRun(mode, chromePath, chromeDriverPath, bidiMapperPath) {
  const service = new chrome.ServiceBuilder(chromeDriverPath).addArguments(
    `--bidi-mapper-path=${bidiMapperPath}`,
  );

  const options = new chrome.Options()
    .setChromeBinaryPath(chromePath)
    .addArguments('--headless=new');

  if (mode === 'bidi') {
    options.enableBidi();
  }

  const driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .setChromeService(service)
    .build();

  try {
    let bidiContextId;
    let cdpSession;
    let scriptManager;

    if (mode === 'cdp') {
      cdpSession = await driver.createCDPConnection('page');
    } else if (mode === 'bidi') {
      bidiContextId = await driver.getWindowHandle();
      scriptManager = await ScriptManager(bidiContextId, driver);
    }

    const url = 'data:text/html,' + encodeURIComponent(BENCHMARK_HTML);
    await driver.get(url);

    const benchmarkAction = (index, id) => {
      document.getElementById(id).innerText = 'Iter: ' + (index + 1);
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
    };

    // Warmup.
    for (let i = 0; i < WARMUP_ITERATIONS; i++) {
        await runIteration(mode, i, {driver, cdpSession, scriptManager, bidiContextId}, benchmarkAction);
    }

    const latencies = [];
    for (let i = 0; i < ITERATIONS_PER_RUN; i++) {
      const start = performance.now();
      await runIteration(mode, i, {driver, cdpSession, scriptManager, bidiContextId}, benchmarkAction);
      const end = performance.now();
      latencies.push(end - start);
    }
    return latencies;
  } finally {
    await driver.quit();
  }
}

async function main() {
  const chromePath = installAndGetChromePath();
  const chromeDriverPath = installAndGetChromeDriverPath();
  const bidiMapperPath = getBidiMapperPath();

  console.log(`Using Chrome: ${chromePath}`);
  console.log(`Using ChromeDriver: ${chromeDriverPath}`);
  console.log(`Using BiDi Mapper: ${bidiMapperPath}`);
  
  console.log(
    `Starting Benchmark: ${RUNS} runs x ${ITERATIONS_PER_RUN} iterations...`,
  );

  const stats = {
    cdp: [],
    classic: [],
    bidi: [],
  };

  for (let i = 0; i < RUNS; i++) {
    process.stdout.write(`Run ${i + 1}/${RUNS}: `);

    // Run Classic
    process.stdout.write(`running Classic... `);
    const classicLatencies = await runBenchmarkRun('classic', chromePath, chromeDriverPath, bidiMapperPath);
    stats.classic.push(...classicLatencies);

    // Run CDP
    process.stdout.write(`running CDP... `);
    const cdpLatencies = await runBenchmarkRun('cdp', chromePath, chromeDriverPath, bidiMapperPath);
    stats.cdp.push(...cdpLatencies);

    // Run BiDi
    process.stdout.write(`running BiDi... `);
    const bidiLatencies = await runBenchmarkRun('bidi', chromePath, chromeDriverPath, bidiMapperPath);
    stats.bidi.push(...bidiLatencies);

    console.log('Done.');
  }

  const classicFinal = calculateStats(stats.classic);
  const cdpFinal = calculateStats(stats.cdp);
  const bidiFinal = calculateStats(stats.bidi);

  console.log('\n=== Results (Mean of Runs) ===');
  const printStats = (name, final) => {
      console.log(`${name}:`);
      console.log(
        `  Mean: ${final.mean.toFixed(4)}ms ±${final.marginOfErrorMean.toFixed(4)}ms (±${final.ciRsdMean.toFixed(2)}%)`,
      );
      console.log(
        `  Median: ${final.median.toFixed(4)}ms ±${final.marginOfErrorMedian.toFixed(4)}ms (±${final.ciRsdMedian.toFixed(2)}%)`,
      );
  };
  
  printStats('Selenium Classic', classicFinal);
  printStats('Selenium CDP', cdpFinal);
  printStats('Selenium BiDi', bidiFinal);

  // Comparisons
  console.log('\n=== Comparison (Classic vs CDP) ===');
  printComparison(classicFinal, cdpFinal);

  console.log('\n=== Comparison (BiDi vs CDP) ===');
  printComparison(bidiFinal, cdpFinal);

  // Print CI metrics
  console.log('\n=== CI output ===');
  printCiComparison('CLASSIC_VS_CDP', classicFinal, cdpFinal);
  printCiComparison('BIDI_VS_CDP', bidiFinal, cdpFinal);
}

function printCiComparison(prefix, final, baseline) {
  const printMetric = (name, finalValue, baselineValue, finalSe, baselineSe) => {
    const diffAbs = finalValue - baselineValue;
    const diffRel = (diffAbs / baselineValue) * 100;
    const diffSe = Math.sqrt(Math.pow(finalSe, 2) + Math.pow(baselineSe, 2));
    const diffMoe = diffSe * T_CRIT_95_LARGE_N;
    const diffRelMoe = (diffMoe / baselineValue) * 100;

    console.log(`PERF_METRIC:SELENIUM_${prefix}_${name}_REL:VALUE:${diffRel.toFixed(4)}`);
    console.log(`PERF_METRIC:SELENIUM_${prefix}_${name}_REL:RANGE:${diffRelMoe.toFixed(4)}`);
  };

  printMetric(
    'MEAN',
    final.mean,
    baseline.mean,
    final.standardErrorMean,
    baseline.standardErrorMean,
  );
  printMetric(
    'MEDIAN',
    final.median,
    baseline.median,
    final.standardErrorMedian,
    baseline.standardErrorMedian,
  );
  printMetric(
    'P10',
    final.p10,
    baseline.p10,
    final.standardErrorP10,
    baseline.standardErrorP10,
  );
}

function printComparison(bidiFinal, baselineFinal) {
  const meanDiffAbs = bidiFinal.mean - baselineFinal.mean;
  const meanDiffRel = (meanDiffAbs / baselineFinal.mean) * 100;
  const meanDiffStandardError = Math.sqrt(
    Math.pow(baselineFinal.standardErrorMean, 2) +
      Math.pow(bidiFinal.standardErrorMean, 2),
  );
  const meanDiffAbsMoe = meanDiffStandardError * T_CRIT_95_LARGE_N;
  const meanDiffRelMoe = (meanDiffAbsMoe / baselineFinal.mean) * 100;

  const medianDiffAbs = bidiFinal.median - baselineFinal.median;
  const medianDiffRel = (medianDiffAbs / baselineFinal.median) * 100;
  const medianDiffStandardError = Math.sqrt(
    Math.pow(baselineFinal.standardErrorMedian, 2) +
      Math.pow(bidiFinal.standardErrorMedian, 2),
  );
  const medianDiffAbsMoe = medianDiffStandardError * T_CRIT_95_LARGE_N;
  const medianDiffRelMoe = (medianDiffAbsMoe / baselineFinal.median) * 100;

  console.log(
    `  Mean:   ${meanDiffRel.toFixed(2)}% ±${meanDiffRelMoe.toFixed(2)}% / ${meanDiffAbs.toFixed(4)}ms ±${meanDiffAbsMoe.toFixed(4)}ms`,
  );
  console.log(
    `  Median: ${medianDiffRel.toFixed(2)}% ±${medianDiffRelMoe.toFixed(2)}% / ${medianDiffAbs.toFixed(4)}ms ±${medianDiffAbsMoe.toFixed(4)}ms`,
  );
}

await main();
