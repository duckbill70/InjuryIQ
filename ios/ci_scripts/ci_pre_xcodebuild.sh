#!/bin/bash
set -ex

echo "Running pre-xcodebuild script"

cd ..
pod install || { echo "pod install failed"; exit 1; }

echo "pre-xcodebuild script completed successfully"