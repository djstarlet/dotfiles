import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { execAsync } from "ags/process"
import { createPoll, timeout } from "ags/time"
import { createComputed, createEffect, createState } from "gnim"

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v))
}

function parseVolume(raw: string) {
  const m = raw.match(/([0-9]*\.?[0-9]+)/)
  if (!m) return 0.5
  return clamp01(Number(m[1]))
}

function parseWifiEnabled(raw: string) {
  return raw.trim().toLowerCase() === "enabled"
}

function parseWifiSignal(raw: string) {
  const m = raw.match(/(\d{1,3})/)
  if (!m) return -1
  return Math.max(0, Math.min(100, Number(m[1])))
}

function parseActiveWorkspace(raw: string) {
  try {
    const parsed = JSON.parse(raw)
    const id = Number(parsed?.id)
    if (Number.isFinite(id) && id > 0) return id
  } catch {
    // ignored
  }
  return 1
}

function parseFocusedWindowTitle(raw: string) {
  try {
    const parsed = JSON.parse(raw)
    const title = String(parsed?.title || parsed?.initialTitle || parsed?.class || "").trim()
    if (!title) return "Desktop"

    const compact = title.replace(/\s+/g, " ")
    return compact.length > 48 ? `${compact.slice(0, 45)}...` : compact
  } catch {
    return "Desktop"
  }
}

function sanitizeEventText(raw: string) {
  const cleaned = raw
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/\t/g, " ")
    .trim()

  return cleaned
    .split("\n")
    .map((line) => line.replace(/\s{2,}/g, " ").trim())
    .filter((line, idx, arr) => line.length > 0 || (idx > 0 && idx < arr.length - 1))
    .join("\n")
}

function parseCursorY(raw: string) {
  const m = raw.match(/(-?\d+)\s*,\s*(-?\d+)/)
  if (!m) return 9999
  const y = Number(m[2])
  return Number.isFinite(y) ? y : 9999
}

function parseWorkspaceIds(raw: string) {
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return [1]

    const ids = parsed
      .map((item) => Number(item?.id))
      .filter((id) => Number.isFinite(id) && id > 0)

    if (ids.length === 0) return [1]
    return [...new Set(ids)].sort((a, b) => a - b)
  } catch {
    return [1]
  }
}

function workspaceColorClass(id: number) {
  const palette = ((id - 1) % 8) + 1
  return `ws-p${palette}`
}

