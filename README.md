## Keybinds
- SUPER + RETURN - terminal (kitty)
- SUPER + SPACE - albert toggle
- SUPER + F - browser (librewolf)
- SUPER + E - file explorer (pcmanfm)
- SUPER + V - toggle floating
- SUPER + C - close window
- SUPER + SHIFT + C - force kill window
- SUPER + mouse button 1 - move window
- SUPER + mouse button 2 - resize window
- SUPER + TAB - hyprexpo toggle
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
- SUPER + SHIFT + H - hyprshade toggle (frutiger_aero)
- SUPER + CTRL + H - hyprshade on (chrome_bloom)
- SUPER + L - layout: dwindle
- SUPER + SHIFT + L - layout: master

## Install
# Gentoo - hyprland-plugins, ags, albert, librewolf, wl-clip-persist are in GURU/overlays
emerge hyprland gui-libs/gtk4-layer-shell net-libs/nodejs net-misc/curl dev-lang/python x11-terms/kitty x11-misc/pcmanfm gui-apps/swaybg gui-apps/wl-clipboard media-session/wireplumber media-video/pipewire net-misc/networkmanager xfce-base/xfce4-settings media-sound/pavucontrol gui-apps/grim gui-apps/slurp x11-libs/libnotify media-fonts/symbols-nerd-font
# Arch - ags, albert, hyprland-plugins are in the AUR
sudo pacman -S --needed hyprland gtk4 gtk4-layer-shell nodejs npm curl python wtype kitty librewolf pcmanfm swaybg wl-clipboard wl-clip-persist wireplumber pipewire networkmanager xfce4-settings pavucontrol grim slurp libnotify ttf-nerd-fonts-symbols
# Debian / Ubuntu (hyprland needs trixie+/universe) - albert: OBS repo, librewolf: flatpak
sudo apt install hyprland hyprland-plugins gtk4-layer-shell-dev libgtk-4-dev wtype nodejs npm curl python3 kitty pcmanfm swaybg wl-clipboard wireplumber pipewire network-manager xfce4-settings pavucontrol grim slurp libnotify-bin
# Fedora (hyprland 41+) - hyprland-plugins: COPR, albert: OBS, librewolf: flatpak, wl-clip-persist: not packaged
sudo dnf install hyprland gtk4 gtk4-layer-shell gtk4-layer-shell-devel wtype nodejs npm curl python3 kitty pcmanfm swaybg wl-clipboard wireplumber pipewire NetworkManager xfce4-settings pavucontrol grim slurp libnotify
# npm toolchain (inside ags/.config/ags): npm install   # gnim, typescript
# fonts not in Debian/Fedora repos: install Nerd Fonts manually

## Necessary deps
hyprland

hyprland-plugins (hyprexpo)

hyprpm

ags

gnim

GTK4

gtk4-layer-shell

node / npm

typescript

hyprctl 

curl

python3

wtype

## Changeable deps
kitty (hyprland.conf - terminal emulator)

librewolf (hyprland.conf - browser)

pcmanfm (hyprland.conf - file explorer)

swaybg (hyprland.conf - wallpaper)

albert (hyprland.conf, ags/.config/ags/widget/Bar.tsx for quick actions button)

wl-clipboard + wl-clip-persist (hyprland.conf)

wpctl (wireplumber - volume in bar.tsx)

nmcli (ags/.config/ags/widget/Bar.tsx - wifi toggle button)

nmtui (ags/.config/ags/widget/Bar.tsx - network settings button)

xfce4-settings (ags/.config/ags/widget/Bar.tsx - system settings button)

pavucontrol (ags/.config/ags/widget/Bar.tsx - volume button)

pipewire / wireplumber

grim, slurp, wl-copy, libnotify (hypr/hypr/scripts/take-screenshot.sh)

fonts (ags/.config/ags/style.css - font-family declarations: Trebuchet MS, Verdana, Liberation Sans, Noto Sans, Noto Sans Symbols, Noto Sans Symbols 2, Symbols Nerd Font, Symbols Nerd Font Mono)
