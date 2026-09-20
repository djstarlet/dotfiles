import { Gtk, Gdk } from "ags/gtk4"
import { createEffect } from "gnim"
import type { Store } from "./store"
import { openFloatingPanel } from "./floating-window"
import type { WidgetId } from "./widgets.config"

// One row per widget. controlCenter is listed but not toggleable here: it
// hosts this panel, so it stays a build-time decision in widgets.config.ts.
const WIDGET_ROWS: { id: WidgetId; label: string; hint?: string }[] = [
  { id: "clock", label: "Clock", hint: "bar centre" },
  { id: "workspaces", label: "Workspaces", hint: "bar left" },
  { id: "desktopMenu", label: "Desktop menu", hint: "bar left button" },
  { id: "calendar", label: "Calendar", hint: "opens from the clock" },
  { id: "controlCenter", label: "Control Center", hint: "hosts this panel - set in widgets.config.ts" },
  { id: "settings", label: "Settings", hint: "Control Center mini-gear" },
  { id: "displaySettings", label: "Display settings", hint: "Control Center tile" },
  { id: "notifications", label: "Notifications", hint: "bar bell" },
  { id: "toasts", label: "Toasts", hint: "pop-up notifications" },
  { id: "systemInfo", label: "System info", hint: "Control Center tile" },
  { id: "powerMenu", label: "Power menu", hint: "bar power button" },
]

// ─── Widgets panel: a real Gtk window, same shell as System Info ──────────────
export default function WidgetsPanelWindow(gdkmonitor: Gdk.Monitor, monitorIndex: number, s: Store) {
  // Bar.tsx instantiates this once per monitor; a normal toplevel window is
  // centered by the compositor, so only the first instance owns it.
  if (monitorIndex !== 0) return null

  const switchRefs = new Map<WidgetId, Gtk.Switch>()
  let syncing = false
  let win: Gtk.ApplicationWindow | null = null

  // GTK4 emits notify::active synchronously from set_active(); the guard must
  // bracket the call (same shape as syncingVolume/syncingBrightness in
  // ControlCenter.tsx), or a programmatic sync would write itself back.
  createEffect(() => {
    const enabled = s.widgetsEnabled()
    syncing = true
    for (const row of WIDGET_ROWS) {
      const ref = switchRefs.get(row.id)
      if (ref) ref.set_active(enabled[row.id])
    }
    syncing = false
  })

  function WidgetRow(row: (typeof WIDGET_ROWS)[number]) {
    const locked = row.id === "controlCenter"
    return (
      <box class="widgets-row" orientation={Gtk.Orientation.HORIZONTAL} spacing={10}>
        <box orientation={Gtk.Orientation.VERTICAL} spacing={1} hexpand valign={Gtk.Align.CENTER}>
          <label class="widgets-row-label" label={row.label} xalign={0} />
          {row.hint && <label class="widgets-row-hint" label={row.hint} xalign={0} />}
        </box>
        <Gtk.Switch
          valign={Gtk.Align.CENTER}
          sensitive={!locked}
          $={(self) => {
            switchRefs.set(row.id, self)
            syncing = true
            self.set_active(s.widgetsEnabled()[row.id])
            syncing = false
          }}
          onNotifyActive={(self) => {
            if (syncing) return
            s.setWidgetEnabled(row.id, self.get_active())
          }}
        />
      </box>
    )
  }

  function WidgetsContent() {
    return (
      <box
        class="flyout widgets-panel-flyout"
        orientation={Gtk.Orientation.VERTICAL}
        spacing={10}
        hexpand
        vexpand
        halign={Gtk.Align.CENTER}
        valign={Gtk.Align.CENTER}
        widthRequest={420}
        heightRequest={560}
      >
        <label class="flyout-title" label="Widgets" xalign={0.5} />
        <box orientation={Gtk.Orientation.VERTICAL} spacing={4}>
          {WIDGET_ROWS.map((row) => WidgetRow(row))}
        </box>
      </box>
    )
  }

  // Open ⇄ widgetsPanelOpen, both directions (same shape as SystemInfo).
  createEffect(() => {
    if (s.widgetsPanelOpen()) {
      if (win) return // guard against duplicates
      win = openFloatingPanel({
        title: "Widgets",
        cssClass: "WidgetsPanelWindow",
        width: 420,
        height: 560,
        content: WidgetsContent,
        s,
        gdkmonitor,
        isOpen: s.widgetsPanelOpen,
        // No cursor-latch auto-dismiss: the panel stays open until Esc, X, the
        // tile, or another flyout closes it.
        dismissOnLeave: false,
        // Null the caller's ref first: a WM close comes back through the store
        // as an effect re-run, and destroy() from there would re-enter
        // close-request (same shape as SystemInfo).
        onClosed: () => {
          win = null
          s.setWidgetsPanelOpen(false)
        },
      })
    } else {
      win?.destroy()
      win = null
      switchRefs.clear()
    }
  })

  return null
}
