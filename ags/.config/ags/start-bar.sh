#!/usr/bin/env bash
set -euo pipefail

pkill -f "ags run" 2>/dev/null || true
pkill -f "/run/user/.*/ags.js" 2>/dev/null || true
pkill -x qs 2>/dev/null || true

exec ags run -d "$HOME/.config/ags"
