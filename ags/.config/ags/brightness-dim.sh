#!/usr/bin/env bash
set -euo pipefail

BRIGHTNESS="${1:?Usage: brightness-dim.sh <percent>}"

[[ "$BRIGHTNESS" =~ ^[0-9]+$ ]] || { echo "invalid brightness" >&2; exit 1; }

# Clamp to 5–100
if [[ "$BRIGHTNESS" -lt 5 ]]; then
  BRIGHTNESS=5
elif [[ "$BRIGHTNESS" -gt 100 ]]; then
  BRIGHTNESS=100
fi

# Compute dim factor: (100 - percent) / 100
DIM=$(awk -v p="$BRIGHTNESS" 'BEGIN { printf "%.4f", (100 - p) / 100 }')

SHADER_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/hypr/shaders"
SHADER_FILE="$SHADER_DIR/ags-dim.frag"

mkdir -p "$SHADER_DIR"

cat > "$SHADER_FILE" <<SHADER
precision highp float;
varying vec2 v_texcoord;
uniform sampler2D tex;
uniform float alpha;
uniform int active;

void main() {
    vec4 c = texture2D(tex, v_texcoord);
    if (active == 1) {
        c.rgb *= (1.0 - $DIM);
    }
    gl_FragColor = c;
}
SHADER

hyprctl keyword decoration:screen_shader "$SHADER_FILE"
