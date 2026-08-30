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

function parseCpuModel(raw: string) {
  const m = String(raw).match(/Model name:\s*(.+)/)
  return m ? m[1].trim() : "Unknown"
}

function parseMonitors(raw: string) {
  try {
    const list = JSON.parse(String(raw))
    if (!Array.isArray(list)) return []
    return list.map((m: any) => ({
      name: String(m.name),
      width: Number(m.width),
      height: Number(m.height),
      refreshRate: Number(m.refreshRate),
      focused: Boolean(m.focused),
    }))
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

function Field(label: string, value: () => string) {
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

export default function SystemInfoWindow(_gdkmonitor: Gdk.Monitor, monitorIndex: number, s: Store) {
  // Bar.tsx instantiates this once per monitor; a normal toplevel window is
  // centered by the compositor, so only the first instance owns it.
  if (monitorIndex !== 0) return null

  // ── Live polls (60s) ───────────────────────────────────────────────────────
  const uptime = createPoll("…", 60_000, ["bash", "-c", "uptime -p"], (out) => out.trim() || "unknown")
  const memory = createPoll("…", 60_000, ["bash", "-c", "free -h | awk '/Mem:/{print $3\" / \"$2}'"], (out) => out.trim() || "unknown")
  const disk = createPoll("…", 60_000, ["bash", "-c", `df -h / | awk 'NR==2{print $3"/"$2" ("$5" used)"}'`], (out) => out.trim() || "unknown")

  // ── Static info: refreshed each time the window opens ──────────────────────
  const [hostname, setHostname] = createState("…")
  const [osName, setOsName] = createState("…")
  const [kernel, setKernel] = createState("…")
  const [cpu, setCpu] = createState("…")
  const [gpu, setGpu] = createState("…")
  const [distroGlyph, setDistroGlyph] = createState("\u{f17c}")
  const [disks, setDisks] = createState<Array<{ name: string; model: string; size: string }>>([])
  const [monitors, setMonitors] = createState<Array<{ name: string; width: number; height: number; refreshRate: number; focused: boolean }>>([])

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
    execAsync(["bash", "-c", `lscpu | grep "Model name"`]).then((out) => setCpu(parseCpuModel(out))).catch(() => setCpu("unknown"))
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
        heightRequest={480}
      >
        <label class="flyout-title" label="System Info" xalign={0.5} />

        <SectionTitle label="SYSTEM" />
        <box orientation={Gtk.Orientation.HORIZONTAL} spacing={12}>
          <box orientation={Gtk.Orientation.VERTICAL} spacing={2} hexpand>
            {Field("Hostname", hostname)}
            {Field("OS", osName)}
            {Field("Kernel", kernel)}
            {Field("Uptime", uptime)}
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
        <For each={disks}>{(d) => Field(d.model, () => d.size)}</For>
        {Field("Root usage", disk)}

        <Divider />

        <SectionTitle label="DISPLAY" />
        <For each={monitors}>{(m, i) => (
          <box orientation={Gtk.Orientation.VERTICAL} spacing={2}>
            <label class="system-info-monitor" label={`Monitor ${i + 1} — ${m.name}`} halign={Gtk.Align.START} xalign={0} />
            {Field("Resolution", () => `${m.width}x${m.height} @ ${Math.round(m.refreshRate)}Hz`)}
          </box>
        )}
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
        defaultHeight: 480,
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
      win.present()

      // Auto-dismiss on focus loss (150ms guard against focus handoff races).
      let focusTimer: ReturnType<typeof timeout> | null = null
      win.connect("notify::is-active", () => {
        if (win?.is_active) {
          if (focusTimer) {
            focusTimer.cancel()
            focusTimer = null
          }
        } else if (!focusTimer) {
          focusTimer = timeout(150, () => {
            focusTimer = null
            s.closeFlyouts()
          })
        }
      })
    } else {
      win?.destroy()
      win = null
    }
  })

  // Rebuild content when async data lands (gnim <For> over a State doesn't
  // re-render the once-built tree reliably). Only rebuild on real changes.
  let lastBuiltKey = ""
  createEffect(() => {
    const key = `${distroGlyph()}|${disks().length}|${monitors().length}|${disks().map((d) => d.size).join(",")}`
    if (key === lastBuiltKey) return
    lastBuiltKey = key
    if (win) win.set_child(SystemInfoContent())
  })

  return null
}
