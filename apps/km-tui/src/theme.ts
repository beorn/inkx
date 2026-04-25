/**
 * km Theme Configuration
 *
 * Uses silvery's `detectTheme()` to query the terminal's actual colors via
 * OSC 4/10/11 and derive a full theme. Falls back to Nord (dark) or
 * Catppuccin Latte (light) when detection fails.
 *
 * Components read Sterling flat tokens (`$fg-accent`, `$bg-surface-default`,
 * `$border-focus`, …) via `theme[key]` lookup — see Sterling's design-system.md.
 * Every shipped silvery Theme has these baked on at construction by
 * `inlineSterlingTokens`.
 */
import { ansi16DarkTheme, detectTheme } from "@silvery/ag-react"
import type { Theme } from "@silvery/ag-react"
// Color math lives in @silvery/color.
import { blend } from "@silvery/color"

/** Default theme for tests (ANSI 16 dark — no terminal detection needed). */
export const defaultKmTheme: Theme = ansi16DarkTheme

// Re-export detectTheme directly — no km-specific wrapper needed.
// detectTheme() handles all fallbacks internally (Nord dark / Catppuccin Latte light).
export { detectTheme }

/** Bracket-access helper — Sterling flat tokens live as hyphen-keyed root
 * siblings on every Theme (baked via `inlineSterlingTokens`). This avoids the
 * banned `theme.<camelCase>` dot-access form. */
function sterlingToken(theme: Theme, key: string): string | undefined {
  const value = (theme as unknown as Record<string, unknown>)[key]
  return typeof value === "string" ? value : undefined
}

/** Resolve the canvas background for blend math.
 *
 * Reads the legacy `bg` first (still the surface consumers write to) and
 * falls back to Sterling's `bg-surface-default` when legacy is absent
 * (hand-crafted Themes bypassing `inlineSterlingTokens`). Swap the order
 * once silvery's legacy Theme shape is retired — see bead
 * `km-silvery.sterling-2e-interior-migration`. */
function canvasBg(theme: Theme): string | undefined {
  return sterlingToken(theme, "bg") ?? sterlingToken(theme, "bg-surface-default")
}

/** Resolve the accent hex for blend math.
 *
 * Reads legacy `primary` first — silvery's legacy derivation picks the
 * scheme yellow/blue by mode, and km-tui's selection tint has been tuned
 * against that. Falls back to Sterling's `bg-accent` for Themes without
 * legacy fields. Swap after Phase F retires the legacy shape. */
function accentHex(theme: Theme): string | undefined {
  return sterlingToken(theme, "primary") ?? sterlingToken(theme, "bg-accent")
}

/** Subtle accent-tinted bg for selected containers — keeps text readable.
 * Returns a hex color blending the canvas with the accent at 6%.
 * For ANSI-16 themes (no hex bg), returns undefined (border-only selection). */
export function selectedBg(theme: Theme): string | undefined {
  const bg = canvasBg(theme)
  const accent = accentHex(theme)
  if (bg && accent && bg.startsWith("#") && accent.startsWith("#")) {
    return blend(bg, accent, 0.06)
  }
  return undefined
}

/** Stronger accent-tinted bg for multi-selected items — roughly double the
 * card-selection tint so multi-selected rows "stack" visually and the user
 * can count selected items at a glance. Rule 6 in selection-style.ts.
 *
 * Truecolor: blend(canvas, accent, 14%) — visibly brighter than
 * selectedBg (6%) so a multi-selected sub-item reads as distinct even inside
 * a card that already has the card-level tint.
 *
 * ANSI-16: returns a "blackBright" fallback so tests (which use ansi16DarkTheme
 * with empty theme.bg) can still verify the marker. On real dark terminals
 * this also draws a visible grey row.
 */
export function multiSelectedBg(theme: Theme): string | undefined {
  const bg = canvasBg(theme)
  const accent = accentHex(theme)
  if (bg && accent && bg.startsWith("#") && accent.startsWith("#")) {
    return blend(bg, accent, 0.14)
  }
  // ANSI-16 fallback — visible on dark terminals, distinct from cursor yellow.
  return "blackBright"
}

