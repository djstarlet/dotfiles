#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/calendar-common.sh"

cmd_status() {
  if [[ ! -f "$CACHE_FILE" ]]; then
    echo '{"signed_in":false}'
    return
  fi
  local token
  token=$(get_access_token) || { echo '{"signed_in":false}'; return; }
  local email
  email=$(python3 -c 'import sys,json; print(json.load(sys.stdin).get("email",""))' < "$CACHE_FILE" 2>/dev/null || true)
  echo "{\"signed_in\":true,\"email\":\"$email\"}"
}

cmd_login() {
  local client_id
  client_id=$(get_client_id)
  if [[ -z "$client_id" ]]; then
    echo '{"status":"error","message":"No Google OAuth client_id configured. Set GOOGLE_CLIENT_ID or create a Desktop OAuth client at https://console.cloud.google.com/ and add client_id to ~/.config/ags/google-calendar-auth.json"}'
    return
  fi
  local resp
  resp=$(curl -s --fail -X POST "https://oauth2.googleapis.com/device/code" \
    -d "client_id=$client_id" \
    -d "scope=https://www.googleapis.com/auth/calendar" 2>/dev/null) || {
    echo '{"status":"error","message":"Failed to request device code."}'
    return
  }
  local vurl ucode dcode ei iv
  vurl=$(echo "$resp" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("verification_url",""))' 2>/dev/null || true)
  ucode=$(echo "$resp" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("user_code",""))' 2>/dev/null || true)
  dcode=$(echo "$resp" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("device_code",""))' 2>/dev/null || true)
  ei=$(echo "$resp" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("expires_in","0"))' 2>/dev/null || true)
  iv=$(echo "$resp" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("interval","5"))' 2>/dev/null || true)
  echo "{\"status\":\"need_code\",\"verification_url\":\"$vurl\",\"user_code\":\"$ucode\",\"device_code\":\"$dcode\",\"expires_in\":$ei,\"interval\":$iv}"
}

cmd_poll() {
  local device_code="$1"
  local client_id
  client_id=$(get_client_id)
  local resp
  resp=$(curl -s --fail -X POST "https://oauth2.googleapis.com/token" \
    -d "client_id=$client_id" \
    -d "device_code=$device_code" \
    -d "grant_type=urn:ietf:params:oauth:grant-type:device_code" 2>/dev/null) || {
    echo '{"status":"error","message":"Failed to poll for token."}'
    return
  }
  local error_msg
  error_msg=$(echo "$resp" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("error",""))' 2>/dev/null || true)
  case "$error_msg" in
    authorization_pending|slow_down)
      echo '{"status":"pending"}'
      ;;
    access_denied)
      echo '{"status":"error","message":"Access denied."}'
      ;;
    expired_token)
      echo '{"status":"error","message":"Code expired, please try again."}'
      ;;
    "")
      local at rt ei email
      at=$(echo "$resp" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("access_token",""))' 2>/dev/null || true)
      rt=$(echo "$resp" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("refresh_token",""))' 2>/dev/null || true)
      ei=$(echo "$resp" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("expires_in","0"))' 2>/dev/null || true)
      if [[ -z "$at" || -z "$rt" ]]; then
        echo '{"status":"error","message":"Failed to exchange device code."}'
        return
      fi
      # Fetch email from userinfo endpoint
      local userinfo_resp
      userinfo_resp=$(curl -s --fail -H "Authorization: Bearer $at" "https://www.googleapis.com/oauth2/v2/userinfo" 2>/dev/null) || true
      email=$(echo "$userinfo_resp" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("email",""))' 2>/dev/null || true)
      local cur_cid
      cur_cid=$(get_client_id)
      write_cache "$at" "$rt" "$ei" "$email" "$cur_cid"
      echo "{\"status\":\"success\",\"email\":\"$email\"}"
      ;;
    *)
      echo "{\"status\":\"error\",\"message\":\"$error_msg\"}"
      ;;
  esac
}

cmd_logout() {
  rm -f "$CACHE_FILE"
  echo '{"status":"signed_out"}'
}

cmd_set_client_id() {
  local client_id="${1:-}"
  if [[ -z "$client_id" ]]; then
    echo '{"status":"error","message":"Client ID cannot be empty."}'
    return
  fi
  if [[ -f "$CACHE_FILE" ]]; then
    python3 -c '
import sys, json
with open(sys.argv[1], "r") as f:
    d = json.load(f)
d["client_id"] = sys.argv[2]
with open(sys.argv[3], "w") as f:
    json.dump(d, f)
' "$CACHE_FILE" "$client_id" "$CACHE_FILE.tmp.$$"
  else
    printf '{}' | python3 -c '
import sys, json
d = json.load(sys.stdin)
d["client_id"] = sys.argv[1]
with open(sys.argv[2], "w") as f:
    json.dump(d, f)
' "$client_id" "$CACHE_FILE.tmp.$$"
  fi
  chmod 600 "$CACHE_FILE.tmp.$$"
  mv -f "$CACHE_FILE.tmp.$$" "$CACHE_FILE"
  echo '{"status":"ok"}'
}

case "${1:-}" in
  status)    cmd_status ;;
  login)     cmd_login ;;
  poll)      cmd_poll "${2:-}" ;;
  logout)    cmd_logout ;;
  set-client-id) cmd_set_client_id "${2:-}" ;;
  *)
    echo "Usage: calendar-auth.sh {status|login|poll <device_code>|logout|set-client-id <client_id>}" >&2
    exit 1
    ;;
esac
