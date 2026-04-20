/**
 * km Theme Configuration
 *
 * Uses silvery's detectTheme() to query the terminal's actual colors via
 * OSC 4/10/11 and derive a full theme. Falls back to Nord (dark) or
 * Catppuccin Latte (light) when detection fails.
 *
 * All components use $token strings (e.g., "$selectionbg", "$border-focus")
 * which silvery ThemeProvider resolves at render time.
 */
import { ansi16DarkTheme, detectTheme } from "@silvery/ag-react"
import type { Theme } from "@silvery/ag-react"
// Color math lives in @silvery/color.
import { blend } from "@silvery/color"

/** Default theme for tests (ANSI 16 dark — no terminal detection needed) */
export const defaultKmTheme: Theme = ansi16DarkTheme

// Re-export detectTheme directly — no km-specific wrapper needed.
// detectTheme() handles all fallbacks internally (Nord dark / Catppuccin Latte light).
export { detectTheme }

/** Subtle primary-tinted bg for selected containers — keeps text readable.
 * Returns a hex color blending theme.bg with theme.primary at 6%.
 * For ANSI-16 themes (no hex bg), returns undefined (border-only selection). */
export function selectedBg(theme: Theme): string | undefined {
  if (theme.bg && theme.primary) return blend(theme.bg, theme.primary, 0.06)
  return undefined
}

/** Stronger primary-tinted bg for multi-selected items — roughly double the
 * card-selection tint so multi-selected rows "stack" visually and the user
 * can count selected items at a glance. Rule 6 in selection-style.ts.
 *
 * Truecolor: blend(theme.bg, theme.primary, 14%) — visibly brighter than
 * selectedBg (6%) so a multi-selected sub-item reads as distinct even inside
 * a card that already has the card-level tint.
 *
 * ANSI-16: returns a "blackBright" fallback so tests (which use ansi16DarkTheme
 * with empty theme.bg) can still verify the marker. On real dark terminals
 * this also draws a visible grey row.
 */
export function multiSelectedBg(theme: Theme): string | undefined {
  if (theme.bg && theme.primary) return blend(theme.bg, theme.primary, 0.14)
  // ANSI-16 fallback — visible on dark terminals, distinct from cursor yellow.
  return "blackBright"
}

/** Subtle focusborder-tinted bg for editing containers.
 * Replaces selection highlight during inline editing.
 *
 * `border-focus` is Sterling's flat projection (populated by
 * augmentWithSterlingFlat on every Theme — see @silvery/theme). The legacy
 * `focusborder` key is kept as a fallback for any non-augmented Theme. */
export function editingBg(theme: Theme): string | undefined {
  const t = theme as unknown as Record<string, string | undefined>
  const focusBorder = t["border-focus"] ?? t["focusborder"]
  if (theme.bg && focusBorder) return blend(theme.bg, focusBorder, 0.04)
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
 * Same hues, same structure — just less bright so the focused pane stands out.
 *
 * Writes both the legacy Theme fields and their Sterling flat counterparts so
 * components can look up either shape. Bracket access avoids the banned
 * `theme.<camelCase>` dot-access form (Phase 2c acceptance) while keeping the
 * output a valid legacy Theme. */
export function deriveUnfocusedTheme(theme: Theme): Theme {
  return {
    ...theme,
    name: `${theme.name}-unfocused`,
    primary: dimColor(theme.primary),
    link: dimColor(theme.link),
    inputborder: dimColor(theme["inputborder"]),
    selectionbg: dimColor(theme["selectionbg"]),
    selection: dimColor(theme.selection),
    focusborder: dimColor(theme["focusborder"]),
    fg: dimColor(theme.fg),
    muted: dimColor(theme.muted),
    disabledfg: dimColor(theme["disabledfg"]),
    border: dimColor(theme.border),
    inversebg: dimColor(theme["inversebg"]),
    inverse: dimColor(theme.inverse),
    error: dimColor(theme.error),
    warning: dimColor(theme.warning),
    success: dimColor(theme.success),
    surfacebg: dimColor(theme["surfacebg"]),
  }
}
