import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { execAsync } from "ags/process"
import { createPoll } from "ags/time"
import { createComputed, createEffect, createState } from "gnim"
import type { Store } from "./store"
import config from "./widgets.config"

// ─── Parser helpers ───────────────────────────────────────────────────────────

function parseWifiSignal(raw: string) {
  const n = Number(String(raw).trim())
  return Number.isFinite(n) ? n : -1
}

function parseVolume(raw: string) {
  const m = String(raw).match(/([0-9.]+)/)
  if (!m) return 0.5
  const n = Number(m[1])
  return Number.isFinite(n) ? n : 0.5
}

function parseWifiEnabled(raw: string) {
  return /enabled|yes|on|true/i.test(raw)
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x))
}

// ─── Control Center ───────────────────────────────────────────────────────────

export default function ControlCenterWindow(gdkmonitor: Gdk.Monitor, monitorIndex: number, s: Store) {
  // ── CC-local polls ─────────────────────────────────────────────────────────
  const wifiEnabled = createPoll(true, 3000, ["nmcli", "-t", "-f", "WIFI", "g"], (out) =>
    parseWifiEnabled(out),
  )
  const wifiSignal = createPoll(-1, 5000, (prev) =>
    execAsync([
      "bash",
      "-lc",
      "nmcli -t -f ACTIVE,SIGNAL dev wifi list | grep '^yes:' | cut -d: -f2 | head -n1",
    ])
      .then((out) => parseWifiSignal(out))
      .catch(() => prev),
  )
  const liveVolume = createPoll(0.5, 1200, ["bash", "-c", "wpctl get-volume @DEFAULT_AUDIO_SINK@ 2>/dev/null || echo '0.5'"], (out) =>
    parseVolume(out),
  )

  // ── CC-local state ─────────────────────────────────────────────────────────
  const [brightnessPercent, setBrightnessPercent] = createState(100)
  const [manualVolume, setManualVolume] = createState(0.5)

  // ── CC-local computeds ─────────────────────────────────────────────────────
  const effectiveBrightness = createComputed(() => Math.max(5, Math.min(100, Math.round(brightnessPercent()))))
  const wifiGlyph = createComputed(() => {
    if (!wifiEnabled()) return "×"

    const signal = wifiSignal()
    if (signal >= 75) return "▂▄▆█"
    if (signal >= 50) return "▂▄▆"
    if (signal >= 25) return "▂▄"
    if (signal >= 1) return "▂"
    return "·"
  })

  // ── CC-local effects ───────────────────────────────────────────────────────
  // Brightness effect
  createEffect(() => {
    const pct = brightnessPercent()
    execAsync(["bash", "-lc", `$HOME/.config/ags/brightness-dim.sh ${Math.round(pct)}`]).catch(() => null)
  })

  // Manual volume sync
  createEffect(() => {
    if (config.controlCenter) {
      setManualVolume(liveVolume())
    }
  })

  // ── JSX ────────────────────────────────────────────────────────────────────
  const { TOP, LEFT, RIGHT } = Astal.WindowAnchor

  return (
    <window
      visible={s.controlOpen}
      name={`ags-control-${monitorIndex}`}
      namespace="ags-control"
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
        class="flyout control-flyout"
        orientation={Gtk.Orientation.VERTICAL}
        spacing={10}
        vexpand
        marginBottom={40}
      >

        <centerbox>
          <box $type="start" widthRequest={34} />
          <label $type="center" class="flyout-title" label="Control Center" xalign={0.5} />
          {config.settings && (
            <button
              $type="end"
              class="mini-gear"
              onClicked={s.toggleSettings}
            >
              <label class="gear-icon" label={"\u{F1FC}"} />
            </button>
          )}
        </centerbox>

        <box class="slider-row" orientation={Gtk.Orientation.VERTICAL} spacing={4}>
          <centerbox>
            <label
              $type="start"
              label={manualVolume((v) => `Volume ${Math.round(v * 100)}%`)}
              xalign={0}
            />
            <box $type="center" />
            <button $type="end" class="round-icon" onClicked={s.openAudioSettings}>
              <image class="symbol-icon" iconName="audio-volume-high-symbolic" pixelSize={20} />
            </button>
          </centerbox>
          <Gtk.Scale
            orientation={Gtk.Orientation.HORIZONTAL}
            drawValue={false}
            hexpand
            adjustment={new Gtk.Adjustment({
              lower: 0,
              upper: 100,
              stepIncrement: 1,
              pageIncrement: 5,
              value: Math.round(manualVolume() * 100),
            })}
            onValueChanged={(self) => {
              const next = clamp01(self.get_value() / 100)
              setManualVolume(next)
              execAsync(["wpctl", "set-volume", "@DEFAULT_AUDIO_SINK@", String(next)]).catch(() => null)
            }}
          />
        </box>

        <box class="slider-row" orientation={Gtk.Orientation.VERTICAL} spacing={4}>
          <label label={effectiveBrightness((v) => `Brightness ${v}%`)} xalign={0} />
          <Gtk.Scale
            orientation={Gtk.Orientation.HORIZONTAL}
            drawValue={false}
            hexpand
            adjustment={new Gtk.Adjustment({
              lower: 5,
              upper: 100,
              stepIncrement: 1,
              pageIncrement: 5,
              value: 100,
            })}
            onValueChanged={(self) => {
              const next = Math.round(self.get_value())
              setBrightnessPercent(Math.max(5, Math.min(100, next)))
            }}
          />
        </box>

        <box class="control-actions-section" orientation={Gtk.Orientation.VERTICAL} spacing={6} halign={Gtk.Align.CENTER}>
          <box class="control-actions-row" orientation={Gtk.Orientation.HORIZONTAL} spacing={10} halign={Gtk.Align.CENTER}>
            <box class="control-action-tile" widthRequest={68} orientation={Gtk.Orientation.VERTICAL} spacing={3} halign={Gtk.Align.CENTER}>
              <button
                widthRequest={44} heightRequest={44}
                hexpand={false} vexpand={false}
                halign={Gtk.Align.CENTER} valign={Gtk.Align.CENTER}
                class={wifiEnabled((on) => `round-icon${on ? " active" : " off"}`)}
                onClicked={() => {
                  const next = !wifiEnabled()
                  execAsync(["nmcli", "radio", "wifi", next ? "on" : "off"]).catch(() => null)
                }}
              >
                <label class="signal-icon" label={wifiGlyph} />
              </button>
              <label class="control-action-label" label="Wi-Fi" />
            </box>
            <box class="control-action-tile" widthRequest={68} orientation={Gtk.Orientation.VERTICAL} spacing={3} halign={Gtk.Align.CENTER}>
              <button
                widthRequest={44} heightRequest={44}
                hexpand={false} vexpand={false}
                halign={Gtk.Align.CENTER} valign={Gtk.Align.CENTER}
                class="round-icon"
                onClicked={s.openNetworkSettings}
              >
                <image class="symbol-icon" iconName="network-workgroup-symbolic" pixelSize={20} />
              </button>
              <label class="control-action-label" label="Network" />
            </box>
            {config.powerMenu && (
              <box class="control-action-tile" widthRequest={68} orientation={Gtk.Orientation.VERTICAL} spacing={3} halign={Gtk.Align.CENTER}>
                <button
                  widthRequest={44} heightRequest={44}
                  hexpand={false} vexpand={false}
                  halign={Gtk.Align.CENTER} valign={Gtk.Align.CENTER}
                  class={s.powerMenuOpen((open) => `round-icon power-toggle${open ? " active" : ""}`)}
                  onClicked={() => {
                    const next = !s.powerMenuOpen()
                    s.setPowerMenuOpen(next)
                    if (!next) s.setPendingPowerAction(null)
                  }}
                >
                  <label class="power-icon" label="⏻" />
                </button>
                <label class="control-action-label" label="Power" />
              </box>
            )}
          </box>
        </box>

      </box>
        </box>
      </box>
    </window>
  )
}
