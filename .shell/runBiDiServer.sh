#!/bin/sh

# Go to the project root folder.
cd "$(dirname $0)/.."

NODE_OPTIONS="--unhandled-rejections=strict" \
DEBUG=* \
npm run bidi-server -- "$@"
