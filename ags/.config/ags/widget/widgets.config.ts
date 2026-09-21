// Widget state. The GUI (Control Center -> Widgets panel) flips these booleans
// directly via settings.sh, so this file is the single source of truth and is
// re-read on every bar start. controlCenter off also forces the widgets it
// hosts off; that cascade is derived at render time in widget/store.ts and is
// never written here.
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

// Image viewer used when opening a screenshot notification (falls back to
// pcmanfm on the containing folder if the viewer is not installed).
export const imageViewer = "swayimg"

export default config
