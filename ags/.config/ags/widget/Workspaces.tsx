import { Gtk } from "ags/gtk4"
import { execAsync } from "ags/process"
import { createComputed, createEffect } from "gnim"
import { timeout } from "ags/time"
import type { Store } from "./store"
import { DEFAULT_WS_DOT_COLORS } from "./store"
import { darken, mixHex } from "./color-utils"
import config from "./widgets.config"

const workspaceSlots = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

export function WorkspacesElement(s: Store) {
  let lastWorkspaceIds: number[] = []
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

  return (
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
            return `ws-core${isActive ? " active" : ""}${phase}`
          })}
          css={createComputed(() => {
            const colors = s.wsDotColors()
            const base = colors[(ws - 1) % 8] || DEFAULT_WS_DOT_COLORS[(ws - 1) % 8]
            return `background: radial-gradient(circle at 32% 28%, ${mixHex(base, "#ffffff", 0.55)} 0%, ${mixHex(base, "#ffffff", 0.25)} 28%, ${base} 62%, ${darken(base, 0.55)} 100%);`
          })}
        />
      </button>
    ))}</>
  )
}
