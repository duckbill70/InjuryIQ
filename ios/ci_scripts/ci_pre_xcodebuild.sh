#!/bin/sh

#  ci_pre_xcodebuild.sh
#  InjuryIQ
#
#  Created by Platts Andrew on 06/10/2025.
#

set -ex

echo "Running pre-xcodebuild script"

cd ..

pod install || { echo "pod install failed"; exit 1; }

echo "pre-xcodebuild script completed successfully"