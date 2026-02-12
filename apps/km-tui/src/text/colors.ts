/**
 * Board Color System
 *
 * Defines colors for boards/sections, with GTD defaults and custom override support.
 * Colors are inherited down the tree - a board's color applies to all its children.
 */

import { createTerm, type StyleChain } from "inkx"

/**
 * Create a term instance with truecolor support.
 * Called per-invocation to avoid module-level mutable state.
 */
function createTermStyle(): StyleChain {
  return createTerm({ color: "truecolor" })
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

/**
 * Get styling function for a color name.
 * Optionally pass a term instance to avoid creating one per call.
 */
export function getTermColor(color: string, term?: StyleChain): (text: string) => string {
  const t = term ?? createTermStyle()
  switch (color) {
    case "black":
      return (text: string) => t.black(text)
    case "red":
      return (text: string) => t.red(text)
    case "green":
      return (text: string) => t.green(text)
    case "yellow":
      return (text: string) => t.yellow(text)
    case "blue":
      return (text: string) => t.blue(text)
    case "magenta":
      return (text: string) => t.magenta(text)
    case "cyan":
      return (text: string) => t.cyan(text)
    case "white":
      return (text: string) => t.white(text)
    case "gray":
    case "grey":
      return (text: string) => t.gray(text)
    default:
      return (text: string) => t.dim(text) // fallback for unknown colors
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
