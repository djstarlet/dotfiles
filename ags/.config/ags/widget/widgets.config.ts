export type WidgetId =
  | "clock" | "workspaces" | "desktopMenu" | "controlCenter" | "powerMenu" | "calendar" | "settings" | "displaySettings" | "notifications" | "toasts" | "systemInfo"

export const config: Record<WidgetId, boolean> = {
  clock: true,
  workspaces: true,
  desktopMenu: true,
  controlCenter: true,
  powerMenu: true,
  calendar: true,
  settings: true,
  displaySettings: true,
  notifications: true,
  // toggles pop-up notifications
  toasts: true,
  systemInfo: true,
}

// settings' only launcher is the mini-gear inside Control Center
if (!config.controlCenter) config.settings = false

// the display settings tile lives inside Control Center
if (!config.controlCenter) config.displaySettings = false

// NOTE: config is static per launch - edit this then restart via start-bar.sh (no hot reload)
export default config
