export type WidgetId =
  | "clock" | "workspaces" | "desktopMenu" | "controlCenter" | "powerMenu" | "calendar" | "settings"

export const config: Record<WidgetId, boolean> = {
  clock: true,
  workspaces: true,
  desktopMenu: true,
  controlCenter: true,
  powerMenu: true,
  calendar: true,
  settings: true,
}

// settings' only launcher is the mini-gear inside Control Center
if (!config.controlCenter) config.settings = false

// NOTE: config is static per launch - edit this then restart via start-bar.sh (no hot reload)
export default config
