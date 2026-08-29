#!/usr/bin/env bash
# Screenshot wrapper: capture via grimblast, copy to clipboard, and spool a
# notification entry for the bar's notification bell.
#
# Usage: take-screenshot.sh [area|screen|output|active]   (default: area)
#
# Wired in hyprland.conf:
#   bind = , Print, exec, ~/.config/hypr/scripts/take-screenshot.sh screen
#   bind = SHIFT, Print, exec, ~/.config/hypr/scripts/take-screenshot.sh area
#   bind = $mainMod SHIFT, S, exec, ~/.config/hypr/scripts/take-screenshot.sh area
#
# grimblast's --notify only works when a notification daemon is running;
# the spool hook is always active, so the bell always lights up.
set -u

target="${1:-area}"
dir="${XDG_PICTURES_DIR:-$HOME/Pictures}/screenshots"
mkdir -p "$dir"
out="$dir/$(date +%Y%m%d_%H%M%S).png"

grimblast copysave "$target" "$out" || exit 1

# Spool a notification entry for the bar's notification watcher (read by
# ~/.config/ags/notifications-watcher.py -> ~/.config/ags/notifications.json).
printf '{"id":"screenshot-%s","title":"Screenshot saved","detail":"%s","openPath":"%s","ts":%s}\n' \
  "$(date +%s%N)" "$out" "$dir" "$(date +%s)" >> "$HOME/.config/ags/notification-spool.jsonl" 2>/dev/null || true

echo "$out"