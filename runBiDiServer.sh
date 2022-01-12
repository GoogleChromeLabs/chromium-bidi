#!/bin/sh

# Go to the project root folder.
cd "$(dirname $0)/"

NODE_OPTIONS="--unhandled-rejections=strict" \
DEBUG=* \
npm run server-no-build -- "$@" 2>&1 | tee -a log.txt
