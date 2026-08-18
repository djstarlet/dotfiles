import { Gtk } from "ags/gtk4"
import { execAsync } from "ags/process"
import { createComputed, createEffect } from "gnim"
import { timeout } from "ags/time"
import type { Store } from "./store"
import { DEFAULT_WS_DOT_COLORS } from "./store"
import { darken, mixHex } from "./color-utils"
import config from "./widgets.config"

export function WorkspacesElement(s: Store) {
  let lastKnownIds: number[] = []
  createEffect(() => {
    const ids = s.workspaceIds()
    const born = ids.filter((id) => !lastKnownIds.includes(id))
    const dying = lastKnownIds.filter((id) => !ids.includes(id))

    if (born.length === 0 && dying.length === 0) {
      lastKnownIds = [...ids]
      return
    }

    if (born.length > 0) {
      timeout(16, () => {
        s.setWorkspaceFx((prev) => {
          const next = { ...prev }
          for (const id of born) next[id] = "born"
          return next
        })
      })
      timeout(280, () => {
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

    lastKnownIds = [...ids]
  })

  const visibleWorkspaceIds = createComputed(() => {
    const ids = s.workspaceIds()
    const fx = s.workspaceFx()
    const dying = Object.entries(fx)
      .filter(([id, phase]) => phase === "dying" && !ids.includes(Number(id)))
      .map(([id]) => Number(id))

    return [...new Set([...ids, ...dying])].sort((a, b) => a - b)
  })

  return (
    <>{visibleWorkspaceIds().map((ws) => (
      <button
        widthRequest={22}
        heightRequest={22}
        class="ws-dot"
        canTarget={createComputed(() => s.workspaceIds().includes(ws))}
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
            const phase = fx[ws] === "born" || fx[ws] === "dying" ? ` ${fx[ws]}` : fx[ws] === undefined ? " unused" : ""
            return `ws-core${isActive ? " active" : ""}${phase}`
          })}
          css={createComputed(() => {
            const colors = s.wsDotColors()
            const base = colors[(ws - 1) % 8] || DEFAULT_WS_DOT_COLORS[(ws - 1) % 8]
            const bg = `background: radial-gradient(circle at 32% 28%, ${mixHex(base, "#ffffff", 0.55)} 0%, ${mixHex(base, "#ffffff", 0.25)} 28%, ${base} 62%, ${darken(base, 0.55)} 100%);`
            const fx = s.workspaceFx()
            if (fx[ws] === "born") {
              return `${bg}transform: scale(0.94) translateY(2px); opacity: 0.75;`
            }
            if (fx[ws] === "dying") {
              return `${bg}transform: scale(0.22) translateY(3px); opacity: 0;`
            }
            return bg
          })}
        />
      </button>
    ))}</>
  )
}
