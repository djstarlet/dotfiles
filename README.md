## Keybinds
- SUPER + Q - terminal (kitty)
- ALT + SPACE - albert show
- SUPER + F - browser (librewolf)
- SUPER + E - file explorer (pcmanfm)
- SUPER + V - toggle floating
- SUPER + C - close window
- SUPER + SHIFT + C - force kill window
- SUPER + mouse button 1 - move window
- SUPER + mouse button 2 - resize window
- SUPER + TAB - hyprexpo toggle (workspace overview)
- SUPER + SHIFT + GRAVE - reload hyprland
- SUPER + 1 - workspace 1
- SUPER + 2 - workspace 2
- SUPER + 3 - workspace 3
- SUPER + 4 - workspace 4
- SUPER + 5 - workspace 5
- SUPER + SHIFT + 1 - move to workspace 1
- SUPER + SHIFT + 2 - move to workspace 2
- SUPER + SHIFT + 3 - move to workspace 3
- SUPER + SHIFT + 4 - move to workspace 4
- SUPER + SHIFT + 5 - move to workspace 5
- PRINT - screenshot (copy screen)
- SHIFT + PRINT - screenshot (save area)
- SUPER + SHIFT + S - screenshot (copy area)
- SUPER + L - layout: dwindle
- SUPER + SHIFT + L - layout: master

## Setup

# Install Script:
`curl -fsSL https://raw.githubusercontent.com/djstarlet/dotfiles/main/install.sh | bash`
- then install the dependencies listed below on your package manager & reboot/logout then login

# Manual:
- drop `hypr/` into `~/.config/` - for hyprland config
- drop `ags/.config/ags/` into `~/.config/` - for the taskbar
- no npm install needed: the AGS CLI bundles the `ags` + `gnim` modules itself (the bar is typescript + gnim, compiled at runtime by `ags run`)
- then install the dependencies listed below on your package manager & reboot/logout then login
- more about the widgets: widgets.md

## Install Dependencies

Gentoo - ags, albert, librewolf, wl-clip-persist, grimblast, nwg-displays are in GURU/overlays

`emerge hyprland gui-libs/gtk4-layer-shell net-libs/nodejs net-misc/curl dev-lang/python x11-terms/kitty x11-misc/pcmanfm gui-apps/swaybg gui-apps/wl-clipboard media-video/wireplumber media-video/pipewire net-misc/networkmanager xfce-base/xfce4-settings media-sound/pavucontrol gui-apps/grim gui-apps/slurp x11-libs/libnotify media-fonts/symbols-nerd-font app-shells/bash-completion`

Arch - ags, albert-bin, grimblast, blesh are in the AUR

`sudo pacman -S --needed hyprland gtk4 gtk4-layer-shell nodejs npm curl python wtype kitty librewolf pcmanfm swaybg wl-clipboard wl-clip-persist wireplumber pipewire networkmanager xfce4-settings pavucontrol grim slurp libnotify ttf-nerd-fonts-symbols nwg-displays bash-completion`

Debian / Ubuntu (hyprland needs trixie+/universe) - albert: OBS repo, librewolf: flatpak, grimblast: install script from https://github.com/hyprwm/contrib (needs jq, put it in PATH), nwg-displays: manual install from https://github.com/nwg-piotr/nwg-displays

`sudo apt install hyprland gtk4-layer-shell-dev libgtk-4-dev wtype nodejs npm curl python3 kitty pcmanfm swaybg wl-clipboard wireplumber pipewire network-manager xfce4-settings pavucontrol grim slurp libnotify-bin jq bash-completion ble.sh`

Fedora (hyprland 41+) - hyprland-contrib (grimblast): COPR, nwg-displays: community COPR (e.g. tofik/nwg-shell) or manual from https://github.com/nwg-piotr/nwg-displays, albert: OBS, librewolf: flatpak, wl-clip-persist must be compiled from source: https://github.com/Linus789/wl-clip-persist.git

`sudo dnf install hyprland gtk4 gtk4-layer-shell gtk4-layer-shell-devel wtype nodejs npm curl python3 kitty pcmanfm swaybg wl-clipboard wireplumber pipewire NetworkManager xfce4-settings pavucontrol grim slurp libnotify bash-completion`


for Debian/Fedora repos: install Nerd Fonts manually from https://github.com/ryanoasis/nerd-fonts

## Necessary deps
hyprland

ags

GTK4

gtk4-layer-shell

node / npm

typescript (npm)

gnim (bundled with ags - the AGS CLI provides the ags/* + gnim JS modules itself)

hyprctl 

curl

bash-completion (bash tab completion, enabled in ~/.bashrc)

ble.sh (live command/argument completion as you type, like CachyOS - AUR blesh / Debian ble.sh; history suggestions disabled, enabled in ~/.bashrc)

python3

wtype

grimblast (screenshot keybinds - Print)

hyprswitch (optional GUI window switcher - AUR source build, not installed by default)

## Changeable deps
kitty (hyprland.conf - terminal emulator)

librewolf (hyprland.conf - browser)

pcmanfm (hyprland.conf - file explorer)

swaybg (start-wallpaper.sh - wallpaper)

albert (hyprland.conf, ags/.config/ags/widget/Bar.tsx for quick actions button)

nwg-displays (GUI monitor layout tool - recommended for arranging multiple outputs)

wl-clipboard + wl-clip-persist (hyprland.conf)

wpctl (wireplumber - volume in bar.tsx)

nmcli (ags/.config/ags/widget/Bar.tsx - wifi toggle button)

nmtui (ags/.config/ags/widget/store.ts - network settings)

xfce4-settings (GTK settings utilities)

pavucontrol (ags/.config/ags/widget/Bar.tsx - volume button)

pipewire / wireplumber

grim, slurp, wl-copy, libnotify (hypr/hypr/scripts/take-screenshot.sh), grimblast (hyprland.conf screenshot keybinds)

fonts (ags/.config/ags/style.css - font-family declarations: Liberation Sans, Liberation Mono, Liberation Serif, Symbols Nerd Font, Symbols Nerd Font Mono)
