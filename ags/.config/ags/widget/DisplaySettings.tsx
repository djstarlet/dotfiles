import type { Store } from "./store"
import config from "./widgets.config"
import { RoundTile } from "./buttons"

// Control Center tile that opens nwg-displays (monitor layout GUI).
// The windowrule in hyprland.conf floats and centers it.
export function DisplaySettingsTile(s: Store) {
  if (!config.displaySettings) return null
  return (
    <RoundTile label="Display" onClicked={s.openDisplaySettings}>
      <label class="display-icon" label={"\uf108"} />
    </RoundTile>
  )
}
