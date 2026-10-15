#!/usr/bin/env bash
# Fills in the settings still marked RAILWAY in production.env by asking for
# each one, so nothing has to be edited by hand. Safe to run again.
#   /opt/ucpnb/repo/deploy/oracle/fill-settings.sh
set -euo pipefail
umask 077
file=/opt/ucpnb/config/production.env
[ -f "$file" ] || { echo "Missing $file; run setup.sh first." >&2; exit 1; }

set_value() {
  KEY=$1 VALUE=$2 awk 'index($0, ENVIRON["KEY"] "=") == 1 { print ENVIRON["KEY"] "=" ENVIRON["VALUE"]; next } { print }' "$file" > "$file.new"
  cat "$file.new" > "$file" && rm -f "$file.new"
}

ask() {
  local key=$1 value
  while :; do
    read -rsp "  $key (Railway: ${key//__/:}): " value; echo
    value=${value//$'\r'/}
    value=$(printf '%s' "$value" | sed -e 's/^[[:space:]"'"'"']*//' -e 's/[[:space:]"'"'"']*$//')
    [ -n "$value" ] && break
    echo "    Nothing was pasted. Try again."
  done
  set_value "$key" "$value"
  echo "    Saved (${#value} characters)."
}

keys=$(grep -E '^[A-Za-z_]+=RAILWAY$' "$file" | cut -d= -f1 || true)
if [ -n "$keys" ]; then
  echo "For each setting: copy its value from Railway (API service > Variables),"
  echo "right-click here to paste, then press Enter. What you paste stays hidden."
  echo
  for key in $keys; do ask "$key"; done
else
  echo "All Railway values are already filled in."
fi

echo
read -rp "Also copy Railway's Jwt Key, so students stay signed in after the move? (y/n) " answer
[[ "$answer" =~ ^[Yy] ]] && ask Jwt__Key
echo
echo "Done. Settings saved in $file."
