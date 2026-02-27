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
      selected: base.primary, // selected = primary (gold in dark, blue in light)
      link: "#81A1C1", // Nord blue for links
    }
  }
  // ANSI 16 fallback
  return caps.darkBackground ? ansi16DarkTheme : ansi16LightTheme
}

// Backward compat — remove after full migration
export { ansi16DarkTheme as kmDarkTheme, ansi16LightTheme as kmLightTheme } from "inkx"
