import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { execAsync } from "ags/process"
import { createComputed } from "gnim"
import type { Store, Notification } from "./store"

// One notification row: the bubble (box.notif-bubble) carries the raised
// look; the body button inside is flat and opens the row's action (folder in
// pcmanfm for screenshots / openPath, URL otherwise). The X dismisses until
// the condition's sig changes. `item` is a computed binding so rows appear
// and disappear as notifications arrive (fixed row slots, matching the
// Settings presets list pattern).
function NotificationRow({ item, s }: { item: () => Notification | null; s: Store }) {
  return (
    <box
      class="notif-bubble"
      orientation={Gtk.Orientation.HORIZONTAL}
      visible={createComputed(() => item() !== null)}
    >
      <button
        class="notif-row-body"
        hexpand
        onClicked={() => {
          const n = item()
          if (!n) return
          if (n.openPath) {
            execAsync(["pcmanfm", n.openPath]).catch(() => null)
          } else if (n.openUrl) {
            execAsync(["xdg-open", n.openUrl]).catch(() => null)
          }
        }}
      >
        <box orientation={Gtk.Orientation.VERTICAL} spacing={2} hexpand>
          <label class="notif-title" xalign={0} label={createComputed(() => item()?.title ?? "")} />
          <label class="notif-detail" xalign={0} wrap label={createComputed(() => item()?.detail ?? "")} />
          <button
            class="notif-action"
            halign={Gtk.Align.START}
            visible={createComputed(() => item()?.action === "update-dotfiles")}
            onClicked={s.runDotfilesUpdate}
          >
            <label label="Update" />
          </button>
        </box>
      </button>
      <button
        class="notif-dismiss"
        valign={Gtk.Align.START}
        onClicked={() => {
          const n = item()
          if (n) s.dismissNotification(n.id, n.sig)
        }}
      >
        <label class="notif-dismiss-icon" label={"\u{F00D}"} />
      </button>
    </box>
  )
}

export default function NotificationsWindow(gdkmonitor: Gdk.Monitor, monitorIndex: number, s: Store) {
  const { TOP, LEFT, RIGHT } = Astal.WindowAnchor

  return (
    <window
      visible={s.notifOpen}
      name={`ags-notif-${monitorIndex}`}
      namespace="ags-notif"
      class="FlyoutWindow"
      gdkmonitor={gdkmonitor}
      anchor={TOP | LEFT | RIGHT}
      layer={Astal.Layer.OVERLAY}
      keymode={Astal.Keymode.ON_DEMAND}
      exclusivity={Astal.Exclusivity.IGNORE}
      marginTop={42}
      application={app}
    >
      <box hexpand>
        <button class="DismissSurface" hexpand vexpand canTarget onClicked={s.closeFlyouts} />
        <box halign={Gtk.Align.END} marginEnd={18}>
          <box
            class="flyout notif-flyout"
            orientation={Gtk.Orientation.VERTICAL}
            spacing={8}
            vexpand
            marginBottom={40}
          >
            <centerbox>
              <box $type="start" widthRequest={34} />
              <label $type="center" class="flyout-title" label="Notifications" xalign={0.5} />
              <box $type="end" widthRequest={24} />
            </centerbox>

            <box orientation={Gtk.Orientation.VERTICAL} spacing={6}>
              {[0, 1, 2, 3, 4].map((i) => (
                <NotificationRow item={createComputed(() => s.notifications()[i] ?? null)} s={s} />
              ))}
            </box>

            <label
              class="notif-empty"
              xalign={0.5}
              label="Nothing to see here"
              visible={createComputed(() => s.notifications().length === 0)}
            />
          </box>
        </box>
      </box>
    </window>
  )
}