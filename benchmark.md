# Performance Benchmarks for Chromium-BiDi

Dashboard: https://googlechromelabs.github.io/chromium-bidi/bench/index.html.

This document outlines the performance benchmarking infrastructure for chromium-bidi. Metrics are collected to better understand the protocol's overhead and stability.

Benchmarks run on GitHub Actions via the headless shell (to minimize latency and noise from Chrome itself) and are published automatically to the dashboard upon every PR merge.

## Puppeteer: BiDi Mode vs. CDP Mode

This benchmark compares Puppeteer running in BiDi mode against standard CDP mode.

### Methodology

Identical script evaluations (involving some serialization) are run in both modes. For each mode, the browser is launched X times and scripts are evaluated Y times per launch, measuring the performance of each individual execution to ensure granular data collection.

To ensure long-term consistency and minimize noise from external dependency updates, these tests are run using a **fixed version of Puppeteer** (currently v24.36.0) against the **current chromium-bidi revision**. This allows performance changes to be attributed directly to internal logic rather than changes in the automation library.

### The Goal

Because Puppeteer in BiDi mode essentially translates commands into CDP calls, the performance difference between these two modes serves as a proxy for BiDi's overhead. The ultimate objective is to achieve a 0% performance delta, ensuring BiDi performs identically to CDP. While reaching this parity is ambitious, the goal is to minimize the overhead as much as possible.

## Selenium: Protocol Comparison

Script execution is evaluated across three different configurations:

  - Raw CDP
  - WebDriver Classic
  - WebDriver BiDi

### Methodology

Similar to the Puppeteer benchmark, the tests are executed via chromedriver, which is the standard communication path for Selenium with Chromium. For each configuration, X browser launches are performed and scripts are evaluated Y times per launch to gather granular performance data.

## E2E Benchmark

Metrics with the `e2e-` prefix are derived from E2E tests in the
[`tests/performance`](tests/performance)
folder. They measure the absolute time, so they are more sensitive to hardware
fluctuations.

## Dashboard Data

To provide more insightful data beyond simple averages, the reporting page includes *Median* and *P10* values alongside the *Mean*. This assists in identifying regression trends even when outliers skew the average. Specifically, the P10 metric was chosen because it represents the "ideal" scenario, effectively filtering out noise from local flakes or system-level jitter. This is especially important for running tests in GitHub Actions. This value should stay close to the theoretical minimum time required for an operation to perform, providing a clear baseline of the protocol's peak efficiency.

## Mathematics

To ensure statistical rigor, error margins are calculated for all metrics.

### Standard Error for the Mean

The standard formula for the Standard Error (SE) of the mean is used:

`SE_mean = StdDev / sqrt(N)`

Where `StdDev` is the standard deviation and `N` is the sample size. The 95% Margin of Error (MOE) is calculated as `1.96 * SE_mean`.

### Standard Error for Percentiles (Median & P10)

Calculating the standard error for percentiles is non-trivial compared to the mean. A **distribution-free Rank-Based** method is used.

1.  **Calculate the Standard Error of the Rank (Index):**
    `SE_index = sqrt(N * p * (1 - p))` Where `p` is the percentile (e.g., 0.5 for Median, 0.1 for P10).

2.  **Determine the 95% Confidence Interval Indices:**
    `Index_lower = floor(N * p - 1.96 * SE_index)`
    `Index_upper = ceil(N * p + 1.96 * SE_index)`

3.  **Estimate the Standard Error of the Value:**
    `SE_percentile ≈ (Value[Index_upper] - Value[Index_lower]) / (2 * 1.96)`

This method estimates the width of the confidence interval around the percentile and derives the SE from that width.

### Standard Error for Relative Difference

When comparing two runs (e.g., BiDi vs. CDP), they are treated as independent samples to calculate the margin of error of their difference.

1.  **Standard Error of the Difference:**
    `SE_diff = sqrt(SE_final^2 + SE_baseline^2)`
    Where `SE_final` and `SE_baseline` are the standard errors of the respective metric (Mean, Median, or P10) being compared.

2.  **Margin of Error for the Difference:** `MOE_diff = 1.96 * SE_diff`

3.  **Relative Margin of Error (Percentage):**
    `MOE_rel% = (MOE_diff / Value_baseline) * 100`
    Where `Value_baseline` is the baseline value (e.g., the Mean of CDP) being used as a reference.

## Running Benchmarks Locally

### Preparation

Ensure you have installed the project dependencies and built the project:

```bash
npm install
npm run build
```

### Puppeteer Benchmark

To run the Puppeteer benchmark locally:

```bash
npm install puppeteer@24.36.0
npm link
npm link chromium-bidi
node tools/benchmark-puppeteer.mjs
```

You can customize the number of runs and iterations using `--runs` and `--iterations`
arguments:
```bash
node tools/benchmark-puppeteer.mjs --runs=5 --iterations=100
```

### Selenium Benchmark

To run the Selenium benchmark:
```bash
node tools/benchmark-selenium.mjs
```

Similar to the Puppeteer benchmark, you can use `--runs` and `--iterations` arguments:
```bash
node tools/benchmark-selenium.mjs --runs=5 --iterations=100
```

### E2E Benchmark

Run the e2e tests with the `-rP` option to get the performance metrics in the output:

```bash
PYTEST_ADDOPTS="-rP" npm run e2e -- tests/performance | grep "PERF_METRIC"
```
