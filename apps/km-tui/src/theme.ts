/**
 * km Theme Configuration
 *
 * Uses silvery's `detectScheme()` to query the terminal's actual colors via
 * OSC 4/10/11 and derive a full Sterling theme. Falls back to ANSI16-derived
 * text/accent tokens on a terminal-owned canvas when detection fails.
 *
 * Components read Sterling flat tokens (`$fg-accent`, `$bg-surface-default`,
 * `$border-focus`, …) via `theme[key]` lookup — see Sterling's design-system.md.
 * Every shipped silvery Theme has these baked on at construction by
 * `inlineSterlingTokens`.
 */
import {
  ansi16DarkTheme,
  ansi16LightTheme,
  detectScheme,
  detectTheme,
  type DetectSchemeOptions,
  type DetectSource,
  type SlotSource,
} from "@silvery/ag-react"
import type { Theme } from "@silvery/ag-react"
// Color math lives in @silvery/color.
import { blend } from "@silvery/color"

/** Default theme for tests (ANSI 16 dark — no terminal detection needed). */
export const defaultKmTheme: Theme = ansi16DarkTheme

// Re-export detectTheme for lower-level tests/tools. Runtime uses detectKmTheme()
// below so pure fallback does not paint Silvery's Nord blue canvas over the
// terminal's actual default background.
export { detectTheme }

export interface DetectKmThemeOptions {
  caps?: {
    colorLevel?: string
    darkBackground?: boolean
  }
  input?: DetectSchemeOptions["input"]
  timeoutMs?: number
}

export interface KmThemeDetection {
  theme: Theme
  source: DetectSource
  confidence: number
  matchedName?: string
  probed: {
    fg: boolean
    bg: boolean
    ansiCount: number
  }
}

const TERMINAL_DEFAULT_CANVAS_KEYS = ["bg", "bg-default", "bg-surface-default", "surfacebg"] as const

const ANSI_FIELDS = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
  "brightWhite",
] as const

/** Keep the theme's text/accent tokens but let the terminal paint the canvas.
 *
 * Pure probe fallback used to return Silvery's built-in Nord bg (`#2e3440`),
 * which visibly disagreed with users whose terminal default is neutral grey.
 * Successful OSC 11 probing can still disagree visually because default
 * terminal cells may include compositor/transparency effects that explicit
 * SGR truecolor background cells do not. Clearing only the base canvas aliases
 * preserves borders, selection, status, popover surfaces, etc. while the
 * root/background cells stay terminal-default. The probed bg remains part of
 * Sterling derivation before this step; km does not carry a hidden bg token.
 */
export function terminalDefaultCanvasTheme(theme: Theme): Theme {
  const next = { ...(theme as unknown as Record<string, unknown>) }
  next.name = `${String(next.name ?? "theme")}-terminal-default-bg`
  for (const key of TERMINAL_DEFAULT_CANVAS_KEYS) next[key] = ""
  return next as unknown as Theme
}

export function fallbackKmTheme(caps: { darkBackground?: boolean } = {}): Theme {
  const isDark = caps.darkBackground ?? true
  return terminalDefaultCanvasTheme(isDark ? ansi16DarkTheme : ansi16LightTheme)
}

export async function detectKmTheme(opts: DetectKmThemeOptions = {}): Promise<KmThemeDetection> {
  const colorLevel = opts.caps?.colorLevel
  if (colorLevel === "mono" || colorLevel === "ansi16") {
    return {
      theme: fallbackKmTheme({ darkBackground: opts.caps?.darkBackground }),
      source: "bg-mode",
      confidence: 0,
      probed: { fg: false, bg: false, ansiCount: 0 },
    }
  }

  const detected = await detectScheme({
    timeoutMs: opts.timeoutMs,
    input: opts.input,
    darkFallback: opts.caps?.darkBackground,
  })
  const slotSources = detected.slotSources as Partial<Record<string, SlotSource>>
  const source = detected.source
  const backgroundProbed = slotSources.background === "probed"
  return {
    theme: source !== "override" ? terminalDefaultCanvasTheme(detected.theme) : detected.theme,
    source,
    confidence: detected.confidence,
    matchedName: detected.matchedName,
    probed: {
      fg: slotSources.foreground === "probed",
      bg: backgroundProbed,
      ansiCount: ANSI_FIELDS.filter((field) => slotSources[field] === "probed").length,
    },
  }
}

/** Bracket-access helper — Sterling flat tokens live as hyphen-keyed root
 * siblings on every Theme (baked via `inlineSterlingTokens`). This avoids the
 * banned `theme.<camelCase>` dot-access form. */
function sterlingToken(theme: Theme, key: string): string | undefined {
  const value = (theme as unknown as Record<string, unknown>)[key]
  return typeof value === "string" ? value : undefined
}

function isTerminalDefaultCanvas(theme: Theme): boolean {
  const bg = sterlingToken(theme, "bg")
  const surface = sterlingToken(theme, "bg-surface-default")
  return (bg === "" || bg === undefined) && (surface === "" || surface === undefined)
}

/** Resolve the canvas background for blend math on app-painted canvases.
 *
 * When the canvas is terminal-owned these keys are intentionally empty and
 * selected/editing surfaces must use Sterling tokens instead of blend math.
 */
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

/** Subtle selected bg for selected containers — keeps text readable.
 *
 * Terminal-owned canvas: use Sterling's selected-hover token, already derived
 * from the resolved color scheme. App-painted canvas: keep the old subtle
 * accent blend against the actual painted canvas.
 */
export function selectedBg(theme: Theme): string | undefined {
  if (isTerminalDefaultCanvas(theme)) {
    return sterlingToken(theme, "bg-selected-hover") ?? sterlingToken(theme, "bg-selected")
  }
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
 * Terminal-owned canvas: use Sterling's selected token.
 *
 * App-painted truecolor: blend(canvas, accent, 14%) — visibly brighter than
 * selectedBg (6%) so a multi-selected sub-item reads as distinct even inside
 * a card that already has the card-level tint.
 *
 * ANSI-16: returns a "blackBright" fallback so tests (which use ansi16DarkTheme
 * with empty theme.bg) can still verify the marker. On real dark terminals
 * this also draws a visible grey row.
 */
export function multiSelectedBg(theme: Theme): string | undefined {
  if (isTerminalDefaultCanvas(theme)) {
    return sterlingToken(theme, "bg-selected") ?? "blackBright"
  }
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
  if (isTerminalDefaultCanvas(theme)) {
    return sterlingToken(theme, "bg-surface-hover") ?? sterlingToken(theme, "bg-muted")
  }
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
  // Sterling v1 completeness (km-silvery.sterling-no-negative-surprises) —
  // disabled / backdrop / explicit defaults are all consumed by km-tui at
  // render time and must dim alongside the rest when a pane is unfocused.
  "fg-disabled",
  "bg-disabled",
  "border-disabled",
  "bg-backdrop",
  "fg-default",
  "bg-default",
]

/** Legacy Theme fields that still drive render output on silvery's legacy
 * path. Dimmed alongside Sterling flat tokens so that consumers reading
 * either shape see the same unfocused signal. The Sterling-replaced aliases
 * (`selection` / `selectionbg` / `inverse` / `inversebg` / `link`) were
 * removed in silvery 0.21.0 — sterling-purge-legacy-tokens — and dropped
 * from this list. Removable after the rest of silvery's legacy Theme shape
 * is retired. */
const UNFOCUSED_LEGACY_DIM: readonly string[] = [
  "primary",
  "inputborder",
  "focusborder",
  "fg",
  "muted",
  "disabledfg",
  "border",
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
