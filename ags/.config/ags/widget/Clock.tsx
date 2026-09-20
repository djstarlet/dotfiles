import { Gtk } from "ags/gtk4"
import { createComputed } from "gnim"
import type { Store } from "./store"

// Single bar-centre button: visible with the clock widget; clickable only
// while the calendar widget is on.
export function ClockElement(s: Store) {
  return (
    <button
      $type="center"
      class={s.calendarOpen((open) => (open ? "clock active" : "clock"))}
      halign={Gtk.Align.CENTER}
      visible={createComputed(() => s.widgetsEnabled().clock)}
      canTarget={createComputed(() => s.widgetsEnabled().calendar)}
      onClicked={s.toggleCalendar}
    >
      <label
        class="clock-label center-label"
        label={s.centerDisplay}
        ellipsize={3}
        halign={Gtk.Align.CENTER}
        xalign={0.5}
      />
    </button>
  )
}
