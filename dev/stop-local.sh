#!/bin/bash
# Stops everything dev/start-local.sh started.
RUN="$(cd "$(dirname "$0")" && pwd)/.run"
for pidfile in "$RUN"/*.pid; do
  [ -e "$pidfile" ] || continue
  pid="$(cat "$pidfile")"
  # Each service was started as its own process tree (npm → vite, dotnet run → app).
  pkill -TERM -P "$pid" 2>/dev/null
  kill "$pid" 2>/dev/null && echo "stopped $(basename "$pidfile" .pid)"
  rm -f "$pidfile"
done
