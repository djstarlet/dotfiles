import app from "ags/gtk4/app"
import { Gtk } from "ags/gtk4"
import { execAsync } from "ags/process"
import { createPoll, timeout } from "ags/time"
import { For, createEffect, createState } from "gnim"
import type { Store } from "./store"

// ─── Parsers ──────────────────────────────────────────────────────────────────

function parseOsName(raw: string) {
  const m = String(raw).match(/^PRETTY_NAME="?([^"\n]+)"?/m)
  return m ? m[1] : "Unknown"
}

// "AMD Ryzen 7 5800X 8-Core Processor|16|5619.7388" → "AMD Ryzen 7 5800X (16) @ 5.62 GHz"
function parseCpuInfo(raw: string) {
  const [model, cores, maxMhz] = String(raw).split("|").map((s) => s.trim())
  if (!model) return "Unknown"
  const ghz = Number(maxMhz) / 1000
  // Drop AMD's "8-Core Processor" suffix; it pushes the line past the 420px window.
  const name = model.replace(/\s+\d+-Core Processor\s*$/, "")
  return `${name}${cores ? ` (${cores})` : ""}${ghz > 0 ? ` @ ${ghz.toFixed(2)} GHz` : ""}`
}

function parseBoard(raw: string) {
  return String(raw).trim() || "unknown"
}

// "719 emerge" → "719 (emerge)"
function parsePackages(raw: string) {
  const [count, mgr] = String(raw).trim().split(/\s+/)
  return count && mgr && /^\d+$/.test(count) ? `${count} (${mgr})` : "unknown"
}

// "/bin/bash|GNU bash, version 5.3.15(1)-release ..." → "bash 5.3.15"
function parseShell(raw: string) {
  const [path, versionLine] = String(raw).split("|")
  const name = String(path ?? "").trim().split("/").pop() || "unknown"
  const m = String(versionLine ?? "").match(/\d+\.\d+(?:\.\d+)?/)
  return m ? `${name} ${m[0]}` : name
}

// "Hyprland 0.56.0 built from branch ..." → "Hyprland 0.56.0"
function parseWm(raw: string) {
  const first = String(raw).trim().split("\n")[0] ?? ""
  const m = first.match(/^(\S+)\s+(\d\S*)/)
  return m ? `${m[1]} ${m[2]}` : first || "unknown"
}

// "50422689792 4288212992 ..." (free -b) → "4.0Gi / 47Gi (9%)"
function parseMemory(raw: string) {
  const [total, used] = String(raw).trim().split(/\s+/).map(Number)
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(used)) return "unknown"
  const gib = (n: number) => (n / 1024 ** 3 >= 10 ? `${Math.round(n / 1024 ** 3)}Gi` : `${(n / 1024 ** 3).toFixed(1)}Gi`)
  return `${gib(used)} / ${gib(total)} (${Math.round((used / total) * 100)}%)`
}

function parseMonitors(raw: string) {
  try {
    const list = JSON.parse(String(raw))
    if (!Array.isArray(list)) return []
    return list.map((m: any) => {
      const pw = Number(m.physicalWidth) || 0
      const ph = Number(m.physicalHeight) || 0
      return {
        name: String(m.name),
        model: String(m.model ?? "").trim(),
        width: Number(m.width),
        height: Number(m.height),
        refreshRate: Number(m.refreshRate),
        focused: Boolean(m.focused),
        inches: pw > 0 && ph > 0 ? (Math.hypot(pw, ph) / 25.4).toFixed(1) : "",
      }
    })
  } catch {
    return []
  }
}

function sortMonitors(ms: ReturnType<typeof parseMonitors>) {
  // Focused monitor first (it's the "primary"), then the rest in hyprctl order.
  return [...ms.filter((m) => m.focused), ...ms.filter((m) => !m.focused)]
}

