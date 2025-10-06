#!/bin/bash
set -ex

echo "Running pre-xcodebuild script"

# Go to repo root (one level up from ios/ci_scripts)
cd "/../.."

# Install JS dependencies
npm ci || { echo "npm ci failed"; exit 1; }

# Go to ios directory
cd ios || { echo "Failed to cd to ios directory"; exit 1; }

# Install CocoaPods dependencies
pod install || { echo "pod install failed"; exit 1; }

echo "pre-xcodebuild script completed successfully"