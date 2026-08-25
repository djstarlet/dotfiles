import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { createComputed, For } from "gnim"
import type { Store } from "./store"
import { SHORTCUT_PRESETS, SHORTCUT_FALLBACK } from "./store"

export default function DesktopMenuWindow(gdkmonitor: Gdk.Monitor, monitorIndex: number, s: Store) {
  return (
    <window
      visible={s.desktopMenuOpen}
      name={`ags-desktop-menu-${monitorIndex}`}
      class="FlyoutWindow"
      gdkmonitor={gdkmonitor}
      anchor={Astal.WindowAnchor.TOP | Astal.WindowAnchor.LEFT | Astal.WindowAnchor.RIGHT}
      layer={Astal.Layer.OVERLAY}
      keymode={Astal.Keymode.ON_DEMAND}
      exclusivity={Astal.Exclusivity.IGNORE}
      marginTop={42}
      marginStart={0}
      application={app}
    >
      <box hexpand>
      <box halign={Gtk.Align.START}>
      <box
        class="flyout desktop-menu-flyout"
        orientation={Gtk.Orientation.VERTICAL}
        spacing={8}
        marginStart={10}
        marginEnd={40}
        marginBottom={40}
      >
        <label class="flyout-title" label="Quick Actions" xalign={0.0} />
        <For each={createComputed(() => SHORTCUT_PRESETS[s.focusedWindowClass()] ?? SHORTCUT_FALLBACK)}>
          {(sc) => (
            <button class="action" onClicked={() => { s.setDesktopMenuOpen(false); s.sendFocusedShortcut(sc.mod, sc.key) }}>
              <box orientation={Gtk.Orientation.HORIZONTAL} hexpand spacing={8} class="menu-row">
                <label label={sc.label} xalign={0.0} hexpand />
                <label label={sc.hint} xalign={1.0} class="shortcut-label" />
              </box>
            </button>
          )}
        </For>
        <Gtk.Separator orientation={Gtk.Orientation.HORIZONTAL} />
        <button class="action" onClicked={s.createNewDesktop}>
          <label label="New Desktop" />
        </button>
        <button class="action" onClicked={s.closeCurrentDesktop}>
          <label label="Close Current Desktop" />
        </button>
        <button class="action" onClicked={s.openOverview}>
          <label label="Desktop Overview" />
        </button>
        <button class="action" onClicked={s.moveWindowToNewDesktop}>
          <label label="Move Window To New Desktop" />
        </button>
        <button class="action" onClicked={s.openLauncher}>
          <label label="App Launcher" />
        </button>
        <button class="action" onClicked={s.takeScreenshot}>
          <label label="Screenshot" />
        </button>
      </box>
      </box>
      <button class="DismissSurface" hexpand vexpand canTarget onClicked={s.closeFlyouts} />
      </box>
    </window>
  )
}
