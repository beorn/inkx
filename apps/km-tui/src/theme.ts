/**
 * km Theme Configuration
 *
 * Delegates fully to themex for theme derivation. At startup, km detects
 * the terminal's actual colors via OSC queries and derives a matching theme.
 * Falls back to built-in themes (Nord dark / Catppuccin Latte light) when
 * detection fails.
 *
 * All components use $token strings (e.g., "$selection", "$focusborder")
 * which inkx ThemeProvider resolves at render time.
 */
import { ansi16DarkTheme, ansi16LightTheme, detectTheme } from "inkx"
import type { Theme, TerminalCaps } from "inkx"

/** Default theme for tests (ANSI 16 dark — no terminal detection needed) */
export const defaultKmTheme: Theme = ansi16DarkTheme

/**
 * Detect the terminal's theme from its actual colors.
 *
 * - Truecolor terminals: queries OSC 4/10/11 for the real palette,
 *   fills gaps from Nord (dark) or Catppuccin Latte (light), derives
 *   a full 33-token theme via themex.
 * - ANSI 16 terminals: uses named ANSI colors that adapt to whatever
 *   terminal theme the user has configured.
 */
export async function detectTerminalTheme(caps: TerminalCaps): Promise<Theme> {
  if (caps.colorLevel !== "truecolor") {
    // ANSI 16 — colors adapt to the terminal's palette automatically
    return caps.darkBackground ? ansi16DarkTheme : ansi16LightTheme
  }
  // Truecolor — detect actual terminal colors and derive theme
  return detectTheme()
}

/** Dim a single color value — same hue, reduced brightness.
 * Truecolor (#RRGGBB): multiply RGB by factor.
 * ANSI 16: map bright variants to normal (redBright->red). */
function dimColor(color: string, factor = 0.85): string {
  if (!color) return color
  if (color.startsWith("#") && color.length === 7) {
    const r = Math.round(parseInt(color.slice(1, 3), 16) * factor)
    const g = Math.round(parseInt(color.slice(3, 5), 16) * factor)
    const b = Math.round(parseInt(color.slice(5, 7), 16) * factor)
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`
  }
  // ANSI 16: bright -> normal is the closest we can get to "dimming"
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
    inputborder: dimColor(theme.inputborder),
    selection: dimColor(theme.selection),
    selectionfg: dimColor(theme.selectionfg),
    focusborder: dimColor(theme.focusborder),
    fg: dimColor(theme.fg),
    mutedfg: dimColor(theme.mutedfg),
    disabledfg: dimColor(theme.disabledfg),
    border: dimColor(theme.border),
    inverse: dimColor(theme.inverse),
    inversefg: dimColor(theme.inversefg),
    error: dimColor(theme.error),
    warning: dimColor(theme.warning),
    success: dimColor(theme.success),
    surface: dimColor(theme.surface),
  }
}
