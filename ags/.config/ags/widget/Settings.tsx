import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
const { TOP, RIGHT } = Astal.WindowAnchor
import { execAsync } from "ags/process"
import { createComputed, For } from "gnim"
import type { Store } from "./store"

const controlFlyoutMarginEnd = 18

export default function SettingsWindows(gdkmonitor: Gdk.Monitor, monitorIndex: number, s: Store) {
  return [
    <window
        visible={s.settingsOpen}
        name={`ags-settings-${monitorIndex}`}
        class="FlyoutWindow"
        gdkmonitor={gdkmonitor}
        anchor={TOP | RIGHT}
        layer={Astal.Layer.OVERLAY}
        keymode={Astal.Keymode.ON_DEMAND}
        exclusivity={Astal.Exclusivity.IGNORE}
        marginTop={48}
        application={app}
      >
        <box hexpand halign={Gtk.Align.END} marginEnd={controlFlyoutMarginEnd}>
          <box
            class="flyout settings-flyout"
            orientation={Gtk.Orientation.VERTICAL}
            spacing={8}
            vexpand
            marginBottom={40}
          >
            <centerbox>
              <box $type="start" widthRequest={34} />
              <label $type="center" class="flyout-title" label="Settings" xalign={0.5} />
              <box $type="end" widthRequest={34} />
            </centerbox>

            <Gtk.Separator orientation={Gtk.Orientation.HORIZONTAL} />

            {/* GTK Theme */}
            <box class="settings-row" orientation={Gtk.Orientation.VERTICAL} spacing={4}>
              <label label="GTK Theme" xalign={0} />
              <button class="settings-dropdown" onClicked={() => {
                if (s.activeList() === "theme" && s.listPopupOpen()) {
                  s.setListPopupOpen(false)
                  s.setActiveList(null)
                } else {
                  s.setActiveList("theme")
                  s.setListPopupOpen(true)
                }
              }}>
                <label label={s.currentTheme((v) => v || "GTK theme…")} xalign={0} hexpand />
              </button>
            </box>

            {/* Icon Theme */}
            <box class="settings-row" orientation={Gtk.Orientation.VERTICAL} spacing={4}>
              <label label="Icon Theme" xalign={0} />
              <button class="settings-dropdown" onClicked={() => {
                if (s.activeList() === "icon" && s.listPopupOpen()) {
                  s.setListPopupOpen(false)
                  s.setActiveList(null)
                } else {
                  s.setActiveList("icon")
                  s.setListPopupOpen(true)
                }
              }}>
                <label label={s.currentIcon((v) => v || "Icon theme…")} xalign={0} hexpand />
              </button>
            </box>

            {/* Font */}
            <box class="settings-row" orientation={Gtk.Orientation.VERTICAL} spacing={4}>
              <label label="Font" xalign={0} />
              <button class="settings-dropdown" onClicked={() => {
                if (s.activeList() === "font" && s.listPopupOpen()) {
                  s.setListPopupOpen(false)
                  s.setActiveList(null)
                } else {
                  s.setActiveList("font")
                  s.setListPopupOpen(true)
                }
              }}>
                <label label={s.currentFont((v) => v || "Font…")} xalign={0} hexpand />
              </button>
            </box>

            {/* Cursor */}
            <box class="settings-row" orientation={Gtk.Orientation.VERTICAL} spacing={4}>
              <label label="Cursor" xalign={0} />
              <box orientation={Gtk.Orientation.HORIZONTAL} spacing={6}>
                <button class="settings-dropdown" hexpand halign={Gtk.Align.FILL} onClicked={() => {
                  if (s.activeList() === "cursor" && s.listPopupOpen()) {
                    s.setListPopupOpen(false)
                    s.setActiveList(null)
                  } else {
                    s.setActiveList("cursor")
                    s.setListPopupOpen(true)
                  }
                }}>
                  <label label={s.currentCursor((v) => v || "Cursor theme…")} xalign={0} hexpand />
                </button>
                <Gtk.Entry
                  class="settings-entry settings-size-entry"
                  placeholderText="Size"
                  widthRequest={56}
                  widthChars={4}
                  maxWidthChars={4}
                  text={s.cursorSizeInput()}
                  tooltipText="Size \u2014 press Enter to apply"
                  onActivate={(self) => {
                    const size = self.get_text().trim() || "24"
                    s.setCursorSizeInput(size)
                    const theme = s.currentCursor()
                    if (theme) {
                      execAsync(["bash", "-c", `$HOME/.config/ags/settings.sh set cursor '${theme}' ${size}`])
                        .then(() => s.setSettingsStatus(`Cursor size set to ${size}`))
                        .catch(() => s.setSettingsStatus("Failed to set cursor size"))
                    }
                  }}
                />
              </box>
            </box>

            {/* Wallpaper */}
            <box class="settings-row" orientation={Gtk.Orientation.VERTICAL} spacing={4}>
              <label label="Wallpaper" xalign={0} />
              <button class="action" onClicked={() => {
                s.setSettingsStatus("Choosing wallpaper...")
                execAsync(["bash", "-c", "$HOME/.config/ags/pick-file.py"])
                  .then((out) => {
                    const path = out.trim()
                    if (!path) { s.setSettingsStatus(""); return }
                    execAsync(["bash", "-c", `$HOME/.config/ags/settings.sh set wallpaper '${path}'`])
                      .then(() => s.setSettingsStatus("Wallpaper set"))
                      .catch(() => s.setSettingsStatus("Failed to set wallpaper"))
                  })
                  .catch(() => s.setSettingsStatus("Failed to open file picker"))
              }}>
                <label label="Choose wallpaper..." />
              </button>
            </box>

            <Gtk.Separator orientation={Gtk.Orientation.HORIZONTAL} />

            <label
              class="settings-status"
              label={s.settingsStatus}
              xalign={0.5}
              visible={createComputed(() => s.settingsStatus() !== "")}
            />
          </box>
        </box>
      </window>
,
      <window
        visible={createComputed(() => s.listPopupOpen() && s.activeList() !== null)}
        name={`ags-settings-list-${monitorIndex}`}
        class="FlyoutWindow"
        gdkmonitor={gdkmonitor}
        anchor={TOP | RIGHT}
        layer={Astal.Layer.OVERLAY}
        keymode={Astal.Keymode.ON_DEMAND}
        exclusivity={Astal.Exclusivity.IGNORE}
        marginTop={120}
        application={app}
      >
        <box hexpand halign={Gtk.Align.END} marginEnd={controlFlyoutMarginEnd}>
          <button class="DismissSurface" hexpand vexpand canTarget onClicked={() => {
            s.setListPopupOpen(false)
            s.setActiveList(null)
          }} />
          <box
            class="flyout settings-list-popup"
            orientation={Gtk.Orientation.VERTICAL}
            spacing={8}
            marginBottom={40}
          >
            <label class="flyout-title" label={createComputed(() => {
              const kind = s.activeList()
              if (kind === "theme") return "GTK Theme"
              if (kind === "icon") return "Icon Theme"
              if (kind === "font") return "Fonts"
              if (kind === "cursor") return "Cursor Theme"
              return ""
            })} xalign={0.5} />
            <Gtk.Separator orientation={Gtk.Orientation.HORIZONTAL} />
            <Gtk.ScrolledWindow heightRequest={220} widthRequest={300} overlayScrolling={false}>
              <box class="settings-list" orientation={Gtk.Orientation.VERTICAL}>
                <For each={createComputed(() => {
                  const kind = s.activeList()
                  if (kind === "theme") return s.themeList()
                  if (kind === "icon") return s.iconList()
                  if (kind === "font") return s.fontList()
                  if (kind === "cursor") return s.cursorList()
                  return []
                })}>
                  {(item) => (
                    <button class="settings-item" onClicked={() => {
                      const kind = s.activeList()
                      if (kind === "theme") {
                        execAsync(["bash", "-c", `$HOME/.config/ags/settings.sh set theme '${item}'`])
                          .then(() => s.setCurrentTheme(item))
                          .catch(() => null)
                      } else if (kind === "icon") {
                        execAsync(["bash", "-c", `$HOME/.config/ags/settings.sh set icon '${item}'`])
                          .then(() => s.setCurrentIcon(item))
                          .catch(() => null)
                      } else if (kind === "font") {
                        execAsync(["bash", "-c", `$HOME/.config/ags/settings.sh set font '${item}'`])
                          .then(() => s.setCurrentFont(item))
                          .catch(() => null)
                      } else if (kind === "cursor") {
                        const size = s.cursorSizeInput()
                        execAsync(["bash", "-c", `$HOME/.config/ags/settings.sh set cursor '${item}' ${size}`])
                          .then(() => s.setCurrentCursor(item))
                          .catch(() => null)
                      }
                      s.setListPopupOpen(false)
                      s.setActiveList(null)
                    }}>
                      <label label={item} xalign={0} hexpand />
                    </button>
                  )}
                </For>
              </box>
            </Gtk.ScrolledWindow>
          </box>
          <button class="DismissSurface" hexpand vexpand canTarget onClicked={() => {
            s.setListPopupOpen(false)
            s.setActiveList(null)
          }} />
        </box>
      </window>
  ]
}
