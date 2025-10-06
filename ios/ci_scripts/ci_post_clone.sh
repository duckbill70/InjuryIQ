#!/bin/bash
set -ex

echo "Running post-clone script"

cd "$(git rev-parse --show-toplevel)"
npm ci || { echo "npm ci failed"; exit 1; }

echo "post-clone script completed successfully"
