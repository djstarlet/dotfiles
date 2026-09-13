// Mac-style per-app Quick Actions rows: picked by the focused window's class
// when the menu opens; unknown apps fall back to the generic edit shortcuts.
export type ShortcutDef = { label: string; hint: string; mod: string; key: string }
export const SHORTCUT_FALLBACK: ShortcutDef[] = [
  { label: "Save", hint: "Ctrl+S", mod: "CTRL", key: "s" },
  { label: "Undo", hint: "Ctrl+Z", mod: "CTRL", key: "z" },
  { label: "Redo", hint: "Ctrl+Shift+Z", mod: "CTRL_SHIFT", key: "z" },
  { label: "Cut", hint: "Ctrl+X", mod: "CTRL", key: "x" },
  { label: "Copy", hint: "Ctrl+C", mod: "CTRL", key: "c" },
  { label: "Paste", hint: "Ctrl+V", mod: "CTRL", key: "v" },
  { label: "Select All", hint: "Ctrl+A", mod: "CTRL", key: "a" },
]
export const SHORTCUT_PRESETS: Record<string, ShortcutDef[]> = {
  kitty: [
    { label: "Copy", hint: "Ctrl+Shift+C", mod: "CTRL_SHIFT", key: "c" },
    { label: "Paste", hint: "Ctrl+Shift+V", mod: "CTRL_SHIFT", key: "v" },
    { label: "New Tab", hint: "Ctrl+Shift+T", mod: "CTRL_SHIFT", key: "t" },
    { label: "Close Tab", hint: "Ctrl+Shift+W", mod: "CTRL_SHIFT", key: "w" },
    { label: "New Window", hint: "Ctrl+Shift+Enter", mod: "CTRL_SHIFT", key: "Return" },
  ],
  librewolf: [
    { label: "New Tab", hint: "Ctrl+T", mod: "CTRL", key: "t" },
    { label: "Close Tab", hint: "Ctrl+W", mod: "CTRL", key: "w" },
    { label: "Reopen Closed Tab", hint: "Ctrl+Shift+T", mod: "CTRL_SHIFT", key: "t" },
    { label: "Find", hint: "Ctrl+F", mod: "CTRL", key: "f" },
    { label: "Reload", hint: "Ctrl+R", mod: "CTRL", key: "r" },
    { label: "Copy", hint: "Ctrl+C", mod: "CTRL", key: "c" },
    { label: "Paste", hint: "Ctrl+V", mod: "CTRL", key: "v" },
  ],
  pcmanfm: [
    { label: "Copy", hint: "Ctrl+C", mod: "CTRL", key: "c" },
    { label: "Paste", hint: "Ctrl+V", mod: "CTRL", key: "v" },
    { label: "Select All", hint: "Ctrl+A", mod: "CTRL", key: "a" },
    { label: "Rename", hint: "F2", mod: "", key: "F2" },
    { label: "Move to Trash", hint: "Del", mod: "", key: "Delete" },
    { label: "Properties", hint: "Alt+Return", mod: "ALT", key: "Return" },
  ],
}
