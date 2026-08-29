export type WidgetId =
  | "clock" | "workspaces" | "desktopMenu" | "controlCenter" | "powerMenu" | "calendar" | "settings" | "displaySettings" | "notifications" | "toasts"

export const config: Record<WidgetId, boolean> = {
  clock: true,
  workspaces: true,
  desktopMenu: true,
  controlCenter: true,
  powerMenu: true,
  calendar: true,
  settings: true,
  displaySettings: false,
  notifications: true,
  // Toast popups: the toast window surface never unmaps in this
  // gtk4-layer-shell build (leaves a click-eating remnant). Off by default;
  // the bell + flyout notification center works without it.
  toasts: false,
}

// settings' only launcher is the mini-gear inside Control Center
if (!config.controlCenter) config.settings = false

// the display settings tile lives inside Control Center
if (!config.controlCenter) config.displaySettings = false

// NOTE: config is static per launch - edit this then restart via start-bar.sh (no hot reload)
export default config
