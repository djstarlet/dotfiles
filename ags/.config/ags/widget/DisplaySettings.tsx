import { createComputed } from "gnim"
import type { Store } from "./store"
import { RoundTile } from "./buttons"

// Control Center tile that opens nwg-displays (monitor layout GUI).
// The windowrule in hyprland.conf floats and centers it.
export function DisplaySettingsTile(s: Store) {
  return (
    <RoundTile
      label="Display"
      visible={createComputed(() => s.widgetsEnabled().displaySettings)}
      onClicked={s.openDisplaySettings}
    >
      <label class="display-icon" label={"\uf108"} />
    </RoundTile>
  )
}
