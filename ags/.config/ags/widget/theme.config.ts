export type ThemeConfig = {
  defaults: {
    background: string
    accent: string
    text: string
  }
  workspaceDotColors: string[]
  presets: {
    name: string
    background: string
    accent: string
    text: string
    dots: string[]
  }[]
}

export const theme: ThemeConfig = {
  defaults: {
    background: "#f6faff",
    accent: "#55adff",
    text: "#0f2235",
  },
  workspaceDotColors: [
    "#ef3d34",
    "#f0a114",
    "#24a337",
    "#3b83e6",
    "#9b5ad7",
    "#28a9a0",
    "#e96f3a",
    "#cf5398",
  ],
  presets: [
    {
      name: "Dots",
      background: "#dbe7f5",
      accent: "#76abff",
      text: "#4c4f69",
      dots: ["#d20f39", "#fe640b", "#df8e1d", "#40a02b", "#179299", "#04a5e5", "#7287fd", "#ea76cb"],
    },
    {
      name: "Colorblind Safe (Light)",
      background: "#ffffff",
      accent: "#0072B2",
      text: "#000000",
      dots: ["#000000", "#E69F00", "#56B4E9", "#009E73", "#F0E442", "#0072B2", "#D55E00", "#CC79A7"],
    },
    {
      name: "Colorblind Safe (Dark)",
      background: "#1a1a1a",
      accent: "#56B4E9",
      text: "#f2f2f2",
      dots: ["#999999", "#E69F00", "#56B4E9", "#009E73", "#F0E442", "#0072B2", "#D55E00", "#CC79A7"],
    },
    {
      name: "High Contrast (Light)",
      background: "#ffffff",
      accent: "#0000ff",
      text: "#000000",
      dots: ["#d00000", "#b05a00", "#8a6f00", "#008000", "#007f7f", "#0000cc", "#5a00a8", "#c00080"],
    },
    {
      name: "High Contrast (Dark)",
      background: "#000000",
      accent: "#ffff00",
      text: "#ffffff",
      dots: ["#ff4040", "#ff8c00", "#ffff00", "#00ff66", "#00ffff", "#3388ff", "#bb66ff", "#ff66cc"],
    },
    {
      name: "Nord",
      background: "#2e3440",
      accent: "#88c0d0",
      text: "#d8dee9",
      dots: ["#bf616a", "#d08770", "#ebcb8b", "#a3be8c", "#8fbcbb", "#81a1c1", "#5e81ac", "#b48ead"],
    },
    {
      name: "Catppuccin Mocha",
      background: "#1e1e2e",
      accent: "#89b4fa",
      text: "#cdd6f4",
      dots: ["#f38ba8", "#fab387", "#f9e2af", "#a6e3a1", "#94e2d5", "#74c7ec", "#cba6f7", "#f5c2e7"],
    },
    {
      name: "Catppuccin Latte",
      background: "#eff1f5",
      accent: "#1e66f5",
      text: "#4c4f69",
      dots: ["#d20f39", "#fe640b", "#df8e1d", "#40a02b", "#179299", "#04a5e5", "#7287fd", "#ea76cb"],
    },
    {
      name: "Gruvbox Dark",
      background: "#282828",
      accent: "#d79921",
      text: "#ebdbb2",
      dots: ["#cc241d", "#d65d0e", "#d79921", "#98971a", "#689d6a", "#458588", "#b16286", "#a89984"],
    },
    {
      name: "Tokyo Night",
      background: "#1a1b26",
      accent: "#7aa2f7",
      text: "#c0caf5",
      dots: ["#f7768e", "#ff9e64", "#e0af68", "#9ece6a", "#73daca", "#7dcfff", "#bb9af7", "#db4b4b"],
    },
    {
      name: "Dracula",
      background: "#282a36",
      accent: "#bd93f9",
      text: "#f8f8f2",
      dots: ["#ff5555", "#ffb86c", "#f1fa8c", "#50fa7b", "#8be9fd", "#6272a4", "#bd93f9", "#ff79c6"],
    },
  ],
}
