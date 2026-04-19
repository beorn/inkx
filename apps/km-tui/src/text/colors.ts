/**
 * Board Color System
 *
 * Defines colors for boards/sections, with GTD defaults and custom override support.
 * Colors are inherited down the tree - a board's color applies to all its children.
 *
 * Theme-aware helpers (themeFg, themeBg) resolve $token strings via the active theme,
 * supporting both ANSI 16 color names and truecolor hex values.
 */

import { createTerm, resolveThemeColor, type StyleChain } from "@silvery/ag-react"
import { getActiveTheme } from "@silvery/ag-term/pipeline"

/** Cached term instance for color styling. Uses default color detection. */
let _termStyle: StyleChain | undefined

function createTermStyle(): StyleChain {
  return (_termStyle ??= createTerm())
}

/**
 * GTD board default colors
 * Board names are normalized (lowercase, no @ prefix) for matching
 */
export const GTD_BOARD_COLORS: Record<string, string> = {
  inbox: "white",
  next: "cyan",
  waiting: "yellow",
  someday: "gray",
  done: "green",
  dropped: "gray",
  blocked: "red",
}

/**
 * Valid terminal color names
 */
export type TermColor = "black" | "red" | "green" | "yellow" | "blue" | "magenta" | "cyan" | "white" | "gray" | "grey"

/** ANSI named colors supported by StyleChain (includes bright variants). */
const ANSI_COLORS: Record<string, (t: StyleChain) => StyleChain> = {
  black: (t) => t.black,
  red: (t) => t.red,
  green: (t) => t.green,
  yellow: (t) => t.yellow,
  blue: (t) => t.blue,
  magenta: (t) => t.magenta,
  cyan: (t) => t.cyan,
  white: (t) => t.white,
  gray: (t) => t.gray,
  grey: (t) => t.grey,
  blackBright: (t) => t.blackBright,
  redBright: (t) => t.redBright,
  greenBright: (t) => t.greenBright,
  yellowBright: (t) => t.yellowBright,
  blueBright: (t) => t.blueBright,
  magentaBright: (t) => t.magentaBright,
  cyanBright: (t) => t.cyanBright,
  whiteBright: (t) => t.whiteBright,
}

/**
 * Apply a color value as foreground to a StyleChain.
 * Handles ANSI names ("red", "blueBright"), hex ("#EBCB8B"), and empty string (passthrough).
 *
 * Foreground only — see km-tui.detail-view-bg-conflict. km never emits
 * chalk-style backgrounds for inline content. Anything that wants a
 * background should set <Text backgroundColor="$token"> on the React side
 * so silvery's buffer-bg pipeline owns the cell, instead of letting chalk
 * inject `\u001b[107m` into the text payload (which collides with silvery's
 * incremental bg-conflict detection at SILVERY_STRICT=2).
 */
function applyFg(t: StyleChain, color: string): StyleChain {
  if (!color) return t
  const ansi = ANSI_COLORS[color]
  if (ansi) return ansi(t)
  if (color.startsWith("#")) return t.hex(color)
  return t // unknown color, passthrough
}

/**
 * Resolve a $token or color string against the active theme.
 * Returns the resolved color value (ANSI name or hex), or empty string for unresolvable.
 */
function resolveColor(color: string): string {
  if (color.startsWith("$")) {
    return resolveThemeColor(color, getActiveTheme()) ?? ""
  }
  return color
}

/**
 * Apply a theme-aware foreground color to text.
 * Accepts $token strings ("$primary"), ANSI names ("red"), or hex ("#EBCB8B").
 */
export function themeFg(text: string, color: string, term?: StyleChain): string {
  const t = term ?? createTermStyle()
  const resolved = resolveColor(color)
  return applyFg(t, resolved)(text)
}

/**
 * Get styling function for a color name.
 * Supports ANSI names, bright variants, hex colors, and $token strings.
 * Optionally pass a term instance to avoid creating one per call.
 */
export function getTermColor(color: string, term?: StyleChain): (text: string) => string {
  const t = term ?? createTermStyle()
  const resolved = resolveColor(color)
  if (!resolved) return (text: string) => t.dim(text)
  const chain = applyFg(t, resolved)
  // If applyFg returned the same chain (unknown color), fall back to dim
  if (chain === t) return (text: string) => t.dim(text)
  return (text: string) => chain(text)
}

/**
 * Normalize board name for color lookup
 * Removes @ prefix and lowercases
 */
export function normalizeBoardName(name: string): string {
  return name.replace(/^@/, "").toLowerCase()
}

/**
 * Get color for a board by name, checking GTD defaults
 */
export function getBoardColorByName(name: string): string | undefined {
  const normalized = normalizeBoardName(name)
  return GTD_BOARD_COLORS[normalized]
}

/**
 * Apply color to text
 */
export function colorize(text: string, color: string | undefined): string {
  if (!color) return text
  return getTermColor(color)(text)
}
