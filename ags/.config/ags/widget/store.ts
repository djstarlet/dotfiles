import { execAsync } from "ags/process"
import { createPoll, timeout } from "ags/time"
import { createComputed, createEffect, createState } from "gnim"
import GLib from "gi://GLib"
import Notifd from "gi://AstalNotifd"
import { theme } from "./theme.config"
import type { ThemeConfig } from "./theme.config"
import { isHexColor } from "./color-utils"

// ─── Parser helpers ───────────────────────────────────────────────────────────

function parseActiveWorkspace(raw: string) {
  try {
    const parsed = JSON.parse(raw)
    // Hyprland 0.56 replaced `id` with `address` (numeric id as a string);
    // keep the `id` fallback for older versions. Do not "simplify" it away.
    const id = Number(parsed?.address ?? parsed?.id)
    if (Number.isFinite(id) && id > 0) return id
  } catch {
  }
  return 1
}

// Helper: send a keyboard shortcut to the focused window via wtype
// (Wayland virtual-keyboard protocol - dotool/ydotool are unusable here:
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

function parseFocusedWindowClass(raw: string): string {
  try {
    const parsed = JSON.parse(raw)
    return String(parsed?.class || parsed?.initialClass || "").toLowerCase().trim()
  } catch {
    return ""
  }
}

