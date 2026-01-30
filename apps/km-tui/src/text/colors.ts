/**
 * Board Color System
 *
 * Defines colors for boards/sections, with GTD defaults and custom override support.
 * Colors are inherited down the tree - a board's color applies to all its children.
 */

import { createTerm, type StyleChain } from "inkx"

// Module-level term instance for styling (lazily initialized)
let _term: ReturnType<typeof createTerm> | null = null
function getTerm(): StyleChain {
  if (!_term) {
    _term = createTerm({ color: "truecolor" })
  }
  return _term
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
export type TermColor =
  | "black"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "white"
  | "gray"
  | "grey"

/**
 * Get styling function for a color name
 */
export function getTermColor(color: string): (text: string) => string {
  const term = getTerm()
  switch (color) {
    case "black":
      return (text: string) => term.black(text)
    case "red":
      return (text: string) => term.red(text)
    case "green":
      return (text: string) => term.green(text)
    case "yellow":
      return (text: string) => term.yellow(text)
    case "blue":
      return (text: string) => term.blue(text)
    case "magenta":
      return (text: string) => term.magenta(text)
    case "cyan":
      return (text: string) => term.cyan(text)
    case "white":
      return (text: string) => term.white(text)
    case "gray":
    case "grey":
      return (text: string) => term.gray(text)
    default:
      return (text: string) => term.dim(text) // fallback for unknown colors
  }
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
