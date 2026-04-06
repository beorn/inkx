/**
 * km Theme Configuration
 *
 * Uses silvery's detectTheme() to query the terminal's actual colors via
 * OSC 4/10/11 and derive a full theme. Falls back to Nord (dark) or
 * Catppuccin Latte (light) when detection fails.
 *
 * All components use $token strings (e.g., "$selection-bg", "$focusborder")
 * which silvery ThemeProvider resolves at render time.
 */
import { ansi16DarkTheme, detectTheme } from "@silvery/ag-react"
import type { Theme } from "@silvery/ag-react"
// Color math: @silvery/theme re-exports blend(), brighten(), darken(), hexToRgb(), etc. from @silvery/color.
import { blend } from "@silvery/theme"

/** Default theme for tests (ANSI 16 dark — no terminal detection needed) */
export const defaultKmTheme: Theme = ansi16DarkTheme

// Re-export detectTheme directly — no km-specific wrapper needed.
// detectTheme() handles all fallbacks internally (Nord dark / Catppuccin Latte light).
export { detectTheme }

/** Subtle primary-tinted bg for selected containers — keeps text readable.
 * Returns a hex color blending theme.bg with theme.primary at 12%.
 * For ANSI-16 themes (no hex bg), returns undefined (border-only selection). */
export function selectedBg(theme: Theme): string | undefined {
  if (theme.bg && theme.primary) return blend(theme.bg, theme.primary, 0.12)
  return undefined
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
    selectionbg: dimColor(theme.selectionbg),
    selection: dimColor(theme.selection),
    focusborder: dimColor(theme.focusborder),
    fg: dimColor(theme.fg),
    muted: dimColor(theme.muted),
    disabledfg: dimColor(theme.disabledfg),
    border: dimColor(theme.border),
    inversebg: dimColor(theme.inversebg),
    inverse: dimColor(theme.inverse),
    error: dimColor(theme.error),
    warning: dimColor(theme.warning),
    success: dimColor(theme.success),
    surfacebg: dimColor(theme.surfacebg),
  }
}
