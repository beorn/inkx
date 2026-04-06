/**
 * Command Registry
 *
 * Centralized registry of all available TUI commands.
 * Used by:
 * - Command palette (fuzzy search)
 * - Help overlay (documentation)
 * - km-sh (script execution)
 * - Keyboard handler (reference)
 */

import type { BoardReducerOp } from "./board-types.ts"

/**
 * Command definition for the palette and help system.
 * Board-level commands only - app-level commands are in km-ink.
 */
export interface CommandDef {
  /** Unique identifier (snake_case) */
  id: string
  /** Human-readable name */
  name: string
  /** Brief description */
  description: string
  /** Keyboard shortcut (for display) */
  shortcut?: string
  /** Category for grouping */
  category: CommandCategory
  /** The action to dispatch (or null if requires context) */
  action: BoardReducerOp | null
  /** Whether this command needs additional context (like nodeId) */
  needsContext?: boolean
}

export type CommandCategory = "Navigation" | "Selection" | "Folding" | "View"

/**
 * All registered commands.
 * Order matters for display in command palette.
 */
export const commands: CommandDef[] = [
  // === Navigation ===
  {
    id: "nav_prev_sibling",
    name: "Move Up",
    description: "Move to previous sibling",
    shortcut: "k / \u2191",
    category: "Navigation",
    action: { type: "CURSOR_MOVE", dir: "prev" },
  },
  {
    id: "nav_next_sibling",
    name: "Move Down",
    description: "Move to next sibling",
    shortcut: "j / \u2193",
    category: "Navigation",
    action: { type: "CURSOR_MOVE", dir: "next" },
  },
  {
    id: "nav_parent",
    name: "Move to Parent",
    description: "Navigate to parent node",
    shortcut: "h / \u2190",
    category: "Navigation",
    action: { type: "CURSOR_MOVE", dir: "out" },
  },
  {
    id: "nav_child",
    name: "Move to Child",
    description: "Navigate to first child",
    shortcut: "l / \u2192",
    category: "Navigation",
    action: { type: "CURSOR_MOVE", dir: "in" },
  },
  {
    id: "nav_first_sibling",
    name: "Jump to Top",
    description: "Jump to first sibling",
    shortcut: "g",
    category: "Navigation",
    action: { type: "CURSOR_MOVE", dir: "first" },
  },
  {
    id: "nav_last_sibling",
    name: "Jump to Bottom",
    description: "Jump to last sibling",
    shortcut: "G",
    category: "Navigation",
    action: { type: "CURSOR_MOVE", dir: "last" },
  },
  {
    id: "nav_cross_column_left",
    name: "Move Column Left",
    description: "Move to column on left",
    shortcut: "H",
    category: "Navigation",
    action: { type: "NAV_CROSS_COLUMN", direction: "left" },
  },
  {
    id: "nav_cross_column_right",
    name: "Move Column Right",
    description: "Move to column on right",
    shortcut: "L",
    category: "Navigation",
    action: { type: "NAV_CROSS_COLUMN", direction: "right" },
  },
  {
    id: "nav_back",
    name: "Navigate Back",
    description: "Go back in navigation history",
    shortcut: "[",
    category: "Navigation",
    action: { type: "NAV_BACK" },
  },
  {
    id: "nav_forward",
    name: "Navigate Forward",
    description: "Go forward in navigation history",
    shortcut: "]",
    category: "Navigation",
    action: { type: "NAV_FORWARD" },
  },

  // === Selection ===
  {
    id: "select_toggle",
    name: "Toggle Selection",
    description: "Toggle selection on current node",
    shortcut: "v",
    category: "Selection",
    action: null,
    needsContext: true,
  },
  {
    id: "select_all_siblings",
    name: "Select All Siblings",
    description: "Select all siblings of current node",
    shortcut: "V",
    category: "Selection",
    action: { type: "SELECT_ALL_SIBLINGS" },
  },
  {
    id: "select_all",
    name: "Select All",
    description: "Select all visible nodes",
    shortcut: "Ctrl+A",
    category: "Selection",
    action: { type: "SELECT_ALL" },
  },
  {
    id: "clear_selection",
    name: "Clear Selection",
    description: "Clear all selections",
    shortcut: "Esc",
    category: "Selection",
    action: { type: "CLEAR_SELECTION" },
  },

  // === Folding ===
  {
    id: "toggle_fold",
    name: "Toggle Fold",
    description: "Fold/unfold current node",
    shortcut: "z",
    category: "Folding",
    action: null,
    needsContext: true,
  },
  {
    id: "toggle_collapse",
    name: "Toggle Collapse",
    description: "Collapse/expand top-level column",
    shortcut: "c",
    category: "Folding",
    action: null,
    needsContext: true,
  },
  {
    id: "fold_all_more",
    name: "Fold All",
    description: "Fold all nodes at depth 1",
    shortcut: "Z",
    category: "Folding",
    action: { type: "FOLD_LEVEL", depth: 1 },
  },
  {
    id: "unfold_all_more",
    name: "Unfold All",
    description: "Unfold all nodes",
    shortcut: "Shift+Z",
    category: "Folding",
    action: { type: "UNFOLD_LEVEL", depth: 99 },
  },

  // === View ===
  {
    id: "zoom_in",
    name: "Zoom In",
    description: "Focus on current node as root",
    shortcut: "Enter",
    category: "View",
    action: null,
    needsContext: true,
  },
  {
    id: "zoom_out",
    name: "Zoom Out",
    description: "Return to parent context",
    shortcut: "Backspace",
    category: "View",
    action: null,
    needsContext: true,
  },
  {
    id: "increase_outline_depth",
    name: "Increase Outline Depth",
    description: "Show more nested levels",
    shortcut: ">",
    category: "View",
    action: { type: "INCREASE_OUTLINE_DEPTH" },
  },
  {
    id: "decrease_outline_depth",
    name: "Decrease Outline Depth",
    description: "Show fewer nested levels",
    shortcut: "<",
    category: "View",
    action: { type: "DECREASE_OUTLINE_DEPTH" },
  },
  {
    id: "increase_content_lines",
    name: "Show More Content",
    description: "Increase content preview lines",
    shortcut: "+",
    category: "View",
    action: { type: "INCREASE_CONTENT_LINES" },
  },
  {
    id: "decrease_content_lines",
    name: "Show Less Content",
    description: "Decrease content preview lines",
    shortcut: "-",
    category: "View",
    action: { type: "DECREASE_CONTENT_LINES" },
  },
]

/**
 * Get commands by category.
 */
export function getCommandsByCategory(): Map<CommandCategory, CommandDef[]> {
  const byCategory = new Map<CommandCategory, CommandDef[]>()
  for (const cmd of commands) {
    const list = byCategory.get(cmd.category) || []
    list.push(cmd)
    byCategory.set(cmd.category, list)
  }
  return byCategory
}

/**
 * Get a command by ID.
 */
export function getCommandById(id: string): CommandDef | undefined {
  return commands.find((cmd) => cmd.id === id)
}

/**
 * Simple fuzzy match for command palette.
 * Returns true if all characters in query appear in target in order.
 */
export function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  let qi = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi++
    }
  }
  return qi === q.length
}

/**
 * Filter commands by fuzzy search query.
 */
export function filterCommands(query: string): CommandDef[] {
  if (!query) return commands
  return commands.filter(
    (cmd) => fuzzyMatch(query, cmd.name) || fuzzyMatch(query, cmd.description) || fuzzyMatch(query, cmd.id),
  )
}
