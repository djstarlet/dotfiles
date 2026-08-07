# Shared helpers for calendar-auth.sh and calendar-events.sh
# Source this file: source "$(dirname "$0")/calendar-common.sh"

CACHE_FILE="$HOME/.config/ags/google-calendar-auth.json"

get_client_id() {
  if [[ -n "${GOOGLE_CLIENT_ID:-}" ]]; then
    echo "$GOOGLE_CLIENT_ID"
    return
  fi
  if [[ -f "$CACHE_FILE" ]]; then
    python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("client_id",""))' < "$CACHE_FILE" 2>/dev/null || true
  fi
}

write_cache() {
  local access_token="$1" refresh_token="$2" expires_in="$3" email="$4" client_id="$5"
  local expiry=$(( $(date +%s) + expires_in ))
  printf '{"client_id":"%s","refresh_token":"%s","access_token":"%s","token_expiry":%s,"email":"%s"}' \
    "$client_id" "$refresh_token" "$access_token" "$expiry" "$email" \
    | python3 -c '
import sys, json
d = json.load(sys.stdin)
with open(sys.argv[1], "w") as f:
  json.dump(d, f)
' "$CACHE_FILE.tmp.$$"
  chmod 600 "$CACHE_FILE.tmp.$$"
  mv -f "$CACHE_FILE.tmp.$$" "$CACHE_FILE"
}

get_access_token() {
  if [[ ! -f "$CACHE_FILE" ]]; then
    return 1
  fi
  local at expiry
  at=$(python3 -c 'import sys,json; print(json.load(sys.stdin).get("access_token",""))' < "$CACHE_FILE" 2>/dev/null || true)
  expiry=$(python3 -c 'import sys,json; print(json.load(sys.stdin).get("token_expiry","0"))' < "$CACHE_FILE" 2>/dev/null || true)
  local now
  now=$(date +%s)
  if [[ -n "$at" && "$at" != "null" && "$expiry" != "null" && "$now" -lt "$expiry" ]]; then
    echo "$at"
    return 0
  fi
  local client_id rt
  client_id=$(get_client_id)
  rt=$(python3 -c 'import sys,json; print(json.load(sys.stdin).get("refresh_token",""))' < "$CACHE_FILE" 2>/dev/null || true)
  [[ -z "$client_id" || -z "$rt" ]] && return 1
  local resp new_at new_ei
  resp=$(curl -s --fail -X POST "https://oauth2.googleapis.com/token" \
    -d "client_id=$client_id" \
    -d "grant_type=refresh_token" \
    -d "refresh_token=$rt" 2>/dev/null) || return 1
  new_at=$(echo "$resp" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("access_token",""))' 2>/dev/null || true)
  new_ei=$(echo "$resp" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("expires_in","0"))' 2>/dev/null || true)
  if [[ -n "$new_at" && "$new_at" != "null" ]]; then
    local cur_email cur_cid
    cur_email=$(python3 -c 'import sys,json; print(json.load(sys.stdin).get("email",""))' < "$CACHE_FILE" 2>/dev/null || true)
    cur_cid=$(get_client_id)
    write_cache "$new_at" "$rt" "$new_ei" "$cur_email" "$cur_cid"
    echo "$new_at"
    return 0
  fi
  return 1
}
