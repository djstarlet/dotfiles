import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { timeout } from "ags/time"
import { createComputed, createEffect } from "gnim"
import type { Store, Notification } from "./store"

// Slide-out then dismiss: the daemon removes the notification on
// dismiss(), so the reveal-off animation must play BEFORE calling it.
// Daemon-side expiry (timeout) removes instantly - acceptable.
function slideOutAndDismiss(revealer: Gtk.Revealer, n: Notification, s: Store) {
  revealer.reveal_child = false
  timeout(240, () => s.dismissNotification(n.id))
}

// One toast row: a Revealer (SLIDE_LEFT, 220ms) wrapping the .toast bubble.
// Appears by revealing 10ms after mount; the popup auto-slides away after
// TOAST_VISIBLE_MS WITHOUT dismissing the notifd notification, so it stays
// in the bell until the user acts (X or click). Clicking the body (not the
// X) animates out then dismisses.
const TOAST_VISIBLE_MS = 6000

function ToastRow({ item, s }: { item: () => Notification | null; s: Store }) {
  let revealer: Gtk.Revealer
  let lastShownId = "_none_"

  createEffect(() => {
    const n = item()
    if (n && n.id !== lastShownId) {
      lastShownId = n.id
      revealer.reveal_child = false
      timeout(10, () => {
        if (item()?.id === lastShownId) revealer.reveal_child = true
      })
      // Popup-only hide: slide away but leave the notification in the
      // daemon so the bell keeps it until dismissed.
      timeout(TOAST_VISIBLE_MS, () => {
        if (item()?.id === lastShownId) revealer.reveal_child = false
      })
    } else if (!n) {
      lastShownId = "_none_"
      revealer.reveal_child = false
    }
  })

  return (
    <revealer
      $={(self) => (revealer = self)}
      transitionType={Gtk.RevealerTransitionType.SLIDE_LEFT}
      transitionDuration={220}
      revealChild={false}
    >
      <box class="toast" orientation={Gtk.Orientation.HORIZONTAL} spacing={4}>
        <button
          class="toast-body"
          hexpand
          onClicked={() => {
            const n = item()
            if (n) slideOutAndDismiss(revealer, n, s)
          }}
        >
          <box orientation={Gtk.Orientation.VERTICAL} spacing={2} hexpand>
            <label class="notif-title" xalign={0} label={createComputed(() => item()?.title ?? "")} />
            <label class="notif-detail" xalign={0} wrap label={createComputed(() => item()?.detail ?? "")} />
          </box>
        </button>
        <button
          class="notif-dismiss"
          valign={Gtk.Align.START}
          onClicked={() => {
            const n = item()
            if (n) slideOutAndDismiss(revealer, n, s)
          }}
        >
          <label class="notif-dismiss-icon" label={"\u{F00D}"} />
        </button>
      </box>
    </revealer>
  )
}

// Stacked toast popups for the active monitor: one window holding up to 5
// rows (fixed slots, matching the flyout), anchored top-right. The window
// itself is visible only while notifications exist; appear/disappear
// animation lives in each row's Revealer.
export default function NotificationToasts(gdkmonitor: Gdk.Monitor, monitorIndex: number, s: Store) {
  const { TOP, RIGHT } = Astal.WindowAnchor

  return (
    <window
      visible={createComputed(() => s.notifications().length > 0)}
      name={`ags-toast-${monitorIndex}`}
      namespace="ags-toast"
      class="ToastWindow"
      gdkmonitor={gdkmonitor}
      anchor={TOP | RIGHT}
      layer={Astal.Layer.OVERLAY}
      keymode={Astal.Keymode.NONE}
      exclusivity={Astal.Exclusivity.IGNORE}
      marginTop={42}
      marginEnd={18}
      application={app}
    >
      <box orientation={Gtk.Orientation.VERTICAL} spacing={8} halign={Gtk.Align.END}>
        {[0, 1, 2, 3, 4].map((i) => (
          <ToastRow item={createComputed(() => s.notifications()[i] ?? null)} s={s} />
        ))}
      </box>
    </window>
  )
}
