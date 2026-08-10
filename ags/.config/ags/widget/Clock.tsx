import type { Store } from "./store"
import config from "./widgets.config"

export function ClockElement(s: Store) {
  if (config.clock && config.calendar) {
    return (
      <button
        $type="center"
        class={s.calendarOpen((open) => (open ? "clock active" : "clock"))}
        onClicked={s.toggleCalendar}
      >
        <label class="clock-label center-label" label={s.centerDisplay} />
      </button>
    )
  }

  if (config.clock && !config.calendar) {
    return <label $type="center" class="clock-label center-label" label={s.clock} />
  }

  return null
}
