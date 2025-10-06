#!/bin/bash
set -ex

echo "Running pre-xcodebuild script"

# Try to find node
if command -v node >/dev/null 2>&1; then
  NODE_BIN=$(command -v node)
elif [ -x /usr/local/bin/node ]; then
  NODE_BIN=/usr/local/bin/node
elif [ -x /opt/homebrew/bin/node ]; then
  NODE_BIN=/opt/homebrew/bin/node
else
  echo "ERROR: Node.js is not installed or not in PATH"
  exit 1
fi

$NODE_BIN -v

# Use npm from the same location as node
NPM_BIN=$(dirname $NODE_BIN)/npm
$NPM_BIN ci || { echo "npm ci failed"; exit 1; }

cd .. || { echo "Failed to cd to ios directory"; exit 1; }
pod install || { echo "pod install failed"; exit 1; }

echo "pre-xcodebuild script completed successfully"