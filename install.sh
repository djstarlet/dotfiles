#!/usr/bin/env bash
# dotfiles installer - https://github.com/djstarlet/dotfiles
#
# Installs the Hyprland + AGS bar setup: system dependencies, the AGS CLI,
# and the configs in ~/.config.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/djstarlet/dotfiles/main/install.sh | bash
#   # or from a checkout:
#   ./install.sh
#
# The distribution is detected automatically via /etc/os-release (no user input).
# Supported families and package managers:
#   Arch / Arch-based ....... pacman (+ yay bootstrapped from the AUR when missing)
#   Debian / Ubuntu ......... apt-get   (AGS is built from source)
#   Fedora .................. dnf       (AGS comes from the solopasha/hyprland COPR)
#   Gentoo .................. emerge    (AGS is built from source; GURU only ships AGS v1,
#                                        which is incompatible with this config)
#
# Notes / limitations:
#   - Debian/Ubuntu: hyprland requires trixie or newer / universe enabled.
#   - Nerd Fonts must be installed manually on Debian/Fedora (see README.md).
#   - albert and librewolf are optional ("changeable") deps needing third-party
#     repos on some distros; failures there are warnings, not fatal errors.
#   - grimblast (used by the screenshot keybinds): AUR 'grimblast-git' on Arch,
#     'hyprland-contrib' from the solopasha COPR on Fedora, 'app-misc/grimblast'
#     from GURU on Gentoo (best-effort), and installed from hyprwm/contrib into
#     ~/.local/bin on Debian/Ubuntu.
#   - The 'ags' npm package is no longer published on the registry; the AGS CLI
#     bundles the 'ags/*' and 'gnim' modules itself (e.g. /usr/share/ags/js/
#     node_modules), so no npm install step is needed for the bar config.
#   - emerge may prompt for license/config changes; portage has no universal -y flag.
#
#   - Adds an 'ags-restart()' helper, bash tab completion (bash-completion)
#     and ble.sh as-you-type suggestions (AUR 'blesh' / Debian 'ble.sh') to
#     ~/.bashrc - all idempotent.
# Set INSTALL_DRY_RUN=1 to print every mutating command instead of running it.

set -euo pipefail

# ---------------------------------------------------------------- constants

REPO_URL="https://github.com/djstarlet/dotfiles/archive/refs/heads/main.tar.gz"
YAY_AUR_URL="https://aur.archlinux.org/yay.git"
ASTAL_REPO_URL="https://github.com/aylur/astal.git"
AGS_REPO_URL="https://github.com/aylur/ags.git"
WL_CLIP_PERSIST_URL="https://github.com/Linus789/wl-clip-persist.git"
CONTRIB_REPO_URL="https://github.com/hyprwm/contrib.git"
FEDORA_COPR="solopasha/hyprland"

OS_RELEASE_FILE="${OS_RELEASE_FILE:-/etc/os-release}"
DRY_RUN="${INSTALL_DRY_RUN:-0}"

# ---------------------------------------------------------------- logging

info() { printf '==> %s\n' "$*"; }
warn() { printf '==> WARNING: %s\n' "$*" >&2; }
error() { printf '==> ERROR: %s\n' "$*" >&2; }
die() {
	error "$*"
	exit 1
}

command_exists() { command -v "$1" >/dev/null 2>&1; }

# Run a single command, or just print it in dry-run mode.
run_step() {
	if (( DRY_RUN )); then
		info "[dry-run] $*"
		return 0
	fi
	"$@"
}

# ------------------------------------------------------- temp dir management

TMP_DIRS=()
cleanup() {
	local d
	for d in ${TMP_DIRS[@]+"${TMP_DIRS[@]}"}; do
		rm -rf "$d"
	done
}
trap cleanup EXIT

new_tmp() {
	local dir
	dir="$(mktemp -d)"
	TMP_DIRS+=("$dir")
	printf '%s\n' "$dir"
}

# ------------------------------------------------------------ global state

DISTRO=""          # arch | debian | fedora | gentoo
DISTRO_ID=""       # raw ID from /etc/os-release
PRETTY_NAME_TXT="" # PRETTY_NAME from /etc/os-release
PKG_MGR=""         # pacman | apt | dnf | yum | emerge
SRC_PATH=""        # real path of the repo copy used to deploy configs
SRC_LABEL=""       # human-readable description of where configs came from

APT_UPDATED=0
COPR_ENABLED=0

