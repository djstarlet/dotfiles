#!/usr/bin/env bash
set -euo pipefail

# settings.sh — dotfiles settings manager
# Called by the ags settings flyout. Interface is the contract; do not change it.

command -v gsettings >/dev/null 2>&1 || { echo '{"error": "gsettings not found — install gsettings-desktop-schemas"}' >&2; exit 1; }
command -v hyprctl >/dev/null 2>&1 || { echo '{"error": "hyprctl not found — is Hyprland running?"}' >&2; exit 1; }

cmd="${1:-}"
# SYNC WITH widget/theme.config.ts workspaceDotColors
DEFAULT_WS_DOTS='{"dots":["#ef3d34","#f0a114","#24a337","#3b83e6","#9b5ad7","#28a9a0","#e96f3a","#cf5398"]}'

case "$cmd" in
  list-themes)
    ls -1 /usr/share/themes | sort
    ;;

  list-icons)
    ls -1 /usr/share/icons | sort
    ;;

  list-fonts)
    command -v fc-list >/dev/null 2>&1 || { echo '{"error": "fc-list not found (install fontconfig)"}' >&2; exit 1; }
    fc-list : family | sed 's/,.*//' | sort -u
    ;;

  list-cursors)
    for d in /usr/share/icons/*/cursors ~/.icons/*/cursors; do
      [ -d "$d" ] || continue
      basename "$(dirname "$d")"
    done | sort -u
    ;;

  list-wallpapers)
    wpdir="$HOME/.config/hypr/wallpapers"
    [ -d "$wpdir" ] || exit 0
    found=0
    for f in "$wpdir"/*.jpg "$wpdir"/*.jpeg "$wpdir"/*.png "$wpdir"/*.webp; do
      [ -f "$f" ] || continue
      basename "$f"
      found=1
    done | sort
    ;;

  get)
    sub="${2:-}"
    case "$sub" in
      theme)
        gsettings get org.gnome.desktop.interface gtk-theme | sed 's/^'\''//;s/'\''$//' || { echo '{"error": "gsettings get failed"}' >&2; exit 1; }
        ;;

      icon)
        gsettings get org.gnome.desktop.interface icon-theme | sed 's/^'\''//;s/'\''$//' || { echo '{"error": "gsettings get failed"}' >&2; exit 1; }
        ;;

      font)
        gsettings get org.gnome.desktop.interface font-name | sed 's/^'\''//;s/'\''$//' || { echo '{"error": "gsettings get failed"}' >&2; exit 1; }
        ;;

      cursor-theme)
        gsettings get org.gnome.desktop.interface cursor-theme | sed 's/^'\''//;s/'\''$//' || { echo '{"error": "gsettings get failed"}' >&2; exit 1; }
        ;;

      cursor-size)
        gsettings get org.gnome.desktop.interface cursor-size | sed 's/^'\''//;s/'\''$//' || { echo '{"error": "gsettings get failed"}' >&2; exit 1; }
        ;;

      wallpaper)
        wpdir="$HOME/.config/hypr/wallpapers"
        current="$HOME/.config/hypr/current-wallpaper.jpg"
        [ -f "$current" ] || { echo '""' ; exit 0; }
        for f in "$wpdir"/*.jpg "$wpdir"/*.jpeg "$wpdir"/*.png "$wpdir"/*.webp; do
          [ -f "$f" ] || continue
          cmp -s "$f" "$current" && basename "$f" && exit 0
        done
        echo "current-wallpaper"
        ;;

      colors)
        colorsfile="$HOME/.config/ags/theme-colors.json"
        if [ -f "$colorsfile" ]; then
          python3 -c "import json,sys; d=json.load(open('$colorsfile')); print(json.dumps(d))"
        else
          echo '{"background":"#f4f7fc","accent":"#55adff","text":"#2d3137"}'
        fi
        ;;

      ws-dots)
        dotsfile="$HOME/.config/ags/ws-dot-colors.json"
        if [ -f "$dotsfile" ]; then
          python3 -c "import json; print(json.dumps(json.load(open('$dotsfile'))))"
        else
          printf '%s\n' "$DEFAULT_WS_DOTS"
        fi
        ;;

      *)
        echo '{"error": "unknown get subcommand: '"$sub"'"}' >&2
        exit 1
        ;;
    esac
    ;;

  set)
    sub="${2:-}"
    case "$sub" in
      theme)
        name="${3:-}"
        [ -z "$name" ] && { echo '{"error": "missing theme name"}' >&2; exit 1; }
        gsettings set org.gnome.desktop.interface gtk-theme "$name" || { echo '{"error": "gsettings set failed"}' >&2; exit 1; }
        echo "ok"
        ;;

      icon)
        name="${3:-}"
        [ -z "$name" ] && { echo '{"error": "missing icon theme name"}' >&2; exit 1; }
        gsettings set org.gnome.desktop.interface icon-theme "$name" || { echo '{"error": "gsettings set failed"}' >&2; exit 1; }
        echo "ok"
        ;;

      font)
        name="${3:-}"
        [ -z "$name" ] && { echo '{"error": "missing font name"}' >&2; exit 1; }
        gsettings set org.gnome.desktop.interface font-name "$name" || { echo '{"error": "gsettings set failed"}' >&2; exit 1; }
        echo "ok"
        ;;

      cursor)
        theme="${3:-}"
        size="${4:-}"
        [ -z "$theme" ] && { echo '{"error": "missing cursor theme"}' >&2; exit 1; }
        [ -z "$size" ] && { echo '{"error": "missing cursor size"}' >&2; exit 1; }
        gsettings set org.gnome.desktop.interface cursor-theme "$theme" || { echo '{"error": "gsettings set cursor-theme failed"}' >&2; exit 1; }
        gsettings set org.gnome.desktop.interface cursor-size "$size" || { echo '{"error": "gsettings set cursor-size failed"}' >&2; exit 1; }
        hyprctl keyword cursor:theme "$theme" || { echo '{"error": "hyprctl cursor:theme failed"}' >&2; exit 1; }
        hyprctl keyword cursor:size "$size" || { echo '{"error": "hyprctl cursor:size failed"}' >&2; exit 1; }
        echo "ok"
        ;;

      wallpaper)
        src="${3:-}"
        [ -z "$src" ] && { echo '{"error": "missing wallpaper path or name"}' >&2; exit 1; }
        wpdir="$HOME/.config/hypr/wallpapers"
        dest="$HOME/.config/hypr/current-wallpaper.jpg"
        if [[ "$src" = /* ]]; then
          # Absolute path: import into wallpapers dir (overwrite by basename), then apply
          [ -f "$src" ] || { echo '{"error": "file not found: '"$src"'"}' >&2; exit 1; }
          cp "$src" "$wpdir/$(basename "$src")" || { echo '{"error": "copy to wallpapers dir failed"}' >&2; exit 1; }
          wpfile="$wpdir/$(basename "$src")"
        else
          # Bare name: look in wallpapers dir
          wpfile="$wpdir/$src"
          [ -f "$wpfile" ] || { echo '{"error": "wallpaper not found: '"$src"'"}' >&2; exit 1; }
        fi
        cp "$wpfile" "$dest" || { echo '{"error": "copy failed"}' >&2; exit 1; }
        [ -s "$dest" ] || { echo '{"error": "wallpaper copy failed"}' >&2; exit 1; }
        pngdest="${dest%.jpg}.png"
        python3 -c "from PIL import Image; Image.open('$dest').convert('RGB').save('$pngdest', 'PNG')" || { echo '{"error": "image conversion failed"}' >&2; exit 1; }
        pkill swaybg 2>/dev/null || true
        sleep 0.2
        hyprctl dispatch exec "swaybg -i $pngdest -m fill" >/dev/null 2>&1
        echo "ok"
        ;;

      color)
        name="${3:-}"
        hex="${4:-}"
        [ -z "$name" ] && { echo '{"error": "missing color name"}' >&2; exit 1; }
        [ -z "$hex" ] && { echo '{"error": "missing hex value"}' >&2; exit 1; }
        case "$name" in
          background|accent|text) ;;
          *) echo '{"error": "unknown color: '"$name"'"}' >&2; exit 1 ;;
        esac
        [[ "$hex" =~ ^#[0-9a-fA-F]{6}$ ]] || { echo '{"error": "invalid color: '"$hex"'"}' >&2; exit 1; }
        colorsfile="$HOME/.config/ags/theme-colors.json"
        if [ -f "$colorsfile" ]; then
          # Read existing, merge the one field, write atomically
          bg=$(python3 -c "import json,sys; d=json.load(open('$colorsfile')); print(d.get('background','#f4f7fc'))")
          ac=$(python3 -c "import json,sys; d=json.load(open('$colorsfile')); print(d.get('accent','#55adff'))")
          tx=$(python3 -c "import json,sys; d=json.load(open('$colorsfile')); print(d.get('text','#2d3137'))")
          case "$name" in
            background) bg="$hex" ;;
            accent)     ac="$hex" ;;
            text)       tx="$hex" ;;
          esac
        else
          bg="#f4f7fc"; ac="#55adff"; tx="#2d3137"
          case "$name" in
            background) bg="$hex" ;;
            accent)     ac="$hex" ;;
            text)       tx="$hex" ;;
          esac
        fi
        tmp="${colorsfile}.tmp.$$"
        printf '{"background":"%s","accent":"%s","text":"%s"}\n' "$bg" "$ac" "$tx" > "$tmp"
        chmod 600 "$tmp"
        mv -f "$tmp" "$colorsfile"
        echo "ok"
        ;;

      ws-dot)
        index="${3:-}"
        hex="${4:-}"
        [[ "$index" =~ ^[1-8]$ ]] || { echo '{"error": "invalid workspace dot index"}' >&2; exit 1; }
        [[ "$hex" =~ ^#[0-9a-fA-F]{6}$ ]] || { echo '{"error": "invalid workspace dot color"}' >&2; exit 1; }
        dotsfile="$HOME/.config/ags/ws-dot-colors.json"
        tmp="${dotsfile}.tmp.$$"
        python3 - "$dotsfile" "$index" "$hex" <<'PY' > "$tmp"
import json
import os
import re
import sys

path, index, color = sys.argv[1:]
defaults = ["#ef3d34", "#f0a114", "#24a337", "#3b83e6", "#9b5ad7", "#28a9a0", "#e96f3a", "#cf5398"]
try:
    with open(path) as handle:
        dots = json.load(handle).get("dots", defaults)
    if not isinstance(dots, list) or len(dots) != 8 or not all(isinstance(dot, str) and re.fullmatch(r"#[0-9a-fA-F]{6}", dot) for dot in dots):
        dots = defaults
except (OSError, ValueError, TypeError):
    dots = defaults
dots[int(index) - 1] = color
print(json.dumps({"dots": dots}, separators=(",", ":")))
PY
        chmod 600 "$tmp"
        mv -f "$tmp" "$dotsfile"
        echo "ok"
        ;;

      reset)
        if [ "${3:-}" = "ws-dots" ]; then
          rm -f "$HOME/.config/ags/ws-dot-colors.json"
          echo "ok"
        else
          echo '{"error": "unknown reset target"}' >&2
          exit 1
        fi
        ;;

      *)
        echo '{"error": "unknown set subcommand: '"$sub"'"}' >&2
        exit 1
        ;;
    esac
    ;;

  *)
    echo '{"error": "usage: settings.sh {list-themes|list-icons|set <theme|icon|font|cursor|wallpaper> ...}"}' >&2
    exit 1
    ;;
esac
