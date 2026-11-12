#!/bin/zsh
cd "$(dirname "$0")"
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

# 1. Start the Speakly Backend server quietly if not already running
if ! curl -s http://localhost:8787/health >/dev/null 2>&1; then
  echo "Starting Speakly Backend Server..."
  (cd ../backend && nohup node server.js >/tmp/speakly-backend.log 2>&1 &)
  sleep 1
fi

# 2. Start the Speakly Desktop App
nohup npm start >/tmp/speakly.log 2>&1 &
disown

osascript -e 'display notification "Speakly & AI Engine are active in your Menu Bar." with title "Speakly Started 🐥"' >/dev/null 2>&1 || true
exit 0
