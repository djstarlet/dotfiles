#!/usr/bin/env bash
set -euo pipefail

# settings.sh — dotfiles settings manager
# Called by the ags settings flyout. Interface is the contract; do not change it.

command -v gsettings >/dev/null 2>&1 || { echo '{"error": "gsettings not found — install gsettings-desktop-schemas"}' >&2; exit 1; }
command -v hyprctl >/dev/null 2>&1 || { echo '{"error": "hyprctl not found — is Hyprland running?"}' >&2; exit 1; }

cmd="${1:-}"

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
