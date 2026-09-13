## Widgets

- clock (center of the bar) - shows the date/time; click to open the calendar flyout
- workspace dots (1-8) - click to switch workspaces, middle-click to create a new desktop; eight dot colors can be customized in Settings
- desktop menu (hamburger, top left) - quick actions for the focused app, app launcher (albert), screenshot, and desktop tools (new desktop, close current, overview, move window)
- control center (gear, top right) - volume and brightness sliders with glossy knobs, Wi-Fi toggle, network settings, and a power tile that opens the power menu
- notifications (bell, left of the control center) — a daemon-fed flyout plus pop-up toasts. New toasts appear top-right, auto-hide after ~6 seconds, and show an 80×80 cover-scaled screenshot thumbnail. The bell keeps all notifications pinned until dismissed. Notifications are split IMPORTANT vs TRIVIAL:
  - Important (dotfiles update, failed systemd units, low disk, calendar auth failure, hyprland config errors) — pop on every bar start/login AND when the condition changes again later.
  - Trivial (screenshots) — pop once ever, tracked by notification body in `~/.config/ags/toasted-trivial.json` (200-entry cap). Body-keyed, not id-keyed, because notifd ids restart at 1 each bar launch.

  The bell badge lights for unread notifications newer than the last time the flyout was opened (tracked in `~/.config/ags/notifications-seen.json`, clamped to the current daemon max on load). The X on each entry dismisses it; entries clear when the underlying condition resolves (the watcher re-runs every 60s).
- power menu (power icon, top right) - lock, logout, reboot, and shutdown, with a confirmation step
- calendar flyout - month view plus your next Google Calendar events
  - Google Calendar: click the user icon in the calendar header, then sign in (you'll need your own OAuth `client_id` from Google Cloud - the dialog walks you through it)
  - events refresh every 6 seconds; your token lives in `~/.config/ags/google-calendar-auth.json` (gitignored)
- settings (mini-gear inside the control center header) - a scrollable flyout for GTK theme, icon theme, font, cursor, and wallpaper
  - Colors: edit background, accent, and text with hex entries and swatches; open the custom RGB panel for channel-level editing
  - Workspace Dots: edit all eight swatches or reset them to the defaults
  - Color Presets dropdown: choose from 11 presets - Dots, Nord, Catppuccin Mocha/Latte, Gruvbox Dark, Tokyo Night, Dracula, Colorblind Safe (Light/Dark), and High Contrast (Light/Dark)
  - wallpaper: click "Choose wallpaper..." to open a GTK3 file picker; the selected image is imported to `~/.config/hypr/wallpapers/`, converted to PNG, and applied via swaybg
- system info (circled-i icon in Control Center) — opens a centered floating GTK window showing four sections: SYSTEM (hostname, OS, kernel, uptime + distro glyph from Nerd Font dev-* codepoints), HARDWARE (CPU, memory, GPU looked up from PCI device id, disks), STORAGE (physical disk model + size + root usage), DISPLAY (one entry per monitor from `hyprctl monitors -j`, focused first as "Monitor 1"). Floats + centers via hyprland windowrule matching title `^(System Info)$`, closes on focus loss and Esc. Toggled by `systemInfo` in widgets.config.ts.

The bar auto-hides - move the cursor to the top edge to bring it back. Wallpaper persists across logins: the settings chooser writes the current wallpaper under `~/.config/hypr/`, restored by `start-wallpaper.sh` on startup.

## Declarative configuration

The bar has two TypeScript configuration files under `ags/.config/ags/widget/`:

- `widgets.config.ts` - the `config: Record<WidgetId, boolean>` map toggles `clock`, `workspaces`, `desktopMenu`, `controlCenter`, `powerMenu`, `calendar`, `settings`, `notifications`, `toasts`, and `systemInfo`. It is static per launch: edit it, then restart the bar with `start-bar.sh` (there is no hot reload). Settings is launched from the control center, so disabling `controlCenter` also disables `settings`.
- `theme.config.ts` - the declarative theme source of truth. `theme.defaults` defines `background`, `accent`, and `text`; `theme.workspaceDotColors` defines eight hex colors; and `theme.presets` defines 11 named presets, each with a background, accent, text, and eight dot colors. The default theme is background `#f6faff`, accent `#55adff`, text `#0f2235`, with dot colors `#ef3d34`, `#f0a114`, `#24a337`, `#3b83e6`, `#9b5ad7`, `#28a9a0`, `#e96f3a`, and `#cf5398`.

`theme.config.ts` is the source of truth. The default variables in `style.css` mirror it (the stylesheet comment points back to the file), and the `settings.sh` / `start-bar.sh` defaults use the same values.

## Runtime overrides

Workspace dot colors are resolved in this order (highest priority first):

1. `AGS_WS_DOT_COLORS` - exported by `start-bar.sh` from `ws-dot-colors.json`, or from the defaults when that file is absent; it is a comma-separated list of eight hex colors.
2. `theme-colors.json` and `ws-dot-colors.json` - written by the Settings flyout through `settings.sh`.
3. `theme.config.ts` defaults.

`theme-colors.json` and `ws-dot-colors.json` are gitignored per-machine state. Restart the bar after changing a persisted workspace-dot override so `start-bar.sh` can export it.

Useful `settings.sh` commands:

- `settings.sh get colors` - read the saved background, accent, and text colors
- `settings.sh set color <background|accent|text> <hex>` - save one base color
- `settings.sh get ws-dots` - read the saved workspace-dot colors
- `settings.sh set ws-dot <1-8> <hex>` - save one workspace-dot color
- `settings.sh reset ws-dots` - remove the saved dot overrides and return to the defaults
