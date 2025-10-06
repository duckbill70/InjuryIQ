#!/bin/sh

#  ci_pre_xcodebuild.sh
#  InjuryIQ
#
#  Created by Platts Andrew on 06/10/2025.
#

set -ex

echo "Running pre-xcodebuild script"

# Print versions for debugging
node -v || { echo "Node.js not found"; exit 1; }
npm -v || { echo "npm not found"; exit 1; }
pod --version || { echo "CocoaPods not found"; exit 1; }

# Go to ios directory
cd "$(dirname "$0")/../ios" || { echo "Failed to cd to ios directory"; exit 1; }

# Install JS dependencies
npm ci || { echo "npm ci failed"; exit 1; }

# Install CocoaPods dependencies
pod install || { echo "pod install failed"; exit 1; }

echo "pre-xcodebuild script completed successfully"
