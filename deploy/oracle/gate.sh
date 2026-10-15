#!/usr/bin/env bash
# The only commands GitHub's key may run on this server (it's the forced
# command for that key in ~/.ssh/authorized_keys): deploy one environment
# at a given commit, or stream a production backup. Anything else is refused.
# Everything is inside main(), so bash has read the whole file before the
# git checkout below replaces it with the deployed commit's version.
set -euo pipefail

main() {
  local repo=/opt/ucpnb/repo
  local words
  read -r -a words <<< "${SSH_ORIGINAL_COMMAND:-}"
  case "${words[0]:-}" in
    deploy)
      local env=${words[1]:-} sha=${words[2]:-}
      [[ "$env" =~ ^(production|staging)$ ]] || { echo "refused: unknown environment" >&2; exit 1; }
      [[ "$sha" =~ ^[0-9a-f]{7,40}$ ]] || { echo "refused: not a commit id" >&2; exit 1; }
      if [ ! -f "/opt/ucpnb/config/$env.env" ]; then
        echo "$env isn't set up on this server; nothing to deploy."
        exit 0
      fi
      # The scripts themselves come from the commit being deployed.
      git -C "$repo" fetch --quiet --prune origin
      git -C "$repo" checkout --quiet --force --detach "$sha"
      exec "$repo/deploy/oracle/deploy.sh" "$env" "$sha"
      ;;
    backup)
      exec "$repo/deploy/oracle/backup.sh" production --stdout
      ;;
    *)
      echo "refused: this key can only deploy or back up" >&2
      exit 1
      ;;
  esac
}

main "$@"
