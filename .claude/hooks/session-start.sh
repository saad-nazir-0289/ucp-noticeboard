#!/bin/bash
# Prepares a Claude Code cloud session: .NET 8 SDK + dotnet-ef for the
# backend, npm deps for the extension and PWA, and a local PostgreSQL with
# all migrations applied (matching appsettings.json's DefaultConnection).
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# --- .NET 8 SDK ---
# Microsoft's own download host is blocked by the cloud proxy, so this
# installs Ubuntu's packaged SDK instead.
if ! command -v dotnet >/dev/null 2>&1 || ! dotnet --list-sdks | grep -q '^8\.'; then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq dotnet-sdk-8.0
fi

export PATH="$PATH:$HOME/.dotnet/tools"
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export PATH=\"\$PATH:$HOME/.dotnet/tools\"" >> "$CLAUDE_ENV_FILE"
  echo 'export DOTNET_CLI_TELEMETRY_OPTOUT=1' >> "$CLAUDE_ENV_FILE"
  echo 'export ASPNETCORE_ENVIRONMENT=Development' >> "$CLAUDE_ENV_FILE"
fi

# Pinned to match the EF Core packages in UCPNoticeBoard.Api.csproj.
if ! dotnet tool list --global | grep -q '^dotnet-ef '; then
  dotnet tool install --global dotnet-ef --version 8.0.8
fi

dotnet restore backend/UCPNoticeBoard.sln

# --- Frontends ---
(cd extension && npm install --no-audit --no-fund)
(cd pwa && npm install --no-audit --no-fund)

# --- PostgreSQL ---
if command -v pg_ctlcluster >/dev/null 2>&1; then
  PG_VERSION="$(ls /usr/lib/postgresql | sort -n | tail -1)"
  pg_ctlcluster "$PG_VERSION" main start 2>/dev/null || true
  su postgres -c "psql -qc \"ALTER USER postgres PASSWORD 'postgres';\""
  if ! su postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='ucp_noticeboard'\"" | grep -q 1; then
    su postgres -c "psql -qc 'CREATE DATABASE ucp_noticeboard;'"
  fi
  (cd backend/UCPNoticeBoard.Api && dotnet ef database update)
fi
