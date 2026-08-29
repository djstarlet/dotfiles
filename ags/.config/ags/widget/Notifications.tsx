import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { execAsync } from "ags/process"
import { createComputed } from "gnim"
import type { Store, Notification } from "./store"

// One notification row. `item` is a computed binding so rows appear/disappear
// as notifications arrive (fixed row slots, matching the Settings presets
// list pattern - the list itself is not reactive, per-row bindings are).
function NotificationRow({ item }: { item: () => Notification | null }) {
  return (
    <button
      class="action notif-row"
      visible={createComputed(() => item() !== null)}
      onClicked={() => {
        execAsync(["bash", "-lc", "xdg-open https://github.com/djstarlet/dotfiles/releases 2>/dev/null"]).catch(() => null)
      }}
    >
      <box orientation={Gtk.Orientation.VERTICAL} spacing={2} hexpand>
        <label class="notif-title" xalign={0} label={createComputed(() => item()?.title ?? "")} />
        <label class="notif-detail" xalign={0} wrap label={createComputed(() => item()?.detail ?? "")} />
      </box>
    </button>
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
              {[0, 1, 2].map((i) => (
                <NotificationRow item={createComputed(() => s.notifications()[i] ?? null)} />
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