import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { timeout } from "ags/time"
import { createComputed, createEffect, createState } from "gnim"
import type { Store, Notification } from "./store"

// Slide-out then dismiss: the daemon removes the notification on
// dismiss(), so the reveal-off animation must play BEFORE calling it.
function slideOutAndDismiss(revealer: Gtk.Revealer, n: Notification, s: Store) {
  revealer.reveal_child = false
  timeout(240, () => s.dismissNotification(n.id))
}

const TOAST_VISIBLE_MS = 6000

// Each notification's popup shows exactly once per session: once toasted,
// a re-reveal on a later window remount would re-toast old notifications
// whenever a new one arrives.
const toastedIds = new Set<string>()

function ToastRow({ item, s, onAutoHide }: { item: () => Notification | null; s: Store; onAutoHide: (id: string) => void }) {
  let revealer: Gtk.Revealer
  let lastShownId = "_none_"

  createEffect(() => {
    const n = item()
    if (n && n.id !== lastShownId) {
      lastShownId = n.id
      if (toastedIds.has(n.id)) return // already popped this session
      toastedIds.add(n.id)
      revealer.reveal_child = false
      timeout(10, () => {
        if (item()?.id === lastShownId) revealer.reveal_child = true
      })
      // Popup-only hide: slide away but leave the notification in the
      // daemon so the bell keeps it until dismissed.
      timeout(TOAST_VISIBLE_MS, () => {
        if (item()?.id === lastShownId) {
          revealer.reveal_child = false
          onAutoHide(n.id)
        }
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
      valign={Gtk.Align.START}
      vexpand={false}
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
          <box
            class="toast-thumb"
            widthRequest={80}
            heightRequest={80}
            valign={Gtk.Align.CENTER}
            visible={createComputed(() => Boolean(item()?.image))}
            $={(self) => {
              const pic = new Gtk.Picture()
              pic.set_content_fit(Gtk.ContentFit.COVER)
              pic.set_size_request(80, 80)
              self.append(pic)
              createEffect(() => {
                const f = item()?.image
                if (f) pic.set_filename(f)
              })
            }}
          />
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

// Separate toast window, top-right. The `$` size cap keeps the surface from
// ballooning to the anchor extent (this GTK layer-shell build sizes anchored
// windows to their full edge otherwise, which eats clicks).
export default function NotificationToasts(gdkmonitor: Gdk.Monitor, monitorIndex: number, s: Store) {
  const { TOP, LEFT, RIGHT } = Astal.WindowAnchor

  const [hidden, setHidden] = createState<Record<string, boolean>>({})
  const anyVisible = createComputed(() => s.notifications().some((n) => !hidden()[n.id]))
  // Raw state for the visible prop: computed bindings don't drive window
  // mapping in this build (the bar's visible uses a state and unmaps fine).
  const [toastVisible, setToastVisible] = createState(false)
  createEffect(() => setToastVisible(anyVisible()))

  return (
    <window
      visible={toastVisible}
      name={`ags-toast-${monitorIndex}`}
      namespace="ags-toast"
      class="ToastWindow"
      gdkmonitor={gdkmonitor}
      anchor={TOP | LEFT | RIGHT}
      layer={Astal.Layer.OVERLAY}
      keymode={Astal.Keymode.NONE}
      exclusivity={Astal.Exclusivity.IGNORE}
      marginTop={42}
      marginEnd={18}
      application={app}
    >
      <box hexpand>
        <button class="DismissSurface" hexpand vexpand canTarget onClicked={s.closeFlyouts} />
        <box orientation={Gtk.Orientation.VERTICAL} spacing={8} halign={Gtk.Align.END} valign={Gtk.Align.START} vexpand={false} heightRequest={340}>
        {[0].map((i) => (
          <ToastRow
            item={createComputed(() => s.notifications()[i] ?? null)}
            s={s}
            onAutoHide={(id) => setHidden((prev) => ({ ...prev, [id]: true }))}
          />
        ))}
        </box>
      </box>
    </window>
  )
}