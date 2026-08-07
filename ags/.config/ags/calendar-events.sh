#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/calendar-common.sh"

token=$(get_access_token) || exit 0
[[ -z "$token" ]] && exit 0

now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
future=$(python3 -c "from datetime import datetime,timezone,timedelta; print((datetime.now(timezone.utc)+timedelta(days=7)).strftime('%Y-%m-%dT%H:%M:%SZ'))")

resp=$(curl -s --fail "https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now}&timeMax=${future}&orderBy=startTime&singleEvents=true&maxResults=10" \
  -H "Authorization: Bearer $token" 2>/dev/null) || exit 0

python3 -c '
import json, sys
from datetime import datetime

data = json.load(sys.stdin)
items = data.get("items", [])
if not items:
    print("No upcoming Google Calendar events.")
    sys.exit(0)

for item in items:
    start = item.get("start", {})
    dt_str = start.get("dateTime") or start.get("date")
    if not dt_str:
        continue
    try:
        dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        local = dt.astimezone()
        summary = item.get("summary", "(no title)")
        if start.get("dateTime"):
            print(f"{local.strftime(\"%a %b %d %H:%M\")} {summary}")
        else:
            print(f"{local.strftime(\"%a %b %d\")} {summary}")
    except Exception:
        pass
' <<< "$resp" || exit 0
