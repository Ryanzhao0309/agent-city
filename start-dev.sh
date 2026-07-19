#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
  if [[ -n "${WEB_PID:-}" ]]; then
    kill "$WEB_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

echo "Starting Agent City API on http://localhost:3000"
cd "$ROOT_DIR/apps/server"
npm run dev &
SERVER_PID=$!

echo "Starting Agent City web on http://localhost:5173"
cd "$ROOT_DIR/apps/web"
npm run dev &
WEB_PID=$!

echo ""
echo "Agent City is starting."
echo "Open http://localhost:5173/"
echo "Press Ctrl+C to stop both services."

wait
