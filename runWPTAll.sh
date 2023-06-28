#!/bin/bash
# shellcheck disable=SC2155

set -uo pipefail
HEADLESS=false exec npm run wpt -- "$@"
HEADLESS=true exec npm run wpt -- "$@"
CHROMEDRIVER=true exec npm run wpt -- "$@"