export default function Bar(gdkmonitor: Gdk.Monitor) {
  const monitorIndex = Math.max(0, app.get_monitors().indexOf(gdkmonitor))
  const { TOP, LEFT, RIGHT, BOTTOM } = Astal.WindowAnchor
  const workspaceSlots = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

  const clock = createPoll("", 1000, ["bash", "-lc", "date '+%a %d %b  %H:%M:%S'"])
  const activeWorkspace = createPoll(1, 1200, ["hyprctl", "activeworkspace", "-j"], (out) =>
    parseActiveWorkspace(out),
  )
  const focusedWindowTitle = createPoll("Desktop", 900, ["hyprctl", "activewindow", "-j"], (out) =>
    parseFocusedWindowTitle(out),
  )
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
  const liveVolume = createPoll(0.5, 1200, ["wpctl", "get-volume", "@DEFAULT_AUDIO_SINK@"], (out) =>
    parseVolume(out),
  )
  const cursorY = createPoll(9999, 120, ["hyprctl", "cursorpos"], (out) => parseCursorY(out))
  const workspaceListRaw = createPoll([1], 1300, ["hyprctl", "workspaces", "-j"], (out) =>
    parseWorkspaceIds(out),
  )
  const gcalEvents = createPoll(
    "No events available.",
    6000,
    ["bash", "-lc", "~/.config/quickshell/calendar-events.sh"],
    (out) => {
      const cleaned = sanitizeEventText(out)
      return cleaned.length > 0 ? cleaned : "No upcoming Google Calendar events."
    },
  )

  const [barVisible, setBarVisible] = createState(true)
  const [controlOpen, setControlOpen] = createState(false)
  const [calendarOpen, setCalendarOpen] = createState(false)
  const [desktopMenuOpen, setDesktopMenuOpen] = createState(false)
  const [brightnessPercent, setBrightnessPercent] = createState(100)
  const [manualVolume, setManualVolume] = createState(0.5)

  const popupOpen = createComputed(() => controlOpen() || calendarOpen() || desktopMenuOpen())
  const effectiveBarVisible = createComputed(() => barVisible() || popupOpen())
  const effectiveBrightness = createComputed(() => Math.max(5, Math.min(100, Math.round(brightnessPercent()))))
  const dimOpacity = createComputed(() => (100 - effectiveBrightness()) / 100)
  const dimVisible = createComputed(() => dimOpacity() > 0.001)
  const dimCss = createComputed(() => `background: rgba(0,0,0,${dimOpacity().toFixed(3)});`)
  const volumeValue = createComputed(() => manualVolume())
  const workspaceIds = createComputed(() => {
    const ids = workspaceListRaw()
    const active = activeWorkspace()
    if (ids.includes(active)) return ids
    return [...ids, active].sort((a, b) => a - b)
  })
  const [workspaceFx, setWorkspaceFx] = createState<Record<number, "born" | "dying">>({})
  const wifiGlyph = createComputed(() => {
    if (!wifiEnabled()) return "×"

    const signal = wifiSignal()
    if (signal >= 75) return "▂▄▆█"
    if (signal >= 50) return "▂▄▆"
    if (signal >= 25) return "▂▄"
    if (signal >= 1) return "▂"
    return "·"
  })
  const clockDisplay = createComputed(() => {
    const raw = clock()
    const time = raw.split("  ")[1] || raw
    if (calendarOpen()) return time

    const parts = time.split(":")
    if (parts.length >= 2) return `${parts[0]}:${parts[1]}`
    return time
  })
  const centerDisplay = createComputed(() => (calendarOpen() ? clock() : focusedWindowTitle()))

  let hideTimer: ReturnType<typeof timeout> | null = null

  function closeFlyouts() {
    setControlOpen(false)
    setCalendarOpen(false)
    setDesktopMenuOpen(false)
  }

  function toggleControl() {
    const next = !controlOpen()
    setControlOpen(next)
    setCalendarOpen(false)
  }

  function toggleCalendar() {
    const next = !calendarOpen()
    setCalendarOpen(next)
    setControlOpen(false)
    setDesktopMenuOpen(false)
  }

  function toggleDesktopMenu() {
    const next = !desktopMenuOpen()
    setDesktopMenuOpen(next)
    setControlOpen(false)
    setCalendarOpen(false)
  }

  function openAudioSettings() {
    execAsync(["bash", "-lc", "(command -v pavucontrol >/dev/null 2>&1 && pavucontrol) || true"]).catch(
      () => null,
    )
  }

  function openLauncher() {
    execAsync([
      "bash",
      "-lc",
      "(command -v albert >/dev/null 2>&1 && albert show) || (command -v krunner >/dev/null 2>&1 && krunner) || true",
    ]).catch(() => null)
    setDesktopMenuOpen(false)
  }

  function openSystemSettings() {
    execAsync([
      "bash",
      "-lc",
      "(command -v systemsettings >/dev/null 2>&1 && systemsettings) || (command -v systemsettings6 >/dev/null 2>&1 && systemsettings6) || (command -v gnome-control-center >/dev/null 2>&1 && gnome-control-center) || (command -v nwg-look >/dev/null 2>&1 && nwg-look) || true",
    ]).catch(() => null)
    setDesktopMenuOpen(false)
  }

  function openNetworkSettings() {
    execAsync([
      "bash",
      "-lc",
      "(command -v nm-connection-editor >/dev/null 2>&1 && nm-connection-editor) || (command -v kitty >/dev/null 2>&1 && kitty -e nmtui) || nmtui",
    ]).catch(() => null)
    setDesktopMenuOpen(false)
  }

  function sendFocusedShortcut(mod: string, key: string) {
    execAsync(["hyprctl", "dispatch", "sendshortcut", `${mod},${key},activewindow`]).catch(() => null)
    setDesktopMenuOpen(false)
  }

  function takeScreenshot() {
    execAsync([
      "bash",
      "-lc",
      "mkdir -p ~/Pictures/Screenshots; ts=$(date +%Y-%m-%d_%H-%M-%S); out=~/Pictures/Screenshots/shot_$ts.png; ok=0; if command -v grim >/dev/null 2>&1 && command -v slurp >/dev/null 2>&1; then grim -g \"$(slurp)\" \"$out\" >/dev/null 2>&1 && ok=1; [[ $ok -eq 1 ]] && command -v wl-copy >/dev/null 2>&1 && wl-copy < \"$out\"; elif command -v grimblast >/dev/null 2>&1; then grimblast --notify copysave area \"$out\" >/dev/null 2>&1 && ok=1; elif command -v hyprshot >/dev/null 2>&1; then hyprshot -m region -o ~/Pictures/Screenshots -f shot_$ts.png >/dev/null 2>&1 && ok=1; fi; [[ $ok -eq 1 ]] && command -v notify-send >/dev/null 2>&1 && notify-send \"Screenshot saved\" \"$out\"",
    ]).catch(() => null)
    setDesktopMenuOpen(false)
  }

  function closeCurrentDesktop() {
    execAsync([
      "bash",
      "-lc",
      "current=$(hyprctl activeworkspace -j | sed -n 's/.*\"id\":\s*\([0-9][0-9]*\).*/\1/p' | head -n1); target=$(hyprctl workspaces -j | sed -n 's/.*\"id\":\s*\([0-9][0-9]*\).*/\1/p' | sort -n | grep -vx \"$current\" | head -n1); hyprctl dispatch removeworkspace \"$current\" >/dev/null 2>&1 || { [[ -n \"$target\" ]] && hyprctl dispatch workspace \"$target\" >/dev/null 2>&1; }",
    ]).catch(() => null)
    setDesktopMenuOpen(false)
  }

  function createNewDesktop() {
    const ids = workspaceIds()
    const maxId = ids.length > 0 ? Math.max(...ids) : 1
    execAsync(["hyprctl", "dispatch", "workspace", String(maxId + 1)]).catch(() => null)
    setDesktopMenuOpen(false)
  }

  function moveWindowToNewDesktop() {
    const ids = workspaceIds()
    const maxId = ids.length > 0 ? Math.max(...ids) : 1
    const nextId = String(maxId + 1)
    execAsync(["bash", "-lc", `hyprctl dispatch movetoworkspace ${nextId}; hyprctl dispatch workspace ${nextId}`]).catch(
      () => null,
    )
    setDesktopMenuOpen(false)
  }

  function openOverview() {
    execAsync(["hyprctl", "dispatch", "hyprexpo:expo", "toggle"]).catch(() => null)
    setDesktopMenuOpen(false)
  }

  function runCalendarCrud(action: "add" | "edit" | "delete" | "refresh") {
    const shouldReopen = action !== "refresh" && calendarOpen()

    if (shouldReopen) {
      setCalendarOpen(false)
      cancelHide()
      setBarVisible(true)
    }

    execAsync(["bash", "-lc", `~/.config/quickshell/google-calendar-crud.sh ${action}`])
      .catch(() => null)
      .finally(() => {
        if (shouldReopen) {
          setCalendarOpen(true)
          cancelHide()
          setBarVisible(true)
        }
      })
  }

  function scheduleHide() {
    if (hideTimer) return
    hideTimer = timeout(380, () => {
      hideTimer = null
      if (!popupOpen() && cursorY() > 40) setBarVisible(false)
    })
  }

  function cancelHide() {
    if (hideTimer) {
      hideTimer.cancel()
      hideTimer = null
    }
  }

  let lastWorkspaceIds: number[] = []
  createEffect(() => {
    const ids = workspaceIds()
    const born = ids.filter((id) => !lastWorkspaceIds.includes(id))
    const dying = lastWorkspaceIds.filter((id) => !ids.includes(id))

    if (born.length === 0 && dying.length === 0) {
      lastWorkspaceIds = [...ids]
      return
    }

    if (born.length > 0) {
      setWorkspaceFx((prev) => {
        const next = { ...prev }
        for (const id of born) next[id] = "born"
        return next
      })

      timeout(460, () => {
        setWorkspaceFx((prev) => {
          const next = { ...prev }
          for (const id of born) {
            if (next[id] === "born") delete next[id]
          }
          return next
        })
      })
    }

    if (dying.length > 0) {
      setWorkspaceFx((prev) => {
        const next = { ...prev }
        for (const id of dying) next[id] = "dying"
        return next
      })

      timeout(520, () => {
        setWorkspaceFx((prev) => {
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

  createEffect(() => {
    const revealEdge = cursorY() <= 8
    const onBarBand = cursorY() <= 40
    const revealBand = cursorY() <= 20
    const hasPopup = popupOpen()
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
    setManualVolume(liveVolume())
  })

  return (
    <>
      <window
        visible={dimVisible}
        name={`ags-dimmer-${monitorIndex}`}
        class="DimmerWindow"
        gdkmonitor={gdkmonitor}
        anchor={TOP | LEFT | RIGHT | BOTTOM}
        layer={Astal.Layer.OVERLAY}
        keymode={Astal.Keymode.NONE}
        exclusivity={Astal.Exclusivity.IGNORE}
        canTarget={false}
        application={app}
      >
        <box class="Dimmer" canTarget={false} css={dimCss} hexpand vexpand />
      </window>

      <window
        visible={popupOpen}
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
          onClicked={closeFlyouts}
        />
      </window>

      <window
        visible={effectiveBarVisible}
        name={`ags-topbar-${monitorIndex}`}
        namespace="ags-topbar"
        class="Bar"
        gdkmonitor={gdkmonitor}
        exclusivity={Astal.Exclusivity.EXCLUSIVE}
        anchor={TOP | LEFT | RIGHT}
        layer={Astal.Layer.TOP}
        keymode={Astal.Keymode.NONE}
        application={app}
      >
          <centerbox cssName="bar-shell" class="bar-shell" hexpand halign={Gtk.Align.FILL}>
            <box $type="start" spacing={8}>
              <button
                widthRequest={26}
                heightRequest={22}
                class={desktopMenuOpen((open) => `desktop-menu-toggle bar-cap-button${open ? " active" : ""}`)}
                onClicked={toggleDesktopMenu}
              >
                <label class="desktop-menu-icon" label="▾" />
              </button>
              {workspaceSlots.map((ws) => (
                <button
                  visible={createComputed(() => {
                    const ids = workspaceIds()
                    const fx = workspaceFx()
                    return ids.includes(ws) || fx[ws] === "dying"
                  })}
                  widthRequest={22}
                  heightRequest={22}
                  class="ws-dot"
                  $={(self) => {
                    const middleClick = new Gtk.GestureClick({ button: 2 })
                    middleClick.connect("pressed", () => {
                      createNewDesktop()
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
                      const current = activeWorkspace()
                      const fx = workspaceFx()
                      const isActive = current === ws
                      const phase = fx[ws] ? ` ${fx[ws]}` : ""
                      return `ws-core ${workspaceColorClass(ws)}${isActive ? " active" : ""}${phase}`
                    })}
                  />
                </button>
              ))}
            </box>

            <button
              $type="center"
              class={calendarOpen((open) => (open ? "clock active" : "clock"))}
              onClicked={toggleCalendar}
            >
              <label class="clock-label center-label" label={centerDisplay} />
            </button>

            <box $type="end" spacing={8}>
              <button
                widthRequest={26}
                heightRequest={22}
                class={controlOpen((open) => (open ? "gear bar-cap-button active" : "gear bar-cap-button"))}
                onClicked={toggleControl}
              >
                <label class="gear-icon" label="⚙" />
              </button>
            </box>
          </centerbox>
      </window>

      <window
        visible={desktopMenuOpen}
        name={`ags-desktop-menu-${monitorIndex}`}
        class="FlyoutWindow"
        gdkmonitor={gdkmonitor}
        anchor={TOP | LEFT}
        layer={Astal.Layer.OVERLAY}
        keymode={Astal.Keymode.ON_DEMAND}
        exclusivity={Astal.Exclusivity.IGNORE}
        marginTop={44}
        marginStart={10}
        application={app}
      >
        <box class="flyout desktop-menu-flyout" orientation={Gtk.Orientation.VERTICAL} spacing={8}>
          <label class="flyout-title" label="Quick Actions" xalign={0.5} />
          <button class="action" onClicked={() => sendFocusedShortcut("CTRL", "S")}>
            <label label="Save" />
          </button>
          <button class="action" onClicked={() => sendFocusedShortcut("CTRL", "Z")}>
            <label label="Undo" />
          </button>
          <button class="action" onClicked={() => sendFocusedShortcut("CTRL_SHIFT", "Z")}>
            <label label="Redo" />
          </button>
          <button class="action" onClicked={() => sendFocusedShortcut("CTRL", "X")}>
            <label label="Cut" />
          </button>
          <button class="action" onClicked={() => sendFocusedShortcut("CTRL", "C")}>
            <label label="Copy" />
          </button>
          <button class="action" onClicked={() => sendFocusedShortcut("CTRL", "V")}>
            <label label="Paste" />
          </button>
          <button class="action" onClicked={() => sendFocusedShortcut("CTRL", "A")}>
            <label label="Select All" />
          </button>
          <Gtk.Separator orientation={Gtk.Orientation.HORIZONTAL} />
          <button class="action" onClicked={createNewDesktop}>
            <label label="New Desktop" />
          </button>
          <button class="action" onClicked={closeCurrentDesktop}>
            <label label="Close Current Desktop" />
          </button>
          <button class="action" onClicked={openOverview}>
            <label label="Desktop Overview" />
          </button>
          <button class="action" onClicked={moveWindowToNewDesktop}>
            <label label="Move Window To New Desktop" />
          </button>
          <button class="action" onClicked={openLauncher}>
            <label label="App Launcher" />
          </button>
          <button class="action" onClicked={takeScreenshot}>
            <label label="Screenshot" />
          </button>
        </box>
      </window>

      <window
        visible={controlOpen}
        name={`ags-control-${monitorIndex}`}
        class="FlyoutWindow"
        gdkmonitor={gdkmonitor}
        anchor={TOP | RIGHT}
        layer={Astal.Layer.OVERLAY}
        keymode={Astal.Keymode.ON_DEMAND}
        exclusivity={Astal.Exclusivity.IGNORE}
        marginTop={48}
        marginEnd={18}
        application={app}
      >
        <box class="flyout control-flyout" orientation={Gtk.Orientation.VERTICAL} spacing={10}>
          <centerbox>
            <box $type="start" widthRequest={34} />
            <label $type="center" class="flyout-title" label="Control Center" xalign={0.5} />
            <button
              $type="end"
              class="mini-gear"
              onClicked={openSystemSettings}
            >
              <label class="gear-icon" label="⚙" />
            </button>
          </centerbox>

          <box class="slider-row" orientation={Gtk.Orientation.VERTICAL} spacing={4}>
            <centerbox>
              <label
                $type="start"
                label={volumeValue((v) => `Volume ${Math.round(v * 100)}%`)}
                xalign={0}
              />
              <box $type="center" />
              <button $type="end" class="round-icon" onClicked={openAudioSettings}>
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
                value: Math.round(volumeValue() * 100),
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

          <box orientation={Gtk.Orientation.HORIZONTAL} spacing={10} halign={Gtk.Align.CENTER}>
            <button
              class={wifiEnabled((on) => `round-icon${on ? " active" : " off"}`)}
              onClicked={() => {
                const next = !wifiEnabled()
                execAsync(["nmcli", "radio", "wifi", next ? "on" : "off"]).catch(() => null)
              }}
            >
              <label class="signal-icon" label={wifiGlyph} />
            </button>
            <button
              class="round-icon"
              onClicked={openNetworkSettings}
            >
              <image class="symbol-icon" iconName="network-workgroup-symbolic" pixelSize={20} />
            </button>
          </box>
        </box>
      </window>

      <window
        visible={calendarOpen}
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
        <box hexpand halign={Gtk.Align.CENTER}>
          <box class="flyout calendar-flyout" orientation={Gtk.Orientation.VERTICAL} spacing={10}>
            <label class="flyout-title" label="Calendar" xalign={0.5} />
            <Gtk.Calendar class="calendar-widget" />
            <Gtk.Separator orientation={Gtk.Orientation.HORIZONTAL} />
            <label class="events-title" label="Google Calendar" xalign={0.5} />
            <box class="calendar-actions" orientation={Gtk.Orientation.HORIZONTAL} spacing={8} halign={Gtk.Align.CENTER}>
              <button class="action" onClicked={() => runCalendarCrud("add")}>
                <label label="Add" />
              </button>
              <button class="action" onClicked={() => runCalendarCrud("edit")}>
                <label label="Edit" />
              </button>
              <button class="action" onClicked={() => runCalendarCrud("delete")}>
                <label label="Delete" />
              </button>
              <button class="action" onClicked={() => runCalendarCrud("refresh")}>
                <label label="Refresh" />
              </button>
            </box>
            <label class="events" label={gcalEvents} xalign={0.5} wrap justify={Gtk.Justification.CENTER} />
          </box>
        </box>
      </window>
    </>
  )
}
