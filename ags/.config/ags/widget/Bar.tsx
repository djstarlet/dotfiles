// Helper: parseWifiSignal
function parseWifiSignal(raw: string) {
  const n = Number(String(raw).trim())
  return Number.isFinite(n) ? n : -1
}

// Helper: parseVolume
function parseVolume(raw: string) {
  const m = String(raw).match(/([0-9.]+)/)
  if (!m) return 0.5
  const n = Number(m[1])
  return Number.isFinite(n) ? n : 0.5
}
// Helper: parseActiveWorkspace
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

// Helper: parseWifiEnabled
function parseWifiEnabled(raw: string) {
  return /enabled|yes|on|true/i.test(raw)
}

// Helper: clamp01
function clamp01(x: number) {
  return Math.max(0, Math.min(1, x))
}

// Helper: send a keyboard shortcut to the focused window via wtype
// (Wayland virtual-keyboard protocol — dotool/ydotool are unusable here:
// this kernel has no CONFIG_INPUT_UINPUT, so there is no /dev/uinput).
// The caller closes the flyout first; wtype's -s 250 waits for keyboard
// focus to return to the app underneath before injecting the keys.
function sendFocusedShortcut(mod: string, key: string) {
  const args: string[] = ["wtype", "-s", "250"]
  if (String(mod).includes("CTRL")) args.push("-M", "ctrl")
  if (String(mod).includes("SHIFT")) args.push("-M", "shift")
  if (String(mod).includes("ALT")) args.push("-M", "alt")
  const k = String(key)
  args.push("-k", k.length === 1 ? k.toLowerCase() : k)
  execAsync(args).catch(() => null)
}

// Mac-style per-app Quick Actions rows: picked by the focused window's class
// when the menu opens; unknown apps fall back to the generic edit shortcuts.
type ShortcutDef = { label: string; hint: string; mod: string; key: string }
const SHORTCUT_FALLBACK: ShortcutDef[] = [
  { label: "Save", hint: "Ctrl+S", mod: "CTRL", key: "s" },
  { label: "Undo", hint: "Ctrl+Z", mod: "CTRL", key: "z" },
  { label: "Redo", hint: "Ctrl+Shift+Z", mod: "CTRL_SHIFT", key: "z" },
  { label: "Cut", hint: "Ctrl+X", mod: "CTRL", key: "x" },
  { label: "Copy", hint: "Ctrl+C", mod: "CTRL", key: "c" },
  { label: "Paste", hint: "Ctrl+V", mod: "CTRL", key: "v" },
  { label: "Select All", hint: "Ctrl+A", mod: "CTRL", key: "a" },
]
const SHORTCUT_PRESETS: Record<string, ShortcutDef[]> = {
  kitty: [
    { label: "Copy", hint: "Ctrl+Shift+C", mod: "CTRL_SHIFT", key: "c" },
    { label: "Paste", hint: "Ctrl+Shift+V", mod: "CTRL_SHIFT", key: "v" },
    { label: "New Tab", hint: "Ctrl+Shift+T", mod: "CTRL_SHIFT", key: "t" },
    { label: "Close Tab", hint: "Ctrl+Shift+W", mod: "CTRL_SHIFT", key: "w" },
    { label: "New Window", hint: "Ctrl+Shift+Enter", mod: "CTRL_SHIFT", key: "Return" },
  ],
  librewolf: [
    { label: "New Tab", hint: "Ctrl+T", mod: "CTRL", key: "t" },
    { label: "Close Tab", hint: "Ctrl+W", mod: "CTRL", key: "w" },
    { label: "Reopen Closed Tab", hint: "Ctrl+Shift+T", mod: "CTRL_SHIFT", key: "t" },
    { label: "Find", hint: "Ctrl+F", mod: "CTRL", key: "f" },
    { label: "Reload", hint: "Ctrl+R", mod: "CTRL", key: "r" },
    { label: "Copy", hint: "Ctrl+C", mod: "CTRL", key: "c" },
    { label: "Paste", hint: "Ctrl+V", mod: "CTRL", key: "v" },
  ],
  pcmanfm: [
    { label: "Copy", hint: "Ctrl+C", mod: "CTRL", key: "c" },
    { label: "Paste", hint: "Ctrl+V", mod: "CTRL", key: "v" },
    { label: "Select All", hint: "Ctrl+A", mod: "CTRL", key: "a" },
    { label: "Rename", hint: "F2", mod: "", key: "F2" },
    { label: "Move to Trash", hint: "Del", mod: "", key: "Delete" },
    { label: "Properties", hint: "Alt+Return", mod: "ALT", key: "Return" },
  ],
}

