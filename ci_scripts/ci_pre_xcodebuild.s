#!/bin/bash
set -e
echo "Running pre-xcodebuild script"
# Added comment to force refresh
cd "$(dirname "$0")/../ios"
npm ci
pod install