#!/usr/bin/env bash
# Check the deploy logic in install.sh: symlink guard, per-file merge,
# backup of differing files, preservation of user files. Run: bash test-deploy.sh
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"
. ./install.sh  # guard in install.sh prevents main() from running when sourced

fail() { echo "FAIL: $*"; exit 1; }
ok() { echo "ok: $*"; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# ---- fixture: a repo tree + a home with a mix of configs
SRC_PATH="$work/src"
mkdir -p "$SRC_PATH/hypr/scripts" "$SRC_PATH/ags/.config/ags/widget" "$SRC_PATH/albert/.config/albert"
echo "bind = new" > "$SRC_PATH/hypr/hyprland.conf"
echo "old theme" > "$SRC_PATH/ags/.config/ags/theme.config.ts"
echo "widget on" > "$SRC_PATH/ags/.config/ags/widget/widgets.config.ts"

HOME="$work/home"
mkdir -p "$HOME/.config/hypr" "$HOME/.config/ags/widget"
echo "bind = old" > "$HOME/.config/hypr/hyprland.conf"                                                 # differs -> overwritten + backed up
echo "user theme" > "$HOME/.config/ags/theme.config.ts"                                                  # differs -> overwritten + backed up
cp "$SRC_PATH/ags/.config/ags/widget/widgets.config.ts" "$HOME/.config/ags/widget/widgets.config.ts"    # identical -> skipped
echo "monitors=MYLAYOUT" > "$HOME/.config/hypr/monitors.conf"                                           # user file -> kept, not backed up

# ---- 1. symlinked config dir must be refused
mv "$HOME/.config/ags" "$HOME/.config/ags.real"
ln -s "$work/real-ags" "$HOME/.config/ags"
if ( deploy_dotfiles ) >/dev/null 2>&1; then
	fail "deploy succeeded despite symlinked ~/.config/ags"
fi
rm "$HOME/.config/ags"
mv "$HOME/.config/ags.real" "$HOME/.config/ags"
ok "symlink guard refuses symlinked config dir"

# ---- 2. deploy: merge semantics
deploy_dotfiles >/dev/null
grep -q "bind = new" "$HOME/.config/hypr/hyprland.conf" || fail "tracked file not updated"
grep -q "monitors=MYLAYOUT" "$HOME/.config/hypr/monitors.conf" || fail "user file clobbered"
grep -q "old theme" "$SRC_PATH/ags/.config/ags/theme.config.ts" || fail "fixture broken"
ok "merge-copy updates tracked files"

backup="$(find "$HOME/.config" -maxdepth 1 -type d -name 'dotfiles-backup-*' | head -1)"
[[ -n $backup ]] || fail "no backup dir created"
grep -q "bind = old" "$backup/hypr/hyprland.conf" || fail "differing file not backed up"
find "$backup" -name 'widgets.config.ts' | grep -q . && fail "identical file was backed up"
[[ -d $backup/ags ]] || fail "no ags backup dir"
ok "differing files backed up, identical files skipped"

# ---- 3. re-run is byte-stable: no backup created, configs identical
rm -rf "$backup"
capture() { ls "$HOME/.config"/dotfiles-backup-* 2>/dev/null || true; }
before="$(capture)"
deploy_dotfiles >/dev/null
after="$(capture)"
[[ $before == "$after" ]] || fail "re-run created a backup dir"
ok "re-run is quiet (no backups, no churn)"

echo "all checks passed"