#!/usr/bin/env bash
# Quick Actions "Screenshot": drag to select a region (esc = fullscreen).
# Saves to ~/Pictures/screenshots and copies to the clipboard.
set -u

dir="${XDG_PICTURES_DIR:-$HOME/Pictures}/screenshots"
mkdir -p "$dir"
out="$dir/$(date +%Y%m%d_%H%M%S).png"

region=$(slurp 2>/dev/null || true)
if [ -n "$region" ]; then
  grim -g "$region" "$out"
else
  grim "$out"
fi

if command -v wl-copy >/dev/null 2>&1; then
  wl-copy < "$out"
fi
# Spool a notification entry for the bar's notification-watcher.py
# (notify-send only works when a notification daemon is running).
printf '{"id":"screenshot-%s","title":"Screenshot saved","detail":"%s","openPath":"%s","ts":%s}\n' \
  "$(date +%s%N)" "$out" "$dir" "$(date +%s)" >> "$HOME/.config/ags/notification-spool.jsonl" 2>/dev/null || true
echo "$out"
