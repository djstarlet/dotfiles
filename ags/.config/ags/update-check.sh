#!/usr/bin/env bash
# Bar update watcher - fingerprints the locally installed ags config against
# the latest djstarlet/dotfiles release and records the result in
# ~/.config/ags/update-check.json, which the bar's notification bell reads.
#
# Fired from start-bar.sh (backgrounded). Offline/failure = keep the previous
# result, so a flaky network never clears a pending update notice.
set -euo pipefail

AGS_DIR="$HOME/.config/ags"
OUT="$AGS_DIR/update-check.json"
CACHE="$AGS_DIR/update-check.cache"          # cached remote fingerprint + mtime
REPO_TARBALL="https://github.com/djstarlet/dotfiles/archive/refs/heads/main.tar.gz"
CACHE_TTL=900                                # 15min between tarball downloads

[ -d "$AGS_DIR" ] || exit 0

# Only one watcher at a time: flock releases automatically when the
# process exits, so a stray watcher after a bar restart is impossible.
exec 9>"$AGS_DIR/update-check.lock"
flock -n 9 || exit 0

# fingerprint() - content hash of a config tree, excluding runtime state.
# The same excludes must apply to local and remote trees.
fingerprint() {
  local dir="$1"
  # -L: dereference symlinks - on machines where ~/.config/ags is a symlink
  # into a dotfiles checkout, plain find would hash an empty file list.
  # Hash from inside the tree so sha256sum sees relative paths: absolute
  # paths differ between the installed bar and the extracted tarball.
  (
    cd "$dir" && find -L . -type f \
      -not -path '*/@girs/*' -not -path '*/node_modules/*' \
      -not -name 'ws-dot-colors.json' -not -name 'saved-presets.json' \
      -not -name 'theme-colors.json' -not -name 'google-calendar-auth.json' \
      -not -name 'update-check.json' -not -name 'update-check.cache' -not -name 'update-check.lock' \
      -not -name 'dismissed-notifications.json' \
      -not -name 'notifications.json' -not -name 'notification-spool.jsonl' \
      -not -name '*.tsbuildinfo' -not -name 'package-lock.json' \
      -print0 | sort -z | xargs -0 sha256sum | sha256sum | cut -c1-64
  )
}

local_sha="$(fingerprint "$AGS_DIR")"

# Remote fingerprint, cached so a bar restart doesn't re-download the tarball.
remote_sha=""
if [ -s "$CACHE" ] && [ $(( $(date +%s) - "$(stat -c %Y "$CACHE")" )) -lt "$CACHE_TTL" ]; then
  remote_sha="$(cut -d' ' -f1 "$CACHE")"
else
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  curl -fsSL --max-time 30 "$REPO_TARBALL" -o "$tmp/dotfiles.tar.gz" || exit 0
  tar -xzf "$tmp/dotfiles.tar.gz" -C "$tmp" --strip-components=1
  remote_sha="$(fingerprint "$tmp/ags/.config/ags")"
  printf '%s\n' "$remote_sha" > "$CACHE"
fi

update_available=false
[ "$local_sha" != "$remote_sha" ] && update_available=true

cat > "$OUT" <<EOF
{"checked_at": "$(date -Is)", "update_available": $update_available, "local_sha": "$local_sha", "remote_sha": "$remote_sha"}
EOF