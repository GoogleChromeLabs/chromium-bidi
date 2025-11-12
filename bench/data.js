window.BENCHMARK_DATA = {
  "lastUpdate": 1762944821346,
  "repoUrl": "https://github.com/GoogleChromeLabs/chromium-bidi",
  "entries": {
    "Benchmark": [
      {
        "commit": {
          "author": {
            "email": "69349599+sadym-chromium@users.noreply.github.com",
            "name": "Maksim Sadym",
            "username": "sadym-chromium"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "6f321e470e1c09fb9e76501b512fffa9579f55c2",
          "message": "chore: publish performance data to gh-pages (#3907)\n\n* Use `benchmark-action/github-action-benchmark@v1` to automate perf\nmetric storage and deployment.\n* Switch repo's GitHub Pages to deployment from branch `gh-pages`.\nRequired, as now there are 2 sources of information for gh-pages (WPT +\nperformance).\n* Update WPT report to override `wpt/index.html` and\n`wpt/wptreport-2023.html` in `gh-pages` branch.\n* Add `index.html` with links to the perf metrics and to the WPT reports\nthe root of `gh-pages` branch.\n* Example perf page: https://googlechromelabs.github.io/chromium-bidi/bench/index.html",
          "timestamp": "2025-11-12T11:51:40+01:00",
          "tree_id": "5a4b10876769f1243ce6f58636ff03633a086cc6",
          "url": "https://github.com/GoogleChromeLabs/chromium-bidi/commit/6f321e470e1c09fb9e76501b512fffa9579f55c2"
        },
        "date": 1762944820291,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "ubuntu-latest-new-headless-node:test_performance_screenshot",
            "value": 165.2696132659912,
            "unit": "ms"
          },
          {
            "name": "macos-latest-new-headless-cd:test_performance_screenshot",
            "value": 1697.815179824829,
            "unit": "ms"
          },
          {
            "name": "macos-latest-headful-node:test_performance_screenshot",
            "value": 1773.7640380859375,
            "unit": "ms"
          },
          {
            "name": "macos-latest-headful-cd:test_performance_screenshot",
            "value": 3422.404956817627,
            "unit": "ms"
          },
          {
            "name": "ubuntu-latest-old-headless-node:test_performance_screenshot",
            "value": 278.86343002319336,
            "unit": "ms"
          },
          {
            "name": "macos-latest-old-headless-cd:test_performance_screenshot",
            "value": 234.27166938781738,
            "unit": "ms"
          },
          {
            "name": "macos-latest-old-headless-node:test_performance_screenshot",
            "value": 204.82916831970215,
            "unit": "ms"
          },
          {
            "name": "ubuntu-latest-new-headless-cd:test_performance_screenshot",
            "value": 184.76476669311523,
            "unit": "ms"
          },
          {
            "name": "ubuntu-latest-old-headless-cd:test_performance_screenshot",
            "value": 284.848690032959,
            "unit": "ms"
          }
        ]
      }
    ]
  }
}