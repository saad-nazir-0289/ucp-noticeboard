#!/bin/bash
# Starts the whole system locally with demo data, for previewing changes:
#
#   Backend API     http://localhost:5000   (Swagger at /swagger)
#   PWA             http://localhost:5173
#   Mock portal     http://localhost:5174   (the extension, injected into a
#                                            stand-in UCP dashboard)
#
# Uses its own database (ucp_preview), never the production one; nothing
# here talks to production. Needs a local PostgreSQL (the cloud session
# hook provides one) reachable with UCP_LOCAL_POSTGRES_* below.
#
#   dev/start-local.sh           start (keeps existing preview data)
#   dev/start-local.sh --reset   wipe ucp_preview first, for fresh demo data
#   dev/stop-local.sh            stop everything
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUN="$ROOT/dev/.run"
mkdir -p "$RUN"

PG_HOST="${UCP_LOCAL_POSTGRES_HOST:-localhost}"
PG_USER="${UCP_LOCAL_POSTGRES_USER:-postgres}"
PG_PASSWORD="${UCP_LOCAL_POSTGRES_PASSWORD:-postgres}"
PG_DB="ucp_preview"

"$ROOT/dev/stop-local.sh" >/dev/null 2>&1 || true

if command -v pg_ctlcluster >/dev/null 2>&1; then
  pg_ctlcluster "$(ls /usr/lib/postgresql | sort -n | tail -1)" main start 2>/dev/null || true
fi

if [ "${1:-}" = "--reset" ]; then
  echo "Resetting $PG_DB..."
  PGPASSWORD="$PG_PASSWORD" psql -h "$PG_HOST" -U "$PG_USER" -d postgres -qc "DROP DATABASE IF EXISTS $PG_DB WITH (FORCE)"
fi

start() { # name, command...
  local name="$1"; shift
  nohup "$@" >"$RUN/$name.log" 2>&1 &
  echo $! >"$RUN/$name.pid"
}

wait_for() { # name, url
  for _ in $(seq 1 90); do
    if curl -s -o /dev/null "$2"; then echo "  $1 ready: $2"; return 0; fi
    sleep 1
  done
  echo "  $1 did not start — see dev/.run/$1.log" >&2
  return 1
}

echo "Building the extension for local use..."
(cd "$ROOT/extension" && npm run build:local >"$RUN/extension-build.log" 2>&1)

echo "Starting services..."
ASPNETCORE_ENVIRONMENT=Development \
ConnectionStrings__DefaultConnection="Host=$PG_HOST;Port=5432;Database=$PG_DB;Username=$PG_USER;Password=$PG_PASSWORD" \
SeedDemoData=true \
start backend dotnet run --project "$ROOT/backend/UCPNoticeBoard.Api" --no-launch-profile --urls http://localhost:5000

start pwa npm --prefix "$ROOT/pwa" run dev -- --port 5173 --strictPort
start portal node "$ROOT/dev/serve-portal.mjs" 5174

wait_for backend http://localhost:5000/swagger/index.html
wait_for pwa http://localhost:5173/
wait_for portal http://localhost:5174/

cat <<'INFO'

Demo accounts (Roll Number → role; privileged PIN is 1234):
  L1F21BSCS0001  Admin      (Demo Admin)
  L1F21BSCS0002  Publisher  (Computing Society)
  L1F22BSSE0003  Publisher  (Student Affairs Office)
  L1F23BSCS0004  Student    (Ayesha Khan) … through L1F23BSCS0008

Mock portal as someone else: http://localhost:5174/?roll=L1F21BSCS0001&name=Demo%20Admin
INFO
