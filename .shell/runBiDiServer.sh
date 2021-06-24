#!/bin/sh

# Get location of the script.
SCRIPT=$(readlink -f $0)
SCRIPTPATH=`dirname $SCRIPT`

cd $SCRIPTPATH/..

NODE_OPTIONS="--unhandled-rejections=strict" \
DEBUG=* \
npm run bidi-server -- $@ 2>&1 | tee log.txt
