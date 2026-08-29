#!/usr/bin/env bash
# Screenshot wrapper: capture via grimblast, copy to clipboard, notify via
# mako (toast + persistent bell entry), with a folder-open action.
#
# Usage: take-screenshot.sh [area|screen|output|active]   (default: area)
#
# Wired in hyprland.conf:
#   bind = , Print, exec, ~/.config/hypr/scripts/take-screenshot.sh screen
#   bind = SHIFT, Print, exec, ~/.config/hypr/scripts/take-screenshot.sh area
#   bind = $mainMod SHIFT, S, exec, ~/.config/hypr/scripts/take-screenshot.sh area
set -u

target="${1:-area}"
dir="${XDG_PICTURES_DIR:-$HOME/Pictures}/screenshots"
mkdir -p "$dir"
out="$dir/$(date +%Y%m%d_%H%M%S).png"

grimblast copysave "$target" "$out" || exit 1

# Toast via mako (also lands in the bar's bell over dbus). The action
# handler waits for the user to pick "Open folder" and opens pcmanfm.
if command -v notify-send >/dev/null 2>&1; then
  # Transient toast: -t expires it after 6s (conditions from
  # notifications-watcher.py stay until dismissed/resolved).
  (
    choice=$(notify-send -t 6000 -a "dotfiles-bar" -A "open=Open folder" \
      "Screenshot saved" "$out" 2>/dev/null)
    [ "$choice" = "open" ] && pcmanfm "$dir"
  ) >/dev/null 2>&1 &
fi

echo "$out"