#!/bin/bash
set -e
echo "Running pre-xcodebuild script"
cd "$(dirname "$0")/../ios"
npm ci
pod install
