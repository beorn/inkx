import type { CommandDef } from "../types.ts"

// View mode
export const cycleViewMode = {
  id: "cycle_view_mode",
  name: "Cycle View Mode",
  description: "Cycle through view modes (columns, list, detail)",
  category: "View",
  shortcuts: ["v"],
  execute: () => ({ type: "CYCLE_VIEW_MODE" }),
} satisfies CommandDef

export const showHelp = {
  id: "show_help",
  name: "Show Help",
  description: "Toggle help overlay",
  category: "View",
  shortcuts: ["?"],
  execute: () => ({ type: "SHOW_HELP" }),
} satisfies CommandDef

// Fold commands
export const toggleFold = {
  id: "toggle_fold",
  name: "Toggle Fold",
  description: "Fold or unfold current node",
  category: "Fold",
  shortcuts: ["z"],
  execute: (ctx) => {
    if (!ctx.currentNodeId) return null
    return { type: "TOGGLE_FOLD", nodeId: ctx.currentNodeId }
  },
} satisfies CommandDef

export const toggleCollapse = {
  id: "toggle_collapse",
  name: "Toggle Collapse",
  description: "Collapse or expand top-level column",
  category: "Fold",
  shortcuts: ["c"],
  execute: (ctx) => {
    if (!ctx.currentNodeId) return null
    return { type: "TOGGLE_COLLAPSE", nodeId: ctx.currentNodeId }
  },
} satisfies CommandDef

export const foldAll = {
  id: "fold_all",
  name: "Fold All",
  description: "Fold all nodes at depth 1",
  category: "Fold",
  shortcuts: ["Z"],
  execute: () => ({ type: "FOLD_LEVEL", depth: 1 }),
} satisfies CommandDef

export const unfoldAll = {
  id: "unfold_all",
  name: "Unfold All",
  description: "Unfold all nodes",
  category: "Fold",
  shortcuts: ["Shift+Z"],
  execute: () => ({ type: "UNFOLD_LEVEL", depth: 99 }),
} satisfies CommandDef

// View configuration
export const increaseOutlineDepth = {
  id: "increase_outline_depth",
  name: "Increase Depth",
  description: "Show more nested levels",
  category: "View",
  shortcuts: [">"],
  execute: () => ({ type: "INCREASE_OUTLINE_DEPTH" }),
} satisfies CommandDef

export const decreaseOutlineDepth = {
  id: "decrease_outline_depth",
  name: "Decrease Depth",
  description: "Show fewer nested levels",
  category: "View",
  shortcuts: ["<"],
  execute: () => ({ type: "DECREASE_OUTLINE_DEPTH" }),
} satisfies CommandDef

export const increaseContentLines = {
  id: "increase_content_lines",
  name: "Show More Content",
  description: "Increase content preview lines",
  category: "View",
  shortcuts: ["+", "="],
  execute: () => ({ type: "INCREASE_CONTENT_LINES" }),
} satisfies CommandDef

export const decreaseContentLines = {
  id: "decrease_content_lines",
  name: "Show Less Content",
  description: "Decrease content preview lines",
  category: "View",
  shortcuts: ["-", "_"],
  execute: () => ({ type: "DECREASE_CONTENT_LINES" }),
} satisfies CommandDef

export const viewCommands: CommandDef[] = [
  cycleViewMode,
  showHelp,
  toggleFold,
  toggleCollapse,
  foldAll,
  unfoldAll,
  increaseOutlineDepth,
  decreaseOutlineDepth,
  increaseContentLines,
  decreaseContentLines,
]
