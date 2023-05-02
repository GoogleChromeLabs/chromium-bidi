#!/bin/bash
set -euo pipefail

LOCAL="$(npm list devtools-protocol | grep devtools-protocol | cut -d "@" -f2)"
REMOTE="$(npx npm-remote-ls puppeteer@latest | grep devtools-protocol | cut -d "@" -f2)"

if [[ "$LOCAL" != "$REMOTE" ]]; then
    echo "devtools-protocol version ($LOCAL) does not match the one in puppeteer ($REMOTE)"
    exit 1
fi
