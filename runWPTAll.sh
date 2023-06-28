#!/bin/bash
# shellcheck disable=SC2155

set -uo pipefail

trap ctrl_c INT
ctrl_c() {
    exit 1
}

export LOG_FILE="logs/$(basename "$0").log"
export UPDATE_EXPECTATIONS="${UPDATE_EXPECTATIONS:-false}"

for test in "$@"; do
    test="${test//wpt-metadata\//}"
    test="${test//mapper\/headless\//}"
    test="${test//mapper\/headful\//}"
    test="${test//chromedriver\/headless\//}"
    test="${test//.ini/}"

    CHROMEDRIVER=true npm run wpt -- "$test"
    HEADLESS=false npm run wpt -- "$test"
    HEADLESS=true npm run wpt -- "$test"
done

# Grep for errors if $LOG is set.
[[ -n "$LOG" ]] && [[ -r "$LOG_FILE" ]] && less -p error "$LOG_FILE"