/** Subtle focusborder-tinted bg for editing containers.
 * Replaces selection highlight during inline editing.
 *
 * Reads Sterling's `border-focus` (the canonical focus-ring color) via flat
 * projection — baked into every shipped Theme at construction. */
export function editingBg(theme: Theme): string | undefined {
  const bg = canvasBg(theme)
  const focus = sterlingToken(theme, "border-focus") ?? sterlingToken(theme, "focusborder")
  if (bg && focus && bg.startsWith("#") && focus.startsWith("#")) {
    return blend(bg, focus, 0.04)
  }
  return undefined
}

/** Dim a single color value — same hue, reduced brightness.
 * Truecolor (#RRGGBB): multiply RGB by factor.
 * ANSI 16: map bright variants to normal (redBright->red). */
function dimColor(color: string | undefined, factor = 0.85): string | undefined {
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

/** Sterling flat tokens that get dimmed in the unfocused variant.
 * Structural surfaces (`bg-surface-*`) stay pinned — the canvas identity
 * should read the same in both panes. Only interactive + status tokens
 * and borders dim to signal focus. */
const UNFOCUSED_STERLING_DIM: readonly string[] = [
  "fg-accent",
  "bg-accent",
  "fg-on-accent",
  "fg-accent-hover",
  "bg-accent-hover",
  "fg-accent-active",
  "bg-accent-active",
  "border-accent",
  "fg-muted",
  "bg-muted",
  "fg-error",
  "bg-error",
  "fg-warning",
  "bg-warning",
  "fg-success",
  "bg-success",
  "fg-info",
  "bg-info",
  "border-default",
  "border-focus",
  "border-muted",
  "fg-cursor",
  "bg-cursor",
  // Sterling selection / inverse / link (Phase A — sterling-selection-tokens).
  // After Phase B (selection-theme-tokens), paintFrame reads `bg-selected` /
  // `fg-on-selected` directly off the (per-pane) Theme — so the unfocused
  // variant must dim them too, otherwise the unfocused pane keeps a
  // full-strength selection bar.
  "bg-selected",
  "fg-on-selected",
  "bg-selected-hover",
  "bg-inverse",
  "fg-on-inverse",
  "fg-link",
]

/** Legacy Theme fields that still drive render output on silvery's legacy
 * path. Dimmed alongside Sterling flat tokens so that consumers reading
 * either shape see the same unfocused signal. Removable after silvery's
 * legacy Theme shape is retired (see bead
 * `km-silvery.sterling-2e-interior-migration` phase F). */
const UNFOCUSED_LEGACY_DIM: readonly string[] = [
  "primary",
  "link",
  "inputborder",
  "selectionbg",
  "selection",
  "focusborder",
  "fg",
  "muted",
  "disabledfg",
  "border",
  "inversebg",
  "inverse",
  "error",
  "warning",
  "success",
  "surfacebg",
]

/** Derive an unfocused variant: every color is dimmed proportionally.
 * Same hues, same structure — just less bright so the focused pane stands out.
 *
 * Dims Sterling flat tokens (the canonical surface consumers read at render
 * time) AND the parallel legacy Theme fields still in flight. Both shapes
 * co-exist on every Theme via `inlineSterlingTokens`; dimming both keeps the
 * visible signal identical regardless of which shape the consumer reads. */
export function deriveUnfocusedTheme(theme: Theme): Theme {
  const dimmed: Record<string, unknown> = { ...(theme as unknown as Record<string, unknown>) }
  dimmed.name = `${theme.name}-unfocused`

  for (const key of UNFOCUSED_STERLING_DIM) {
    const value = dimmed[key]
    if (typeof value === "string") {
      const next = dimColor(value)
      if (next !== undefined) dimmed[key] = next
    }
  }
  for (const key of UNFOCUSED_LEGACY_DIM) {
    const value = dimmed[key]
    if (typeof value === "string") {
      const next = dimColor(value)
      if (next !== undefined) dimmed[key] = next
    }
  }

  return dimmed as unknown as Theme
}
