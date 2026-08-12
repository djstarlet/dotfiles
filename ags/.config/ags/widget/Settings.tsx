import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
const { TOP, RIGHT } = Astal.WindowAnchor
import { execAsync } from "ags/process"
import { createComputed, createEffect, createState, For } from "gnim"
import type { Store } from "./store"
import { DEFAULT_WS_DOT_COLORS } from "./store"
import { theme } from "./theme.config"
import type { ThemeConfig } from "./theme.config"
import type { Rgb } from "./color-utils"
import { hexToRgb, rgbToHex, mixHex, lighten, darken } from "./color-utils"

const controlFlyoutMarginEnd = 18
type ColorName = "background" | "accent" | "text" | "dot"
const PRESET_COLORS = ["#0f2235", "#f6faff", "#dbe7f5", "#55adff", "#326fda", "#ff5a5a", "#ff9f43", "#6ddb6d", "#a06bff", "#ff6bb3", "#22c1c3", "#f0c33c"]

export default function SettingsWindows(gdkmonitor: Gdk.Monitor, monitorIndex: number, s: Store) {
  const [bgInput, setBgInput] = createState("#f6faff")
  const [accentInput, setAccentInput] = createState("#55adff")
  const [textInput, setTextInput] = createState("#0f2235")
  const [customOpen, setCustomOpen] = createState(false)
  const [customChannel, setCustomChannel] = createState<ColorName>("background")
  const [customDotIndex, setCustomDotIndex] = createState<number | null>(null)
  const [customRed, setCustomRed] = createState(246)
  const [customGreen, setCustomGreen] = createState(250)
  const [customBlue, setCustomBlue] = createState(255)
  const validColor = (value: string) => /^#[0-9a-fA-F]{6}$/.test(value)

  const customHex = createComputed(() => rgbToHex([customRed(), customGreen(), customBlue()]))
  const customPreviewCss = createComputed(() => `background: ${customHex()};`)

  const setCustomRgbFromHex = (hex: string) => {
    const [red, green, blue] = hexToRgb(hex)
    setCustomRed(red)
    setCustomGreen(green)
    setCustomBlue(blue)
  }

  const colorInput = (name: ColorName) => {
    if (name === "dot") {
      const index = customDotIndex()
      return index === null ? DEFAULT_WS_DOT_COLORS[0] : s.wsDotColors()[index] || DEFAULT_WS_DOT_COLORS[index]
    }
    return name === "background" ? bgInput() : name === "accent" ? accentInput() : textInput()
  }
  const colorSetter = (name: ColorName) => name === "background" ? setBgInput : name === "accent" ? setAccentInput : name === "text" ? setTextInput : () => {}

  const applyColor = (name: ColorName, value: string, setValue: (value: string) => void) => {
    const hex = value.trim()
    if (!validColor(hex)) {
      s.setSettingsStatus("Invalid color")
      return
    }

    if (name === "dot") {
      const index = customDotIndex()
      if (index === null) return
      s.setWsDotColor(index, hex)
      return execAsync(["bash", "-c", `$HOME/.config/ags/settings.sh set ws-dot ${index + 1} '${hex}'`])
        .then(() => s.setSettingsStatus(`Workspace dot ${index + 1} updated`))
        .catch(() => s.setSettingsStatus("Failed to set workspace dot"))
    }

    setValue(hex)
    if (customChannel() === name) setCustomRgbFromHex(hex)

    return execAsync(["bash", "-c", `$HOME/.config/ags/settings.sh set color ${name} '${hex}'`])
      .then(() => {
        const background = name === "background" ? hex : bgInput()
        const accent = name === "accent" ? hex : accentInput()
        const text = name === "text" ? hex : textInput()
        app.apply_css(`
          window {
            --bar-bg: ${background};
            --bar-bg-light: ${lighten(background)};
            --bar-bg-dark: ${darken(background, 0.12)};
            --bar-accent: ${accent};
            --bar-accent-light: ${lighten(accent)};
            --bar-accent-dark: ${darken(accent)};
            --bar-accent-pale: ${mixHex(accent, "#ffffff", 0.65)};
            --bar-text: ${text};
            --bar-text-dim: ${mixHex(text, "#6a7a8c", 0.35)};
          }
        `, false)
        s.setSettingsStatus("Colors applied")
      })
      .catch(() => s.setSettingsStatus("Failed to set color"))
  }

  const activePreset = createComputed(() =>
    theme.presets.find((preset) =>
      preset.background.toLowerCase() === bgInput().toLowerCase() && preset.accent.toLowerCase() === accentInput().toLowerCase() && preset.text.toLowerCase() === textInput().toLowerCase()
    )?.name || null
  )

  const applyPreset = async (preset: ThemeConfig["presets"][number]) => {
    await applyColor("background", preset.background, setBgInput)
    await applyColor("accent", preset.accent, setAccentInput)
    await applyColor("text", preset.text, setTextInput)
    for (const [index, hex] of preset.dots.entries()) {
      s.setWsDotColor(index, hex)
      await execAsync(["bash", "-c", `$HOME/.config/ags/settings.sh set ws-dot ${index + 1} '${hex}'`])
    }
    s.setSettingsStatus(`${preset.name} applied`)
  }

  const selectCustomChannel = (name: ColorName) => {
    setCustomChannel(name)
    setCustomRgbFromHex(colorInput(name))
  }

  const updateCustomComponent = (component: "red" | "green" | "blue", value: number) => {
    if (component === "red") setCustomRed(value)
    if (component === "green") setCustomGreen(value)
    if (component === "blue") setCustomBlue(value)
    const rgb: Rgb = [
      component === "red" ? value : customRed(),
      component === "green" ? value : customGreen(),
      component === "blue" ? value : customBlue(),
    ]
    applyColor(customChannel(), rgbToHex(rgb), colorSetter(customChannel()))
  }

  createEffect(() => {
    if (!customOpen()) setCustomDotIndex(null)
  })

  createEffect(() => {
    if (s.settingsOpen()) {
      execAsync(["bash", "-c", "$HOME/.config/ags/settings.sh get colors"])
        .then((out) => {
          try {
            const colors = JSON.parse(out) as { background?: string; accent?: string; text?: string }
            if (colors.background && validColor(colors.background)) setBgInput(colors.background)
            if (colors.accent && validColor(colors.accent)) setAccentInput(colors.accent)
            if (colors.text && validColor(colors.text)) setTextInput(colors.text)
          } catch { /* ignored */ }
        })
        .catch(() => null)
    }
  })

  return [
    <window
        visible={createComputed(() => s.settingsOpen())}
        name={`ags-settings-${monitorIndex}`}
        class="FlyoutWindow"
        gdkmonitor={gdkmonitor}
        anchor={TOP | RIGHT}
        layer={Astal.Layer.OVERLAY}
        keymode={Astal.Keymode.ON_DEMAND}
        exclusivity={Astal.Exclusivity.IGNORE}
        marginTop={48}
        application={app}
      >
        <box hexpand halign={Gtk.Align.END} marginEnd={controlFlyoutMarginEnd}>
          <box
            class="flyout settings-flyout"
            orientation={Gtk.Orientation.VERTICAL}
            spacing={0}
            vexpand
            marginBottom={40}
          >
            <Gtk.ScrolledWindow
              vexpand
              hexpand
              heightRequest={640}
              overlayScrolling
            >
              <box orientation={Gtk.Orientation.VERTICAL} spacing={8}>
                <centerbox>
                  <box $type="start" widthRequest={34} />
                  <label $type="center" class="flyout-title" label="Theme" xalign={0.5} />
                  <box $type="end" widthRequest={34} />
                </centerbox>

                <Gtk.Separator orientation={Gtk.Orientation.HORIZONTAL} />

            {/* GTK Theme */}
            <box class="settings-row" orientation={Gtk.Orientation.VERTICAL} spacing={4}>
              <label label="GTK Theme" xalign={0} />
              <button class="settings-dropdown" onClicked={() => {
                if (s.activeList() === "theme" && s.listPopupOpen()) {
                  s.setListPopupOpen(false)
                  s.setActiveList(null)
                } else {
                  s.setActiveList("theme")
                  s.setListPopupOpen(true)
                }
              }}>
                <label label={s.currentTheme((v) => v || "GTK theme...")} xalign={0} hexpand />
              </button>
            </box>

            {/* Icon Theme */}
            <box class="settings-row" orientation={Gtk.Orientation.VERTICAL} spacing={4}>
              <label label="Icon Theme" xalign={0} />
              <button class="settings-dropdown" onClicked={() => {
                if (s.activeList() === "icon" && s.listPopupOpen()) {
                  s.setListPopupOpen(false)
                  s.setActiveList(null)
                } else {
                  s.setActiveList("icon")
                  s.setListPopupOpen(true)
                }
              }}>
                <label label={s.currentIcon((v) => v || "Icon theme...")} xalign={0} hexpand />
              </button>
            </box>

            {/* Font */}
            <box class="settings-row" orientation={Gtk.Orientation.VERTICAL} spacing={4}>
              <label label="Font" xalign={0} />
              <button class="settings-dropdown" onClicked={() => {
                if (s.activeList() === "font" && s.listPopupOpen()) {
                  s.setListPopupOpen(false)
                  s.setActiveList(null)
                } else {
                  s.setActiveList("font")
                  s.setListPopupOpen(true)
                }
              }}>
                <label label={s.currentFont((v) => v || "Font...")} xalign={0} hexpand />
              </button>
            </box>

            {/* Cursor */}
            <box class="settings-row" orientation={Gtk.Orientation.VERTICAL} spacing={4}>
              <label label="Cursor" xalign={0} />
              <box orientation={Gtk.Orientation.HORIZONTAL} spacing={6}>
                <button class="settings-dropdown" hexpand halign={Gtk.Align.FILL} onClicked={() => {
                  if (s.activeList() === "cursor" && s.listPopupOpen()) {
                    s.setListPopupOpen(false)
                    s.setActiveList(null)
                  } else {
                    s.setActiveList("cursor")
                    s.setListPopupOpen(true)
                  }
                }}>
                  <label label={s.currentCursor((v) => v || "Cursor theme...")} xalign={0} hexpand />
                </button>
                <Gtk.Entry
                  class="settings-entry settings-size-entry"
                  placeholderText="Size"
                  widthRequest={56}
                  widthChars={4}
                  maxWidthChars={4}
                  text={s.cursorSizeInput()}
                  tooltipText="Size \u2014 press Enter to apply"
                  onActivate={(self) => {
                    const size = self.get_text().trim() || "24"
                    s.setCursorSizeInput(size)
                    const theme = s.currentCursor()
                    if (theme) {
                      execAsync(["bash", "-c", `$HOME/.config/ags/settings.sh set cursor '${theme}' ${size}`])
                        .then(() => s.setSettingsStatus(`Cursor size set to ${size}`))
                        .catch(() => s.setSettingsStatus("Failed to set cursor size"))
                    }
                  }}
                />
              </box>
            </box>

            {/* Wallpaper */}
            <box class="settings-row" orientation={Gtk.Orientation.VERTICAL} spacing={4}>
              <label label="Wallpaper" xalign={0} />
              <button class="action" onClicked={() => {
                s.setSettingsStatus("Choosing wallpaper...")
                execAsync(["bash", "-c", "$HOME/.config/ags/pick-file.py"])
                  .then((out) => {
                    const path = out.trim()
                    if (!path) { s.setSettingsStatus(""); return }
                    execAsync(["bash", "-c", `$HOME/.config/ags/settings.sh set wallpaper '${path}'`])
                      .then(() => s.setSettingsStatus("Wallpaper set"))
                      .catch(() => s.setSettingsStatus("Failed to set wallpaper"))
                  })
                  .catch(() => s.setSettingsStatus("Failed to open file picker"))
              }}>
                <label label="Choose wallpaper..." />
              </button>
            </box>

            <Gtk.Separator orientation={Gtk.Orientation.HORIZONTAL} />

            <box class="settings-row" orientation={Gtk.Orientation.VERTICAL} spacing={4}>
              <label label="Color Presets" xalign={0} />
              <button class="settings-dropdown" onClicked={() => {
                if (s.activeList() === "preset" && s.listPopupOpen()) {
                  s.setListPopupOpen(false)
                  s.setActiveList(null)
                } else {
                  s.setActiveList("preset")
                  s.setListPopupOpen(true)
                }
              }}>
                <label label={activePreset((name) => name || "Custom...")} xalign={0} hexpand />
              </button>
            </box>

            <Gtk.Separator orientation={Gtk.Orientation.HORIZONTAL} />

            <label class="flyout-title" label="Colors" xalign={0} />

            <box
              class="settings-custom-panel"
              orientation={Gtk.Orientation.VERTICAL}
              spacing={6}
              visible={createComputed(() => customOpen())}
            >
              <box orientation={Gtk.Orientation.HORIZONTAL} spacing={4}>
                <button class={customChannel((active) => `settings-channel-button${active === "background" ? " active" : ""}`)} onClicked={() => {
                  setCustomDotIndex(null)
                  selectCustomChannel("background")
                }}>
                  <label label="Background" />
                </button>
                <button class={customChannel((active) => `settings-channel-button${active === "accent" ? " active" : ""}`)} onClicked={() => {
                  setCustomDotIndex(null)
                  selectCustomChannel("accent")
                }}>
                  <label label="Accent" />
                </button>
                <button class={customChannel((active) => `settings-channel-button${active === "text" ? " active" : ""}`)} onClicked={() => {
                  setCustomDotIndex(null)
                  selectCustomChannel("text")
                }}>
                  <label label="Text" />
                </button>
              </box>

              <box
                orientation={Gtk.Orientation.HORIZONTAL}
                spacing={3}
                visible={createComputed(() => customDotIndex() !== null)}
              >
                {DEFAULT_WS_DOT_COLORS.map((_, index) => (
                  <button
                    class={customDotIndex((active) => `settings-channel-button${active === index ? " active" : ""}`)}
                    onClicked={() => {
                      setCustomDotIndex(index)
                      setCustomChannel("dot")
                      setCustomRgbFromHex(s.wsDotColors()[index] || DEFAULT_WS_DOT_COLORS[index])
                    }}
                  >
                    <label label={String(index + 1)} />
                  </button>
                ))}
              </box>

              <box orientation={Gtk.Orientation.HORIZONTAL} spacing={6}>
                <box class="settings-color-preview" css={customPreviewCss} />
                <label label={customHex} xalign={0} />
              </box>

              <box class="settings-custom-row" orientation={Gtk.Orientation.HORIZONTAL} spacing={6}>
                <label label="R" widthRequest={12} />
                <Gtk.Scale
                  orientation={Gtk.Orientation.HORIZONTAL}
                  drawValue={false}
                  hexpand
                  adjustment={new Gtk.Adjustment({ lower: 0, upper: 255, stepIncrement: 1, pageIncrement: 16, value: customRed() })}
                  onValueChanged={(self) => updateCustomComponent("red", Math.round(self.get_value()))}
                />
                <label label={customRed((value) => String(value))} widthRequest={28} xalign={1} />
              </box>

              <box class="settings-custom-row" orientation={Gtk.Orientation.HORIZONTAL} spacing={6}>
                <label label="G" widthRequest={12} />
                <Gtk.Scale
                  orientation={Gtk.Orientation.HORIZONTAL}
                  drawValue={false}
                  hexpand
                  adjustment={new Gtk.Adjustment({ lower: 0, upper: 255, stepIncrement: 1, pageIncrement: 16, value: customGreen() })}
                  onValueChanged={(self) => updateCustomComponent("green", Math.round(self.get_value()))}
                />
                <label label={customGreen((value) => String(value))} widthRequest={28} xalign={1} />
              </box>

              <box class="settings-custom-row" orientation={Gtk.Orientation.HORIZONTAL} spacing={6}>
                <label label="B" widthRequest={12} />
                <Gtk.Scale
                  orientation={Gtk.Orientation.HORIZONTAL}
                  drawValue={false}
                  hexpand
                  adjustment={new Gtk.Adjustment({ lower: 0, upper: 255, stepIncrement: 1, pageIncrement: 16, value: customBlue() })}
                  onValueChanged={(self) => updateCustomComponent("blue", Math.round(self.get_value()))}
                />
                <label label={customBlue((value) => String(value))} widthRequest={28} xalign={1} />
              </box>
            </box>

            <box class="settings-row" orientation={Gtk.Orientation.HORIZONTAL} spacing={6}>
              <label label="Background" xalign={0} hexpand />
              <Gtk.Entry
                class="settings-entry settings-size-entry"
                placeholderText="#rrggbb"
                widthChars={7}
                maxWidthChars={7}
                text={bgInput()}
                onNotifyText={(self) => setBgInput(self.text)}
                onActivate={(self) => applyColor("background", self.get_text(), setBgInput)}
              />
            </box>
            <box orientation={Gtk.Orientation.HORIZONTAL} spacing={4}>
              {PRESET_COLORS.map((c) => (
                <button class="settings-swatch" css={`background: ${c};`} onClicked={() => applyColor("background", c, setBgInput)} />
              ))}
              <button class="settings-swatch settings-custom-swatch" onClicked={() => {
                setCustomDotIndex(null)
                setCustomChannel("background")
                setCustomRgbFromHex(bgInput())
                setCustomOpen(true)
              }}>
                <label label={"\u{F1FB}"} />
              </button>
            </box>

            <box class="settings-row" orientation={Gtk.Orientation.HORIZONTAL} spacing={6}>
              <label label="Accent" xalign={0} hexpand />
              <Gtk.Entry
                class="settings-entry settings-size-entry"
                placeholderText="#rrggbb"
                widthChars={7}
                maxWidthChars={7}
                text={accentInput()}
                onNotifyText={(self) => setAccentInput(self.text)}
                onActivate={(self) => applyColor("accent", self.get_text(), setAccentInput)}
              />
            </box>
            <box orientation={Gtk.Orientation.HORIZONTAL} spacing={4}>
              {PRESET_COLORS.map((c) => (
                <button class="settings-swatch" css={`background: ${c};`} onClicked={() => applyColor("accent", c, setAccentInput)} />
              ))}
              <button class="settings-swatch settings-custom-swatch" onClicked={() => {
                setCustomDotIndex(null)
                setCustomChannel("accent")
                setCustomRgbFromHex(accentInput())
                setCustomOpen(true)
              }}>
                <label label={"\u{F1FB}"} />
              </button>
            </box>

            <box class="settings-row" orientation={Gtk.Orientation.HORIZONTAL} spacing={6}>
              <label label="Text" xalign={0} hexpand />
              <Gtk.Entry
                class="settings-entry settings-size-entry"
                placeholderText="#rrggbb"
                widthChars={7}
                maxWidthChars={7}
                text={textInput()}
                onNotifyText={(self) => setTextInput(self.text)}
                onActivate={(self) => applyColor("text", self.get_text(), setTextInput)}
              />
            </box>
            <box orientation={Gtk.Orientation.HORIZONTAL} spacing={4}>
              {PRESET_COLORS.map((c) => (
                <button class="settings-swatch" css={`background: ${c};`} onClicked={() => applyColor("text", c, setTextInput)} />
              ))}
              <button class="settings-swatch settings-custom-swatch" onClicked={() => {
                setCustomDotIndex(null)
                setCustomChannel("text")
                setCustomRgbFromHex(textInput())
                setCustomOpen(true)
              }}>
                <label label={"\u{F1FB}"} />
              </button>
            </box>

            <box class="settings-row" orientation={Gtk.Orientation.VERTICAL} spacing={4}>
              <label label="Workspace Dots" xalign={0} />
              <box orientation={Gtk.Orientation.HORIZONTAL} spacing={4}>
                {DEFAULT_WS_DOT_COLORS.map((fallback, index) => (
                  <button
                    class="settings-swatch"
                    css={s.wsDotColors((colors) => `background: ${colors[index] || fallback};`)}
                    onClicked={() => {
                      setCustomDotIndex(index)
                      setCustomChannel("dot")
                      setCustomRgbFromHex(s.wsDotColors()[index] || fallback)
                      setCustomOpen(true)
                    }}
                  >
                    <label label={String(index + 1)} />
                  </button>
                ))}
                <button class="action" onClicked={() => {
                  s.resetWsDotColors()
                  execAsync(["bash", "-c", "$HOME/.config/ags/settings.sh reset ws-dots"])
                    .then(() => s.setSettingsStatus("Workspace dots reset"))
                    .catch(() => s.setSettingsStatus("Failed to reset workspace dots"))
                }}>
                  <label label="Reset" />
                </button>
              </box>
            </box>

              </box>
            </Gtk.ScrolledWindow>

            <label
              class="settings-status"
              label={s.settingsStatus}
              xalign={0.5}
              visible={createComputed(() => s.settingsStatus() !== "")}
            />
          </box>
        </box>
      </window>,
      <window
        visible={createComputed(() => s.listPopupOpen() && s.activeList() !== null)}
        name={`ags-settings-list-${monitorIndex}`}
        class="FlyoutWindow"
        gdkmonitor={gdkmonitor}
        anchor={TOP | RIGHT}
        layer={Astal.Layer.OVERLAY}
        keymode={Astal.Keymode.ON_DEMAND}
        exclusivity={Astal.Exclusivity.IGNORE}
        marginTop={120}
        application={app}
      >
        <box hexpand halign={Gtk.Align.END} marginEnd={controlFlyoutMarginEnd}>
          <button class="DismissSurface" hexpand vexpand canTarget onClicked={() => {
            s.setListPopupOpen(false)
            s.setActiveList(null)
          }} />
          <box
            class="flyout settings-list-popup"
            orientation={Gtk.Orientation.VERTICAL}
            spacing={8}
            marginBottom={40}
          >
            <label class="flyout-title" label={createComputed(() => {
              const kind = s.activeList()
              if (kind === "theme") return "GTK Theme"
              if (kind === "icon") return "Icon Theme"
              if (kind === "font") return "Fonts"
              if (kind === "cursor") return "Cursor Theme"
              if (kind === "preset") return "Color Presets"
              return ""
            })} xalign={0.5} />
            <Gtk.Separator orientation={Gtk.Orientation.HORIZONTAL} />
            <Gtk.ScrolledWindow heightRequest={220} widthRequest={300} overlayScrolling={false}>
              <box class="settings-list" orientation={Gtk.Orientation.VERTICAL}>
                <For each={createComputed(() => {
                  const kind = s.activeList()
                  if (kind === "theme") return s.themeList()
                  if (kind === "icon") return s.iconList()
                  if (kind === "font") return s.fontList()
                  if (kind === "cursor") return s.cursorList()
                  if (kind === "preset") return theme.presets.map((preset) => preset.name)
                  return []
                })}>
                  {(item) => (
                    <button class="settings-item" onClicked={() => {
                      const kind = s.activeList()
                      if (kind === "theme") {
                        execAsync(["bash", "-c", `$HOME/.config/ags/settings.sh set theme '${item}'`])
                          .then(() => s.setCurrentTheme(item))
                          .catch(() => null)
                      } else if (kind === "icon") {
                        execAsync(["bash", "-c", `$HOME/.config/ags/settings.sh set icon '${item}'`])
                          .then(() => s.setCurrentIcon(item))
                          .catch(() => null)
                      } else if (kind === "font") {
                        execAsync(["bash", "-c", `$HOME/.config/ags/settings.sh set font '${item}'`])
                          .then(() => s.setCurrentFont(item))
                          .catch(() => null)
                      } else if (kind === "cursor") {
                        const size = s.cursorSizeInput()
                        execAsync(["bash", "-c", `$HOME/.config/ags/settings.sh set cursor '${item}' ${size}`])
                          .then(() => s.setCurrentCursor(item))
                          .catch(() => null)
                      } else if (kind === "preset") {
                        const preset = theme.presets.find((candidate) => candidate.name === item)
                        if (preset) void applyPreset(preset).catch(() => s.setSettingsStatus("Failed to apply preset"))
                      }
                      s.setListPopupOpen(false)
                      s.setActiveList(null)
                    }}>
                      <label label={item} xalign={0} hexpand />
                    </button>
                  )}
                </For>
              </box>
            </Gtk.ScrolledWindow>
          </box>
          <button class="DismissSurface" hexpand vexpand canTarget onClicked={() => {
            s.setListPopupOpen(false)
            s.setActiveList(null)
          }} />
        </box>
      </window>
  ]
}
