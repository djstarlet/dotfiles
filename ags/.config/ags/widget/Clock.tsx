import { Gtk } from "ags/gtk4"
import type { Store } from "./store"
import config from "./widgets.config"

export function ClockElement(s: Store) {
  if (config.clock && config.calendar) {
    return (
      <button
        $type="center"
        class={s.calendarOpen((open) => (open ? "clock active" : "clock"))}
        halign={Gtk.Align.CENTER}
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

  if (config.clock && !config.calendar) {
    return <label $type="center" class="clock-label center-label" label={s.clock} />
  }

  return null
}
