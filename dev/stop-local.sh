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

# Anything still holding the preview ports (e.g. left over from a session
# that was restarted) would make the next start silently reuse a stale
# server, so free them too.
for port in 5000 5173 5174; do
  if command -v fuser >/dev/null 2>&1; then
    fuser -k -TERM "$port/tcp" >/dev/null 2>&1 && echo "freed port $port"
  elif command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null)"
    [ -n "$pids" ] && kill $pids 2>/dev/null && echo "freed port $port"
  fi
done
