export type Rgb = [number, number, number]

export function hexToRgb(hex: string): Rgb {
  const value = hex.slice(1)
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ]
}

export function rgbToHex([r, g, b]: Rgb) {
  return `#${[r, g, b].map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("")}`
}

export function mixHex(hex: string, target: string, amount: number) {
  const [r, g, b] = hexToRgb(hex)
  const [tr, tg, tb] = hexToRgb(target)
  return rgbToHex([
    r + (tr - r) * amount,
    g + (tg - g) * amount,
    b + (tb - b) * amount,
  ])
}

export function lighten(hex: string, amount = 0.2) {
  return mixHex(hex, "#ffffff", amount)
}

export function darken(hex: string, amount = 0.2) {
  return mixHex(hex, "#000000", amount)
}

// Hyprland window-shadow "glow" (decoration:shadow:color) follows the theme
// accent. AGS_GLOW_ALPHA (two hex digits, default `18` ≈ 9% opacity) controls
// the intensity — raise it for a stronger glow, lower it to soften further.
export function hyprAccentGlow(accent: string): string {
  const alpha = (typeof process !== "undefined" && process.env.AGS_GLOW_ALPHA) || "18"
  return `rgba(${accent.replace(/^#/, "")}${String(alpha).replace(/^#/, "")})`
}
