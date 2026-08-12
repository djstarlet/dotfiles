import app from "ags/gtk4/app"
import style from "./style.css"
import { execAsync } from "ags/process"

import Bar from "./widget/Bar"
import { lighten, darken, mixHex } from "./widget/color-utils"
import { theme } from "./widget/theme.config"

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)
}

function injectThemeColors(background: string, accent: string, text: string) {
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
}

app.start({
  css: style,
  iconTheme: "Adwaita",
  requestHandler(argv, response) {
    if (argv[0] === "quit") {
      app.quit(0)
      response("ok")
    }
    response("unknown command")
  },
  main() {
    execAsync(["bash", "-c", "$HOME/.config/ags/settings.sh get colors"])
      .then((out) => {
        try {
          const colors = JSON.parse(out) as { background?: string; accent?: string; text?: string }
          injectThemeColors(
            isHexColor(colors.background) ? colors.background : theme.defaults.background,
            isHexColor(colors.accent) ? colors.accent : theme.defaults.accent,
            isHexColor(colors.text) ? colors.text : theme.defaults.text,
          )
        } catch {
          injectThemeColors(theme.defaults.background, theme.defaults.accent, theme.defaults.text)
        }
      })
      .catch(() => injectThemeColors(theme.defaults.background, theme.defaults.accent, theme.defaults.text))

    app.get_monitors().map(Bar)
  },
})
