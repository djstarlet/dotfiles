import { Gtk } from "ags/gtk4"
import type { Store } from "./store"
import config from "./widgets.config"

// Control Center tile that opens nwg-displays (monitor layout GUI).
// The windowrule in hyprland.conf floats and centers it.
export function DisplaySettingsTile(s: Store) {
  if (!config.displaySettings) return null
  return (
    <box class="control-action-tile" widthRequest={68} orientation={Gtk.Orientation.VERTICAL} spacing={3} halign={Gtk.Align.CENTER}>
      <button
        widthRequest={44} heightRequest={44}
        hexpand={false} vexpand={false}
        halign={Gtk.Align.CENTER} valign={Gtk.Align.CENTER}
        class="round-icon"
        onClicked={s.openDisplaySettings}
      >
        <label class="display-icon" label={"\uf108"} />
      </button>
      <label class="control-action-label" label="Display" />
    </box>
  )
}