## Widgets
- clock (center of the bar) - opens the calendar flyout
- workspace dots (1-12) - click to switch, middle-click makes a new desktop
- desktop menu (top left) - quick actions for the focused app, app launcher (albert), screenshot, and desktop tools (new desktop, close current, overview, move window)
- control center (gear) - volume (wpctl + pavucontrol), brightness (Hyprland screen shader), Wi-Fi toggle (nmcli), network settings (nmtui), power menu
- power menu - lock, logout, reboot, shutdown (with a confirm step)
- calendar flyout - month view plus your next Google Calendar events
  - Google Calendar: click the calendar in the bar, then Sign in (you'll need your own OAuth client_id from Google Cloud - the dialog walks you through it)
  - events refresh every 6 seconds; your token lives in ~/.config/ags/google-calendar-auth.json (gitignored)
- the bar auto-hides - move the cursor to the top edge to bring it back
