#!/usr/bin/env bash
set -uo pipefail

# Brightness control for the Control Center slider.
#   brightness-dim.sh <percent>   apply brightness (5-100)
#   brightness-dim.sh --get       print the current brightness percent
#
# Prefers real hardware brightness and falls back to a Hyprland screen
# shader overlay for panels without brightness control (e.g. an old DVI
# monitor). Detection order:
#   1. brightnessctl - a backlight device, or an external monitor exposed
#      through the ddcci kernel driver (type "ddc")
#   2. ddcutil - DDC/CI over i2c (requires /dev/i2c-* and permissions)
#   3. shader overlay - a dimming shader applied via decoration:screen_shader
# The detected mode is cached for 5 minutes in ~/.cache/ags-brightness-mode
# so the slider does not re-probe i2c on every move.

BRIGHTNESS=""
if [[ ${1:-} == "--get" ]]; then
  BRIGHTNESS="--get"
else
  BRIGHTNESS="${1:?Usage: brightness-dim.sh <percent> | --get}"
  [[ "$BRIGHTNESS" =~ ^[0-9]+$ ]] || { echo "invalid brightness" >&2; exit 1; }
  if (( BRIGHTNESS < 5 )); then BRIGHTNESS=5; fi
  if (( BRIGHTNESS > 100 )); then BRIGHTNESS=100; fi
fi

MODE_FILE="${XDG_CACHE_HOME:-$HOME/.cache}/ags-brightness-mode"
SHADER_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/hypr/shaders"
SHADER_FILE="$SHADER_DIR/ags-dim.frag"

clear_shader() {
  hyprctl keyword decoration:screen_shader "" >/dev/null 2>&1 || true
}

shader_percent() {
  local dim
  dim=$(grep -oE '1\.0 - [0-9]+(\.[0-9]+)?' "$SHADER_FILE" 2>/dev/null | head -n1 | awk '{print $3}')
  [[ -n $dim ]] || { echo 100; return; }
  awk -v d="$dim" 'BEGIN { p = 100 - (d * 100); if (p < 5) p = 5; if (p > 100) p = 100; printf "%d", p }'
}

brightnessctl_percent() {
  local dev="$1" cur max
  cur=$(brightnessctl -d "$dev" g 2>/dev/null) || return 1
  max=$(brightnessctl -d "$dev" m 2>/dev/null) || return 1
  [[ -n $cur && -n $max ]] || return 1
  awk -v c="$cur" -v m="$max" 'BEGIN { if (m < 1) m = 1; p = c / m * 100; if (p < 5) p = 5; if (p > 100) p = 100; printf "%d", p }'
}

ddcutil_percent() {
  local cur
  cur=$(timeout 8 ddcutil --brief getvcp 10 2>/dev/null | awk '$1 == "VCP" && $2 == 10 { print $4; exit }')
  [[ -n $cur ]] || return 1
  awk -v c="$cur" 'BEGIN { if (c < 5) c = 5; if (c > 100) c = 100; printf "%d", c }'
}

detect_mode() {
  # 1) brightnessctl (laptop backlight, or ddcci-exposed external monitor)
  if command -v brightnessctl >/dev/null 2>&1; then
    local dev
    dev=$(brightnessctl -m 2>/dev/null | awk -F, '$2 == "ddc" || $2 == "backlight" { print $1; exit }')
    if [[ -n $dev ]]; then printf 'brightnessctl %s' "$dev"; return; fi
  fi
  # 2) ddcutil over i2c
  if command -v ddcutil >/dev/null 2>&1; then
    if timeout 8 ddcutil --brief getvcp 10 >/dev/null 2>&1; then printf 'ddcutil'; return; fi
  fi
  # 3) shader overlay
  printf 'shader'
}

cached_mode() {
  local mode="" ts=0 now
  [[ -f $MODE_FILE ]] && read -r mode ts < "$MODE_FILE" 2>/dev/null
  now=$(date +%s)
  if [[ -z $mode || $((now - ts)) -gt 300 ]]; then
    mode=$(detect_mode)
    mkdir -p "$(dirname "$MODE_FILE")"
    printf '%s %s\n' "$mode" "$now" > "$MODE_FILE"
  fi
  printf '%s' "$mode"
}

apply_shader() {
  local dim tmp
  dim=$(awk -v p="$BRIGHTNESS" 'BEGIN { printf "%.4f", (100 - p) / 100 }')
  mkdir -p "$SHADER_DIR"
  tmp="$SHADER_DIR/.ags-dim.tmp.$$"
  cat > "$tmp" <<SHADER
#version 320 es
precision highp float;
in vec2 v_texcoord;
uniform sampler2D tex;
out vec4 fragColor;

void main() {
    vec4 c = texture(tex, v_texcoord);
    c.rgb *= (1.0 - $dim);
    fragColor = c;
}
SHADER
  # Atomic rename: Hyprland must never read a half-written shader (that
  # produced transient "unexpected end of file" compile errors on fast drags).
  mv "$tmp" "$SHADER_FILE"
  hyprctl keyword decoration:screen_shader "$SHADER_FILE" >/dev/null
}

if [[ $BRIGHTNESS == "--get" ]]; then
  mode="$(cached_mode)"
  pct=""
  case "$mode" in
    brightnessctl\ *) pct=$(brightnessctl_percent "${mode#brightnessctl }") || pct="" ;;
    ddcutil) pct=$(ddcutil_percent) || pct="" ;;
  esac
  [[ -n $pct ]] || pct=$(shader_percent)
  printf '%s\n' "$pct"
  exit 0
fi

mode="$(cached_mode)"
case "$mode" in
  brightnessctl\ *)
    if brightnessctl --device="${mode#brightnessctl }" set "${BRIGHTNESS}%" >/dev/null 2>&1; then
      clear_shader # hardware path: the dim overlay must not linger
      exit 0
    fi
    ;;
  ddcutil)
    if ddcutil setvcp 10 "$BRIGHTNESS" >/dev/null 2>&1; then
      clear_shader
      exit 0
    fi
    ;;
esac

apply_shader