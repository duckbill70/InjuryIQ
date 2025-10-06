#!/bin/bash
set -e
cd "$(dirname "$0")/../ios"
npm ci
pod install
