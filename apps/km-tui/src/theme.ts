/**
 * km Theme Configuration
 *
 * Uses inkx v2 theme tokens exclusively. No app-specific color constants.
 * Theme selection and primary color cycling managed via generateTheme().
 *
 * All components use $token strings (e.g., "$selected", "$focusring")
 * which inkx ThemeProvider resolves at render time.
 */
import { ansi16DarkTheme, ansi16LightTheme, defaultDarkTheme, defaultLightTheme, generateTheme } from "inkx"
import type { Theme, AnsiPrimary, TerminalCaps } from "inkx"

/** Default theme for km (ANSI 16 dark, primary=yellow) */
export const defaultKmTheme: Theme = ansi16DarkTheme

/** All ANSI 16 primary color options for cycling */
export const primaryColors = ["yellow", "cyan", "magenta", "green", "red", "blue", "white"] as const
export type PrimaryColor = (typeof primaryColors)[number]

/** Generate km theme with specific primary color */
export function kmTheme(primary: PrimaryColor, dark = true): Theme {
  return generateTheme(primary as AnsiPrimary, dark)
}

/** Adjust brightness of a hex color by a fixed amount per channel.
 * Positive delta = lighter, negative = darker. Clamped to [0, 255]. */
function adjustBrightness(hex: string, delta: number): string {
  const r = Math.max(0, Math.min(255, parseInt(hex.slice(1, 3), 16) + delta))
  const g = Math.max(0, Math.min(255, parseInt(hex.slice(3, 5), 16) + delta))
  const b = Math.max(0, Math.min(255, parseInt(hex.slice(5, 7), 16) + delta))
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`
}

/** Select the appropriate theme based on terminal capabilities.
 * When detectedBg is provided (from OSC 11 query), derive raisedbg and separator
 * from the actual terminal background for a neutral, matching tint. */
export function selectThemeForCaps(caps: TerminalCaps, detectedBg?: string | null): Theme {
  if (caps.colorLevel === "truecolor") {
    const dark = caps.darkBackground
    const base = dark ? defaultDarkTheme : defaultLightTheme
    // Derive surface colors from actual bg when detected, else use fallbacks
    const raisedbg = detectedBg ? adjustBrightness(detectedBg, dark ? 12 : -12) : "#3B3F47"
    const separator = detectedBg ? adjustBrightness(detectedBg, dark ? 20 : -20) : "#4C5060"
    return {
      ...base,
      bg: "", // Use terminal's own background
      raisedbg,
      separator,
      text: "#D4D4D4", // Neutral white
      text2: "#A0A0A0", // Neutral light gray
      text3: "#707070", // Neutral mid-gray (counts, chrome)
      text4: "#505050", // Neutral dark gray (ghost text)
      // Chrome (title bars, status bars) — inverted from normal
      chromebg: "#D4D4D4", // Light grey (text as background)
      chromefg: "#1A1A1A", // Dark text on chrome
      // Warm accents
      primary: "#EBCB8B", // Gold
      selected: "#EBCB8B", // Selected = primary
      selectedfg: "#1A1A1A", // Dark on gold
      control: "#B8A06E", // Muted gold
      link: "#A8DBFF", // Bright clean blue
      focusring: "#4A9EFF", // Bright blue
      // Status — warm tones
      error: "#E06C75", // Warm red
      warning: "#EBCB8B", // Gold
      success: "#98C379", // Warm green
    }
  }
  // ANSI 16 fallback
  return caps.darkBackground ? ansi16DarkTheme : ansi16LightTheme
}

/** Dim a single color value — same hue, reduced brightness.
 * Truecolor (#RRGGBB): multiply RGB by factor.
 * ANSI 16: map bright variants to normal (redBright→red). */
function dimColor(color: string, factor = 0.85): string {
  if (!color) return color
  if (color.startsWith("#") && color.length === 7) {
    const r = Math.round(parseInt(color.slice(1, 3), 16) * factor)
    const g = Math.round(parseInt(color.slice(3, 5), 16) * factor)
    const b = Math.round(parseInt(color.slice(5, 7), 16) * factor)
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`
  }
  // ANSI 16: bright → normal is the closest we can get to "dimming"
  if (color.endsWith("Bright")) return color.slice(0, -"Bright".length)
  return color
}

/** Derive an unfocused variant: every color is dimmed proportionally.
 * Same hues, same structure — just less bright so the focused pane stands out. */
export function deriveUnfocusedTheme(theme: Theme): Theme {
  return {
    ...theme,
    name: `${theme.name}-unfocused`,
    primary: dimColor(theme.primary),
    link: dimColor(theme.link),
    control: dimColor(theme.control),
    selected: dimColor(theme.selected),
    selectedfg: dimColor(theme.selectedfg),
    focusring: dimColor(theme.focusring),
    text: dimColor(theme.text),
    text2: dimColor(theme.text2),
    text3: dimColor(theme.text3),
    text4: dimColor(theme.text4),
    separator: dimColor(theme.separator),
    chromebg: dimColor(theme.chromebg),
    chromefg: dimColor(theme.chromefg),
    error: dimColor(theme.error),
    warning: dimColor(theme.warning),
    success: dimColor(theme.success),
    raisedbg: dimColor(theme.raisedbg),
  }
}

/** Derive a theme for selected/cursor rows: all accent and status colors
 * become selectedfg so text is always readable on $selected background. */
export function deriveSelectedTheme(theme: Theme): Theme {
  return {
    ...theme,
    name: `${theme.name}-selected`,
    primary: theme.selectedfg,
    link: theme.selectedfg,
    control: theme.selectedfg,
    error: theme.selectedfg,
    warning: theme.selectedfg,
    success: theme.selectedfg,
  }
}

// Backward compat — remove after full migration
export { ansi16DarkTheme as kmDarkTheme, ansi16LightTheme as kmLightTheme } from "inkx"
