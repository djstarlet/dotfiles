#!/usr/bin/env bash
# Restore the last-picked wallpaper (written by the settings chooser), else the bundled default.
WALL="$HOME/.config/hypr/current-wallpaper.png"
if [ -f "$WALL" ]; then
  exec swaybg -i "$WALL" -m fill
fi
FALLBACK="$HOME/.config/hypr/default_wallpaper.jpg"
[ -f "$FALLBACK" ] || FALLBACK="$HOME/Downloads/dell_32.png"
exec swaybg -i "$FALLBACK" -m fill
