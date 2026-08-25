#!/usr/bin/env bash
set -euo pipefail

pkill -f "ags run" 2>/dev/null || true
pkill -f "/run/user/.*/ags.js" 2>/dev/null || true

dots_json="$HOME/.config/ags/ws-dot-colors.json"
if [ -f "$dots_json" ]; then
  # SYNC WITH settings.sh / widget/theme.config.ts workspaceDotColors
  export AGS_WS_DOT_COLORS=$(dots_json="$dots_json" python3 -c 'import json,os; d=json.load(open(os.environ["dots_json"])); print(",".join(d.get("dots", [])))' 2>/dev/null || true)
fi
[ -n "${AGS_WS_DOT_COLORS:-}" ] || export AGS_WS_DOT_COLORS="#ef3d34,#f0a114,#24a337,#3b83e6,#9b5ad7,#28a9a0,#e96f3a,#cf5398"
# Window "glow" (decoration:shadow:color) intensity: two hex digits of alpha.
export AGS_GLOW_ALPHA="${AGS_GLOW_ALPHA:-18}"

exec ags run -d "$HOME/.config/ags"
