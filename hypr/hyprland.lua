-- Hyprland Lua config (0.57+, git HEAD).
-- Legacy backup: hyprland.conf (kept untouched).
-- NOTE: if this config errors, Hyprland provides emergency binds
--   SUPER+Q (terminal), SUPER+R (hyprland-run), SUPER+M (exit).

-- Runtime home lookup: lua exec_cmd does not expand ~.
local home = os.getenv("HOME")

-- ============ MONITORS ============
-- TODO: nwg-displays writes monitors.conf in LEGACY (hyprlang) syntax, which the
-- Lua config cannot `source`. Monitor rules are NOT currently applied here.
-- Either port them to hl.monitor({...}) below / a required monitors.lua, or keep
-- nwg-displays output separate and convert it manually.
-- Example:
-- hl.monitor({ output = "DP-1", mode = "preferred", position = "auto", scale = "auto" })

-- ============ ENV ============
hl.env("XCURSOR_THEME", "Adwaita")
hl.env("XCURSOR_SIZE", "24")

-- ============ PLUGINS ============
-- DISABLED: hyprexpo does not compile against Hyprland git HEAD (9999) yet —
-- upstream header refactor (Window.hpp moved). The stale 0.56.2 .so has been
-- moved to hyprexpo.so.stale-0562. Re-enable this line (and the ALT+Tab bind
-- below) when the plugin git syncs with the refactor.

-- ============ AUTOSTART ============
hl.on("hyprland.start", function()
    hl.exec_cmd(home .. "/.config/ags/start-bar.sh")
    hl.exec_cmd("albert")
    hl.exec_cmd("hyprpm reload -n")
    hl.exec_cmd(home .. "/.config/hypr/scripts/start-wallpaper.sh")
    hl.exec_cmd("wl-paste --watch wl-clip-persist --clipboard regular")
    hl.exec_cmd("gentoo-pipewire-launcher")
end)

-- ============ INPUT ============
hl.config({
    input = {
        kb_layout = "us",
        follow_mouse = 0,
    },
})

-- ============ GENERAL ============
hl.config({
    general = {
        gaps_in = 3,
        gaps_out = 10,
        resize_on_border = true,
        border_size = 2,
        -- Metallic white/grey gradient borders for all windows.
        col = {
            active_border = "rgba(ffffffff)",
            inactive_border = "rgba(939daaff)",
        },
    },
})

