import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { execAsync } from "ags/process"
import { createComputed } from "gnim"
import type { Store } from "./store"
import config from "./widgets.config"

export default function CalendarWindows(gdkmonitor: Gdk.Monitor, monitorIndex: number, s: Store) {
  const { TOP, LEFT, RIGHT } = Astal.WindowAnchor
  // Top-level calendar auth status check
  if (config.calendar) {
    ;(async () => {
      try {
        const out = await execAsync(["bash", "-lc", "$HOME/.config/ags/calendar-auth.sh status"])
        try {
          const parsed = JSON.parse(out)
          if (parsed.signed_in && parsed.email) {
            s.setCalendarAccountEmail(parsed.email)
          }
        } catch { /* ignored */ }
      } catch { /* ignored */ }
    })()
  }

  return [
      <window
        visible={s.calendarOpen}
        name={`ags-calendar-${monitorIndex}`}
        class="FlyoutWindow"
        gdkmonitor={gdkmonitor}
        anchor={TOP | LEFT | RIGHT}
        layer={Astal.Layer.OVERLAY}
        keymode={Astal.Keymode.ON_DEMAND}
        exclusivity={Astal.Exclusivity.IGNORE}
        marginTop={42}
        application={app}
      >
        <box hexpand>
          <button class="DismissSurface" hexpand vexpand canTarget onClicked={s.closeFlyouts} />
          <box class="flyout calendar-flyout" orientation={Gtk.Orientation.VERTICAL} spacing={10} marginBottom={40}>
            <centerbox>
              <box $type="start" widthRequest={34} />
              <label $type="center" class="flyout-title" label="Calendar" xalign={0.5} />
              <button $type="end" class="calendar-account-btn" onClicked={s.handleAccountClick}
                tooltipText={s.calendarAccountEmail((e) => e ? "Sign out" : "Sign in to Google Calendar")}>
                <label class="calendar-account-icon" label={"\u{F007}"} />
              </button>
            </centerbox>
            <Gtk.Calendar class="calendar-widget" />
            <Gtk.Separator orientation={Gtk.Orientation.HORIZONTAL} />
            <label class="events-title" label="Google Calendar" xalign={0.5} />

            <label class="events" label={s.gcalEvents} xalign={0.5} wrap justify={Gtk.Justification.CENTER} />
          </box>
          <button class="DismissSurface" hexpand vexpand canTarget onClicked={s.closeFlyouts} />
        </box>
      </window>,

      <window
        visible={s.authDialogOpen}
        name={`ags-calendar-auth-${monitorIndex}`}
        class="FlyoutWindow"
        gdkmonitor={gdkmonitor}
        anchor={TOP | LEFT | RIGHT}
        layer={Astal.Layer.OVERLAY}
        keymode={Astal.Keymode.ON_DEMAND}
        exclusivity={Astal.Exclusivity.IGNORE}
        marginTop={42}
        application={app}
      >
        <box hexpand>
          <button class="DismissSurface" hexpand vexpand canTarget onClicked={s.closeAuthDialog} />
          <box class="flyout calendar-auth-dialog" orientation={Gtk.Orientation.VERTICAL} spacing={10} marginBottom={40}>
            <label class="flyout-title" label="Sign in to Google Calendar" xalign={0.5} />
            <Gtk.Separator orientation={Gtk.Orientation.HORIZONTAL} />

            {/* State A: need_code - device_code set */}
            <box class="auth-instructions" orientation={Gtk.Orientation.VERTICAL} spacing={6} marginTop={4}
              visible={createComputed(() => !!s.authDialogInfo().device_code)}>
              <label label="Go to this URL and enter the code:" xalign={0.5} wrap />
               <label class="auth-url" label={createComputed(() => s.authDialogInfo().verification_url || "-")} xalign={0.5} wrap selectable />
               <label class="auth-code" label={createComputed(() => s.authDialogInfo().user_code || "-")} xalign={0.5} />
            </box>

            {/* State B: client_id missing */}
            <box class="auth-setup" orientation={Gtk.Orientation.VERTICAL} spacing={6} marginTop={4}
              visible={createComputed(() => s.isClientIdMissing())}>
              <label label="No OAuth client_id found. Create one at:" xalign={0.5} wrap />
              <box orientation={Gtk.Orientation.HORIZONTAL} spacing={6} halign={Gtk.Align.CENTER}>
                <label class="auth-url" label="https://console.cloud.google.com/" xalign={0.5} wrap selectable />
                <button class="action" onClicked={() => execAsync(["bash", "-lc",
                  "(command -v xdg-open >/dev/null 2>&1 && xdg-open 'https://console.cloud.google.com/') || true"
                ]).catch(() => null)}>
                  <label label="Open" />
                </button>
              </box>
              <Gtk.Entry
                class="auth-entry"
                placeholderText="Paste your OAuth client_id (xxxx.apps.googleusercontent.com)"
                text={s.clientIdInput()}
                onNotifyText={(self) => s.setClientIdInput(self.text)}
                halign={Gtk.Align.CENTER}
              />
            </box>

            {/* State C: other errors */}
            <label class="auth-error" label={createComputed(() => s.authDialogInfo().error)} xalign={0.5} wrap
              visible={createComputed(() => s.authDialogInfo().error !== "" && !s.isClientIdMissing())} />

            <box orientation={Gtk.Orientation.HORIZONTAL} spacing={10} halign={Gtk.Align.CENTER} marginTop={6}>
              <button class="action" onClicked={s.closeAuthDialog}>
                <label label="Cancel" />
              </button>
              <button class="action" onClicked={s.saveClientIdAndLogin}
                visible={createComputed(() => s.isClientIdMissing())}>
                <label label="Save & Sign in" />
              </button>
              <button class="action" onClicked={s.startAuthPoll}
                visible={createComputed(() => !!s.authDialogInfo().device_code)}>
                <label label="I've authorized" />
              </button>
            </box>
          </box>
          <button class="DismissSurface" hexpand vexpand canTarget onClicked={s.closeAuthDialog} />
        </box>
      </window>,
  ]
}
