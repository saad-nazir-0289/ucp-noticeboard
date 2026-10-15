#!/usr/bin/env bash
# Copies the live Railway database into one environment here.
#   copy-railway-data.sh staging      # rehearsal: real data on staging, to test with
#   copy-railway-data.sh production   # the real move
# It asks for Railway's public database URL (Railway → Postgres → Variables
# → DATABASE_PUBLIC_URL), so it never ends up in a file or your shell history.
# The target database is backed up first, then replaced; the API then starts
# on the copy and brings it up to date (new tables, the fixed categories).
set -euo pipefail
. "$(dirname "$(readlink -f "$0")")/common.sh"

main() {
  local env=${1:-}
  valid_env "$env" || die "usage: copy-railway-data.sh staging|production"
  [ -f "$CONFIG_DIR/$env.env" ] || die "$env isn't set up yet ($CONFIG_DIR/$env.env is missing)."
  load_stack_env
  local db; db=$(database_for "$env")

  if [ "$env" = production ]; then
    echo "This REPLACES the production database here with Railway's."
    read -rp "Type 'copy to production' to continue: " answer
    [ "$answer" = "copy to production" ] || die "cancelled"
  fi

  local url
  read -rsp "Railway DATABASE_PUBLIC_URL (input hidden): " url; echo
  [[ "$url" =~ ^postgres(ql)?:// ]] || die "that doesn't look like a postgresql:// URL"

  say "Checking Railway's Postgres version"
  local version
  version=$(docker run --rm "$PG_TOOLS_IMAGE" psql "$url" -tAc "show server_version_num") || die "couldn't connect to Railway"
  [ "${version:0:2}" -le 17 ] || die "Railway runs Postgres ${version:0:2}; change postgres:17 to postgres:${version:0:2} in docker-compose.yml and common.sh first."

  # Global, so the clean-up below still sees it when the script ends.
  DUMP=$(mktemp /tmp/railway-XXXXXX.dump)
  trap 'rm -f "$DUMP"' EXIT

  say "Copying Railway's database (this takes a moment)"
  docker run --rm "$PG_TOOLS_IMAGE" pg_dump --format=custom --no-owner --no-acl "$url" > "$DUMP"
  [ -s "$DUMP" ] || die "the copy came back empty"
  echo "Got $(du -h "$DUMP" | cut -f1)."

  say "Backing up the current $env database here first"
  "$(dirname "$(readlink -f "$0")")/backup.sh" "$env"

  say "Replacing the $env database"
  compose stop "api-$env"
  pg_tools psql --host db --username postgres -v ON_ERROR_STOP=1 \
    -c "DROP DATABASE IF EXISTS $db WITH (FORCE);" -c "CREATE DATABASE $db;"
  pg_tools pg_restore --host db --username postgres --no-owner --no-acl -d "$db" < "$DUMP" \
    || echo "pg_restore reported problems (above). Check the counts below before relying on this copy." >&2

  if [ "$env" = staging ]; then
    # Staging must never reach real students' phones, or keep their unlocked devices.
    # (Railway's database may predate the unlocked-devices table.)
    pg_tools psql --host db --username postgres -d "$db" -v ON_ERROR_STOP=1 \
      -c 'DELETE FROM "PushSubscriptions";' \
      -c 'DO $$ BEGIN IF to_regclass($q$"DeviceSessions"$q$) IS NOT NULL THEN DELETE FROM "DeviceSessions"; END IF; END $$;' >/dev/null
    echo "Removed the copied notification subscriptions and unlocked devices from staging."
  fi

  say "Starting the $env API on the copy"
  compose up -d "api-$env"
  wait_healthy "$env" || die "the API didn't start; see: docker compose logs api-$env"
  pg_tools psql --host db --username postgres -d "$db" -tA \
    -c 'SELECT format($$%s users, %s notices, %s categories$$, (SELECT count(*) FROM "Users"), (SELECT count(*) FROM "Notices"), (SELECT count(*) FROM "Categories"));'
  say "Done: $env now runs on Railway's data"
}

main "$@"
