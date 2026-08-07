import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"

export default function MinimalTest(gdkmonitor: Gdk.Monitor) {
  return (
    <window
      visible={true}
      name="ags-minimal-test"
      class="MinimalTestWindow"
      gdkmonitor={gdkmonitor}
      anchor={Astal.WindowAnchor.TOP | Astal.WindowAnchor.LEFT}
      layer={Astal.Layer.TOP}
      keymode={Astal.Keymode.NONE}
      exclusivity={Astal.Exclusivity.IGNORE}
      marginTop={100}
      marginStart={100}
      application={app}
    >
      <box orientation={Gtk.Orientation.VERTICAL} spacing={20} hexpand vexpand>
        <box css="background: lime; min-height: 200px; min-width: 350px;" />
        <button onClicked={() => print('Button clicked!')}>Test Button</button>
      </box>
    </window>
  )
}
