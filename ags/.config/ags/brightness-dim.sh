#!/usr/bin/env bash
set -uo pipefail

# Brightness control for the Control Center slider.
#   brightness-dim.sh <percent>   apply brightness (5-100)
#   brightness-dim.sh --get       print the current brightness percent
#
# Prefers real hardware brightness and falls back to a Hyprland screen
# shader overlay for panels without brightness control. Detection order:
#   1. brightnessctl - a backlight device, or an external monitor exposed
#      through the ddcci kernel driver (type "ddc")
#   2. ddcutil - DDC/CI over i2c. With several DDC displays the one whose
#      DRM connector matches the first monitor in `hyprctl monitors -j`
#      (the primary) is chosen, so an ultrawide + side monitor setup
#      controls the main screen; a single display is used directly.
#   3. shader overlay - a dimming shader via decoration:screen_shader
# The detected mode is cached for 5 minutes in
# ~/.cache/ags-brightness-mode ("mode spec timestamp") so the slider does
# not re-probe i2c on every move.
#
# All ddcutil access is serialized with flock - multiple bars/sliders
# polling and setting at once would otherwise fight over the i2c bus and
# fail with flock contention, making the brightness "tweak" erratically.
# In hardware mode a failed read returns the last known value instead of
# the (possibly stale) shader value, so the slider never jumps.

BRIGHTNESS=""
if [[ ${1:-} == "--get" ]]; then
  BRIGHTNESS="--get"
else
  BRIGHTNESS="${1:?Usage: brightness-dim.sh <percent> | --get}"
  [[ "$BRIGHTNESS" =~ ^[0-9]+$ ]] || { echo "invalid brightness" >&2; exit 1; }
  if (( BRIGHTNESS < 5 )); then BRIGHTNESS=5; fi
  if (( BRIGHTNESS > 100 )); then BRIGHTNESS=100; fi
fi

CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}"
MODE_FILE="$CACHE_DIR/ags-brightness-mode-v2"
LAST_FILE="$CACHE_DIR/ags-brightness-last"
FAIL_FILE="$CACHE_DIR/ags-brightness-failures"
LOCK_FILE="$CACHE_DIR/ags-brightness-ddcutil.lock"
SHADER_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/hypr/shaders"
SHADER_FILE="$SHADER_DIR/ags-dim.frag"
MAX_HW_FAILURES=3

# Serialize and time-limit every ddcutil invocation (i2c is not safe to
# hammer, and a wedged bus would otherwise hang the call forever).
# --sleep-multiplier shrinks ddcutil's mandatory post-write settle delays
# (the default 1.0 makes every setvcp take seconds).
# Detection waits for the lock (it is rare, and a collision with the bar's
# own 5s poll must not bail out and mis-cache "shader"); the frequent
# getvcp reads fail fast instead, and setvcp waits briefly so drags do not
# pile up i2c transactions.
run_ddcutil_detect() {
  flock -w 20 "$LOCK_FILE" timeout 30 ddcutil --sleep-multiplier 0.5 --brief detect 2>/dev/null
}

run_ddcutil_get() {
  flock -n "$LOCK_FILE" timeout 20 ddcutil --sleep-multiplier 0.5 --brief getvcp "$@" 2>/dev/null
}

run_ddcutil_set() {
  flock -w 10 "$LOCK_FILE" timeout 20 ddcutil --sleep-multiplier 0.5 setvcp "$@" 2>/dev/null
}

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
  local bus="$1" cur
  cur=$(run_ddcutil_get 10 --bus "$bus" | awk '$1 == "VCP" && $2 == 10 { print $4; exit }')
  [[ -n $cur ]] || return 1
  awk -v c="$cur" 'BEGIN { if (c < 5) c = 5; if (c > 100) c = 100; printf "%d", c }'
}

# Parse `ddcutil --brief detect` into "i2c-bus connector" lines,
# skipping blocks without a Monitor: line (e.g. "Invalid display" ghosts).
detect_display_map() {
  awk '
    /^Display / { if (bus != "" && conn != "" && mon) print bus, conn; bus = ""; conn = ""; mon = 0; next }
    /I2C bus:/ { b = $NF; sub(/^\/dev\/i2c-/, "", b); bus = b; next }
    /DRM connector:/ { conn = $3; next }
    /Monitor:/ { mon = 1; next }
    /^[[:space:]]*$/ { if (bus != "" && conn != "" && mon) print bus, conn; bus = ""; next }
    END { if (bus != "" && conn != "" && mon) print bus, conn }
  '
}

