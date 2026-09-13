import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { timeout } from "ags/time"
import { createComputed, createEffect, createState } from "gnim"
import type { Store } from "./store"
import config from "./widgets.config"
import PowerMenuWindow from "./PowerMenu"
import DesktopMenuWindow from "./DesktopMenu"
import SettingsWindows from "./Settings"
import CalendarWindows from "./Calendar"
import ControlCenterWindow from "./ControlCenter"
import SystemInfoWindow from "./SystemInfo"
import NotificationsWindow from "./Notifications"
import NotificationToasts from "./Toasts"
import { ClockElement } from "./Clock"
import { WorkspacesElement } from "./Workspaces"
import { BarCap } from "./buttons"

export default function Bar(gdkmonitor: Gdk.Monitor, s: Store) {
  const monitorIndex = Math.max(0, app.get_monitors().indexOf(gdkmonitor))
  const { TOP, LEFT, RIGHT, BOTTOM } = Astal.WindowAnchor

  // ── Bar-local state ────────────────────────────────────────────────────────
  const [barVisible, setBarVisible] = createState(true)
  const [barWindowVisible, setBarWindowVisible] = createState(true)
  const [barRevealed, setBarRevealed] = createState(true)
  const [barReserved, setBarReserved] = createState(true)

  // hyprctl cursorpos reports the cursor in GLOBAL layout coordinates, and
  // monitors are rarely positioned at (0,0) - e.g. a second screen placed at
  // Y=2077 has its top edge at global Y=2077. The reveal/hide bands must be
  // relative to THIS monitor's geometry, otherwise the bar can never react to
  // the cursor on any monitor whose top edge is not at global Y=0.
  function cursorInTopBand(bandHeight: number) {
    const { x: cx, y: cy } = s.cursorPos()
    const geo = gdkmonitor.get_geometry()
    const withinX = cx >= geo.x && cx <= geo.x + geo.width
    const relY = cy - geo.y
    return withinX && relY >= 0 && relY <= bandHeight
  }

  const effectiveBarVisible = createComputed(() => barVisible() || s.popupOpen())

  let hideTimer: ReturnType<typeof timeout> | null = null
  let barRevealTimer: ReturnType<typeof timeout> | null = null
  let barReserveTimer: ReturnType<typeof timeout> | null = null
  let barUnmountTimer: ReturnType<typeof timeout> | null = null
  const barSlideDuration = 300
  const barRevealDelay = 20
  const barReserveReleaseDelay = 48

  // ── Bar-local effects ──────────────────────────────────────────────────────
  function scheduleHide() {
    if (hideTimer) return
    hideTimer = timeout(380, () => {
      hideTimer = null
      if (!s.popupOpen() && !cursorInTopBand(40)) setBarVisible(false)
    })
  }

  function cancelHide() {
    if (hideTimer) {
      hideTimer.cancel()
      hideTimer = null
    }
  }

  createEffect(() => {
    const revealEdge = cursorInTopBand(8)
    const onBarBand = cursorInTopBand(40)
    const revealBand = cursorInTopBand(20)
    const hasPopup = s.popupOpen()
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

  // ── JSX ────────────────────────────────────────────────────────────────────
  return (
    <>
      <window
        visible={s.popupOpen}
        name={`ags-dismiss-${monitorIndex}`}
        namespace="ags-dismiss"
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
                <BarCap open={s.desktopMenuOpen} onClicked={s.toggleDesktopMenu}>
                  <label class="desktop-menu-icon" label={"\u{F0C9}"} />
                </BarCap>
              )}
              {config.workspaces && WorkspacesElement(s)}
            </box>

            {ClockElement(s)}

            <box $type="end" spacing={8}>
              {config.notifications && (
                <BarCap open={s.notifOpen} onClicked={s.toggleNotifications}>
                  <overlay>
                    <label class="notif-bell" label={"\u{F0F3}"} />
                    <label
                      $type="overlay"
                      class="notif-badge"
                      label="●"
                      canTarget={false}
                      halign={Gtk.Align.END}
                      valign={Gtk.Align.START}
                      visible={s.hasNotifications}
                    />
                  </overlay>
                </BarCap>
              )}
              {config.controlCenter && (
                <BarCap open={s.controlOpen} onClicked={s.toggleControl}>
                  <label class="gear-icon" label={"\u{F013}"} />
                </BarCap>
              )}
              {config.powerMenu && (
                <BarCap open={s.powerMenuOpen} onClicked={s.togglePowerMenu}>
                  <label class="power-icon" label={"\u{F011}"} />
                </BarCap>
              )}
            </box>
          </centerbox>
        </box>
      </window>

      {config.desktopMenu && DesktopMenuWindow(gdkmonitor, monitorIndex, s)}

      {config.controlCenter && ControlCenterWindow(gdkmonitor, monitorIndex, s)}

      {config.systemInfo && SystemInfoWindow(gdkmonitor, monitorIndex, s)}

      {config.notifications && NotificationsWindow(gdkmonitor, monitorIndex, s)}

      {config.toasts && NotificationToasts(gdkmonitor, monitorIndex, s)}

      {config.powerMenu && PowerMenuWindow(gdkmonitor, monitorIndex, s)}

      {config.calendar && CalendarWindows(gdkmonitor, monitorIndex, s)}

      {config.settings && SettingsWindows(gdkmonitor, monitorIndex, s)}
    </>
  )
}
