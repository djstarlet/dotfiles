import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import GdkPixbuf from "gi://GdkPixbuf"
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

// Each notification's popup shows exactly once per session: once toasted, a
// later remount must not replay it.
const toastedIds = new Set<string>()

// `onShown`/`onHidden` report when a toast is actually on screen. The window's
// `visible` MUST key off this and never off s.notifications(): notifd retains
// every notification until it is dismissed or its own timeout expires, so a
// "daemon has notifications" predicate is permanently true and the OVERLAY
// surface never unmaps - leaving an invisible, click-eating layer.
function ToastRow({
  item,
  s,
  onShown,
  onHidden,
}: {
  item: () => Notification | null
  s: Store
  onShown: (id: string) => void
  onHidden: (id: string) => void
}) {
  let revealer: Gtk.Revealer
  let lastShownId = "_none_"

  const clear = () => {
    const id = lastShownId
    lastShownId = "_none_"
    revealer.reveal_child = false
    // let the slide-out finish before the surface goes away
    if (id !== "_none_") timeout(260, () => onHidden(id))
  }

  createEffect(() => {
    const n = item()
    if (n && n.id !== lastShownId) {
      if (lastShownId !== "_none_") {
        // Mark the new toast shown BEFORE hiding the old one: otherwise
        // anyOnScreen briefly empties and the window unmaps mid-swap.
        onShown(n.id)
        onHidden(lastShownId)
      }
      lastShownId = n.id
      if (toastedIds.has(n.id)) {
        revealer.reveal_child = false
        return // already popped this session
      }
      toastedIds.add(n.id)
      revealer.reveal_child = false
      timeout(10, () => {
        if (item()?.id !== lastShownId) return
        revealer.reveal_child = true
        onShown(lastShownId)
      })
      // Popup-only hide: slide away but leave the notification in the daemon
      // so the bell keeps it until dismissed. Capture the owner id: prior
      // timers must not hide a toast they don't own.
      const owner = n.id
      timeout(TOAST_VISIBLE_MS, () => {
        if (lastShownId === owner) clear()
      })
    } else if (!n) {
      clear()
    }
  })

  const dismiss = () => {
    const n = item()
    if (!n) return
    clear()
    slideOutAndDismiss(revealer, n, s)
  }

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
        {/* GtkButton is a Bin: it holds exactly ONE child. Two children used to
            silently drop the label box, so text and thumbnail go inside a
            single wrapper (same shape as the notifications flyout row). */}
        <button class="toast-body" hexpand onClicked={dismiss}>
          <box orientation={Gtk.Orientation.HORIZONTAL} spacing={6} hexpand>
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
                // Gtk.Image in this build renders pixbufs/paintables at a
                // tiny icon scale - use Gtk.Picture, which honors the widget
                // allocation. Load + scale the pixbuf explicitly to an exact
                // 80x80 (gjs's GdkPixbuf bindings lack subpixbuf/crop).
                const pic = new Gtk.Picture()
                pic.content_fit = Gtk.ContentFit.FILL
                pic.can_shrink = true
                pic.set_size_request(80, 80)
                self.append(pic)
                createEffect(() => {
                  const f = item()?.image
                  if (!f) return
                  try {
                    // Scale into an exact 80x80 (slight squash on a wide
                    // screenshot is imperceptible at thumbnail size; gjs's
                    // GdkPixbuf bindings lack subpixbuf/crop).
                    const pb = GdkPixbuf.Pixbuf.new_from_file(f)
                    const scaled = pb.scale_simple(80, 80, GdkPixbuf.InterpType.BILINEAR)
                    pic.paintable = Gdk.Texture.new_for_pixbuf(scaled)
                  } catch {
                    // unreadable image - leave the thumbnail empty
                  }
                })
              }}
            />
          </box>
        </button>
        <button class="notif-dismiss" valign={Gtk.Align.START} onClicked={dismiss}>
          <label class="notif-dismiss-icon" label={"\u{F00D}"} />
        </button>
      </box>
    </revealer>
  )
}

// Toast window, top-right. Anchored TOP|RIGHT only: adding LEFT forces the
// surface to the full anchor extent (a 1280px-wide click sink). Margins use
// Astal.Window's own margin_* properties - the GtkWidget margin-end would add
// to the surface size instead of offsetting it.
export default function NotificationToasts(gdkmonitor: Gdk.Monitor, monitorIndex: number, s: Store) {
  const { TOP, RIGHT } = Astal.WindowAnchor

  const [shown, setShown] = createState<Record<string, boolean>>({})
  const anyOnScreen = createComputed(() => Object.keys(shown()).length > 0)
  const mark = (id: string, on: boolean) =>
    setShown((prev) => {
      if (Boolean(prev[id]) === on) return prev
      const next = { ...prev }
      if (on) next[id] = true
      else delete next[id]
      return next
    })

  return (
    <window
      visible={anyOnScreen}
      name={`ags-toast-${monitorIndex}`}
      namespace="ags-toast"
      class="ToastWindow"
      gdkmonitor={gdkmonitor}
      anchor={TOP | RIGHT}
      layer={Astal.Layer.OVERLAY}
      keymode={Astal.Keymode.NONE}
      exclusivity={Astal.Exclusivity.IGNORE}
      margin={18}
      margin_top={42}
      application={app}
    >
      <box orientation={Gtk.Orientation.VERTICAL} spacing={8} valign={Gtk.Align.START} halign={Gtk.Align.END}>
        {[0].map((i) => (
          <ToastRow
            item={createComputed(() => {
              const ns = s.notifications()
              if (ns.length === 0) return null
              // notifd's list order isn't guaranteed; ids are monotonically
              // increasing, so max-id is the newest regardless of order.
              let newest = ns[0]
              for (const n of ns) if (Number(n.id) > Number(newest.id)) newest = n
              return newest
            })}
            s={s}
            onShown={(id) => mark(id, true)}
            onHidden={(id) => mark(id, false)}
          />
        ))}
      </box>
    </window>
  )
}
