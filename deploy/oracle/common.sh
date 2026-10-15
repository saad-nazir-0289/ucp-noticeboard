# Shared by the scripts in this folder. Everything lives under /opt/ucpnb:
#   repo/          a clone of the GitHub repository (scripts run from here)
#   src/<env>/     the code each environment was last deployed from
#   config/        stack.env (database password, domains), production.env,
#                  staging.env (each API's settings and secrets)
#   backups/       nightly database dumps
UCPNB_ROOT=/opt/ucpnb
UCPNB_REPO_URL=${UCPNB_REPO_URL:-https://github.com/saad-nazir-0289/ucp-noticeboard.git}
CONFIG_DIR=$UCPNB_ROOT/config
STACK_ENV=$CONFIG_DIR/stack.env

die() { echo "Error: $*" >&2; exit 1; }
say() { printf '\n== %s\n' "$*"; }

# docker compose with this stack's file and settings, from the deployed
# production code if there is one, otherwise from the repo clone.
compose() {
  local dir=$UCPNB_ROOT/repo/deploy/oracle
  [ -f "$UCPNB_ROOT/src/production/deploy/oracle/docker-compose.yml" ] && dir=$UCPNB_ROOT/src/production/deploy/oracle
  local profiles=()
  [ -f "$CONFIG_DIR/production.env" ] && profiles+=(--profile production)
  [ -f "$CONFIG_DIR/staging.env" ] && profiles+=(--profile staging)
  docker compose --project-directory "$dir" -f "$dir/docker-compose.yml" --env-file "$STACK_ENV" "${profiles[@]}" "$@"
}

valid_env() { [ "$1" = production ] || [ "$1" = staging ]; }
database_for() { echo "ucpnb_$1"; }

# Postgres client tools, on the stack's network. They can dump any server up
# to their own version and restore into the stack's Postgres (same version).
PG_TOOLS_IMAGE=postgres:18-alpine
PG_MAJOR=18
pg_tools() {
  docker run --rm -i --network ucpnb_default -e PGPASSWORD="$POSTGRES_PASSWORD" "$PG_TOOLS_IMAGE" "$@"
}

load_stack_env() {
  [ -f "$STACK_ENV" ] || die "$STACK_ENV is missing. Run setup.sh first."
  # shellcheck disable=SC1090
  set -a; . "$STACK_ENV"; set +a
}

# Waits for an API to answer /health (it migrates its database first).
wait_healthy() {
  local env=$1 tries=${2:-60}
  for _ in $(seq "$tries"); do
    if docker run --rm --network ucpnb_default curlimages/curl:8.10.1 -fsS --max-time 5 "http://api-$env:8080/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 3
  done
  return 1
}
