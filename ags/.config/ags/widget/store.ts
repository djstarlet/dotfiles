import { execAsync } from "ags/process"
import { createPoll, timeout } from "ags/time"
import { createComputed, createEffect, createState } from "gnim"
import { theme } from "./theme.config"
import type { ThemeConfig } from "./theme.config"

// ─── Parser helpers ───────────────────────────────────────────────────────────

function parseActiveWorkspace(raw: string) {
  try {
    const parsed = JSON.parse(raw)
    const id = Number(parsed?.id)
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

// Mac-style per-app Quick Actions rows: picked by the focused window's class
// when the menu opens; unknown apps fall back to the generic edit shortcuts.
type ShortcutDef = { label: string; hint: string; mod: string; key: string }
export const SHORTCUT_FALLBACK: ShortcutDef[] = [
  { label: "Save", hint: "Ctrl+S", mod: "CTRL", key: "s" },
  { label: "Undo", hint: "Ctrl+Z", mod: "CTRL", key: "z" },
  { label: "Redo", hint: "Ctrl+Shift+Z", mod: "CTRL_SHIFT", key: "z" },
  { label: "Cut", hint: "Ctrl+X", mod: "CTRL", key: "x" },
  { label: "Copy", hint: "Ctrl+C", mod: "CTRL", key: "c" },
  { label: "Paste", hint: "Ctrl+V", mod: "CTRL", key: "v" },
  { label: "Select All", hint: "Ctrl+A", mod: "CTRL", key: "a" },
]
export const SHORTCUT_PRESETS: Record<string, ShortcutDef[]> = {
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
      .map((item) => Number(item?.id))
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
  id: string
  sig?: string // condition fingerprint; a change re-alerts after dismissal
  title: string
  detail: string
  openUrl?: string
  openPath?: string
}

function parseWsDotColors(raw: string | undefined) {
  if (!raw) return null
  const colors = raw.split(",").map((color) => color.trim())
  return colors.length === 8 && colors.every((color) => /^#[0-9a-fA-F]{6}$/.test(color)) ? colors : null
}

function parseSavedPresets(raw: unknown): SavedPreset[] | null {
  if (!Array.isArray(raw)) return null
  const valid = raw.every((preset) =>
    preset &&
    typeof preset.name === "string" &&
    preset.name.trim().length > 0 &&
    [preset.background, preset.accent, preset.text].every((color) => typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color)) &&
    Array.isArray(preset.dots) &&
    preset.dots.length === 8 &&
    preset.dots.every((color: unknown) => typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color))
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
  const focusedWindowTitle = createPoll("Desktop", 900, ["hyprctl", "activewindow", "-j"], (out) =>
    parseFocusedWindowTitle(out),
  )
  const focusedWindowClass = createPoll("", 900, ["hyprctl", "activewindow", "-j"], (out, prev) => {
    const cls = parseFocusedWindowClass(out)
    return cls !== "" ? cls : prev
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

  // notifications-watcher.py (fired from start-bar.sh and re-run by this
  // poll) gathers all notification sources into notifications.json.
  const notificationPoll = createPoll<Notification[]>([], 60000, ["bash", "-c", "$HOME/.config/ags/notifications-watcher.py >/dev/null 2>&1; cat $HOME/.config/ags/notifications.json 2>/dev/null || true"], (out, prev) => {
    try {
      const parsed = JSON.parse(out)
      if (Array.isArray(parsed)) {
        return parsed.filter((n) => n && typeof n.id === "string" && typeof n.title === "string") as Notification[]
      }
    } catch {
      // Not written yet (first watcher run still in flight).
    }
    return prev
  })

  // ── Shared state ───────────────────────────────────────────────────────────
  const [controlOpen, setControlOpen] = createState(false)
  const [notifOpen, setNotifOpen] = createState(false)
  const [powerMenuOpen, setPowerMenuOpen] = createState(false)
  const [pendingPowerAction, setPendingPowerAction] = createState<null | "lock" | "logout" | "reboot" | "shutdown">(null)
  const [calendarOpen, setCalendarOpen] = createState(false)
  const [desktopMenuOpen, setDesktopMenuOpen] = createState(false)
  const [settingsOpen, setSettingsOpen] = createState(false)
  const [settingsStatus, setSettingsStatus] = createState("")
  const [chooserOpen, setChooserOpen] = createState(false)

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

  // Manually dismissed notifications: id -> sig at dismiss time. A changed
  // condition (new sig) re-alerts; the map persists across bar restarts.
  const [dismissed, setDismissed] = createState<Record<string, string>>({})
  execAsync(["bash", "-c", "cat $HOME/.config/ags/dismissed-notifications.json 2>/dev/null || true"])
    .then((out) => {
      try {
        const parsed = JSON.parse(out)
        if (parsed && typeof parsed === "object") setDismissed(parsed)
      } catch {
        // No or invalid dismissed state - start clean.
      }
    })
    .catch(() => null)

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
    if (index < 0 || index >= 8 || !/^#[0-9a-fA-F]{6}$/.test(hex)) return
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
  const notifications = createComputed<Notification[]>(() => {
    const gone = dismissed()
    return notificationPoll().filter((n) => gone[n.id] !== (n.sig ?? ""))
  })
  const hasNotifications = createComputed(() => notifications().length > 0)
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
    setListPopupOpen(false)
    setActiveList(null)
    setAuthDialogOpen(false)
    if (authPollStop) { authPollStop(); authPollStop = null }
  }

  function toggleNotifications() {
    const next = !notifOpen()
    setNotifOpen(next)
    if (next) {
      setControlOpen(false)
      setCalendarOpen(false)
      setDesktopMenuOpen(false)
      setSettingsOpen(false)
      setPowerMenuOpen(false)
      setPendingPowerAction(null)
    }
  }

  function dismissNotification(id: string, sig?: string) {
    setDismissed((prev) => ({ ...prev, [id]: sig ?? "" }))
    const payload = JSON.stringify({ ...dismissed(), [id]: sig ?? "" })
    execAsync(["bash", "-c", `printf '%s' '${payload}' > $HOME/.config/ags/dismissed-notifications.json`]).catch(() => null)
  }

  function togglePowerMenu() {
    const next = !powerMenuOpen()
    setPowerMenuOpen(next)
    if (!next) setPendingPowerAction(null)
    if (next) {
      setControlOpen(false)
      setCalendarOpen(false)
      setDesktopMenuOpen(false)
      setSettingsOpen(false)
    }
  }

  function toggleControl() {
    const next = !controlOpen()
    setControlOpen(next)
    if (!next) {
      setPowerMenuOpen(false)
      setPendingPowerAction(null)
    }
    if (next) {
      setCalendarOpen(false)
      setDesktopMenuOpen(false)
      setSettingsOpen(false)
    }
  }

  function toggleCalendar() {
    const next = !calendarOpen()
    setCalendarOpen(next)
    setControlOpen(false)
    setPowerMenuOpen(false)
    setDesktopMenuOpen(false)
    setSettingsOpen(false)
    if (!next) {
      setAuthDialogOpen(false)
      if (authPollStop) { authPollStop(); authPollStop = null }
    }
  }

  function toggleDesktopMenu() {
    const next = !desktopMenuOpen()
    setDesktopMenuOpen(next)
    setControlOpen(false)
    setPowerMenuOpen(false)
    setCalendarOpen(false)
    setSettingsOpen(false)
  }

  function toggleSettings() {
    const next = !settingsOpen()
    setSettingsOpen(next)
    if (next) {
      setControlOpen(false)
      setCalendarOpen(false)
      setDesktopMenuOpen(false)
      setPowerMenuOpen(false)
      setPendingPowerAction(null)
    } else {
      setListPopupOpen(false)
      setActiveList(null)
    }
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
      "current=$(hyprctl activeworkspace -j | sed -n 's/.*\"id\":\s*\([0-9][0-9]*\).*/\1/p' | head -n1); target=$(hyprctl workspaces -j | sed -n 's/.*\"id\":\s*\([0-9][0-9]*\).*/\1/p' | sort -n | grep -vx \"$current\" | head -n1); hyprctl dispatch removeworkspace \"$current\" >/dev/null 2>&1 || { [[ -n \"$target\" ]] && hyprctl dispatch workspace \"$target\" >/dev/null 2>&1; }",
    ]).catch(() => null)
    setDesktopMenuOpen(false)
  }

  function createNewDesktop() {
    const ids = workspaceIds()
    const maxId = ids.length > 0 ? Math.max(...ids) : 1
    const newId = maxId + 1
    execAsync(["hyprctl", "dispatch", "workspace", String(newId)]).catch(() => null)
    setDesktopMenuOpen(false)
  }

  function switchToWorkspace(id: number) {
    setActiveWorkspaceOverride(id)
    execAsync(["hyprctl", "dispatch", "workspace", String(id)]).catch(() => null)
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
    execAsync(["hyprctl", "dispatch", "workspace", "+1"]).catch(() => null)
    setDesktopMenuOpen(false)
  }

  return {
    // Polls
    clock,
    activeWorkspace,
    setActiveWorkspaceOverride,
    switchToWorkspace,
    focusedWindowTitle,
    focusedWindowClass,
    cursorPos,
    workspaceListRaw,
    gcalEvents,

    // State
    controlOpen,
    setControlOpen,
    notifOpen,
    setNotifOpen,
    powerMenuOpen,
    setPowerMenuOpen,
    pendingPowerAction,
    setPendingPowerAction,
    calendarOpen,
    setCalendarOpen,
    desktopMenuOpen,
    setDesktopMenuOpen,
    settingsOpen,
    setSettingsOpen,
    settingsStatus,
    setSettingsStatus,
    chooserOpen,
    setChooserOpen,
    activeList,
    setActiveList,
    listPopupOpen,
    setListPopupOpen,
    themeList,
    setThemeList,
    iconList,
    setIconList,
    fontList,
    setFontList,
    cursorList,
    setCursorList,
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
    setAuthDialogOpen,
    authDialogInfo,
    setAuthDialogInfo,
    clientIdInput,
    setClientIdInput,
    workspaceFx,
    setWorkspaceFx,
    wsDotColors,
    setWsDotColors,
    setWsDotColor,
    resetWsDotColors,
    savedPresets,
    setSavedPresets,
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
    dismissNotification,
    togglePowerMenu,
    toggleControl,
    toggleCalendar,
    toggleDesktopMenu,
    toggleSettings,
    openAudioSettings,
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
    startLogin,
    handleAccountClick,
    saveClientIdAndLogin,
    closeAuthDialog,
    startAuthPoll,

  }
}