-- ============ DECORATION ============
hl.config({
    decoration = {
        rounding = 6,
        shadow = {
            enabled = true,
            range = 16,
            render_power = 2,
            -- AGS sets this at runtime via `hyprctl keyword decoration:shadow:color`
            -- to follow the theme accent (intensity controlled by AGS_GLOW_ALPHA).
            -- Fallback = default accent (#55adff) at ~9% opacity.
            color = "rgba(55adff18)",
            color_inactive = "rgba(0000002a)",
        },
        blur = {
            enabled = true,
            size = 3,
            passes = 1,
        },
    },
})

-- ============ MISC ============
hl.config({
    misc = {
        force_default_wallpaper = 0,
        animate_manual_resizes = true,
        animate_mouse_windowdragging = true,
    },
})

-- ============ ANIMATIONS ============
hl.curve("default", { type = "bezier", points = { { 0.12, 0.92 }, { 0.08, 1.0 } } })
hl.curve("wind", { type = "bezier", points = { { 0.12, 0.92 }, { 0.08, 1.0 } } })
hl.curve("overshot", { type = "bezier", points = { { 0.18, 0.95 }, { 0.22, 1.03 } } })
hl.curve("graceful", { type = "bezier", points = { { 0.22, 1.0 }, { 0.36, 1.0 } } })
hl.curve("liner", { type = "bezier", points = { { 1, 1 }, { 1, 1 } } })
hl.curve("barSlideIn", { type = "bezier", points = { { 0.18, 1.08 }, { 0.28, 1.0 } } })

hl.animation({ leaf = "windows", enabled = true, speed = 5, bezier = "wind", style = "popin 60%" })
hl.animation({ leaf = "windowsIn", enabled = true, speed = 6, bezier = "overshot", style = "popin 60%" })
hl.animation({ leaf = "windowsOut", enabled = true, speed = 5, bezier = "graceful", style = "popin 72%" })
hl.animation({ leaf = "windowsMove", enabled = true, speed = 5, bezier = "graceful", style = "slide" })
hl.animation({ leaf = "layers", enabled = true, speed = 4, bezier = "default", style = "slide" })
hl.animation({ leaf = "layersIn", enabled = true, speed = 5, bezier = "barSlideIn", style = "slide" })
hl.animation({ leaf = "layersOut", enabled = true, speed = 4, bezier = "default", style = "slide" })
hl.animation({ leaf = "fadeIn", enabled = true, speed = 7, bezier = "default" })
hl.animation({ leaf = "fadeOut", enabled = true, speed = 7, bezier = "default" })
hl.animation({ leaf = "fadeSwitch", enabled = true, speed = 7, bezier = "default" })
hl.animation({ leaf = "fadeShadow", enabled = false })
hl.animation({ leaf = "fadeDim", enabled = true, speed = 7, bezier = "default" })
hl.animation({ leaf = "fadeLayers", enabled = true, speed = 7, bezier = "default" })
hl.animation({ leaf = "workspaces", enabled = true, speed = 5, bezier = "overshot", style = "slidevert" })
hl.animation({ leaf = "border", enabled = false })
hl.animation({ leaf = "borderangle", enabled = false })

-- ============ KEYBINDS ============
local mainMod = "SUPER"

hl.bind(mainMod .. " + Q", hl.dsp.exec_cmd("kitty"))
-- Albert stays on ALT+SPACE regardless of mainMod (public repo uses SUPER as mainMod).
hl.bind("ALT + space", hl.dsp.exec_cmd("albert show"))
hl.bind(mainMod .. " + F", hl.dsp.exec_cmd("librewolf"))
hl.bind(mainMod .. " + E", hl.dsp.exec_cmd("pcmanfm"))

hl.bind(mainMod .. " + V", hl.dsp.window.float({ action = "toggle" }))
hl.bind(mainMod .. " + F4", hl.dsp.exec_cmd(home .. "/.config/hypr/scripts/close-window-epic.sh"))
hl.bind(mainMod .. " + c", hl.dsp.exec_cmd(home .. "/.config/hypr/scripts/close-window-epic.sh"))
hl.bind(mainMod .. " + SHIFT + C", hl.dsp.exec_cmd(home .. "/.config/hypr/scripts/force-kill-active.sh"))

-- Move/resize with mouse
hl.bind(mainMod .. " + mouse:272", hl.dsp.window.drag(), { mouse = true })
hl.bind(mainMod .. " + mouse:273", hl.dsp.window.resize(), { mouse = true })

-- DISABLED: hyprexpo plugin is not loaded on git HEAD (see PLUGINS above),
-- so this dispatcher doesn't exist. Re-enable with the plugin line.
-- hl.bind(mainMod .. " + Tab", hl.dsp.exec_cmd("hyprctl dispatch hyprexpo:expo toggle"))
hl.bind(mainMod .. " + SHIFT + grave", hl.dsp.exec_cmd("hyprctl reload"))

-- Workspaces 1-5
for i = 1, 5 do
    hl.bind(mainMod .. " + " .. i, hl.dsp.focus({ workspace = i }))
    hl.bind(mainMod .. " + SHIFT + " .. i, hl.dsp.window.move({ workspace = i }))
end

-- Utils
hl.bind("Print", hl.dsp.exec_cmd(home .. "/.config/hypr/scripts/take-screenshot.sh screen"))
hl.bind("SHIFT + Print", hl.dsp.exec_cmd(home .. "/.config/hypr/scripts/take-screenshot.sh area"))
hl.bind(mainMod .. " + SHIFT + S", hl.dsp.exec_cmd(home .. "/.config/hypr/scripts/take-screenshot.sh area"))

-- Layout change
-- NOTE: `hyprctl keyword` against config values in Lua mode is unverified on
-- 0.57+; if it errors, try `hyprctl eval 'hl.config({general={layout="dwindle"}})'`.
hl.bind(mainMod .. " + L", hl.dsp.exec_cmd('hyprctl keyword general:layout "dwindle"'))
hl.bind(mainMod .. " + SHIFT + L", hl.dsp.exec_cmd('hyprctl keyword general:layout "master"'))

-- ============ WINDOW RULES (unified) ============
hl.window_rule({
    name = "wallpaper-chooser",
    match = { title = "^(Choose Wallpaper)$" },
    float = true,
    center = true,
})
hl.window_rule({
    name = "portal-desktop",
    match = { class = "^(org\\.freedesktop\\.impl\\.portal\\.desktop\\.hyprland)$" },
    float = true,
    center = true,
})
hl.window_rule({
    name = "pavucontrol",
    match = { class = "^(org\\.pulseaudio\\.pavucontrol|pavucontrol)$" },
    float = true,
    center = true,
})
hl.window_rule({
    name = "color-pickers",
    match = { title = "^(Select Color|Select a Color)$" },
    float = true,
    center = true,
})
hl.window_rule({
    name = "ags-gjs",
    match = { class = "^(ags|gjs)$" },
    float = true,
    center = true,
})
hl.window_rule({
    name = "nwg-displays",
    match = { class = "^(nwg-displays)$" },
    float = true,
    center = true,
    size = "80% 80%",
})
-- Albert launcher: centered float, no blur, no border. `suppress_event = "maximize"`
-- works around Hyprland 86c24e2e forcing XDG_TOPLEVEL_STATE_MAXIMIZED on every map.
hl.window_rule({
    name = "albert",
    match = { class = "^(albert)$" },
    float = true,
    center = true,
    no_blur = true,
    decorate = false,
    suppress_event = "maximize",
})
-- AGS Gtk.ApplicationWindow panels (System Info, Widgets): real toplevels,
-- floated + centered. The title still matches the window's title property.
hl.window_rule({
    name = "ags-panels",
    match = { title = "^(System Info|Widgets)$" },
    float = true,
    center = true,
})
-- Swayimg (screenshot notification viewer): float + centre so images get their
-- natural size instead of being squashed into a tiling slot.
hl.window_rule({
    name = "swayimg",
    match = { class = "^(swayimg)$" },
    float = true,
    center = true,
})
