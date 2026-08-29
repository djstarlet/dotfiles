#!/usr/bin/env bash
# Bar update check - compares the local BAR_VERSION against the released one
# (ags/.config/ags/BAR_VERSION in the djstarlet/dotfiles repo) and records the
# result in ~/.config/ags/update-check.json for the notification bell.
#
# Fired by notifications-watcher.py. Offline/failure = keep the previous
# result, so a flaky network never clears a pending update notice.
set -euo pipefail

AGS_DIR="$HOME/.config/ags"
OUT="$AGS_DIR/update-check.json"
VERSION_FILE="$AGS_DIR/BAR_VERSION"
RELEASE_URL="https://raw.githubusercontent.com/djstarlet/dotfiles/main/ags/.config/ags/BAR_VERSION"

[ -f "$VERSION_FILE" ] || exit 0
local_version="$(cat "$VERSION_FILE")"

# Another check may already hold the lock (releases automatically on exit).
exec 9>"$AGS_DIR/update-check.lock"
flock -n 9 || exit 0

remote_version="$(curl -fsSL --max-time 15 "$RELEASE_URL" 2>/dev/null || true)"
[ -n "$remote_version" ] || exit 0

update_available=false
[ "$local_version" != "$remote_version" ] && update_available=true

cat > "$OUT" <<EOF
{"checked_at": "$(date -Is)", "update_available": $update_available, "local_version": "$local_version", "remote_version": "$remote_version"}
EOF