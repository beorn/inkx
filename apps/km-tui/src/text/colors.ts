/**
 * Board Color System
 *
 * Defines colors for boards/sections, with GTD defaults and custom override support.
 * Colors are inherited down the tree - a board's color applies to all its children.
 */

import chalk, { type ChalkInstance } from "chalk"

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
 * Valid chalk color names
 */
export type ChalkColor =
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
 * Get chalk function for a color name
 */
export function getChalkColor(color: string): ChalkInstance {
  switch (color) {
    case "black":
      return chalk.black
    case "red":
      return chalk.red
    case "green":
      return chalk.green
    case "yellow":
      return chalk.yellow
    case "blue":
      return chalk.blue
    case "magenta":
      return chalk.magenta
    case "cyan":
      return chalk.cyan
    case "white":
      return chalk.white
    case "gray":
    case "grey":
      return chalk.gray
    default:
      return chalk.dim // fallback for unknown colors
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
  return getChalkColor(color)(text)
}
