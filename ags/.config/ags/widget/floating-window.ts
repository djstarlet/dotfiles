import app from "ags/gtk4/app"
import { Gtk, Gdk } from "ags/gtk4"
import { execAsync } from "ags/process"
import { timeout } from "ags/time"
import { createEffect } from "gnim"
import type { Store } from "./store"

// A REAL Hyprland-managed Gtk window (not an Astal layer-shell surface):
// Gtk.ApplicationWindow is a normal toplevel, so Hyprland floats/centers it
// via windowrule and it responds to WM keybinds. Shared by System Info and
// the Widgets panel. System Info opts into the cursor-latch auto-dismiss
// below; the Widgets panel passes dismissOnLeave: false and stays open until
// Esc / X / tile / another flyout closes it.
//
// `content` is an accessor so callers can rebuild the child.
export function openFloatingPanel(p: {
  title: string
  cssClass: string
  width: number
  height: number
  content: () => JSX.Element
  s: Store
  gdkmonitor: Gdk.Monitor
  isOpen: () => boolean
  onClosed: () => void
  // default true (System Info); false = no cursor-latch auto-dismiss (Widgets).
  dismissOnLeave?: boolean
}): Gtk.ApplicationWindow {
  const win = new Gtk.ApplicationWindow({
    application: app,
    title: p.title,
    defaultWidth: p.width,
    defaultHeight: p.height,
    resizable: false,
  })
  win.add_css_class(p.cssClass)
  win.set_child(p.content())

  // Esc closes (only works when the WM gives the window keyboard focus).
  const ctrl = new Gtk.EventControllerKey()
  ctrl.connect("key-pressed", (_c, keyval) => {
    if (keyval === 0xff1b) {
      p.s.closeFlyouts()
      return true
    }
    return false
  })
  win.add_controller(ctrl)

  // Closed via WM (kill bind / hyprctl kill): sync the store back down.
  win.connect("close-request", () => {
    p.onClosed()
    return false // let GTK finish the close
  })

  win.present()

  // Widgets panel: no cursor-latch. Everything below runs only for System Info
  // (the default), which keeps its leave-to-close behaviour.
  if (p.dismissOnLeave === false) return win

  const openedAt = Date.now()

  // ── Auto-dismiss on focus loss ─────────────────────────────────────────────
  // Hyprland 0.56 steals focus from a floating window on pointer motion even
  // with follow_mouse = 0, so losing `is-active` does NOT mean the user left
  // the window. On focus loss we wait 150ms (debounce), then dismiss ONLY if
  // the cursor is actually outside the window rect (8px margin) AND has been
  // inside it at least once since opening.
  //
  // The latch matters: the window is opened from a Control Center tile in the
  // screen corner, while the window itself is centred, so the cursor starts
  // outside. Without `hasEntered` the post-present focus theft read as "user
  // left" and closed the window ~250ms after it appeared.
  let focusTimer: ReturnType<typeof timeout> | null = null
  let hasEntered = false
  let rect: { x: number; y: number; w: number; h: number } | null = null
  let rectAt = 0
  let rectPending = false

  // hyprctl clients -j → this window's real rect. Cached (5s TTL) so focus
  // events never shell out directly.
  const refreshRect = () => {
    if (rectPending || Date.now() - rectAt < 5000) return
    rectPending = true
    execAsync(["hyprctl", "clients", "-j"])
      .then(
        (out) => {
          const list = JSON.parse(out)
          const c = Array.isArray(list) ? list.find((c: any) => c.title === p.title) : null
          if (c?.at && c?.size) {
            rect = { x: Number(c.at[0]), y: Number(c.at[1]), w: Number(c.size[0]), h: Number(c.size[1]) }
            rectAt = Date.now()
          }
        },
        () => {},
      )
      .finally(() => {
        rectPending = false
      })
  }

  const cursorInside = () => {
    const { x: cx, y: cy } = p.s.cursorPos()
    const m = 8
    // Real client rect when cached; the window is centered and non-resizable,
    // so the monitor's center region is an accurate fallback.
    const w = rect?.w || win.get_width?.() || p.width
    const h = rect?.h || win.get_height?.() || p.height
    const geo = p.gdkmonitor.get_geometry()
    const x = rect?.x ?? Math.round(geo.x + (geo.width - w) / 2)
    const y = rect?.y ?? Math.round(geo.y + (geo.height - h) / 2)
    return cx >= x - m && cx <= x + w + m && cy >= y - m && cy <= y + h + m
  }

  const dismissIfLeft = () => {
    focusTimer = null
    if (!p.isOpen()) return
    // Grace period after present(): ignore the initial focus handoff.
    const sinceOpen = Date.now() - openedAt
    if (sinceOpen < 250) {
      focusTimer = timeout(250 - sinceOpen, dismissIfLeft)
      return
    }
    refreshRect()
    if (cursorInside()) {
      hasEntered = true
      return // focus stolen by the Hyprland floating-window bug
    }
    if (!hasEntered) return // cursor never reached the window: ignore focus theft
    p.s.closeFlyouts()
  }

  win.connect("notify::is-active", () => {
    if (win.is_active) {
      if (focusTimer) {
        focusTimer.cancel()
        focusTimer = null
      }
    } else if (!focusTimer) {
      focusTimer = timeout(150, dismissIfLeft)
    }
  })

  // Latch `hasEntered` off the store's existing 120ms cursorPos poll (no new
  // subprocess), and close on cursor-leave once the pointer has been on the
  // window. Geometry comes from the cached rect only; refreshRect() runs on
  // open/focus loss, never from this watcher.
  createEffect(() => {
    // isOpen()/cursorPos() are both read so the effect stops touching the
    // window the moment the caller destroys it.
    if (!p.isOpen()) return
    const inside = cursorInside()
    if (!hasEntered) {
      if (inside) hasEntered = true
      return
    }
    if (!inside && !focusTimer) dismissIfLeft()
  })

  refreshRect()
  // The window may not be mapped yet when the first lookup runs; retry once.
  timeout(400, refreshRect)

  return win
}
