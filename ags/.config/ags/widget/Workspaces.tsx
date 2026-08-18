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
      for (const id of born) {
        s.setWorkspaceFx((prev) => {
                    if (!s.workspaceIds().includes(id)) return prev
                    if (prev[id] !== undefined && prev[id] !== "dying" && prev[id] !== "collapsing") return prev
          const next = { ...prev }
          next[id] = "born"
          return next
        })
        timeout(540, () => {
          s.setWorkspaceFx((prev) => {
            if (String(prev[id]) !== "born" || !s.workspaceIds().includes(id)) return prev
            const next = { ...prev }
            next[id] = "settled"
            return next
          })
        })
      }
    }

    if (dying.length > 0) {
      for (const id of dying) {
        s.setWorkspaceFx((prev) => {
          if (s.workspaceIds().includes(id) || String(prev[id]) === "dying" || String(prev[id]) === "collapsing") return prev
          const next = { ...prev }
          next[id] = "dying"
          return next
        })
        timeout(540, () => {
          s.setWorkspaceFx((prev) => {
            if (String(prev[id]) !== "dying" || s.workspaceIds().includes(id)) return prev
            const next = { ...prev }
            ;(next as Record<number, string>)[id] = "collapsing"
            return next
          })
        })
        timeout(760, () => {
          s.setWorkspaceFx((prev) => {
            if (String(prev[id]) !== "collapsing" || s.workspaceIds().includes(id)) return prev
            const next = { ...prev }
            delete next[id]
            return next
          })
        })
      }
    }

    lastKnownIds = [...ids]
  })

  const vacantWorkspaceKey = createComputed(() => {
    const ids = s.workspaceIds()
    const fx = s.workspaceFx()
    return workspaceSlots
      .filter((id) => !ids.includes(id) && String(fx[id]) !== "dying")
      .join(",")
  })

  return (
    workspaceSlots.map((ws) => (
      <button
        class={createComputed(() => {
          const vacantIds = vacantWorkspaceKey().split(",").filter(Boolean).map(Number)
          const vacantBefore = vacantIds.filter((id) => id < ws).length
          const shiftCount = vacantBefore
          return `ws-dot ws-shift-${shiftCount}`
        })}
        canTarget={createComputed(() => s.workspaceIds().includes(ws))}
        $={(self) => {
          const middleClick = new Gtk.GestureClick({ button: 2 })
          middleClick.connect("pressed", () => {
            s.createNewDesktop()
          })
          self.add_controller(middleClick)
        }}
        onClicked={() => {
          s.switchToWorkspace(ws)
        }}
      >
        <box
          halign={Gtk.Align.CENTER}
          valign={Gtk.Align.CENTER}
          class={createComputed(() => {
            const current = s.activeWorkspace()
            const fx = s.workspaceFx()
            const isActive = current === ws
            const phase = String(fx[ws])
            const phaseClass = phase === "born" ? " born" : phase === "dying" ? " dying" : phase === "collapsing" ? " collapsing" : fx[ws] === undefined ? " unused" : ""
            return `ws-core${isActive ? " active" : ""}${phaseClass}`
          })}
          css={createComputed(() => {
            const colors = s.wsDotColors()
            const base = colors[(ws - 1) % 8] || DEFAULT_WS_DOT_COLORS[(ws - 1) % 8]
            const bg = `background: radial-gradient(circle at 32% 28%, ${mixHex(base, "#ffffff", 0.55)} 0%, ${mixHex(base, "#ffffff", 0.25)} 28%, ${base} 62%, ${darken(base, 0.55)} 100%);`
            return bg
          })}
        />
      </button>
    ))
  )
}
