import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { createComputed, createEffect } from "gnim"
import type { Store } from "./store"
import { DEFAULT_WS_DOT_COLORS } from "./store"
import { darken, mixHex } from "./color-utils"

export default function PowerMenuWindow(gdkmonitor: Gdk.Monitor, monitorIndex: number, s: Store) {
  const { TOP, LEFT, RIGHT } = Astal.WindowAnchor

  createEffect(() => {
    if (s.pendingPowerAction() !== null && !s.powerMenuOpen()) {
      s.setPowerMenuOpen(true)
    }
  })

  return (
    <window
      visible={s.powerMenuOpen}
      name={`ags-power-menu-${monitorIndex}`}
      namespace="ags-power-menu"
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
          <box halign={Gtk.Align.END}>
        <box
          class="flyout power-menu-flyout standalone"
          orientation={Gtk.Orientation.VERTICAL}
          spacing={6}
          vexpand
          marginStart={40}
          marginEnd={10}
          marginBottom={40}
        >
          <centerbox>
            <box $type="start" widthRequest={34} />
            <label $type="center" class="flyout-title" label="Power Menu" xalign={0.5} />
            <box $type="end" widthRequest={24} />
          </centerbox>

          <box
            class="control-actions-row power-actions-row"
            orientation={Gtk.Orientation.HORIZONTAL}
            spacing={10}
            halign={Gtk.Align.CENTER}
            visible={createComputed(() => s.pendingPowerAction() === null)}
          >
            <box class="control-action-tile" widthRequest={68} orientation={Gtk.Orientation.VERTICAL} spacing={3} halign={Gtk.Align.CENTER}>
              <button widthRequest={44} heightRequest={44} hexpand={false} vexpand={false} halign={Gtk.Align.CENTER} valign={Gtk.Align.CENTER} class="round-icon power-action-button" css={createComputed(() => {
                const c = s.wsDotColors()[3] || DEFAULT_WS_DOT_COLORS[3]
                return `background: radial-gradient(circle at 30% 26%, ${mixHex(c, "#ffffff", 0.55)} 0%, ${mixHex(c, "#ffffff", 0.25)} 28%, ${c} 62%, ${darken(c, 0.55)} 100%);`
              })} onClicked={() => s.runPowerAction("lock")}>
                <label class="power-action-glyph" label={s.powerGlyph("lock")} />
              </button>
              <label class="control-action-label" label="Lock" />
            </box>
            <box class="control-action-tile" widthRequest={68} orientation={Gtk.Orientation.VERTICAL} spacing={3} halign={Gtk.Align.CENTER}>
              <button widthRequest={44} heightRequest={44} hexpand={false} vexpand={false} halign={Gtk.Align.CENTER} valign={Gtk.Align.CENTER} class="round-icon power-action-button" css={createComputed(() => {
                const c = s.wsDotColors()[2] || DEFAULT_WS_DOT_COLORS[2]
                return `background: radial-gradient(circle at 30% 26%, ${mixHex(c, "#ffffff", 0.55)} 0%, ${mixHex(c, "#ffffff", 0.25)} 28%, ${c} 62%, ${darken(c, 0.55)} 100%);`
              })} onClicked={() => s.runPowerAction("logout")}>
                <label class="power-action-glyph" label={s.powerGlyph("logout")} />
              </button>
              <label class="control-action-label" label="Logout" />
            </box>
            <box class="control-action-tile" widthRequest={68} orientation={Gtk.Orientation.VERTICAL} spacing={3} halign={Gtk.Align.CENTER}>
              <button widthRequest={44} heightRequest={44} hexpand={false} vexpand={false} halign={Gtk.Align.CENTER} valign={Gtk.Align.CENTER} class="round-icon power-action-button warm" css={createComputed(() => {
                const c = s.wsDotColors()[1] || DEFAULT_WS_DOT_COLORS[1]
                return `background: radial-gradient(circle at 30% 26%, ${mixHex(c, "#ffffff", 0.55)} 0%, ${mixHex(c, "#ffffff", 0.25)} 28%, ${c} 62%, ${darken(c, 0.55)} 100%);`
              })} onClicked={() => s.runPowerAction("reboot")}>
                <label class="power-action-glyph" label={s.powerGlyph("reboot")} />
              </button>
              <label class="control-action-label" label="Reboot" />
            </box>
            <box class="control-action-tile" widthRequest={68} orientation={Gtk.Orientation.VERTICAL} spacing={3} halign={Gtk.Align.CENTER}>
              <button widthRequest={44} heightRequest={44} hexpand={false} vexpand={false} halign={Gtk.Align.CENTER} valign={Gtk.Align.CENTER} class="round-icon power-action-button danger" css={createComputed(() => {
                const c = s.wsDotColors()[0] || DEFAULT_WS_DOT_COLORS[0]
                return `background: radial-gradient(circle at 30% 26%, ${mixHex(c, "#ffffff", 0.55)} 0%, ${mixHex(c, "#ffffff", 0.25)} 28%, ${c} 62%, ${darken(c, 0.55)} 100%);`
              })} onClicked={() => s.runPowerAction("shutdown")}>
                <label class="power-action-glyph" label={s.powerGlyph("shutdown")} />
              </button>
              <label class="control-action-label" label="Shutdown" />
            </box>
          </box>

          <box
            class="power-confirm-row"
            orientation={Gtk.Orientation.VERTICAL}
            spacing={8}
            halign={Gtk.Align.CENTER}
            visible={createComputed(() => s.pendingPowerAction() !== null)}
          >
            <label
              class="power-confirm-label"
              label={createComputed(() => {
                const action = s.pendingPowerAction()
                if (!action) return ""
                return `Confirm ${action}?`
              })}
            />
            <box orientation={Gtk.Orientation.HORIZONTAL} spacing={10} halign={Gtk.Align.CENTER}>
              <button class="action" onClicked={s.cancelPowerAction}>
                <label label="Cancel" />
              </button>
              <button class={createComputed(() => {
                const action = s.pendingPowerAction()
                if (action === "shutdown") return "action danger"
                if (action === "reboot") return "action warm"
                return "action"
              })} onClicked={s.confirmPowerAction}>
                <label label="Confirm" />
              </button>
            </box>
          </box>
          </box>
          </box>
        </box>
    </window>
  )
}