MAIN_PKGS=()              # required packages from the native repos
AUR_PKGS=()               # Arch-only AUR packages (required, installed with yay)
OPTIONAL_PKGS=()          # best-effort packages; failures become warnings

SUMMARY_PKGS_INSTALLED=() # package names handed to a package manager
SUMMARY_PKGS_PRESENT=()   # package names already installed (skipped)
SUMMARY_ACTIONS=()        # non-package-manager actions performed

COPR_PKGS=()              # Fedora-only packages from the enabled COPR

# ---------------------------------------------------------- distro detection

map_distro_family() {
	case "$1" in
	arch | manjaro | endeavouros | garuda | cachyos | artix | archarm) printf '%s\n' arch ;;
	debian | ubuntu | linuxmint | pop | neon | kali | zorin | elementary | devuan) printf '%s\n' debian ;;
	fedora | nobara | ultramarine) printf '%s\n' fedora ;;
	gentoo | funtoo) printf '%s\n' gentoo ;;
	*) printf '%s\n' "" ;;
	esac
}

detect_distro() {
	if [[ ! -r $OS_RELEASE_FILE ]]; then
		die "Cannot read '$OS_RELEASE_FILE': cannot detect your distribution."
	fi
	# shellcheck disable=SC1090  # trusted, distro-provided file
	. "$OS_RELEASE_FILE"
	DISTRO_ID="${ID:-unknown}"
	PRETTY_NAME_TXT="${PRETTY_NAME:-$DISTRO_ID}"

	DISTRO="$(map_distro_family "$DISTRO_ID")"
	if [[ -z $DISTRO && -n ${ID_LIKE:-} ]]; then
		# Fall back to ID_LIKE tokens (e.g. ID=manjaro has ID_LIKE=arch).
		local token
		for token in $ID_LIKE; do
			DISTRO="$(map_distro_family "$token")"
			[[ -n $DISTRO ]] && break
		done
	fi

	if [[ -z $DISTRO ]]; then
		die "Unsupported distribution '${DISTRO_ID}' (${PRETTY_NAME_TXT}).
This installer supports Arch-based, Debian/Ubuntu-based, Fedora and Gentoo systems.
Install the dependencies manually - see README.md ('Install Dependencies')."
	fi
	info "Detected distribution: ${PRETTY_NAME_TXT} (${DISTRO_ID}) -> family '${DISTRO}'"
}

detect_package_manager() {
	case "$DISTRO" in
	arch) PKG_MGR=pacman ;;
	debian) PKG_MGR=apt ;;
	gentoo) PKG_MGR=emerge ;;
	fedora)
		if command_exists dnf; then
			PKG_MGR=dnf
		elif command_exists yum; then
			warn "dnf not found - falling back to yum."
			PKG_MGR=yum
		fi
		;;
	esac

	local probe="$PKG_MGR"
	[[ $PKG_MGR == apt ]] && probe="apt-get"
	if [[ -z $PKG_MGR ]] || ! command_exists "$probe"; then
		die "Expected package manager for '${DISTRO}' ('${probe:-none}') was not found.
Cannot install dependencies automatically. See README.md ('Install Dependencies')."
	fi
	info "Using package manager: ${PKG_MGR}"
}

# --------------------------------------------------------- privilege checks

require_normal_user_and_sudo() {
	if (( EUID == 0 )); then
		die "This script must not be run as root (it builds AUR/npm packages as your user).
Run it as your normal user; it uses sudo only where root is actually required:
  curl -fsSL https://raw.githubusercontent.com/djstarlet/dotfiles/main/install.sh | bash"
	fi
	if ! command_exists sudo; then
		die "sudo is required but not installed. Install sudo and allow your user to use it
(e.g. wheel/sudo group), then re-run this script."
	fi
}

# -------------------------------------------------- package manager abstraction

package_installed() {
	case "$PKG_MGR" in
	pacman) pacman -Qi "$1" >/dev/null 2>&1 ;;
	apt) dpkg-query -W -f='${db:Status-Abbrev}' "$1" 2>/dev/null | grep -q '^ii' ;;
	dnf | yum) rpm -q "$1" >/dev/null 2>&1 ;;
	emerge) portageq match / "$1" >/dev/null 2>&1 ;;
	esac
}