function parseFocusedWindowTitle(raw: string) {
  try {
    const parsed = JSON.parse(raw)
    const title = String(parsed?.title || parsed?.initialTitle || "").trim()
    // Terminals set placeholder titles ("~", home path, "-") when nothing is
    // running in them. Fall back to the class so an empty kitty reads "kitty".
    // Only bare placeholders count — a title with extra text keeps showing.
    const home = String(GLib.get_home_dir() || "").replace(/\/+$/, "")
    const isPlaceholder =
      title === "" ||
      title === "~" ||
      title === "~/" ||
      title === "-" ||
      (home !== "" && title.replace(/\/+$/, "") === home)
    const display = isPlaceholder
      ? String(parsed?.class || parsed?.initialClass || "").trim()
      : title
    if (!display) return "Desktop"
    const compact = display.replace(/\s+/g, " ")
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

function parseCursorPos(raw: string) {
  const m = raw.match(/(-?\d+)\s*,\s*(-?\d+)/)
  if (!m) return { x: -999999, y: -999999 }
  const x = Number(m[1])
  const y = Number(m[2])
  return {
    x: Number.isFinite(x) ? x : -999999,
    y: Number.isFinite(y) ? y : -999999,
  }
}

function parseWorkspaceIds(raw: string) {
  try {
    const parsed = JSON.parse(raw)
    const ids: number[] = (parsed as any[])
      // Hyprland 0.56 replaced `id` with `address` (see parseActiveWorkspace).
      // Special (scratchpad) workspaces get no dot: their negative ids used to
      // be dropped by the `> 0` filter, so exclude them explicitly now.
      .filter((item) => item?.type !== "special")
      .map((item) => Number(item?.address ?? item?.id))
      .filter((val): val is number => Number.isFinite(val) && val > 0)
    if (ids.length === 0) return [1]
    return [...new Set(ids)].sort((a, b) => a - b)
  } catch {
    return [1]
  }
}

export const DEFAULT_WS_DOT_COLORS = theme.workspaceDotColors
export type SavedPreset = ThemeConfig["presets"][number]

export type Notification = {
  id: string // notifd notification id (numeric string)
  title: string
  detail: string
  openUrl?: string
  openPath?: string
  action?: string // "update-dotfiles" renders the Update button
  image?: string // image-path hint (e.g. screenshot thumbnail)
}

function parseWsDotColors(raw: string | undefined) {
  if (!raw) return null
  const colors = raw.split(",").map((color) => color.trim())
  return colors.length === 8 && colors.every(isHexColor) ? colors : null
}

function parseSavedPresets(raw: unknown): SavedPreset[] | null {
  if (!Array.isArray(raw)) return null
  const valid = raw.every((preset) =>
    preset &&
    typeof preset.name === "string" &&
    preset.name.trim().length > 0 &&
    [preset.background, preset.accent, preset.text].every(isHexColor) &&
    Array.isArray(preset.dots) &&
    preset.dots.length === 8 &&
    preset.dots.every(isHexColor)
  )
  return valid ? raw as SavedPreset[] : null
}

// ─── Store factory ────────────────────────────────────────────────────────────

export type Store = ReturnType<typeof createStore>

export function createStore() {
  const envWsDotColors = typeof process !== "undefined" ? parseWsDotColors(process.env.AGS_WS_DOT_COLORS) : null

  // ── Polls ──────────────────────────────────────────────────────────────────
  const clock = createPoll("", 1000, ["bash", "-lc", "date '+%a %d %b  %H:%M:%S'"])
  const activeWorkspacePoll = createPoll(1, 1200, ["hyprctl", "activeworkspace", "-j"], (out) =>
    parseActiveWorkspace(out),
  )
  const [activeWorkspaceOverride, setActiveWorkspaceOverride] = createState<number | null>(null)
  const activeWorkspace = createComputed(() => activeWorkspaceOverride() ?? activeWorkspacePoll())
    createEffect(() => {
      const override = activeWorkspaceOverride()
      if (override !== null) {
        if (activeWorkspacePoll() === override) {
          setActiveWorkspaceOverride(null)
        } else {
          timeout(3000, () => {
            if (activeWorkspaceOverride() === override && activeWorkspacePoll() !== override) {
              setActiveWorkspaceOverride(null)
            }
          })
        }
      }
    })
  // One hyprctl activewindow call feeds both title and class (was two polls
  // running the same command at the same 900ms interval).
  const activeWindowRaw = createPoll("", 900, ["hyprctl", "activewindow", "-j"])
  const focusedWindowTitle = createComputed(() => parseFocusedWindowTitle(activeWindowRaw()))
  // Retain the last non-empty class: the desktop menu's per-app quick actions
  // must survive a momentary empty focus (e.g. focus moving to the desktop).
  const [focusedWindowClass, setFocusedWindowClass] = createState("")
  createEffect(() => {
    const cls = parseFocusedWindowClass(activeWindowRaw())
    if (cls !== "") setFocusedWindowClass(cls)
  })
  // Global layout coordinates of the cursor (hyprctl cursorpos -> "x, y").
  // Bar.tsx compares these against each monitor's geometry, since monitors
  // are rarely positioned at global (0,0).
  const cursorPos = createPoll({ x: -999999, y: -999999 }, 120, ["hyprctl", "cursorpos"], (out) => parseCursorPos(out))
  const workspaceListRaw = createPoll([1], 300, ["hyprctl", "workspaces", "-j"], (out) =>
    parseWorkspaceIds(out),
  )
  const gcalEvents = createPoll(
    "No upcoming Google Calendar events.",
    6000,
    ["bash", "-lc", "$HOME/.config/ags/calendar-events.sh 2>/dev/null || echo 'No upcoming Google Calendar events.'"],
    (out) => {
      const cleaned = sanitizeEventText(out)
      return cleaned.length > 0 ? cleaned : "No upcoming Google Calendar events."
    },
  )

  // Notifications come straight from notifd (AstalNotifd), which IS the
  // notification daemon: every producer notify-sends, notifd holds them
  // (timeouts intact so transient toasts expire naturally), and the
  // bell/toasts refetch on the notified/resolved signals. No polling.
  // NB: get_default() is all it takes to claim the org.freedesktop.Notifications
  // bus name - don't set ignore_timeout, daemon-side expiry is wanted.
  const notifd = Notifd.get_default()
  const [notifications, setNotifications] = createState<Notification[]>([])

  function refreshNotifications() {
    // gjs auto-converts the GLib.List property to a plain JS array.
    const items: Notification[] = []
    for (const n of notifd.notifications) {
      if (!n) continue
      const summary = String(n.summary ?? "")
      if (!summary) continue
      const body = String(n.body ?? "")
      const item: Notification = { id: String(n.id), title: summary, detail: body }
      const img = String(n.image ?? "")
      if (img && img.startsWith("/")) item.image = img
      if (summary === "Screenshot saved" && body) {
        // body carries the file path; open its folder in pcmanfm
        item.openPath = body.replace(/[^/]*$/, "")
      } else if (summary === "Hyprland config errors") {
        item.openPath = "~/.config/hypr"
      } else if (summary.startsWith("Failed user unit") || summary === "Home disk almost full") {
        item.openPath = "~"
      } else if (summary === "Dotfiles update available") {
        item.openUrl = "https://github.com/djstarlet/dotfiles/releases"
        item.action = "update-dotfiles"
      }
      items.push(item)
    }
    setNotifications(items)
  }

  notifd.connect("notified", refreshNotifications)
  notifd.connect("resolved", refreshNotifications)
  refreshNotifications()

  // ── Shared state ───────────────────────────────────────────────────────────
  const [controlOpen, setControlOpen] = createState(false)
  const [notifOpen, setNotifOpen] = createState(false)
  const [powerMenuOpen, setPowerMenuOpen] = createState(false)
  const [pendingPowerAction, setPendingPowerAction] = createState<null | "lock" | "logout" | "reboot" | "shutdown">(null)
  const [calendarOpen, setCalendarOpen] = createState(false)
  const [desktopMenuOpen, setDesktopMenuOpen] = createState(false)
  const [settingsOpen, setSettingsOpen] = createState(false)
  const [systemInfoOpen, setSystemInfoOpen] = createState(false)
  const [settingsStatus, setSettingsStatus] = createState("")

  const [activeList, setActiveList] = createState<"theme" | "icon" | "font" | "cursor" | "preset" | null>(null)
  const [listPopupOpen, setListPopupOpen] = createState(false)
  const [themeList, setThemeList] = createState<string[]>([])
  const [iconList, setIconList] = createState<string[]>([])
  const [fontList, setFontList] = createState<string[]>([])
  const [cursorList, setCursorList] = createState<string[]>([])
  const [currentTheme, setCurrentTheme] = createState("loading...")
  const [currentIcon, setCurrentIcon] = createState("loading...")
  const [currentFont, setCurrentFont] = createState("loading...")
  const [currentCursor, setCurrentCursor] = createState("loading...")
  const [cursorSizeInput, setCursorSizeInput] = createState("24")

  const [calendarAccountEmail, setCalendarAccountEmail] = createState<string | null>(null)
  const [authDialogOpen, setAuthDialogOpen] = createState(false)
  const [authDialogInfo, setAuthDialogInfo] = createState({
    verification_url: "",
    user_code: "",
    device_code: "",
    error: "",
  })
  const [clientIdInput, setClientIdInput] = createState("")
  let authPollStop: (() => void) | null = null

  const [workspaceFx, setWorkspaceFx] = createState<Record<number, "born" | "dying" | "collapsing" | "settled">>({})
  const [wsDotColors, setWsDotColors] = createState<string[]>(envWsDotColors ?? [...DEFAULT_WS_DOT_COLORS])
  const [savedPresets, setSavedPresets] = createState<SavedPreset[]>([])

  if (!envWsDotColors) {
    execAsync(["bash", "-c", "$HOME/.config/ags/settings.sh get ws-dots"])
      .then((out) => {
        try {
          const parsed = JSON.parse(out)
          const colors = Array.isArray(parsed?.dots) ? parseWsDotColors(parsed.dots.join(",")) : null
          if (colors) setWsDotColors(colors)
        } catch {
          // Keep the defaults when the persisted workspace colors are unavailable.
        }
      })
      .catch(() => null)
  }

  execAsync(["bash", "-c", "$HOME/.config/ags/settings.sh get saved-presets"])
    .then((out) => {
      try {
        const parsed = JSON.parse(out)
        const presets = parseSavedPresets(parsed?.presets)
        if (presets) setSavedPresets(presets)
      } catch {
        // Keep saved presets empty when runtime state is unavailable.
      }
    })
    .catch(() => null)

  function setWsDotColor(index: number, hex: string) {
    if (index < 0 || index >= 8 || !isHexColor(hex)) return
    setWsDotColors((current) => current.map((color, i) => i === index ? hex : color))
  }

  function resetWsDotColors() {
    setWsDotColors([...DEFAULT_WS_DOT_COLORS])
  }

  function addSavedPreset(preset: SavedPreset) {
    setSavedPresets((current) => [...current.filter((item) => item.name !== preset.name), preset])
  }

  function removeSavedPreset(name: string) {
    setSavedPresets((current) => current.filter((preset) => preset.name !== name))
  }

  // ── Computeds ──────────────────────────────────────────────────────────────
  // Notifications currently held by notifd (active only; dismissed/expired
  // ones disappear from the bell automatically). The badge lights for
  // notifications newer than the highest id seen when the flyout last opened.
  const [seenUpTo, setSeenUpTo] = createState<number>(0)
  execAsync(["bash", "-c", "cat $HOME/.config/ags/notifications-seen.json 2>/dev/null || echo 0"])
    .then((out) => {
      const n = Number(String(out).trim())
      if (Number.isFinite(n) && n > 0) {
        // Clamp to the current daemon max: notifd ids restart at 1 on each
        // bar launch, so a stale persisted max would suppress the badge
        // forever.
        let max = 0
        for (const nd of notifd.notifications) {
          const id = Number(nd?.id)
          if (Number.isFinite(id) && id > max) max = id
        }
        setSeenUpTo(Math.min(n, max))
      }
    })
    .catch(() => null)

  function markAllSeen() {
    let max = seenUpTo()
    for (const n of notifd.notifications) {
      const id = Number(n.id)
      if (Number.isFinite(id) && id > max) max = id
    }
    if (max > seenUpTo()) {
      setSeenUpTo(max)
      execAsync(["bash", "-c", `printf '%s' ${max} > $HOME/.config/ags/notifications-seen.json`]).catch(() => null)
    }
  }

  const hasNotifications = createComputed(() =>
    notifications().some((n) => Number(n.id) > seenUpTo()),
  )
  const popupOpen = createComputed(() => controlOpen() || notifOpen() || calendarOpen() || desktopMenuOpen() || powerMenuOpen() || settingsOpen())
  const workspaceIds = createComputed(() => {
    const ids = workspaceListRaw()
    const active = activeWorkspace()
    if (ids.includes(active)) return ids
    return [...ids, active].sort((a, b) => a - b)
  })
  const centerDisplay = createComputed(() => (calendarOpen() ? clock() : focusedWindowTitle()))
  const isClientIdMissing = createComputed(() => {
    const err = authDialogInfo().error
    return err.startsWith("No Google OAuth client_id configured")
  })

  // ── Effects ────────────────────────────────────────────────────────────────
  // Auto-clear settings status after 3s
  createEffect(() => {
    const msg = settingsStatus()
    if (msg) {
      timeout(3000, () => setSettingsStatus(""))
    }
  })

  // Settings flyout init
  createEffect(() => {
    if (settingsOpen()) {
      setListPopupOpen(false)
      setActiveList(null)
      execAsync(["bash", "-c", "$HOME/.config/ags/settings.sh list-themes"])
        .then((out) => setThemeList(out.trim().split("\n").filter(Boolean)))
        .catch(() => setThemeList([]))
      execAsync(["bash", "-c", "$HOME/.config/ags/settings.sh list-icons"])
        .then((out) => setIconList(out.trim().split("\n").filter(Boolean)))
        .catch(() => setIconList([]))
      execAsync(["bash", "-c", "$HOME/.config/ags/settings.sh list-fonts"])
        .then((out) => setFontList(out.trim().split("\n").filter(Boolean)))
        .catch(() => setFontList([]))
      execAsync(["bash", "-c", "$HOME/.config/ags/settings.sh get theme"])
        .then((out) => setCurrentTheme(out.trim()))
        .catch(() => setCurrentTheme("..."))
      execAsync(["bash", "-c", "$HOME/.config/ags/settings.sh get icon"])
        .then((out) => setCurrentIcon(out.trim()))
        .catch(() => setCurrentIcon("..."))
      execAsync(["bash", "-c", "$HOME/.config/ags/settings.sh get font"])
        .then((out) => setCurrentFont(out.trim()))
        .catch(() => setCurrentFont("..."))
      execAsync(["bash", "-c", "$HOME/.config/ags/settings.sh list-cursors"])
        .then((out) => setCursorList(out.trim().split("\n").filter(Boolean)))
        .catch(() => setCursorList([]))
      execAsync(["bash", "-c", "$HOME/.config/ags/settings.sh get cursor-theme"])
        .then((out) => setCurrentCursor(out.trim()))
        .catch(() => setCurrentCursor("..."))
      execAsync(["bash", "-c", "$HOME/.config/ags/settings.sh get cursor-size"])
        .then((out) => setCursorSizeInput(out.trim() || "24"))
        .catch(() => setCursorSizeInput("24"))
    } else {
      setListPopupOpen(false)
      setActiveList(null)
    }
  })

  // ── Toggle / close functions ───────────────────────────────────────────────
  function closeFlyouts() {
    setControlOpen(false)
    setNotifOpen(false)
    setPowerMenuOpen(false)
    setPendingPowerAction(null)
    setCalendarOpen(false)
    setDesktopMenuOpen(false)
    setSettingsOpen(false)
    setSystemInfoOpen(false)
    setListPopupOpen(false)
    setActiveList(null)
    setAuthDialogOpen(false)
    if (authPollStop) { authPollStop(); authPollStop = null }
  }

  // Every flyout closes the others when it opens, so two flyouts can never
  // stack at the same anchor.
  const FLYOUT_CLOSERS = {
    control: () => setControlOpen(false),
    notif: () => setNotifOpen(false),
    power: () => { setPowerMenuOpen(false); setPendingPowerAction(null) },
    calendar: () => setCalendarOpen(false),
    desktop: () => setDesktopMenuOpen(false),
    settings: () => setSettingsOpen(false),
    sysinfo: () => setSystemInfoOpen(false),
  } as const

  function closeOtherFlyouts(except: keyof typeof FLYOUT_CLOSERS) {
    for (const [key, close] of Object.entries(FLYOUT_CLOSERS)) {
      if (key !== except) close()
    }
  }

  function toggleNotifications() {
    const next = !notifOpen()
    setNotifOpen(next)
    if (next) closeOtherFlyouts("notif")
  }

  // Dismiss through notifd: the notification leaves the active list, the
  // resolved signal fires, and the bell/toasts refresh themselves.
  function dismissNotification(id: string) {
    const numericId = Number(id)
    for (const n of notifd.notifications) {
      if (n && Number(n.id) === numericId) {
        n.dismiss()
        return
      }
    }
    // Object already gone from the daemon; drop it from the local list.
    setNotifications((current) => current.filter((n) => n.id !== String(id)))
  }

  function togglePowerMenu() {
    const next = !powerMenuOpen()
    setPowerMenuOpen(next)
    if (next) closeOtherFlyouts("power")
    else setPendingPowerAction(null)
  }

  function toggleControl() {
    const next = !controlOpen()
    setControlOpen(next)
    if (next) closeOtherFlyouts("control")
    else {
      setPowerMenuOpen(false)
      setPendingPowerAction(null)
    }
  }

  function toggleCalendar() {
    const next = !calendarOpen()
    setCalendarOpen(next)
    if (next) closeOtherFlyouts("calendar")
    else {
      setAuthDialogOpen(false)
      if (authPollStop) { authPollStop(); authPollStop = null }
    }
  }

  function toggleDesktopMenu() {
    const next = !desktopMenuOpen()
    setDesktopMenuOpen(next)
    if (next) closeOtherFlyouts("desktop")
  }

  function toggleSettings() {
    const next = !settingsOpen()
    setSettingsOpen(next)
    if (next) closeOtherFlyouts("settings")
    else {
      setListPopupOpen(false)
      setActiveList(null)
    }
  }

  function toggleSystemInfo() {
    const next = !systemInfoOpen()
    setSystemInfoOpen(next)
    if (next) closeOtherFlyouts("sysinfo")
  }

  // ── Auth flow ──────────────────────────────────────────────────────────────
  function startLogin() {
    setClientIdInput("")
    setAuthDialogInfo({ verification_url: "", user_code: "", device_code: "", error: "" })
    setAuthDialogOpen(true)
    execAsync(["bash", "-lc", "$HOME/.config/ags/calendar-auth.sh login"])
      .then((out) => {
        try {
          const parsed = JSON.parse(out)
          if (parsed.status === "need_code") {
            setAuthDialogInfo({
              verification_url: parsed.verification_url || "",
              user_code: parsed.user_code || "",
              device_code: parsed.device_code || "",
              error: "",
            })
          } else if (parsed.status === "error") {
            setAuthDialogInfo({
              verification_url: "",
              user_code: "",
              device_code: "",
              error: parsed.message || "Login failed.",
            })
          }
        } catch {
          setAuthDialogInfo({
            verification_url: "",
            user_code: "",
            device_code: "",
            error: "Unexpected response from auth script.",
          })
        }
      })
      .catch(() => {
        setAuthDialogInfo({
          verification_url: "",
          user_code: "",
          device_code: "",
          error: "Could not reach auth script.",
        })
      })
  }

  function handleAccountClick() {
    if (calendarAccountEmail()) {
      execAsync(["bash", "-lc", "$HOME/.config/ags/calendar-auth.sh logout"])
        .then(() => {
          setCalendarAccountEmail(null)
        })
        .catch(() => null)
    } else {
      startLogin()
    }
  }

  function saveClientIdAndLogin() {
    const raw = clientIdInput().trim()
    if (!raw) return
    const escaped = raw.replace(/'/g, "'\\''")
    execAsync(["bash", "-lc", `$HOME/.config/ags/calendar-auth.sh set-client-id '${escaped}'`])
      .then(() => {
        setClientIdInput("")
        startLogin()
      })
      .catch((err) => {
        setAuthDialogInfo({ ...authDialogInfo(), error: String(err) || "Failed to save client_id." })
      })
  }

  function closeAuthDialog() {
    setAuthDialogOpen(false)
    setClientIdInput("")
    if (authPollStop) { authPollStop(); authPollStop = null }
  }

  function startAuthPoll() {
    const info = authDialogInfo()
    if (!info.device_code) return
    if (authPollStop) { authPollStop(); authPollStop = null }
    let stopped = false
    authPollStop = () => { stopped = true }
    function poll() {
      if (stopped) return
      execAsync(["bash", "-c", `$HOME/.config/ags/calendar-auth.sh poll ${info.device_code}`])
        .then((out) => {
          if (stopped) return
          try {
            const parsed = JSON.parse(out)
            if (parsed.status === "success") {
              setCalendarAccountEmail(parsed.email || null)
              setAuthDialogOpen(false)
              authPollStop = null
              return
            }
            if (parsed.status === "error") {
              setAuthDialogInfo({ ...authDialogInfo(), error: parsed.message || "Polling failed." })
              authPollStop = null
              return
            }
          } catch { /* ignored */ }
          timeout(5000, poll)
        })
        .catch(() => { if (!stopped) timeout(5000, poll) })
    }
    poll()
  }

  // ── Action functions ───────────────────────────────────────────────────────
  function openAudioSettings() {
    execAsync(["pavucontrol"]).catch(() => null)
  }

  function setWifiEnabled(on: boolean) {
    execAsync(["nmcli", "radio", "wifi", on ? "on" : "off"]).catch(() => null)
  }

  // Run the dotfiles installer in a kitty window (the update notification's
  // "Update" button). The installer is safe to re-run: it backs up and
  // preserves user files.
  function runDotfilesUpdate() {
    execAsync([
      "kitty",
      "bash",
      "-c",
      "curl -fsSL https://raw.githubusercontent.com/djstarlet/dotfiles/main/install.sh | bash; echo; read -n 1 -s -r -p 'Done - press any key to close...'",
    ]).catch(() => null)
    setNotifOpen(false)
  }

  function openLauncher() {
    execAsync(["bash", "-lc", "albert show"]).catch(() => null)
    setDesktopMenuOpen(false)
  }

  function openNetworkSettings() {
    execAsync(["nmtui"]).catch(() => null)
    setDesktopMenuOpen(false)
  }

  function openDisplaySettings() {
    execAsync(["nwg-displays"]).catch(() => null)
    setControlOpen(false)
  }

  function runPowerAction(action: "lock" | "logout" | "reboot" | "shutdown") {
    setPendingPowerAction(action)
  }

  function confirmPowerAction() {
    const action = pendingPowerAction()
    if (!action) return

    closeFlyouts()

    const command = {
      lock: "loginctl lock-session",
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
      "current=$(hyprctl activeworkspace -j | jq -r '.address // .id // empty'); target=$(hyprctl workspaces -j | jq -r '.[] | select(.type != \"special\") | (.address // .id)' | sort -n | grep -vx \"$current\" | head -n1); hyprctl dispatch removeworkspace \"$current\" >/dev/null 2>&1 || { [[ -n \"$target\" ]] && hyprctl dispatch \"hl.dsp.focus({ workspace = $target })\" >/dev/null 2>&1; }",
    ]).catch(() => null)
    setDesktopMenuOpen(false)
  }

  function createNewDesktop() {
    const ids = workspaceIds()
    const maxId = ids.length > 0 ? Math.max(...ids) : 1
    const newId = maxId + 1
    execAsync(["hyprctl", "dispatch", `hl.dsp.focus({ workspace = ${newId} })`]).catch(() => null)
    setDesktopMenuOpen(false)
  }

  function switchToWorkspace(id: number) {
    setActiveWorkspaceOverride(id)
    execAsync(["hyprctl", "dispatch", `hl.dsp.focus({ workspace = ${id} })`]).catch(() => null)
  }

  function moveWindowToNewDesktop() {
    const ids = workspaceIds()
    const maxId = ids.length > 0 ? Math.max(...ids) : 1
    const nextId = String(maxId + 1)
    execAsync(["bash", "-lc", `hyprctl dispatch 'hl.dsp.window.move({ workspace = ${nextId} })'; hyprctl dispatch 'hl.dsp.focus({ workspace = ${nextId} })'`]).catch(
      () => null,
    )
    setDesktopMenuOpen(false)
  }

  function openOverview() {
    execAsync(["hyprctl", "dispatch", 'hl.dsp.focus({ workspace = "e+1" })']).catch(() => null)
    setDesktopMenuOpen(false)
  }

  return {
    // Polls
    clock,
    activeWorkspace,
    switchToWorkspace,
    focusedWindowClass,
    cursorPos,
    gcalEvents,

    // State
    controlOpen,
    notifOpen,
    powerMenuOpen,
    setPowerMenuOpen,
    pendingPowerAction,
    setPendingPowerAction,
    calendarOpen,
    desktopMenuOpen,
    setDesktopMenuOpen,
    settingsOpen,
    systemInfoOpen,
    setSystemInfoOpen,
    settingsStatus,
    setSettingsStatus,
    activeList,
    setActiveList,
    listPopupOpen,
    setListPopupOpen,
    themeList,
    iconList,
    fontList,
    cursorList,
    currentTheme,
    setCurrentTheme,
    currentIcon,
    setCurrentIcon,
    currentFont,
    setCurrentFont,
    currentCursor,
    setCurrentCursor,
    cursorSizeInput,
    setCursorSizeInput,
    calendarAccountEmail,
    setCalendarAccountEmail,
    authDialogOpen,
    authDialogInfo,
    clientIdInput,
    setClientIdInput,
    workspaceFx,
    setWorkspaceFx,
    wsDotColors,
    setWsDotColor,
    resetWsDotColors,
    savedPresets,
    addSavedPreset,
    removeSavedPreset,

    // Computeds
    popupOpen,
    workspaceIds,
    centerDisplay,
    isClientIdMissing,
    notifications,
    hasNotifications,

    // Functions
    closeFlyouts,
    toggleNotifications,
    refreshNotifications,
    dismissNotification,
    markAllSeen,
    togglePowerMenu,
    toggleControl,
    toggleCalendar,
    toggleDesktopMenu,
    toggleSettings,
    toggleSystemInfo,
    openAudioSettings,
    setWifiEnabled,
    runDotfilesUpdate,
    openLauncher,
    openNetworkSettings,
    openDisplaySettings,
    runPowerAction,
    confirmPowerAction,
    cancelPowerAction,
    powerGlyph,
    takeScreenshot,
    closeCurrentDesktop,
    createNewDesktop,
    moveWindowToNewDesktop,
    openOverview,
    sendFocusedShortcut,
    handleAccountClick,
    saveClientIdAndLogin,
    closeAuthDialog,
    startAuthPoll,

  }
}
