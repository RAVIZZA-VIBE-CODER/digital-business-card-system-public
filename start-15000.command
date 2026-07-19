#!/bin/zsh
set -euo pipefail

cd /Users/tommasoressia/Desktop/digital-business-card-system
export PORT=15000

echo "Starting digital-business-card-system on http://localhost:15000"
echo "Keep this window open while previewing."
echo

npm run dev
