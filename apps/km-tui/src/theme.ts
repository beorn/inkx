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

/** Select the appropriate theme based on terminal capabilities. */
export function selectThemeForCaps(caps: TerminalCaps): Theme {
  if (caps.colorLevel === "truecolor") {
    const base = caps.darkBackground ? defaultDarkTheme : defaultLightTheme
    return {
      ...base,
      // Neutral grays — no blue/Nord tint
      bg: "", // Use terminal's own background
      raisedbg: "#282828", // Subtle raise for dialogs
      separator: "#505050", // Neutral mid-gray
      text: "#D4D4D4", // Neutral white
      text2: "#A0A0A0", // Neutral light gray
      text3: "#707070", // Neutral mid-gray (counts, chrome)
      text4: "#505050", // Neutral dark gray (ghost text)
      // Warm accents
      primary: "#EBCB8B", // Gold
      selected: "#EBCB8B", // Selected = primary
      selectedfg: "#1A1A1A", // Dark on gold
      control: "#B8A06E", // Muted gold
      link: "#6CB6FF", // Clean blue
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

// Backward compat — remove after full migration
export { ansi16DarkTheme as kmDarkTheme, ansi16LightTheme as kmLightTheme } from "inkx"