# Pick the i2c bus to control: the one on the primary monitor's DRM
# connector when several displays exist, else the only display.
# NOTE: use --bus (not --display) for every call - --display makes ddcutil
# re-match displays on each invocation, costing seconds per slider move.
detect_ddcutil_bus() {
  local map primary bus conn p
  map="$(run_ddcutil_detect | detect_display_map)"
  [[ -n $map ]] || return 1
  if [[ $(wc -l <<< "$map") -eq 1 ]]; then
    printf '%s' "${map%% *}"
    return
  fi
  primary=$(hyprctl monitors -j 2>/dev/null | sed -n 's/.*"name": *"\([^"]*\)".*/\1/p' | head -1)
  [[ -n $primary ]] || return 1
  while IFS= read -r p; do
    bus="${p%% *}"
    conn="${p#* }"
    if [[ $conn == *"$primary"* ]]; then
      printf '%s' "$bus"
      return
    fi
  done <<< "$map"
  return 1
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
    local bus
    bus=$(detect_ddcutil_bus) || bus=""
    if [[ -n $bus ]]; then
      printf 'ddcutil %s' "$bus"
      return
    fi
  fi
  # 3) shader overlay
  printf 'shader'
}

cached_mode() {
  local mode="" spec="" ts=0 now
  if [[ -f $MODE_FILE ]]; then
    read -r mode spec ts < "$MODE_FILE" 2>/dev/null || { mode=""; spec=""; ts=0; }
  fi
  now=$(date +%s)
  if [[ -z $mode || $((now - ts)) -gt 300 ]]; then
    mode=$(detect_mode)
    spec=""
    case "$mode" in
      brightnessctl\ *) spec="${mode#brightnessctl }"; mode="brightnessctl" ;;
      ddcutil\ *) spec="${mode#ddcutil }"; mode="ddcutil" ;;
    esac
    mkdir -p "$CACHE_DIR"
    printf '%s %s %s\n' "$mode" "$spec" "$now" > "$MODE_FILE"
  fi
  printf '%s %s\n' "$mode" "$spec"
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
  mode=""; spec=""; pct=""
  read -r mode spec <<< "$(cached_mode)"
  pct=""
  case "$mode" in
    brightnessctl) pct=$(brightnessctl_percent "$spec") || pct="" ;;
    ddcutil) pct=$(ddcutil_percent "$spec") || pct="" ;;
  esac
  if [[ -n $pct ]]; then
    printf '%s\n' "$pct"
    rm -f "$FAIL_FILE"
    mkdir -p "$CACHE_DIR"
    printf '%s\n' "$pct" > "$LAST_FILE"
  elif [[ $mode == shader ]]; then
    shader_percent
  else
    # Hardware read failed (bus busy/wedged). After several consecutive
    # failures, demote to the shader overlay so a flaky i2c bus cannot keep
    # hanging the slider; until then report the last known value.
    fails=0
    [[ -f $FAIL_FILE ]] && read -r fails < "$FAIL_FILE" 2>/dev/null
    fails=$((fails + 1))
    if (( fails >= MAX_HW_FAILURES )); then
      printf 'shader %s\n' "$(date +%s)" > "$MODE_FILE"
      rm -f "$FAIL_FILE"
    else
      printf '%s\n' "$fails" > "$FAIL_FILE"
    fi
    cat "$LAST_FILE" 2>/dev/null || echo 100
  fi
  exit 0
fi

mode=""; spec=""
read -r mode spec <<< "$(cached_mode)"
case "$mode" in
  brightnessctl)
    # Hardware mode: a failed write must NOT fall back to the shader overlay,
    # or the dim layer would flicker on and off during i2c contention.
    brightnessctl --device="$spec" set "${BRIGHTNESS}%" >/dev/null 2>&1 || true
    clear_shader
    exit 0
    ;;
  ddcutil)
    run_ddcutil_set 10 "$BRIGHTNESS" --bus "$spec" >/dev/null 2>&1 || true
    clear_shader
    exit 0
    ;;
esac

apply_shader