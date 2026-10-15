#!/usr/bin/env bash
# Builds and starts one environment's API from a git commit or branch.
#   deploy.sh staging                 # latest staging branch
#   deploy.sh production              # latest main branch
#   deploy.sh production 3f2c1a9      # a specific commit
# If the new version doesn't come up healthy, the previous one is put back.
set -euo pipefail
. "$(dirname "$(readlink -f "$0")")/common.sh"

env=${1:-}; valid_env "$env" || die "usage: deploy.sh production|staging [git ref]"
default_branch=$([ "$env" = production ] && echo main || echo staging)
ref=${2:-origin/$default_branch}
[ -f "$CONFIG_DIR/$env.env" ] || die "$CONFIG_DIR/$env.env is missing: this environment isn't set up yet (see docs/ORACLE.md)."
load_stack_env

say "Fetching the code"
git -C "$UCPNB_ROOT/repo" fetch --quiet --prune origin
src=$UCPNB_ROOT/src/$env
if [ ! -d "$src/.git" ] && [ ! -f "$src/.git" ]; then
  git -C "$UCPNB_ROOT/repo" worktree add --quiet --detach "$src" "$ref"
else
  git -C "$src" checkout --quiet --force --detach "$ref"
fi
commit=$(git -C "$src" rev-parse --short HEAD)

say "Building the $env API ($commit)"
if docker image inspect "ucpnb-api:$env" >/dev/null 2>&1; then
  docker tag "ucpnb-api:$env" "ucpnb-api:$env-previous"
fi
docker build --quiet -t "ucpnb-api:$env" "$src/backend" >/dev/null

say "Starting it"
compose up -d db caddy
compose up -d --force-recreate "api-$env"
if wait_healthy "$env"; then
  docker image prune -f >/dev/null
  say "The $env API is up ($commit)"
  exit 0
fi

echo "The new $env API didn't become healthy. Its last log lines:" >&2
compose logs --tail 40 "api-$env" >&2 || true
if docker image inspect "ucpnb-api:$env-previous" >/dev/null 2>&1; then
  say "Putting the previous version back"
  docker tag "ucpnb-api:$env-previous" "ucpnb-api:$env"
  compose up -d --force-recreate "api-$env"
  wait_healthy "$env" && echo "Previous version restored." >&2
fi
exit 1
