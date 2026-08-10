import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { execAsync } from "ags/process"
import { timeout } from "ags/time"
import { createComputed, createEffect, createState } from "gnim"
import { createStore, workspaceColorClass } from "./store"
import config from "./widgets.config"
import PowerMenuWindow from "./PowerMenu"
import DesktopMenuWindow from "./DesktopMenu"
import SettingsWindows from "./Settings"

export default function Bar(gdkmonitor: Gdk.Monitor) {
  const s = createStore()
  const monitorIndex = Math.max(0, app.get_monitors().indexOf(gdkmonitor))
  const { TOP, LEFT, RIGHT, BOTTOM } = Astal.WindowAnchor
  const workspaceSlots = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

  // ── Bar-local state ────────────────────────────────────────────────────────
  const [barVisible, setBarVisible] = createState(true)
  const [barWindowVisible, setBarWindowVisible] = createState(true)
  const [barRevealed, setBarRevealed] = createState(true)
  const [barReserved, setBarReserved] = createState(true)

  const effectiveBarVisible = createComputed(() => barVisible() || s.popupOpen())

  let hideTimer: ReturnType<typeof timeout> | null = null
  let barRevealTimer: ReturnType<typeof timeout> | null = null
  let barReserveTimer: ReturnType<typeof timeout> | null = null
  let barUnmountTimer: ReturnType<typeof timeout> | null = null
  const barSlideDuration = 300
  const barRevealDelay = 20
  const barReserveReleaseDelay = 48
  const controlFlyoutMarginTop = 48
  const controlFlyoutMarginEnd = 18
  const powerFlyoutMarginTop = 48
  const flyoutToggleSize = 24

  // ── Bar-local effects ──────────────────────────────────────────────────────
  function scheduleHide() {
    if (hideTimer) return
    hideTimer = timeout(380, () => {
      hideTimer = null
      if (!s.popupOpen() && !s.chooserOpen() && s.cursorY() > 40) setBarVisible(false)
    })
  }

  function cancelHide() {
    if (hideTimer) {
      hideTimer.cancel()
      hideTimer = null
    }
  }

  let lastWorkspaceIds: number[] = []
  if (config.workspaces) {
    createEffect(() => {
      const ids = s.workspaceIds()
      const born = ids.filter((id) => !lastWorkspaceIds.includes(id))
      const dying = lastWorkspaceIds.filter((id) => !ids.includes(id))

      if (born.length === 0 && dying.length === 0) {
        lastWorkspaceIds = [...ids]
        return
      }

      if (born.length > 0) {
        s.setWorkspaceFx((prev) => {
          const next = { ...prev }
          for (const id of born) next[id] = "born"
          return next
        })

        timeout(560, () => {
          s.setWorkspaceFx((prev) => {
            const next = { ...prev }
            for (const id of born) {
              if (next[id] === "born") next[id] = "settled"
            }
            return next
          })
        })
      }

      if (dying.length > 0) {
        s.setWorkspaceFx((prev) => {
          const next = { ...prev }
          for (const id of dying) next[id] = "dying"
          return next
        })

        timeout(640, () => {
          s.setWorkspaceFx((prev) => {
            const next = { ...prev }
            for (const id of dying) {
              if (next[id] === "dying") delete next[id]
            }
            return next
          })
        })
      }

      lastWorkspaceIds = [...ids]
    })
  }

  createEffect(() => {
    const revealEdge = s.cursorY() <= 8
    const onBarBand = s.cursorY() <= 40
    const revealBand = s.cursorY() <= 20
    const hasPopup = s.popupOpen() || s.chooserOpen()
    if (hasPopup) {
      cancelHide()
      setBarVisible(true)
      return
    }

    if (revealEdge) {
      cancelHide()
      setBarVisible(true)
      return
    }

    if (!barVisible() && revealBand) {
      cancelHide()
      setBarVisible(true)
      return
    }

    if (barVisible() && onBarBand) {
      cancelHide()
      return
    }

    scheduleHide()
  })

  createEffect(() => {
    const shouldShow = effectiveBarVisible()

    if (shouldShow) {
      if (barReserveTimer) {
        barReserveTimer.cancel()
        barReserveTimer = null
      }

      if (barUnmountTimer) {
        barUnmountTimer.cancel()
        barUnmountTimer = null
      }

      setBarReserved(true)

      if (!barWindowVisible()) {
        setBarWindowVisible(true)

        if (barRevealTimer) barRevealTimer.cancel()
        barRevealTimer = timeout(barRevealDelay, () => {
          barRevealTimer = null
          if (effectiveBarVisible()) setBarRevealed(true)
        })
      } else {
        setBarRevealed(true)
      }

      return
    }

    if (barRevealTimer) {
      barRevealTimer.cancel()
      barRevealTimer = null
    }

    setBarRevealed(false)

    if (barReserveTimer) barReserveTimer.cancel()
    barReserveTimer = timeout(barReserveReleaseDelay, () => {
      barReserveTimer = null
      if (!effectiveBarVisible()) setBarReserved(false)
    })

    if (barUnmountTimer) barUnmountTimer.cancel()
    barUnmountTimer = timeout(barSlideDuration + 24, () => {
      barUnmountTimer = null
      if (!effectiveBarVisible()) setBarWindowVisible(false)
    })
  })

  // Top-level calendar auth status check
  if (config.calendar) {
    ;(async () => {
      try {
        const out = await execAsync(["bash", "-lc", "$HOME/.config/ags/calendar-auth.sh status"])
        try {
          const parsed = JSON.parse(out)
          if (parsed.signed_in && parsed.email) {
            s.setCalendarAccountEmail(parsed.email)
          }
        } catch { /* ignored */ }
      } catch { /* ignored */ }
    })()
  }

  // ── JSX ────────────────────────────────────────────────────────────────────
  return (
    <>
      <window
        visible={createComputed(() => s.popupOpen() && !s.chooserOpen())}
        name={`ags-dismiss-${monitorIndex}`}
        class="DismissWindow"
        gdkmonitor={gdkmonitor}
        anchor={TOP | LEFT | RIGHT | BOTTOM}
        layer={Astal.Layer.TOP}
        keymode={Astal.Keymode.NONE}
        exclusivity={Astal.Exclusivity.IGNORE}
        application={app}
      >
        <button
          class="DismissSurface"
          css="background: rgba(0, 0, 0, 0.01);"
          hexpand
          vexpand
          canTarget
          onClicked={s.closeFlyouts}
        />
      </window>

      <window
        visible={barWindowVisible}
        name={`ags-topbar-${monitorIndex}`}
        namespace="ags-topbar"
        class="Bar"
        gdkmonitor={gdkmonitor}
        exclusivity={barReserved((reserved) =>
          reserved ? Astal.Exclusivity.EXCLUSIVE : Astal.Exclusivity.IGNORE
        )}
        anchor={TOP | LEFT | RIGHT}
        layer={Astal.Layer.TOP}
        keymode={Astal.Keymode.NONE}
        application={app}
      >
        <box class="bar-viewport" hexpand>
          <centerbox
            cssName="bar-shell"
            class={barRevealed((shown) => `bar-shell ${shown ? "shown" : "hidden"}`)}
            hexpand
            halign={Gtk.Align.FILL}
          >
            <box $type="start" spacing={8}>
              {config.desktopMenu && (
                <button
                  widthRequest={flyoutToggleSize}
                  heightRequest={flyoutToggleSize}
                  valign={Gtk.Align.CENTER}
                  class={s.desktopMenuOpen((open) => `desktop-menu-toggle bar-cap-button${open ? " active" : ""}`)}
                  onClicked={s.toggleDesktopMenu}
                >
                  <label class="desktop-menu-icon" label={"\u{F0C9}"} />
                </button>
              )}
              {config.workspaces && (
                <>{workspaceSlots.map((ws) => (
                  <button
                    visible={createComputed(() => {
                      const fx = s.workspaceFx()
                      return fx[ws] === "born" || fx[ws] === "settled" || fx[ws] === "dying"
                    })}
                    widthRequest={22}
                    heightRequest={22}
                    class="ws-dot"
                    $={(self) => {
                      const middleClick = new Gtk.GestureClick({ button: 2 })
                      middleClick.connect("pressed", () => {
                        s.createNewDesktop()
                      })
                      self.add_controller(middleClick)
                    }}
                    onClicked={() => {
                      execAsync(["hyprctl", "dispatch", "workspace", String(ws)]).catch(() => null)
                    }}
                  >
                    <box
                      widthRequest={22}
                      heightRequest={22}
                      halign={Gtk.Align.CENTER}
                      valign={Gtk.Align.CENTER}
                      class={createComputed(() => {
                        const current = s.activeWorkspace()
                        const fx = s.workspaceFx()
                        const isActive = current === ws
                        const phase = fx[ws] === "born" || fx[ws] === "dying" ? ` ${fx[ws]}` : ""
                        return `ws-core ${workspaceColorClass(ws)}${isActive ? " active" : ""}${phase}`
                      })}
                    />
                  </button>
                ))}</>
              )}
            </box>

            {config.clock ? (
              config.calendar ? (
                <button
                  $type="center"
                  class={s.calendarOpen((open) => (open ? "clock active" : "clock"))}
                  onClicked={s.toggleCalendar}
                >
                  <label class="clock-label center-label" label={s.centerDisplay} />
                </button>
              ) : (
                <label $type="center" class="clock-label center-label" label={s.clock} />
              )
            ) : null}

            <box $type="end" spacing={8}>
              {config.controlCenter && (
                <button
                  widthRequest={26}
                  heightRequest={26}
                  valign={Gtk.Align.CENTER}
                  halign={Gtk.Align.CENTER}
                  class={s.controlOpen((open) => (open ? "bar-cap-button active" : "bar-cap-button"))}
                  onClicked={s.toggleControl}
                >
                  <box class="gear-icon-box" widthRequest={14} heightRequest={14} halign={Gtk.Align.CENTER} valign={Gtk.Align.CENTER} />
                </button>
              )}
              {config.powerMenu && (
                <button
                  widthRequest={26}
                  heightRequest={26}
                  valign={Gtk.Align.CENTER}
                  halign={Gtk.Align.CENTER}
                  class={s.powerMenuOpen((open) => (open ? "bar-cap-button active" : "bar-cap-button"))}
                  onClicked={s.togglePowerMenu}
                >
                  <box class="power-icon-box" widthRequest={14} heightRequest={14} halign={Gtk.Align.CENTER} valign={Gtk.Align.CENTER} />
                </button>
              )}
            </box>
          </centerbox>
        </box>
      </window>

      {config.desktopMenu && DesktopMenuWindow(gdkmonitor, monitorIndex, s)}

      {config.controlCenter && (
        <window
          visible={s.controlOpen}
          name={`ags-control-${monitorIndex}`}
          class="FlyoutWindow"
          gdkmonitor={gdkmonitor}
          anchor={TOP | RIGHT}
          layer={Astal.Layer.OVERLAY}
          keymode={Astal.Keymode.ON_DEMAND}
          exclusivity={Astal.Exclusivity.IGNORE}
          marginTop={controlFlyoutMarginTop}
          application={app}
        >
          <box hexpand halign={Gtk.Align.END} marginEnd={controlFlyoutMarginEnd}>
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
                  label={s.manualVolume((v) => `Volume ${Math.round(v * 100)}%`)}
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
                  value: Math.round(s.manualVolume() * 100),
                })}
                onValueChanged={(self) => {
                  const next = s.clamp01(self.get_value() / 100)
                  s.setManualVolume(next)
                  execAsync(["wpctl", "set-volume", "@DEFAULT_AUDIO_SINK@", String(next)]).catch(() => null)
                }}
              />
            </box>

            <box class="slider-row" orientation={Gtk.Orientation.VERTICAL} spacing={4}>
              <label label={s.effectiveBrightness((v) => `Brightness ${v}%`)} xalign={0} />
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
                  s.setBrightnessPercent(Math.max(5, Math.min(100, next)))
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
                    class={s.wifiEnabled((on) => `round-icon${on ? " active" : " off"}`)}
                    onClicked={() => {
                      const next = !s.wifiEnabled()
                      execAsync(["nmcli", "radio", "wifi", next ? "on" : "off"]).catch(() => null)
                    }}
                  >
                    <label class="signal-icon" label={s.wifiGlyph} />
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
        </window>
      )}

      {config.powerMenu && PowerMenuWindow(gdkmonitor, monitorIndex, s)}

      {config.calendar && (
        <window
          visible={s.calendarOpen}
          name={`ags-calendar-${monitorIndex}`}
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
            <box class="flyout calendar-flyout" orientation={Gtk.Orientation.VERTICAL} spacing={10} marginBottom={40}>
              <centerbox>
                <box $type="start" widthRequest={34} />
                <label $type="center" class="flyout-title" label="Calendar" xalign={0.5} />
                <button $type="end" class="calendar-account-btn" onClicked={s.handleAccountClick}
                  tooltipText={s.calendarAccountEmail((e) => e ? "Sign out" : "Sign in to Google Calendar")}>
                  <label label={s.calendarAccountEmail((e) => {
                    if (!e) return "Sign in"
                    return e.length > 20 ? e.slice(0, 18) + "…" : e
                  })} />
                </button>
              </centerbox>
              <Gtk.Calendar class="calendar-widget" />
              <Gtk.Separator orientation={Gtk.Orientation.HORIZONTAL} />
              <label class="events-title" label="Google Calendar" xalign={0.5} />

              <label class="events" label={s.gcalEvents} xalign={0.5} wrap justify={Gtk.Justification.CENTER} />
            </box>
            <button class="DismissSurface" hexpand vexpand canTarget onClicked={s.closeFlyouts} />
          </box>
        </window>
      )}

      {config.calendar && (
        <window
          visible={s.authDialogOpen}
          name={`ags-calendar-auth-${monitorIndex}`}
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
            <button class="DismissSurface" hexpand vexpand canTarget onClicked={s.closeAuthDialog} />
            <box class="flyout calendar-auth-dialog" orientation={Gtk.Orientation.VERTICAL} spacing={10} marginBottom={40}>
              <label class="flyout-title" label="Sign in to Google Calendar" xalign={0.5} />
              <Gtk.Separator orientation={Gtk.Orientation.HORIZONTAL} />

              {/* State A: need_code — device_code set */}
              <box class="auth-instructions" orientation={Gtk.Orientation.VERTICAL} spacing={6} marginTop={4}
                visible={createComputed(() => !!s.authDialogInfo().device_code)}>
                <label label="Go to this URL and enter the code:" xalign={0.5} wrap />
                <label class="auth-url" label={createComputed(() => s.authDialogInfo().verification_url || "—")} xalign={0.5} wrap selectable />
                <label class="auth-code" label={createComputed(() => s.authDialogInfo().user_code || "—")} xalign={0.5} />
              </box>

              {/* State B: client_id missing */}
              <box class="auth-setup" orientation={Gtk.Orientation.VERTICAL} spacing={6} marginTop={4}
                visible={createComputed(() => s.isClientIdMissing())}>
                <label label="No OAuth client_id found. Create one at:" xalign={0.5} wrap />
                <box orientation={Gtk.Orientation.HORIZONTAL} spacing={6} halign={Gtk.Align.CENTER}>
                  <label class="auth-url" label="https://console.cloud.google.com/" xalign={0.5} wrap selectable />
                  <button class="action" onClicked={() => execAsync(["bash", "-lc",
                    "(command -v xdg-open >/dev/null 2>&1 && xdg-open 'https://console.cloud.google.com/') || true"
                  ]).catch(() => null)}>
                    <label label="Open" />
                  </button>
                </box>
                <Gtk.Entry
                  class="auth-entry"
                  placeholderText="Paste your OAuth client_id (xxxx.apps.googleusercontent.com)"
                  text={s.clientIdInput()}
                  onNotifyText={(self) => s.setClientIdInput(self.text)}
                  halign={Gtk.Align.CENTER}
                />
              </box>

              {/* State C: other errors */}
              <label class="auth-error" label={createComputed(() => s.authDialogInfo().error)} xalign={0.5} wrap
                visible={createComputed(() => s.authDialogInfo().error !== "" && !s.isClientIdMissing())} />

              <box orientation={Gtk.Orientation.HORIZONTAL} spacing={10} halign={Gtk.Align.CENTER} marginTop={6}>
                <button class="action" onClicked={s.closeAuthDialog}>
                  <label label="Cancel" />
                </button>
                <button class="action" onClicked={s.saveClientIdAndLogin}
                  visible={createComputed(() => s.isClientIdMissing())}>
                  <label label="Save & Sign in" />
                </button>
                <button class="action" onClicked={s.startAuthPoll}
                  visible={createComputed(() => !!s.authDialogInfo().device_code)}>
                  <label label="I've authorized" />
                </button>
              </box>
            </box>
            <button class="DismissSurface" hexpand vexpand canTarget onClicked={s.closeAuthDialog} />
          </box>
        </window>
      )}

      {config.settings && SettingsWindows(gdkmonitor, monitorIndex, s)}
    </>
  )
}