install_repo_packages() {
	local requested=("$@")
	((${#requested[@]})) || return 0

	local todo=() skipped=() pkg
	for pkg in "${requested[@]}"; do
		if package_installed "$pkg"; then
			skipped+=("$pkg")
		else
			todo+=("$pkg")
		fi
	done

	((${#skipped[@]})) && info "Already installed, skipping: ${skipped[*]}"
	if ((${#skipped[@]})); then
		SUMMARY_PKGS_PRESENT+=("${skipped[@]}")
	fi
	((${#todo[@]})) || return 0

	info "Installing via ${PKG_MGR}: ${todo[*]}"
	local ok=0
	case "$PKG_MGR" in
	pacman)
		run_step sudo pacman -S --needed --noconfirm -- "${todo[@]}" || ok=1
		;;
	apt)
		if (( ! APT_UPDATED )); then
			info "Refreshing apt package lists..."
			run_step sudo env DEBIAN_FRONTEND=noninteractive apt-get update -y || ok=1
		fi
		if (( ! ok )); then
			run_step sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y -- "${todo[@]}" || ok=1
		fi
		;;
	dnf)
		run_step sudo dnf install -y -- "${todo[@]}" || ok=1
		;;
	yum)
		run_step sudo yum install -y -- "${todo[@]}" || ok=1
		;;
	emerge)
		# --noreplace = install-if-missing; portage may still prompt for licenses/config.
		run_step sudo emerge --noreplace --nospinner "${todo[@]}" || ok=1
		;;
	esac

	if (( ok )); then
		return 1
	fi
	SUMMARY_PKGS_INSTALLED+=("${todo[@]}")
	return 0
}

install_aur_packages() {
	local pkgs=("$@")
	((${#pkgs[@]})) || return 0
	ensure_yay

	# AUR packages land in the pacman database, so pacman -Qi detects them.
	# Skipping installed ones keeps reruns quiet and truly idempotent.
	local todo=() skipped=() pkg
	for pkg in "${pkgs[@]}"; do
		if pacman -Qi "$pkg" >/dev/null 2>&1; then
			skipped+=("$pkg")
		else
			todo+=("$pkg")
		fi
	done
	((${#skipped[@]})) && info "Already installed, skipping AUR packages: ${skipped[*]}"
	if ((${#skipped[@]})); then
		SUMMARY_PKGS_PRESENT+=("${skipped[@]}")
	fi
	((${#todo[@]})) || return 0

	local rc=0
	for pkg in "${todo[@]}"; do
		info "Installing AUR package: ${pkg}"
		if run_step yay -S --needed --noconfirm -- "$pkg"; then
			SUMMARY_PKGS_INSTALLED+=("$pkg")
		else
			error "Failed to install AUR package: ${pkg}"
			rc=1
		fi
	done
	return "$rc"
}

# try_install_optional <installer-function> <packages...>
# Attempts each package; failures are collected into a single warning.
try_install_optional() {
	local installer="$1"
	shift
	local failed=() pkg
	for pkg in "$@"; do
		if "$installer" "$pkg"; then
			:
		else
			failed+=("$pkg")
		fi
	done
	if ((${#failed[@]})); then
		warn "Optional packages were not installed automatically: ${failed[*]}
See README.md ('Changeable deps' / 'Install Dependencies') for manual instructions."
	fi
	return 0
}

install_required_packages() {
	if ! install_repo_packages "$@"; then
		die "Failed to install required system packages via ${PKG_MGR}.
Check the error above; distro-specific notes are in README.md ('Install Dependencies')."
	fi
}

# ---------------------------------------------------------------- yay (Arch)

ensure_yay() {
	command_exists yay && return 0

	info "yay not found - installing build prerequisites (base-devel, git)..."
	install_repo_packages base-devel git
	command_exists git || die "git is required to build yay but is still missing."

	local builddir
	builddir="$(new_tmp)"
	info "Cloning the official yay repository from the AUR..."
	run_step git clone --depth=1 "$YAY_AUR_URL" "$builddir/yay"

	if (( DRY_RUN )); then
		info "[dry-run] cd '${builddir}/yay' && makepkg -si --noconfirm --needed"
	else
		info "Building and installing yay as user '$(id -un)' (makepkg must never run as root)..."
		(
			cd "$builddir/yay"
			makepkg -si --noconfirm --needed
		)
		# Clean up the build directory right away (the EXIT trap covers failure paths).
		rm -rf "$builddir"
	fi

	if ! command_exists yay; then
		die "yay installation did not produce an executable 'yay'.
Install it manually, then re-run this script:
  git clone https://aur.archlinux.org/yay.git
  cd yay && makepkg -si"
	fi
	SUMMARY_ACTIONS+=("bootstrapped yay from the AUR")
}

# ------------------------------------------------------------- AGS install

enable_fedora_copr() {
	(( COPR_ENABLED )) && return 0
	info "Enabling COPR '${FEDORA_COPR}' (provides aylurs-gtk-shell and hyprland-contrib)..."
	install_repo_packages 'dnf-command(copr)'
	run_step sudo dnf -y copr enable "$FEDORA_COPR"
	COPR_ENABLED=1
	SUMMARY_ACTIONS+=("enabled COPR ${FEDORA_COPR}")
}

build_ags_from_source() {
	# Documented source-install method: Astal libraries first, then the ags CLI.
	# https://aylur.github.io/ags/guide/install.html
	info "No native AGS package for this distribution - building AGS from source (this can take a while)..."

	case "$DISTRO" in
	debian)
		install_repo_packages g++ gcc meson ninja-build valac valadoc \
			gobject-introspection libgirepository1.0-dev wayland-protocols \
			libgtk-3-dev libgtk-layer-shell-dev libgtk-4-dev libgtk4-layer-shell-dev \
			golang-go nodejs npm
		;;
	gentoo)
		install_repo_packages dev-build/meson dev-util/ninja dev-lang/vala dev-lang/go \
			dev-libs/gobject-introspection dev-libs/wayland dev-libs/wayland-protocols \
			dev-util/wayland-scanner x11-libs/gtk+ gui-libs/gtk-layer-shell \
			gui-libs/gtk4-layer-shell net-libs/nodejs
		;;
	esac

	local srcdir
	srcdir="$(new_tmp)"

	if (( DRY_RUN )); then
		info "[dry-run] clone ${ASTAL_REPO_URL}; meson setup + sudo meson install for lib/astal/{io,gtk3,gtk4}"
		info "[dry-run] clone ${AGS_REPO_URL}; npm install; meson setup build; sudo meson install -C build"
	else
		git clone --depth=1 "$ASTAL_REPO_URL" "$srcdir/astal"
		local component
		for component in lib/astal/io lib/astal/gtk3 lib/astal/gtk4; do
			info "Building Astal component: ${component##*/}"
			(
				cd "$srcdir/astal/$component"
				meson setup build
				sudo meson install -C build
			)
		done
		if [[ $PKG_MGR != pacman && $PKG_MGR != emerge ]]; then
			sudo ldconfig
		fi

		git clone --depth=1 "$AGS_REPO_URL" "$srcdir/ags"
		info "Building the AGS CLI..."
		(
			cd "$srcdir/ags"
			npm install --no-audit --no-fund
			meson setup build
			sudo meson install -C build
		)
		if [[ $PKG_MGR != pacman && $PKG_MGR != emerge ]]; then
			sudo ldconfig
		fi
	fi

	if ! command_exists ags; then
		die "AGS was built but 'ags' is still not on PATH.
Install it manually per https://aylur.github.io/ags/guide/install.html , then re-run."
	fi
	SUMMARY_ACTIONS+=("built AGS (CLI + Astal libraries) from source")
}

ensure_ags() {
	if command_exists ags; then
		local ver
		ver="$(ags --version 2>/dev/null || true)"
		info "AGS already installed${ver:+ ($ver)}."
		return 0
	fi
	case "$DISTRO" in
	arch)
		# Current AGS docs recommend aylurs-gtk-shell-git (provides /usr/bin/ags).
		install_aur_packages aylurs-gtk-shell-git
		;;
	fedora)
		enable_fedora_copr
		install_required_packages aylurs-gtk-shell
		;;
	*)
		build_ags_from_source
		;;
	esac
	if ! command_exists ags; then
		die "AGS installation did not produce an 'ags' executable on PATH."
	fi
	SUMMARY_ACTIONS+=("installed AGS (Aylur GTK Shell)")
}

# --------------------------------------------------------- config deployment

resolve_source_dir() {
	local script_dir=""
	if [[ -n ${BASH_SOURCE[0]:-} ]]; then
		script_dir="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" >/dev/null 2>&1 && pwd)" ||
			script_dir=""
	fi

	if [[ -d ${script_dir}/hypr && -d ${script_dir}/ags/.config/ags && -d ${script_dir}/albert/.config/albert ]]; then
		SRC_PATH="$script_dir"
		SRC_LABEL="${script_dir} (local checkout)"
	else
		local tmp
		tmp="$(new_tmp)"
		info "Downloading dotfiles tarball..."
		run_step curl -fsSL "$REPO_URL" -o "$tmp/dotfiles.tar.gz"
		run_step tar -xzf "$tmp/dotfiles.tar.gz" -C "$tmp" --strip-components=1
		SRC_PATH="$tmp"
		SRC_LABEL="$tmp (downloaded tarball)"
	fi
}

# Copy every file under src/ into dst/, file by file, so that:
#   - user-generated files (monitors.conf, ws-dot-colors.json, calendar auth...) survive
#   - already-identical files are skipped (no mtime churn, keeps re-runs quiet)
#   - differing files are backed up to backup/<relpath> before being overwritten
#   - per-file symlinks in the user's config are refused
merge_copy() {
	local src="$1" dst="$2" backup="$3"
	local f rel target
	while IFS= read -r -d '' f; do
		rel="${f#"$src"}"
		target="$dst$rel"
		mkdir -p "$(dirname "$target")"
		if [[ -L $target ]]; then
			warn "Skipping ${target} - it is a symlink; refusing to write through it. Remove the symlink if a tracked file belongs there."
			continue
		fi
		if [[ -e $target ]]; then
			cmp -s "$f" "$target" && continue
			mkdir -p "$backup/$(dirname "$rel")"
			cp -p "$target" "$backup$rel"
		fi
		cp -p "$f" "$target"
	done < <(find "$src" -type f -print0)
}

deploy_dotfiles() {
	# Symlink guard: cp -R writes THROUGH a symlinked config dir and would
	# clobber whatever it points at (e.g. a dotfiles checkout). Refuse.
	local dir cfg
	for dir in hypr ags albert; do
		cfg="$HOME/.config/$dir"
		if [[ -L $cfg ]]; then
			die "$cfg is a symlink -> '$(readlink "$cfg")'.
This installer refuses to write through symlinks (cp would overwrite the symlink
target's files). Move the config to a real directory first, then re-run."
		fi
	done

	if (( DRY_RUN )); then
		info "[dry-run] merge-copy repo configs into ~/.config/hypr, ~/.config/ags and ~/.config/albert (identical files skipped, differing files backed up)"
		return 0
	fi

	# Merge-copy: repo files overwrite the tracked configs, while
	# user-generated files survive every run - e.g. nwg-displays'
	# monitors.conf, current-wallpaper.png, ags' ws-dot-colors.json and
	# calendar auth. (A wholesale dir swap here used to wipe monitors.conf
	# and reset the monitor layout on every re-run.)
	#
	# Re-runs are now safe: differing files are backed up to a dated
	# directory first; identical files are skipped.
	mkdir -p "$HOME/.config/hypr" "$HOME/.config/ags" "$HOME/.config/albert"
	local backup_dir="$HOME/.config/dotfiles-backup-$(date +%Y%m%d-%H%M%S)"
	merge_copy "$SRC_PATH/hypr" "$HOME/.config/hypr" "$backup_dir/hypr"
	merge_copy "$SRC_PATH/ags/.config/ags" "$HOME/.config/ags" "$backup_dir/ags"
	merge_copy "$SRC_PATH/albert/.config/albert" "$HOME/.config/albert" "$backup_dir/albert"
	if [[ -d $backup_dir ]]; then
		info "Changed configs backed up to ${backup_dir}/ - restore from there if needed."
	fi
	info "Installed Hyprland + AGS + Albert configs (user-generated files preserved)"
	SUMMARY_ACTIONS+=("deployed configs to ~/.config/hypr, ~/.config/ags and ~/.config/albert (user files preserved; overwritten files backed up)")
}

# -------------------------------------------------- convenience helper (bashrc)

# ags-restart: restart the bar from a terminal after config tweaks.
ensure_bashrc_helper() {
	local bashrc="$HOME/.bashrc"
	if grep -q "ags-restart()" "$bashrc" 2>/dev/null; then
		info "ags-restart() already present in ${bashrc}."
		return 0
	fi
	if (( DRY_RUN )); then
		info "[dry-run] append ags-restart() helper to ${bashrc}"
		return 0
	fi
	info "Adding ags-restart() helper to ${bashrc}..."
	printf '\n# Restart the AGS bar (start-bar.sh pkills old bars + execs new one)\nags-restart() { ~/.config/ags/start-bar.sh &disown; }\n' >> "$bashrc"
	SUMMARY_ACTIONS+=("added ags-restart() helper to ~/.bashrc")
}

# Enable bash tab completion (the bash-completion package, like CachyOS's
# default bash setup), unless ~/.bashrc already sources it.
ensure_bash_completion() {
	local bashrc="$HOME/.bashrc"
	if grep -q "bash_completion" "$bashrc" 2>/dev/null; then
		info "bash tab completion already enabled in ${bashrc}."
		return 0
	fi
	if (( DRY_RUN )); then
		info "[dry-run] append bash-completion source block to ${bashrc}"
		return 0
	fi
	info "Enabling bash tab completion in ${bashrc}..."
	printf '\n# Enable bash tab completion (bash-completion package)\nif [ -f /usr/share/bash-completion/bash_completion ]; then\n  . /usr/share/bash-completion/bash_completion\nfi\n' >> "$bashrc"
	SUMMARY_ACTIONS+=("enabled bash tab completion in ~/.bashrc")
}

# ble.sh - bash line editor with as-you-type suggestions and syntax
# highlighting (the CachyOS bash experience). Available via AUR on Arch and
# the ble.sh package on Debian/Ubuntu trixie+; elsewhere the guarded source
# block below simply stays dormant.
ensure_blesh() {
	local bashrc="$HOME/.bashrc"
	if grep -q "/usr/share/blesh/ble.sh" "$bashrc" 2>/dev/null; then
		info "ble.sh already enabled in ${bashrc}."
		return 0
	fi
	if (( DRY_RUN )); then
		info "[dry-run] append ble.sh source block to ${bashrc}"
		return 0
	fi
	info "Enabling ble.sh as-you-type completion in ${bashrc}..."
	printf '\n# ble.sh - live completion suggestions (like CachyOS); no history suggestions\nif [ -f /usr/share/blesh/ble.sh ]; then\n  source /usr/share/blesh/ble.sh\n  bleopt complete_auto_history=\nfi\n' >> "$bashrc"
	SUMMARY_ACTIONS+=("enabled ble.sh in ~/.bashrc")
}

# ------------------------------------------------------ bar bundle verification

# The AGS CLI ships and bundles the 'ags/*' and 'gnim' JS modules itself (e.g.
# /usr/share/ags/js/node_modules); the 'ags' npm package is no longer published,
# so a local npm install must not be attempted. Instead we verify the deployed
# bar config actually bundles, which resolves every ags/* and gnim import.
verify_bar_bundle() {
	local ags_dir="$HOME/.config/ags"
	if (( ! DRY_RUN )); then
		[[ -f $ags_dir/app.ts ]] || die "Missing $ags_dir/app.ts - config deployment failed?"
	fi

	if (( DRY_RUN )); then
		info "[dry-run] verify the bar config bundles: ags bundle ${ags_dir}/app.ts"
		return 0
	fi

	local out_dir out_file
	out_dir="$(new_tmp)"
	out_file="$out_dir/bar-bundle-test.js"
	info "Verifying the bar config bundles (resolves ags/* and gnim imports)..."
	if ags bundle "$ags_dir/app.ts" "$out_file" >/dev/null 2>&1; then
		info "Verified: the bar config bundles successfully (gnim + ags modules resolve)."
		SUMMARY_ACTIONS+=("verified the bar config bundles with the installed AGS CLI")
	else
		die "The bar config failed to bundle with the installed AGS CLI.
This config imports from 'ags/*' and 'gnim', which the AGS CLI is supposed to bundle.
Try manually: cd ${ags_dir} && ags bundle app.ts /tmp/bar-test.js"
	fi
}

# ------------------------------------------------------ distro-specific extras

# Debian/Ubuntu have no grimblast package; the screenshot keybinds in
# hyprland.conf exec grimblast, so install the script from hyprwm/contrib.
try_grimblast_source() {
	command_exists grimblast && return 0
	if (( DRY_RUN )); then
		info "[dry-run] install grimblast from hyprwm/contrib -> ~/.local/bin"
		return 0
	fi
	info "Installing grimblast from hyprwm/contrib (no native package)..."
	local tmp
	tmp="$(new_tmp)"
	if git clone --depth=1 "$CONTRIB_REPO_URL" "$tmp/contrib" &&
		mkdir -p "$HOME/.local/bin" &&
		install -m 755 "$tmp/contrib/grimblast/grimblast" "$HOME/.local/bin/grimblast"; then
		SUMMARY_ACTIONS+=("installed grimblast from hyprwm/contrib (~/.local/bin)")
	else
		warn "Could not install grimblast from source. The Print-key screenshot binds will not work until
you install it manually: https://github.com/hyprwm/contrib/tree/main/grimblast"
	fi
}

# ------------------------------------------------------ fedora wl-clip-persist

try_wl_clip_persist_source() {
	command_exists wl-clip-persist && return 0
	if ! command_exists cargo; then
		warn "wl-clip-persist is not in Fedora repos and cargo is missing - skipping.
Build it manually: https://github.com/Linus789/wl-clip-persist.git (see README)."
		return 0
	fi
	if (( DRY_RUN )); then
		info "[dry-run] build wl-clip-persist from source with cargo -> ~/.local/bin"
		return 0
	fi
	info "Building wl-clip-persist from source (Fedora does not ship it)..."
	local tmp
	tmp="$(new_tmp)"
	if git clone --depth=1 "$WL_CLIP_PERSIST_URL" "$tmp/wl-clip-persist" &&
		(cd "$tmp/wl-clip-persist" && cargo build --release) &&
		mkdir -p "$HOME/.local/bin" &&
		install -m 755 "$tmp/wl-clip-persist/target/release/wl-clip-persist" "$HOME/.local/bin/wl-clip-persist"; then
		SUMMARY_ACTIONS+=("built wl-clip-persist from source (~/.local/bin)")
	else
		warn "Could not build wl-clip-persist from source. Clipboard persistence will not work until
you build it manually: https://github.com/Linus789/wl-clip-persist.git"
	fi
}

# ------------------------------------------------------------- verification

verify_installation() {
	local -a required=(
		Hyprland hyprctl git curl python3 node npm ags
		kitty pcmanfm swaybg grim slurp
		wl-copy wl-paste wl-clip-persist wtype
		wpctl nmcli
	)
	if [[ $DISTRO == arch ]]; then
		required+=(yay)
	fi

	local missing=() cmd
	for cmd in "${required[@]}"; do
		if command_exists "$cmd"; then
			printf '  [ ok ] %s\n' "$cmd"
		else
			printf '  [ MISS ] %s\n' "$cmd"
			missing+=("$cmd")
		fi
	done

	local missing_soft=()
	for cmd in albert librewolf pavucontrol notify-send nwg-displays; do
		command_exists "$cmd" || missing_soft+=("$cmd")
	done

	# grimblast is installed per-distro (AUR / COPR / source); ~/.local/bin
	# installs may simply not be on this shell's PATH yet.
	if ! command_exists grimblast && [[ ! -x $HOME/.local/bin/grimblast ]]; then
		warn "grimblast was not found - the Print-key screenshot binds in hyprland.conf will not work.
See README.md ('Necessary deps') for installation options."
	fi

	if ((${#missing[@]})); then
		error "Verification FAILED for required commands: ${missing[*]}
Check the errors above; manual dependency lists are in README.md
('Install Dependencies' and 'Necessary deps')."
		exit 1
	fi

	if ((${#missing_soft[@]})); then
		info "All required commands verified. Optional (warn-only) not found: ${missing_soft[*]}"
	else
		info "All required commands verified."
	fi
}

print_summary() {
	info "---------------- Summary ----------------"
	info "Distribution : ${PRETTY_NAME_TXT} (${DISTRO_ID}) -> family '${DISTRO}', package manager '${PKG_MGR}'"
	info "Config source: ${SRC_LABEL}"
	if ((${#SUMMARY_PKGS_INSTALLED[@]})); then
		info "Newly installed packages: ${SUMMARY_PKGS_INSTALLED[*]}"
	else
		info "Newly installed packages: (none)"
	fi
	if ((${#SUMMARY_PKGS_PRESENT[@]})); then
		info "Already present (skipped): ${SUMMARY_PKGS_PRESENT[*]}"
	fi
	local action
	for action in ${SUMMARY_ACTIONS[@]+"${SUMMARY_ACTIONS[@]}"}; do
		info "Action       : ${action}"
	done
	info "Re-login (or reboot into Hyprland) so everything takes effect."
	info "------------------------------------------"
}

# ----------------------------------------------------------- package tables

load_package_tables() {
	case "$DISTRO" in
	arch)
		# From README; wl-clip-persist, librewolf and nwg-displays are in the official repos.
		MAIN_PKGS=(hyprland gtk4 gtk4-layer-shell nodejs npm curl python git wtype kitty librewolf pcmanfm swaybg wl-clipboard wl-clip-persist wireplumber pipewire networkmanager xfce4-settings pavucontrol grim slurp libnotify mako ttf-nerd-fonts-symbols nwg-displays bash-completion brightnessctl ddcutil)
		AUR_PKGS=(grimblast-git blesh) # blesh = bash line editor with as-you-type suggestions
		OPTIONAL_PKGS=(albert-bin) # prebuilt launcher; avoid the heavy Qt/C++ source build
		;;
	debian)
		MAIN_PKGS=(hyprland gtk4-layer-shell-dev libgtk-4-dev wtype nodejs npm curl python3 git kitty pcmanfm swaybg wl-clipboard wireplumber pipewire network-manager xfce4-settings pavucontrol grim slurp libnotify-bin mako-notifier jq bash-completion ble.sh brightnessctl ddcutil)
		# nwg-displays is not packaged in Debian; install manually (see README).
		OPTIONAL_PKGS=(albert librewolf nwg-displays) # OBS repo / librewolf.net repo
		;;
	fedora)
		MAIN_PKGS=(hyprland gtk4 gtk4-layer-shell gtk4-layer-shell-devel wtype nodejs npm curl python3 git kitty pcmanfm swaybg wl-clipboard wireplumber pipewire NetworkManager xfce4-settings pavucontrol grim slurp libnotify mako bash-completion brightnessctl ddcutil)
		# hyprland-contrib (grimblast) ships in the solopasha COPR enabled below.
		COPR_PKGS=(hyprland-contrib)
		# Not in the COPR we enable - community COPRs (e.g. tofik/nwg-shell) or manual.
		OPTIONAL_PKGS=(nwg-displays)
		;;
	gentoo)
		MAIN_PKGS=(hyprland gui-libs/gtk4-layer-shell net-libs/nodejs net-misc/curl dev-lang/python dev-vcs/git x11-terms/kitty x11-misc/pcmanfm gui-apps/swaybg gui-apps/wl-clipboard media-video/wireplumber media-video/pipewire net-misc/networkmanager xfce-base/xfce4-settings media-sound/pavucontrol gui-apps/grim gui-apps/slurp x11-libs/libnotify gui-apps/mako media-fonts/symbols-nerd-font app-shells/bash-completion)
		# These need GURU or other overlays; best-effort only.
		OPTIONAL_PKGS=(gui-apps/wtype app-misc/grimblast gui-apps/nwg-displays www-client/librewolf-bin x11-misc/albert app-misc/ddcutil)
		;;
	esac
}

# -------------------------------------------------------------------- main

main() {
	printf '\n=== djstarlet/dotfiles installer ===\n\n'

	require_normal_user_and_sudo
	detect_distro
	detect_package_manager

	load_package_tables
	info "Installing required system dependencies..."
	install_required_packages "${MAIN_PKGS[@]}"

	case "$DISTRO" in
	arch)
		install_aur_packages "${AUR_PKGS[@]}"
		try_install_optional install_aur_packages "${OPTIONAL_PKGS[@]}"
		;;
	fedora)
		enable_fedora_copr
		install_required_packages "${COPR_PKGS[@]}"
		try_install_optional install_repo_packages "${OPTIONAL_PKGS[@]}"
		try_wl_clip_persist_source
		;;
	gentoo)
		try_install_optional install_repo_packages "${OPTIONAL_PKGS[@]}"
		;;
	debian)
		try_install_optional install_repo_packages "${OPTIONAL_PKGS[@]}"
		try_grimblast_source
		;;
	esac

	ensure_ags
	resolve_source_dir
	deploy_dotfiles
	ensure_bashrc_helper
	ensure_bash_completion
	ensure_blesh
	verify_bar_bundle

	info "Verifying installed commands..."
	verify_installation
	print_summary
}

# ${BASH_SOURCE[0]:-$0} also handles execution via stdin (curl | bash),
# where BASH_SOURCE is unset.
if [[ ${BASH_SOURCE[0]:-$0} == "$0" ]]; then
	main "$@"
fi
