#!/usr/bin/env bash
# Database backups.
#   backup.sh production            # writes /opt/ucpnb/backups/production-<date>.dump, keeps 14 days
#   backup.sh production --stdout   # writes the dump to standard output (used by GitHub's backup job)
# Restore with pg_restore (see docs/ORACLE.md).
set -euo pipefail
. "$(dirname "$(readlink -f "$0")")/common.sh"

env=${1:-production}; valid_env "$env" || die "usage: backup.sh production|staging [--stdout]"
load_stack_env
db=$(database_for "$env")

if [ "${2:-}" = "--stdout" ]; then
  pg_tools pg_dump --host db --username postgres --format=custom --no-owner --no-acl "$db"
  exit 0
fi

mkdir -p "$UCPNB_ROOT/backups"
file="$UCPNB_ROOT/backups/$env-$(date -u +%Y-%m-%d-%H%M).dump"
pg_tools pg_dump --host db --username postgres --format=custom --no-owner --no-acl "$db" > "$file.partial"
mv "$file.partial" "$file"
chmod 600 "$file"
find "$UCPNB_ROOT/backups" -name "$env-*.dump" -mtime +14 -delete
echo "Saved $file ($(du -h "$file" | cut -f1))"
