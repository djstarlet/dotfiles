import { Gtk } from "ags/gtk4"
import type { Accessor } from "gnim"

// Round tile in the Control Center action rows.
export function RoundTile(p: {
  label: string
  onClicked: () => void
  class?: string | Accessor<string>
  css?: string | Accessor<string>
  children: JSX.Element
}) {
  return (
    <box
      class="control-action-tile"
      orientation={Gtk.Orientation.VERTICAL}
      spacing={3}
      halign={Gtk.Align.CENTER}
    >
      <button
        hexpand={false}
        vexpand={false}
        halign={Gtk.Align.CENTER}
        valign={Gtk.Align.CENTER}
        class={p.class ?? "round-icon"}
        css={p.css}
        onClicked={p.onClicked}
      >
        {p.children}
      </button>
      <label class="control-action-label" label={p.label} />
    </box>
  )
}

// Square cap button on the bar itself.
export function BarCap(p: { open: Accessor<boolean>; onClicked: () => void; children: JSX.Element }) {
  return (
    <button
      valign={Gtk.Align.CENTER}
      halign={Gtk.Align.CENTER}
      class={p.open((o) => (o ? "bar-cap-button active" : "bar-cap-button"))}
      onClicked={p.onClicked}
    >
      {p.children}
    </button>
  )
}
