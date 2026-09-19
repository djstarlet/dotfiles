#!/usr/bin/env bash
# Check the deploy logic in install.sh: symlink guard, per-file merge,
# backup of differing files, preservation of user files, and the ble.sh
# feature-flag/theme deploy and migration. Run: bash test-deploy.sh
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"
. ./install.sh  # guard in install.sh prevents main() from running when sourced

fail() { echo "FAIL: $*"; exit 1; }
ok() { echo "ok: $*"; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# ---- fixture: a repo tree + a home with a mix of configs
SRC_PATH="$work/src"
mkdir -p "$SRC_PATH/hypr/scripts" "$SRC_PATH/ags/.config/ags/widget" "$SRC_PATH/albert/.config/albert" "$SRC_PATH/bash"
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

# ---- 4. ble.sh feature flags: fresh deploy, idempotency
cp ./bash/features.sh "$SRC_PATH/bash/features.sh"
cp ./bash/gen-blesh-theme.sh "$SRC_PATH/bash/gen-blesh-theme.sh"
rm -f "$HOME/.bashrc" "$HOME/.config/dotfiles/features.sh"
ensure_features_file >/dev/null
grep -q 'dotfiles_blesh' "$HOME/.config/dotfiles/features.sh" || fail "features file not deployed"
ensure_blesh >/dev/null
grep -q 'dotfiles_blesh' "$HOME/.bashrc" || fail "flag-aware ble block missing"
grep -q 'dotfiles/features.sh' "$HOME/.bashrc" || fail "features source line missing"
grep -q 'dotfiles/blesh-theme.sh' "$HOME/.bashrc" || fail "theme source line missing"
ok "fresh install deploys features file and flag-aware ble block"

# user edits must survive re-deploys
echo 'dotfiles_blesh=0' > "$HOME/.config/dotfiles/features.sh"
ensure_features_file >/dev/null
grep -q 'dotfiles_blesh=0' "$HOME/.config/dotfiles/features.sh" || fail "edited features file overwritten"
ok "edited features file left alone"

before="$(cat "$HOME/.bashrc")"
ensure_features_file >/dev/null
ensure_blesh >/dev/null
[[ $(cat "$HOME/.bashrc") == "$before" ]] || fail "re-run changed the bashrc"
[[ $(grep -c 'bleopt complete_auto_history=' "$HOME/.bashrc") == 1 ]] || fail "ble block duplicated"
ok "second run is a no-op"

# ---- 5. ble.sh theme generator: deploy, exec bit, generation, re-run no-op
gen="$HOME/.config/dotfiles/gen-blesh-theme.sh"
rm -f "$gen"
ensure_blesh_theme_gen >/dev/null
[[ -x $gen ]] || fail "theme generator not deployed executable"
[[ $(stat -c %a "$gen") == 755 ]] || fail "theme generator mode is not 755"
cmp -s ./bash/gen-blesh-theme.sh "$gen" || fail "theme generator differs from the repo copy"
ok "theme generator deployed with mode 755"

mkdir -p "$HOME/.config/ags"
echo '{"accent":"#55adff"}' > "$HOME/.config/ags/theme-colors.json"
generate_blesh_theme >/dev/null
grep -q 'ble-color-setface' "$HOME/.config/dotfiles/blesh-theme.sh" || fail "theme not generated at install time"
ok "install-time generation writes blesh-theme.sh"

echo 'user edit' > "$gen"
ensure_blesh_theme_gen >/dev/null
[[ $(cat "$gen") == 'user edit' ]] || fail "edited theme generator overwritten"
ok "edited theme generator left alone"

before="$(cat "$gen")"; before_actions="${#SUMMARY_ACTIONS[@]}"
ensure_blesh_theme_gen >/dev/null
[[ $(cat "$gen") == "$before" ]] || fail "theme generator re-run changed the file"
[[ ${#SUMMARY_ACTIONS[@]} == "$before_actions" ]] || fail "theme generator re-run recorded an action"
ok "theme generator re-run is a no-op"

# ---- 6. migration of the exact block older installers appended
HOME2="$work/home2"
mkdir -p "$HOME2"
printf '\n# ble.sh - live completion suggestions (like CachyOS); no history suggestions\nif [ -f /usr/share/blesh/ble.sh ]; then\n  source /usr/share/blesh/ble.sh\n  bleopt complete_auto_history=\nfi\n' > "$HOME2/.bashrc"
HOME="$HOME2" ensure_blesh >/dev/null
grep -q 'dotfiles_blesh' "$HOME2/.bashrc" || fail "flag-aware block missing after migration"
grep -q 'dotfiles/features.sh' "$HOME2/.bashrc" || fail "features source line missing after migration"
grep -q 'no history suggestions' "$HOME2/.bashrc" && fail "old block still present after migration"
[[ $(grep -c 'bleopt complete_auto_history=' "$HOME2/.bashrc") == 1 ]] || fail "migration duplicated the new block"
ok "old unconditional block migrated exactly once"

before="$(cat "$HOME2/.bashrc")"
HOME="$HOME2" ensure_blesh >/dev/null
[[ $(cat "$HOME2/.bashrc") == "$before" ]] || fail "migration re-run changed the bashrc"
ok "migration re-run is a no-op"

# a pre-theme flag-aware block (current public installer output) upgrades once
HOME3="$work/home3"
mkdir -p "$HOME3"
printf '%s\n' \
	'# dotfiles feature flags - edit ~/.config/dotfiles/features.sh to toggle' \
	'[ -f "$HOME/.config/dotfiles/features.sh" ] && . "$HOME/.config/dotfiles/features.sh"' \
	'' \
	'# ble.sh - live completion suggestions (like CachyOS); toggle via dotfiles_blesh' \
	'if [ "${dotfiles_blesh:-1}" = 1 ] && [ -f /usr/share/blesh/ble.sh ]; then' \
	'  source /usr/share/blesh/ble.sh' \
	'  bleopt complete_auto_history=' \
	'fi' > "$HOME3/.bashrc"
HOME="$HOME3" ensure_blesh >/dev/null
grep -q 'dotfiles/blesh-theme.sh' "$HOME3/.bashrc" || fail "pre-theme block not upgraded"
[[ $(grep -c 'bleopt complete_auto_history=' "$HOME3/.bashrc") == 1 ]] || fail "upgrade duplicated the ble block"
ok "pre-theme flag-aware block upgraded exactly once"

before="$(cat "$HOME3/.bashrc")"
HOME="$HOME3" ensure_blesh >/dev/null
[[ $(cat "$HOME3/.bashrc") == "$before" ]] || fail "upgraded bashrc changed on re-run"
ok "upgraded bashrc re-run is a no-op"

# ---- 7. feature flag semantics, with the ble.sh path mocked for the test
mock="$work/mock/blesh/ble.sh"
mkdir -p "$(dirname "$mock")"
printf 'bleopt() { :; }\nBLE_MOCK_SOURCED=1\n' > "$mock"
probe="$work/probe"
mkdir -p "$probe/.config/dotfiles"
sed "s#/usr/share/blesh/ble.sh#$mock#g" "$HOME/.bashrc" > "$probe/.bashrc"
run_probe() { HOME="$probe" bash --noprofile --norc -c '. "$HOME/.bashrc"; printf "%s" "${BLE_MOCK_SOURCED:-0}"'; }
echo 'dotfiles_blesh=0' > "$probe/.config/dotfiles/features.sh"
[[ $(run_probe) == 0 ]] || fail "dotfiles_blesh=0 still sourced ble.sh"
echo 'dotfiles_blesh=1' > "$probe/.config/dotfiles/features.sh"
[[ $(run_probe) == 1 ]] || fail "dotfiles_blesh=1 did not source ble.sh"
ok "dotfiles_blesh gates ble.sh on/off"

echo "all checks passed"