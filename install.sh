#!/usr/bin/env bash
set -euo pipefail

# dotfiles installer - https://github.com/djstarlet/dotfiles
# drops the configs into ~/.config and installs the bar's npm deps

REPO_URL="https://github.com/djstarlet/dotfiles/archive/refs/heads/main.tar.gz"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "downloading dotfiles..."
curl -fsSL "$REPO_URL" | tar xz -C "$TMP" --strip-components=1

echo "installing Hyprland config (~/.config/hypr)..."
mkdir -p ~/.config
[ -d ~/.config/hypr ] && mv ~/.config/hypr ~/.config/hypr.bak
cp -r "$TMP/hypr" ~/.config/hypr

echo "installing the bar (~/.config/ags)..."
[ -d ~/.config/ags ] && mv ~/.config/ags ~/.config/ags.bak
cp -r "$TMP/ags/.config/ags" ~/.config/ags

echo "installing bar dependencies (npm install)..."
(cd ~/.config/ags && npm install)

echo "Done!"
