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
import { getActiveTheme } from "@silvery/theme"

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

/** ANSI named bg colors supported by StyleChain (includes bright variants). */
const ANSI_BG_COLORS: Record<string, (t: StyleChain) => StyleChain> = {
  black: (t) => t.bgBlack,
  red: (t) => t.bgRed,
  green: (t) => t.bgGreen,
  yellow: (t) => t.bgYellow,
  blue: (t) => t.bgBlue,
  magenta: (t) => t.bgMagenta,
  cyan: (t) => t.bgCyan,
  white: (t) => t.bgWhite,
  gray: (t) => t.bgGray,
  grey: (t) => t.bgGrey,
  blackBright: (t) => t.bgBlackBright,
  redBright: (t) => t.bgRedBright,
  greenBright: (t) => t.bgGreenBright,
  yellowBright: (t) => t.bgYellowBright,
  blueBright: (t) => t.bgBlueBright,
  magentaBright: (t) => t.bgMagentaBright,
  cyanBright: (t) => t.bgCyanBright,
  whiteBright: (t) => t.bgWhiteBright,
}

/**
 * Apply a color value as foreground to a StyleChain.
 * Handles ANSI names ("red", "blueBright"), hex ("#EBCB8B"), and empty string (passthrough).
 */
function applyFg(t: StyleChain, color: string): StyleChain {
  if (!color) return t
  const ansi = ANSI_COLORS[color]
  if (ansi) return ansi(t)
  if (color.startsWith("#")) return t.hex(color)
  return t // unknown color, passthrough
}

/**
 * Apply a color value as background to a StyleChain.
 * Handles ANSI names ("red", "blueBright"), hex ("#EBCB8B"), and empty string (passthrough).
 */
function applyBg(t: StyleChain, color: string): StyleChain {
  if (!color) return t
  const ansiBg = ANSI_BG_COLORS[color]
  if (ansiBg) return ansiBg(t)
  if (color.startsWith("#")) return t.bgHex(color)
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
 * Apply theme-aware foreground + background colors to text.
 * Accepts $token strings, ANSI names, or hex for both fg and bg.
 */
export function themeFgBg(text: string, fg: string, bg: string, term?: StyleChain): string {
  const t = term ?? createTermStyle()
  const resolvedFg = resolveColor(fg)
  const resolvedBg = resolveColor(bg)
  return applyFg(applyBg(t, resolvedBg), resolvedFg)(text)
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
