import app from "ags/gtk4/app"
import { Gtk } from "ags/gtk4"
import { execAsync } from "ags/process"
import { createPoll } from "ags/time"
import { createEffect, createState } from "gnim"
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

function parseGpuModel(raw: string) {
  // "03:00.0 VGA compatible controller: AMD/ATI ..." -> after ": "
  const m = String(raw).match(/VGA compatible controller:\s*(.+)/i)
  return m ? m[1].trim() : "Unknown"
}

function parseResolution(raw: string) {
  try {
    const monitors = JSON.parse(raw)
    if (Array.isArray(monitors) && monitors[0]) {
      const m = monitors[0]
      return `${m.width}x${m.height} @ ${Math.round(m.refreshRate)}Hz`
    }
  } catch {
    // fall through to xrandr
  }
  return ""
}

// ─── Static field helpers ─────────────────────────────────────────────────────

function Field(label: string, value: () => string) {
  return (
    <box orientation={Gtk.Orientation.HORIZONTAL} spacing={8}>
      <label class="system-info-label" label={label} widthRequest={120} xalign={1} halign={Gtk.Align.END} />
      <label class="system-info-value" label={value} hexpand xalign={0} halign={Gtk.Align.START} ellipsize={3 /* PANGO_ELLIPSIZE_END */} />
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
  const [resolution, setResolution] = createState("…")

  createEffect(() => {
    if (!s.systemInfoOpen()) return
    execAsync(["hostname", "-s"]).then(setHostname).catch(() => setHostname("unknown"))
    execAsync(["bash", "-c", "cat /etc/os-release"]).then((out) => setOsName(parseOsName(out))).catch(() => setOsName("unknown"))
    execAsync(["uname", "-r"]).then(setKernel).catch(() => setKernel("unknown"))
    execAsync(["bash", "-c", `lscpu | grep "Model name"`]).then((out) => setCpu(parseCpuModel(out))).catch(() => setCpu("unknown"))
    execAsync(["bash", "-c", `lspci | grep -i vga | head -1`]).then((out) => setGpu(parseGpuModel(out))).catch(() => setGpu("unknown"))
    execAsync(["bash", "-c", `hyprctl monitors -j | python3 -c "import json,sys; m=json.load(sys.stdin)[0]; print(f\\"{m['width']}x{m['height']} @ {m['refreshRate']:.0f}Hz\\")"`])
      .then(setResolution)
      .catch(() =>
        execAsync(["bash", "-c", `xrandr | grep '*' | head -1 | awk '{print $1}'`])
          .then((out) => setResolution(out.trim() || "unknown"))
          .catch(() => setResolution("unknown")),
      )
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
        {Field("Hostname", hostname)}
        {Field("OS", osName)}
        {Field("Kernel", kernel)}
        {Field("Uptime", uptime)}

        <Divider />

        <SectionTitle label="HARDWARE" />
        {Field("CPU", cpu)}
        {Field("Memory", memory)}
        {Field("GPU", gpu)}
        {Field("Disk", disk)}

        <Divider />

        <SectionTitle label="DISPLAY" />
        {Field("Resolution", resolution)}
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
    } else {
      win?.destroy()
      win = null
    }
  })

  return null
}