function parseFocusedWindowClass(raw: string): string {
  try {
    const parsed = JSON.parse(raw)
    return String(parsed?.class || parsed?.initialClass || "").toLowerCase().trim()
  } catch {
    return ""
  }
}

import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { execAsync } from "ags/process"
import { createPoll, timeout } from "ags/time"
import { createComputed, createEffect, createState, For } from "gnim"

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
    const ids: number[] = (parsed as any[])
      .map((item) => Number(item?.id))
      .filter((val): val is number => Number.isFinite(val) && val > 0)
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
  const focusedWindowClass = createPoll("", 900, ["hyprctl", "activewindow", "-j"], (out, prev) => {
    const cls = parseFocusedWindowClass(out)
    return cls !== "" ? cls : prev
  })
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
  const cursorY = createPoll(9999, 120, ["hyprctl", "cursorpos"], (out) => parseCursorY(out))
  const workspaceListRaw = createPoll([1], 1300, ["hyprctl", "workspaces", "-j"], (out) =>
    parseWorkspaceIds(out),
  )
  const gcalEvents = createPoll(
    "No events available.",
    6000,
    ["bash", "-c", "~/.config/quickshell/calendar-events.sh 2>/dev/null || echo 'No events available.'"],
    (out) => {
      const cleaned = sanitizeEventText(out)
      return cleaned.length > 0 ? cleaned : "No upcoming Google Calendar events."
    },
  )

  const [barVisible, setBarVisible] = createState(true)
  const [barWindowVisible, setBarWindowVisible] = createState(true)
  const [barRevealed, setBarRevealed] = createState(true)
  const [barReserved, setBarReserved] = createState(true)
  // Force visibility for debugging
  const forceVisible = true
  const [controlOpen, setControlOpen] = createState(false)
  const [powerMenuOpen, setPowerMenuOpen] = createState(false)
  const [pendingPowerAction, setPendingPowerAction] = createState<null | "lock" | "logout" | "reboot" | "shutdown">(null)
  const [calendarOpen, setCalendarOpen] = createState(false)
  const [desktopMenuOpen, setDesktopMenuOpen] = createState(false)

  const [brightnessPercent, setBrightnessPercent] = createState(100)
  const [manualVolume, setManualVolume] = createState(0.5)
  const popupOpen = createComputed(() => controlOpen() || calendarOpen() || desktopMenuOpen() || powerMenuOpen())
  const effectiveBarVisible = createComputed(() => barVisible() || popupOpen())
  const effectiveBrightness = createComputed(() => Math.max(5, Math.min(100, Math.round(brightnessPercent()))))
  const dimOpacity = createComputed(() => (100 - effectiveBrightness()) / 100)
  const dimVisible = createComputed(() => dimOpacity() > 0.001)
  const volumeValue = createComputed(() => manualVolume())
  const workspaceIds = createComputed(() => {
    const ids = workspaceListRaw()
    const active = activeWorkspace()
    if (ids.includes(active)) return ids
    return [...ids, active].sort((a, b) => a - b)
  })
  const [workspaceFx, setWorkspaceFx] = createState<Record<number, "born" | "dying" | "settled">>({})
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
  let barRevealTimer: ReturnType<typeof timeout> | null = null
  let barReserveTimer: ReturnType<typeof timeout> | null = null
  let barUnmountTimer: ReturnType<typeof timeout> | null = null
  const barSlideDuration = 300
  const barRevealDelay = 20
  const barReserveReleaseDelay = 48
  const controlFlyoutMarginTop = 48
  const controlFlyoutMarginEnd = 18
  // Place the power drawer flush with other flyouts at the top
  const powerFlyoutMarginTop = 48;
  const powerDrawerDuration = 260
  const flyoutToggleSize = 24

  function closeFlyouts() {
    setControlOpen(false)
    setPowerMenuOpen(false)
    setPendingPowerAction(null)
    setCalendarOpen(false)
    setDesktopMenuOpen(false)
  }

  function togglePowerMenu() {
    const next = !powerMenuOpen()
    setPowerMenuOpen(next)
    if (!next) setPendingPowerAction(null)
    if (next) {
      setControlOpen(false)
      setCalendarOpen(false)
      setDesktopMenuOpen(false)
    }
  }

  function toggleControl() {
    const next = !controlOpen()
    setControlOpen(next)
    // Reset power submenu only when closing control flyout
    if (!next) {
      setPowerMenuOpen(false)
      setPendingPowerAction(null)
    }
    if (next) {
      setCalendarOpen(false)
      setDesktopMenuOpen(false)
    }
  }

  function toggleCalendar() {
    const next = !calendarOpen()
    setCalendarOpen(next)
    setControlOpen(false)
    setPowerMenuOpen(false)
    setDesktopMenuOpen(false)
  }

  function toggleDesktopMenu() {
    const next = !desktopMenuOpen()
    setDesktopMenuOpen(next)
    setControlOpen(false)
    setPowerMenuOpen(false)
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

  function runPowerAction(action: "lock" | "logout" | "reboot" | "shutdown") {
    setPendingPowerAction(action)
  }

  function confirmPowerAction() {
    const action = pendingPowerAction()
    if (!action) return

    closeFlyouts()

    const command = {
      lock: "(command -v hyprlock >/dev/null 2>&1 && hyprlock) || loginctl lock-session",
      logout: "hyprctl dispatch exit",
      reboot: "loginctl reboot",
      shutdown: "loginctl poweroff",
    }[action]

    execAsync(["bash", "-lc", command]).catch(() => null)
  }

  function cancelPowerAction() {
    setPendingPowerAction(null)
  }

  function powerGlyph(action: "lock" | "logout" | "reboot" | "shutdown") {
    return {
      lock: "\u{F023}",
      logout: "\u{F08B}",
      reboot: "\u{F01E}",
      shutdown: "\u{F011}",
    }[action]
  }

  function takeScreenshot() {
    execAsync(["bash", "-lc", "~/.config/hypr/scripts/take-screenshot.sh"]).catch(() => null)
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

      timeout(560, () => {
        setWorkspaceFx((prev) => {
          const next = { ...prev }
          for (const id of born) {
            if (next[id] === "born") next[id] = "settled"
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

      timeout(640, () => {
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

  createEffect(() => {
    if (pendingPowerAction() !== null && !powerMenuOpen()) {
      setPowerMenuOpen(true)
    }
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
        <box class="Dimmer" canTarget={false} hexpand vexpand
          $={(self) => {
            createEffect(() => {
              self.opacity = dimOpacity()
            })
          }}
        />
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
              <button
                widthRequest={flyoutToggleSize}
                heightRequest={flyoutToggleSize}
                valign={Gtk.Align.CENTER}
                class={desktopMenuOpen((open) => `desktop-menu-toggle bar-cap-button${open ? " active" : ""}`)}
                onClicked={toggleDesktopMenu}
              >
                <label class="desktop-menu-icon" label={"\u{F0C9}"} />
              </button>
              {workspaceSlots.map((ws) => (
                <button
                  visible={createComputed(() => {
                    const fx = workspaceFx()
                    return fx[ws] === "born" || fx[ws] === "settled" || fx[ws] === "dying"
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
                      const phase = fx[ws] === "born" || fx[ws] === "dying" ? ` ${fx[ws]}` : ""
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
                heightRequest={26}
                valign={Gtk.Align.CENTER}
                halign={Gtk.Align.CENTER}
                class={controlOpen((open) => (open ? "bar-cap-button active" : "bar-cap-button"))}
                onClicked={toggleControl}
              >
                <box class="gear-icon-box" widthRequest={14} heightRequest={14} halign={Gtk.Align.CENTER} valign={Gtk.Align.CENTER} />
              </button>
              <button
                widthRequest={26}
                heightRequest={26}
                valign={Gtk.Align.CENTER}
                halign={Gtk.Align.CENTER}
                class={powerMenuOpen((open) => (open ? "bar-cap-button active" : "bar-cap-button"))}
                onClicked={togglePowerMenu}
              >
                <box class="power-icon-box" widthRequest={14} heightRequest={14} halign={Gtk.Align.CENTER} valign={Gtk.Align.CENTER} />
              </button>
            </box>
          </centerbox>
        </box>
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
        marginStart={0}
        application={app}
      >
        <box
          class="flyout desktop-menu-flyout"
          orientation={Gtk.Orientation.VERTICAL}
          spacing={8}
          marginStart={10}
          marginEnd={40}
          marginBottom={40}
        >
          <label class="flyout-title" label="Quick Actions" xalign={0.0} />
          <For each={createComputed(() => SHORTCUT_PRESETS[focusedWindowClass()] ?? SHORTCUT_FALLBACK)}>
            {(s) => (
              <button class="action" onClicked={() => { setDesktopMenuOpen(false); sendFocusedShortcut(s.mod, s.key) }}>
                <box orientation={Gtk.Orientation.HORIZONTAL} hexpand spacing={8} class="menu-row">
                  <label label={s.label} xalign={0.0} hexpand />
                  <label label={s.hint} xalign={1.0} class="shortcut-label" />
                </box>
              </button>
            )}
          </For>
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
            <button
              $type="end"
              class="mini-gear"
              onClicked={openSystemSettings}
            >
              <label class="gear-icon" label={"\u{F013}"} />
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
                  onClicked={openNetworkSettings}
                >
                  <image class="symbol-icon" iconName="network-workgroup-symbolic" pixelSize={20} />
                </button>
                <label class="control-action-label" label="Network" />
              </box>
              <box class="control-action-tile" widthRequest={68} orientation={Gtk.Orientation.VERTICAL} spacing={3} halign={Gtk.Align.CENTER}>
                <button
                  widthRequest={44} heightRequest={44}
                  hexpand={false} vexpand={false}
                  halign={Gtk.Align.CENTER} valign={Gtk.Align.CENTER}
                  class={powerMenuOpen((open) => `round-icon power-toggle${open ? " active" : ""}`)}
                  onClicked={() => {
                    const next = !powerMenuOpen()
                    setPowerMenuOpen(next)
                    if (!next) setPendingPowerAction(null)
                  }}
                >
                  <label class="power-icon" label="⏻" />
                </button>
                <label class="control-action-label" label="Power" />
              </box>
            </box>
          </box>

        </box>
        </box>
      </window>

      <window
        visible={powerMenuOpen}
        name={`ags-power-menu-${monitorIndex}`}
        class="FlyoutWindow"
        gdkmonitor={gdkmonitor}
        anchor={TOP | RIGHT}
        layer={Astal.Layer.OVERLAY}
        keymode={Astal.Keymode.ON_DEMAND}
        exclusivity={Astal.Exclusivity.IGNORE}
        marginTop={powerFlyoutMarginTop}
        application={app}
      >
        <box hexpand halign={Gtk.Align.END} marginEnd={controlFlyoutMarginEnd}>
          <box
            class="flyout power-menu-flyout standalone"
            orientation={Gtk.Orientation.VERTICAL}
            spacing={6}
            vexpand
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
              visible={createComputed(() => pendingPowerAction() === null)}
            >
              <box class="control-action-tile" widthRequest={68} orientation={Gtk.Orientation.VERTICAL} spacing={3} halign={Gtk.Align.CENTER}>
                <button widthRequest={44} heightRequest={44} hexpand={false} vexpand={false} halign={Gtk.Align.CENTER} valign={Gtk.Align.CENTER} class="round-icon power-action-button" onClicked={() => runPowerAction("lock")}>
                  <label class="power-action-glyph" label={powerGlyph("lock")} />
                </button>
                <label class="control-action-label" label="Lock" />
              </box>
              <box class="control-action-tile" widthRequest={68} orientation={Gtk.Orientation.VERTICAL} spacing={3} halign={Gtk.Align.CENTER}>
                <button widthRequest={44} heightRequest={44} hexpand={false} vexpand={false} halign={Gtk.Align.CENTER} valign={Gtk.Align.CENTER} class="round-icon power-action-button" onClicked={() => runPowerAction("logout")}>
                  <label class="power-action-glyph" label={powerGlyph("logout")} />
                </button>
                <label class="control-action-label" label="Logout" />
              </box>
              <box class="control-action-tile" widthRequest={68} orientation={Gtk.Orientation.VERTICAL} spacing={3} halign={Gtk.Align.CENTER}>
                <button widthRequest={44} heightRequest={44} hexpand={false} vexpand={false} halign={Gtk.Align.CENTER} valign={Gtk.Align.CENTER} class="round-icon power-action-button warm" onClicked={() => runPowerAction("reboot")}>
                  <label class="power-action-glyph" label={powerGlyph("reboot")} />
                </button>
                <label class="control-action-label" label="Reboot" />
              </box>
              <box class="control-action-tile" widthRequest={68} orientation={Gtk.Orientation.VERTICAL} spacing={3} halign={Gtk.Align.CENTER}>
                <button widthRequest={44} heightRequest={44} hexpand={false} vexpand={false} halign={Gtk.Align.CENTER} valign={Gtk.Align.CENTER} class="round-icon power-action-button danger" onClicked={() => runPowerAction("shutdown")}>
                  <label class="power-action-glyph" label={powerGlyph("shutdown")} />
                </button>
                <label class="control-action-label" label="Shutdown" />
              </box>
            </box>

            <box
              class="power-confirm-row"
              orientation={Gtk.Orientation.VERTICAL}
              spacing={8}
              halign={Gtk.Align.CENTER}
              visible={createComputed(() => pendingPowerAction() !== null)}
            >
              <label
                class="power-confirm-label"
                label={createComputed(() => {
                  const action = pendingPowerAction()
                  if (!action) return ""
                  return `Confirm ${action}?`
                })}
              />
              <box orientation={Gtk.Orientation.HORIZONTAL} spacing={10} halign={Gtk.Align.CENTER}>
                <button class="action" onClicked={cancelPowerAction}>
                  <label label="Cancel" />
                </button>
                <button class={createComputed(() => {
                  const action = pendingPowerAction()
                  if (action === "shutdown") return "action danger"
                  if (action === "reboot") return "action warm"
                  return "action"
                })} onClicked={confirmPowerAction}>
                  <label label="Confirm" />
                </button>
              </box>
            </box>
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
        <box hexpand>
          <button class="DismissSurface" hexpand vexpand canTarget onClicked={closeFlyouts} />
          <box class="flyout calendar-flyout" orientation={Gtk.Orientation.VERTICAL} spacing={10} marginBottom={40}>
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
          <button class="DismissSurface" hexpand vexpand canTarget onClicked={closeFlyouts} />
        </box>
      </window>
    </>
  )
}
