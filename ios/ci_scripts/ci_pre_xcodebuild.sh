#!/bin/bash
set -ex

echo "Running pre-xcodebuild script"

# Print PATH for debugging
echo "PATH is: $PATH"

# Check Node.js availability
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js is not installed or not in PATH"
  exit 1
fi

# Print versions for debugging
node -v
npm -v
pod --version

# Go to ios directory
cd .. || { echo "Failed to cd to ios directory"; exit 1; }

# Install JS dependencies
npm ci || { echo "npm ci failed"; exit 1; }

# Install CocoaPods dependencies
pod install || { echo "pod install failed"; exit 1; }

echo "pre-xcodebuild script completed successfully"