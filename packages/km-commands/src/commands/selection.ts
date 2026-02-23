import type { CommandDef } from "../types.ts"

const selectToggle = {
  id: "select_toggle",
  name: "Toggle Selection",
  description: "Toggle selection on current node",
  category: "Selection",
  // Note: No default shortcut - 'v' is used for cycle_view_mode in TUI
  execute: (ctx) => {
    if (!ctx.currentNodeId) return null
    return { type: "SELECT_NODE_TOGGLE", nodeId: ctx.currentNodeId }
  },
} satisfies CommandDef

const selectAdd = {
  id: "select_add",
  name: "Add to Selection",
  description: "Add current node to selection",
  category: "Selection",
  execute: (ctx) => {
    if (!ctx.currentNodeId) return null
    return { type: "SELECT_NODE_ADD", nodeId: ctx.currentNodeId }
  },
} satisfies CommandDef

const selectRemove = {
  id: "select_remove",
  name: "Remove from Selection",
  description: "Remove current node from selection",
  category: "Selection",
  execute: (ctx) => {
    if (!ctx.currentNodeId) return null
    return { type: "SELECT_NODE_REMOVE", nodeId: ctx.currentNodeId }
  },
} satisfies CommandDef

const selectAllSiblings = {
  id: "select_all_siblings",
  name: "Select All Siblings",
  description: "Select all siblings of current node",
  category: "Selection",
  execute: () => ({ type: "SELECT_ALL_SIBLINGS" }),
} satisfies CommandDef

const selectAll = {
  id: "select_all",
  name: "Select All",
  description: "Select all (column first, then board-wide)",
  category: "Selection",
  shortcuts: ["A", "Ctrl+A"],
  execute: () => ({ type: "SELECT_ALL" }),
} satisfies CommandDef

const clearSelection = {
  id: "clear_selection",
  name: "Clear Selection",
  description: "Clear all selections",
  category: "Selection",
  shortcuts: ["Escape"],
  execute: () => ({ type: "CLEAR_SELECTION" }),
} satisfies CommandDef

// Extend selection (shift+direction)
const extendSelectUp = {
  id: "extend_select_up",
  name: "Extend Selection Up",
  description: "Extend selection upward",
  category: "Selection",
  shortcuts: ["Shift+ArrowUp"],
  execute: () => ({ type: "EXTEND_SELECT_UP" }),
} satisfies CommandDef

const extendSelectDown = {
  id: "extend_select_down",
  name: "Extend Selection Down",
  description: "Extend selection downward",
  category: "Selection",
  shortcuts: ["Shift+ArrowDown"],
  execute: () => ({ type: "EXTEND_SELECT_DOWN" }),
} satisfies CommandDef

const extendSelectLeft = {
  id: "extend_select_left",
  name: "Extend Selection Left",
  description: "Extend selection leftward",
  category: "Selection",
  shortcuts: ["Shift+ArrowLeft"],
  execute: () => ({ type: "EXTEND_SELECT_LEFT" }),
} satisfies CommandDef

const extendSelectRight = {
  id: "extend_select_right",
  name: "Extend Selection Right",
  description: "Extend selection rightward",
  category: "Selection",
  shortcuts: ["Shift+ArrowRight"],
  execute: () => ({ type: "EXTEND_SELECT_RIGHT" }),
} satisfies CommandDef

// Visual mode (vim-style: v enters, hjkl extends selection, Escape exits)
const visualModeEnter = {
  id: "visual_mode_enter",
  name: "Visual Mode",
  description: "Enter visual mode for range selection with hjkl",
  category: "Selection",
  shortcuts: ["v"],
  execute: () => ({ type: "VISUAL_MODE_ENTER" }),
} satisfies CommandDef

const visualModeExit = {
  id: "visual_mode_exit",
  name: "Exit Visual Mode",
  description: "Exit visual mode and clear selection",
  category: "Selection",
  execute: () => ({ type: "VISUAL_MODE_EXIT" }),
} satisfies CommandDef

export const selectionCommands: CommandDef[] = [
  selectToggle,
  selectAdd,
  selectRemove,
  selectAllSiblings,
  selectAll,
  clearSelection,
  extendSelectUp,
  extendSelectDown,
  extendSelectLeft,
  extendSelectRight,
  visualModeEnter,
  visualModeExit,
]
