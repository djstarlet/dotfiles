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
import CalendarWindows from "./Calendar"
import ControlCenterWindow from "./ControlCenter"

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

      {config.controlCenter && ControlCenterWindow(gdkmonitor, monitorIndex, s)}

      {config.powerMenu && PowerMenuWindow(gdkmonitor, monitorIndex, s)}

      {config.calendar && CalendarWindows(gdkmonitor, monitorIndex, s)}

      {config.settings && SettingsWindows(gdkmonitor, monitorIndex, s)}
    </>
  )
}
