#!/usr/bin/env bash
set -euo pipefail

# Script to stop and remove all PM2 processes and kill the PM2 daemon.
# Safe: prints a helpful message if `pm2` is not available.


if ! command -v pm2 >/dev/null 2>&1; then
  echo "pm2 not found. Install it globally with: npm i -g pm2"
  echo "Or run: npx pm2 kill"
  exit 0
fi

echo "Stopping pm2-webui if running..."
pm2 delete pm2-webui || true

echo "Stopping all PM2 processes..."
pm2 stop all || true

echo "Deleting all PM2 processes from process list..."
pm2 delete all || true

echo "Killing PM2 daemon..."
pm2 kill || true

echo "Flushing PM2 logs and metrics..."
pm2 flush || true

echo "PM2 processes terminated and daemon killed."
