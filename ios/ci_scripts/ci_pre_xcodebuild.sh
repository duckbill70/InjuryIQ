
#!/bin/bash
set -ex

echo "Running pre-xcodebuild script"

# Move to the repo root (assuming script is at ios/ci_scripts)
cd "$(git rev-parse --show-toplevel)"

# Install JS dependencies
npm ci || { echo "npm ci failed"; exit 1; }

# Move to ios directory
cd ios || { echo "Failed to cd to ios directory"; exit 1; }

# Install CocoaPods dependencies
pod install || { echo "pod install failed"; exit 1; }

echo "pre-xcodebuild script completed successfully"