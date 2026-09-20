// Widget DEFAULTS. The GUI (Control Center -> Widgets panel) persists sparse
// overrides to widget-toggles.json; widget/store.ts merges them over these
// values at runtime, so a key absent from the JSON inherits the value below.
// Editing this file only changes the default, it never overrides a saved choice.
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

// Image viewer used when opening a screenshot notification (falls back to
// pcmanfm on the containing folder if the viewer is not installed).
export const imageViewer = "swayimg"

export default config