function parseDistroId(raw: string) {
  // Handle both ID="x" and ID='x' (Gentoo uses single quotes).
  const m = String(raw).match(/^ID=([^\n]+)/m)
  return m ? m[1].trim().replace(/^['"]|['"]$/g, "") : ""
}

// lspci device-id → name. Text parsing is ambiguous (all Navi 10 SKUs share
// one string: "Radeon RX 5600 OEM/5600 XT / 5700/5700 XT"), so match on id.
const GPU_IDS: Record<string, string> = {
  "1002:731f": "AMD Radeon RX 5700 XT",
  "1002:731e": "AMD Radeon RX 5600 XT",
  "1002:7318": "AMD Radeon RX 5700",
  "1002:67df": "AMD Radeon RX 5700",
  "1002:67c4": "AMD Radeon RX 570",
  "1002:164e": "AMD Radeon iGPU (Renoir)",
  "1002:15bf": "AMD Radeon RX 5500",
  "1002:73bf": "AMD Radeon RX 6800 XT",
  "1002:744c": "AMD Radeon RX 7900 XTX",
  "8086:9bc4": "Intel UHD Graphics 630",
  "8086:4680": "Intel Arc A370M / Iris Xe",
  "8086:a780": "Intel Iris Xe Graphics (Raptor Lake)",
  "10de:1c03": "NVIDIA GeForce GTX 1060",
  "10de:1e07": "NVIDIA GeForce RTX 2080",
  "10de:2504": "NVIDIA GeForce RTX 3050",
  "10de:2484": "NVIDIA GeForce RTX 3060",
  "10de:2684": "NVIDIA GeForce RTX 4090",
}

// Codepoints verified against SymbolsNerdFont-Regular.ttf via fontTools:
// gentoo E7E6, arch E732, debian E77D, ubuntu E73A, fedora E7D9, nixos E843,
// opensuse E857, centos E78A, redhat E7BB (devicons block);
// manjaro F312, linuxmint F30E (linux block); fallback F17C (fa-linux).
const DISTRO_GLYPHS: Record<string, string> = {
  gentoo: "\u{e7e6}",
  arch: "\u{e732}",
  debian: "\u{e77d}",
  ubuntu: "\u{e73a}",
  fedora: "\u{e7d9}",
  manjaro: "\u{f312}",
  linuxmint: "\u{f30e}",
  nixos: "\u{e843}",
  opensuse: "\u{e857}",
  centos: "\u{e78a}",
  redhat: "\u{e7bb}",
}

function parseDisks(raw: string) {
  try {
    const json = JSON.parse(String(raw))
    const list = Array.isArray(json.blockdevices) ? json.blockdevices : []
    return list
      .filter((d: any) => d.name && d.size)
      .map((d: any) => ({
        name: String(d.name),
        model: String(d.model ?? "Disk").trim() || "Disk",
        size: String(d.size).trim(),
      }))
  } catch {
    return []
  }
}

// ─── Static field helpers ─────────────────────────────────────────────────────

function Field(label: string, value: string | (() => string)) {
  return (
    <box orientation={Gtk.Orientation.HORIZONTAL} spacing={8}>
      <label class="system-info-label" label={label} widthRequest={120} xalign={1} halign={Gtk.Align.END} />
      <label class="system-info-value" label={value} selectable hexpand xalign={0} halign={Gtk.Align.START} ellipsize={3 /* PANGO_ELLIPSIZE_END */} />
    </box>
  )
}

function SectionTitle(props: { label: string }) {
  return <label class="system-info-section-title" label={props.label} halign={Gtk.Align.START} xalign={0} />
}

function Divider() {
  return <box class="system-info-divider" />
}

// ─── System Info: a REAL Hyprland-managed Gtk window ──────────────────────────
// Not an Astal layer-shell window: Gtk.ApplicationWindow is a normal toplevel,
// so Hyprland floats/centers it via windowrule and it responds to WM keybinds.

export default function SystemInfoWindow(gdkmonitor: Gdk.Monitor, monitorIndex: number, s: Store) {
  // Bar.tsx instantiates this once per monitor; a normal toplevel window is
  // centered by the compositor, so only the first instance owns it.
  if (monitorIndex !== 0) return null

  // ── Live polls (60s) ───────────────────────────────────────────────────────
  const uptime = createPoll("…", 60_000, ["bash", "-c", "uptime -p"], (out) => out.trim() || "unknown")
  // free -b so the percentage is computed from bytes in JS, not from rounded "free -h" text.
  const memory = createPoll("…", 60_000, ["bash", "-c", "free -b | sed -n 's/^Mem: *//p'"], (out) => parseMemory(out))
  const disk = createPoll("…", 60_000, ["bash", "-c", `df -h / | awk 'NR==2{print $3"/"$2" ("$5" used)"}'`], (out) => out.trim() || "unknown")

  // ── Static info: refreshed each time the window opens ──────────────────────
  const [hostname, setHostname] = createState("…")
  const [osName, setOsName] = createState("…")
  const [kernel, setKernel] = createState("…")
  const [host, setHost] = createState("…")
  const [packages, setPackages] = createState("…")
  const [shell, setShell] = createState("…")
  const [wm, setWm] = createState("…")
  const [cpu, setCpu] = createState("…")
  const [gpu, setGpu] = createState("…")
  const [distroGlyph, setDistroGlyph] = createState("\u{f17c}")
  const [disks, setDisks] = createState<Array<{ name: string; model: string; size: string }>>([])
  const [monitors, setMonitors] = createState<ReturnType<typeof parseMonitors>>([])

  createEffect(() => {
    if (!s.systemInfoOpen()) return
    execAsync(["hostname", "-s"]).then(setHostname).catch(() => setHostname("unknown"))
    execAsync(["bash", "-c", "cat /etc/os-release"])
      .then((out) => {
        setOsName(parseOsName(out))
        setDistroGlyph(DISTRO_GLYPHS[parseDistroId(out)] ?? "\u{f17c}")
      })
      .catch(() => setOsName("unknown"))
    execAsync(["bash", "-c", "lsblk -d -o NAME,MODEL,SIZE -J"])
      .then((out) => setDisks(parseDisks(out)))
      .catch(() => setDisks([]))
    execAsync(["uname", "-r"]).then(setKernel).catch(() => setKernel("unknown"))
    // product_name is the short model code fastfetch shows (MS-7D54); board_name
    // on this board is the long marketing name (MAG X570S TOMAHAWK MAX WIFI).
    execAsync([
      "bash",
      "-c",
      "cat /sys/devices/virtual/dmi/id/product_name 2>/dev/null || cat /sys/devices/virtual/dmi/id/board_name 2>/dev/null",
    ])
      .then((out) => setHost(parseBoard(out)))
      .catch(() => setHost("unknown"))
    execAsync([
      "bash",
      "-c",
      "if command -v qlist >/dev/null 2>&1; then printf '%s emerge' \"$(qlist -I | wc -l)\"; elif command -v pacman >/dev/null 2>&1; then printf '%s pacman' \"$(pacman -Q | wc -l)\"; elif command -v dpkg-query >/dev/null 2>&1; then printf '%s dpkg' \"$(dpkg-query -f '.\\n' -W | wc -l)\"; elif command -v rpm >/dev/null 2>&1; then printf '%s rpm' \"$(rpm -qa | wc -l)\"; fi",
    ])
      .then((out) => setPackages(parsePackages(out)))
      .catch(() => setPackages("unknown"))
    execAsync([
      "bash",
      "-c",
      'sh=$(getent passwd "$USER" | cut -d: -f7); printf "%s|%s" "$sh" "$("$sh" --version 2>/dev/null | head -1)"',
    ])
      .then((out) => setShell(parseShell(out)))
      .catch(() => setShell("unknown"))
    execAsync(["bash", "-c", "hyprctl version | head -1"])
      .then((out) => setWm(parseWm(out)))
      .catch(() => setWm("unknown"))
    execAsync([
      "bash",
      "-c",
      "lscpu | awk -F: '/^Model name/{m=$2} /^CPU\\(s\\):/{c=$2} /^CPU max MHz/{f=$2} END{print m\"|\"c\"|\"f}'",
    ])
      .then((out) => setCpu(parseCpuInfo(out)))
      .catch(() => setCpu("unknown"))
    // GPU: lspci -nn device-id lookup (text parsing is ambiguous across SKUs).
    execAsync([
      "bash",
      "-c",
      "lspci -nn | grep -iE 'vga|3d controller' | head -1 | grep -oE '\\[[0-9a-f]{4}:[0-9a-f]{4}\\]' | tr -d '[]'",
    ])
      .then((out) => {
        const id = out.trim().toLowerCase()
        if (GPU_IDS[id]) setGpu(GPU_IDS[id])
        else
          execAsync([
            "bash",
            "-c",
            "lspci | grep -iE 'vga|3d controller' | head -1 | sed -E 's/.*\\[([^]]*)\\].*/\\1/; s|/.*||; s/OEM//g; s/ *$//'",
          ])
            .then((o) => setGpu(o.trim() || "unknown"))
            .catch(() => setGpu("unknown"))
      })
      .catch(() => setGpu("unknown"))
    execAsync(["bash", "-c", "hyprctl monitors -j"])
      .then((out) => setMonitors(sortMonitors(parseMonitors(out))))
      .catch(() => setMonitors([]))
  })

  // ── Content (same flyout box JSX, extracted) ───────────────────────────────
  function SystemInfoContent() {
    return (
      <box
        class="flyout system-info-flyout"
        orientation={Gtk.Orientation.VERTICAL}
        spacing={10}
        hexpand
        vexpand
        halign={Gtk.Align.CENTER}
        valign={Gtk.Align.CENTER}
        widthRequest={420}
        heightRequest={560}
      >
        <label class="flyout-title" label="System Info" xalign={0.5} />

        <SectionTitle label="SYSTEM" />
        <box orientation={Gtk.Orientation.HORIZONTAL} spacing={12}>
          <box orientation={Gtk.Orientation.VERTICAL} spacing={2} hexpand>
            {Field("Hostname", hostname)}
            {Field("OS", osName)}
            {Field("Kernel", kernel)}
            {Field("Uptime", uptime)}
            {Field("Host", host)}
            {Field("Packages", packages)}
            {Field("Shell", shell)}
            {Field("WM", wm)}
          </box>
          <label class="system-info-logo" label={distroGlyph} valign={Gtk.Align.CENTER} />
        </box>

        <Divider />

        <SectionTitle label="HARDWARE" />
        {Field("CPU", cpu)}
        {Field("Memory", memory)}
        {Field("GPU", gpu)}

        <Divider />

        <SectionTitle label="STORAGE" />
        <For each={disks}>{(d) => Field(d.model, d.size)}</For>
        {Field("Root usage", disk)}

        <Divider />

        <SectionTitle label="DISPLAY" />
        <For each={monitors}>{(m, i) => {
          const desc = `${m.model ? `${m.model} — ` : ""}${m.width}x${m.height} @ ${Math.round(m.refreshRate)}Hz${m.inches ? ` (${m.inches}")` : ""}`
          return (
            <box orientation={Gtk.Orientation.VERTICAL} spacing={2}>
              <label class="system-info-monitor" label={`Monitor ${i() + 1} — ${m.name}`} halign={Gtk.Align.START} xalign={0} />
              {Field("Resolution", desc)}
            </box>
          )
        }}
        </For>
      </box>
    )
  }

  // ── Window lifecycle: open ⇄ systemInfoOpen, both directions ──────────────
  let win: Gtk.ApplicationWindow | null = null

  createEffect(() => {
    if (s.systemInfoOpen()) {
      if (win) return // guard against duplicates
      win = new Gtk.ApplicationWindow({
        application: app,
        title: "System Info",
        defaultWidth: 420,
        defaultHeight: 560,
        resizable: false,
      })
      win.set_child(SystemInfoContent())

      // Esc closes (only works when the WM gives the window keyboard focus).
      const ctrl = new Gtk.EventControllerKey()
      ctrl.connect("key-pressed", (_c, keyval) => {
        if (keyval === 0xff1b) {
          s.closeFlyouts()
          return true
        }
        return false
      })
      win.add_controller(ctrl)

      // Closed via WM (kill bind / hyprctl kill): sync the store back down.
      win.connect("close-request", () => {
        win = null
        s.setSystemInfoOpen(false)
        return false // let GTK finish the close
      })
      const openedAt = Date.now()
      win.present()

      // ── Auto-dismiss on focus loss ──────────────────────────────────────────
      // Hyprland 0.56 steals focus from a floating window on pointer motion even
      // with follow_mouse = 0, so losing `is-active` does NOT mean the user left
      // the window. On focus loss we wait 150ms (debounce), then dismiss ONLY if
      // the cursor is actually outside the window rect (8px margin) AND has been
      // inside it at least once since opening.
      //
      // The latch matters: the window is opened from the Control Center tile in
      // the screen corner, while the window itself is centred, so the cursor
      // starts outside. Without `hasEntered` the post-present focus theft read
      // as "user left" and closed the window ~250ms after it appeared.
      let focusTimer: ReturnType<typeof timeout> | null = null
      let hasEntered = false
      let rect: { x: number; y: number; w: number; h: number } | null = null
      let rectAt = 0
      let rectPending = false

      // hyprctl clients -j → this window's real rect. Cached (5s TTL) so focus
      // events never shell out directly.
      const refreshRect = () => {
        if (rectPending || Date.now() - rectAt < 5000) return
        rectPending = true
        execAsync(["hyprctl", "clients", "-j"])
          .then((out) => {
            const list = JSON.parse(out)
            const c = Array.isArray(list) ? list.find((c: any) => c.title === "System Info") : null
            if (c?.at && c?.size) {
              rect = { x: Number(c.at[0]), y: Number(c.at[1]), w: Number(c.size[0]), h: Number(c.size[1]) }
              rectAt = Date.now()
            }
          })
          .catch(() => {})
          .finally(() => {
            rectPending = false
          })
      }

      const cursorInside = () => {
        const { x: cx, y: cy } = s.cursorPos()
        const m = 8
        // Real client rect when cached; the window is centered and non-resizable,
        // so the monitor's center region is an accurate fallback.
        const w = rect?.w || win?.get_width?.() || 420
        const h = rect?.h || win?.get_height?.() || 560
        const geo = gdkmonitor.get_geometry()
        const x = rect?.x ?? Math.round(geo.x + (geo.width - w) / 2)
        const y = rect?.y ?? Math.round(geo.y + (geo.height - h) / 2)
        return cx >= x - m && cx <= x + w + m && cy >= y - m && cy <= y + h + m
      }

      const dismissIfLeft = () => {
        focusTimer = null
        if (!win) return
        // Grace period after present(): ignore the initial focus handoff.
        const sinceOpen = Date.now() - openedAt
        if (sinceOpen < 250) {
          focusTimer = timeout(250 - sinceOpen, dismissIfLeft)
          return
        }
        refreshRect()
        if (cursorInside()) {
          hasEntered = true
          return // focus stolen by the Hyprland floating-window bug
        }
        if (!hasEntered) return // cursor never reached the window: ignore focus theft
        s.closeFlyouts()
      }

      win.connect("notify::is-active", () => {
        if (win?.is_active) {
          if (focusTimer) {
            focusTimer.cancel()
            focusTimer = null
          }
        } else if (!focusTimer) {
          focusTimer = timeout(150, dismissIfLeft)
        }
      })

      // Latch `hasEntered` off the store's existing 120ms cursorPos poll (no new
      // subprocess), and close on cursor-leave once the pointer has been on the
      // window. Geometry comes from the cached rect only; refreshRect() runs on
      // open/focus loss, never from this watcher.
      createEffect(() => {
        if (!win) return
        const inside = cursorInside()
        if (!hasEntered) {
          if (inside) hasEntered = true
          return
        }
        if (!inside && !focusTimer) dismissIfLeft()
      })

      refreshRect()
      // The window may not be mapped yet when the first lookup runs; retry once.
      timeout(400, refreshRect)
    } else {
      win?.destroy()
      win = null
    }
  })

  // Rebuild content when async data lands (gnim <For> over a State doesn't
  // re-render the once-built tree reliably). Only rebuild on real changes.
  let lastBuiltKey = ""
  createEffect(() => {
    const key = `${distroGlyph()}|${disks().length}|${monitors().length}|${disks().map((d) => d.size).join(",")}|${monitors().map((m) => m.model).join(",")}`
    if (key === lastBuiltKey) return
    lastBuiltKey = key
    if (win) win.set_child(SystemInfoContent())
  })

  return null
}
