import type { CommandDef } from "../types.ts"

// View mode
const cycleViewMode = {
  id: "cycle_view_mode",
  name: "Cycle View Mode",
  description: "Cycle through view modes (columns, list, detail)",
  category: "View",
  execute: () => ({ type: "CYCLE_VIEW_MODE" }),
} satisfies CommandDef

const cycleIconStyle = {
  id: "cycle_icon_style",
  name: "Cycle Icon Style",
  description: "Cycle between nerdfont, workflowy, and regular bullet icons",
  category: "View",
  shortcuts: ["V"],
  execute: () => ({ type: "CYCLE_ICON_STYLE" }),
} satisfies CommandDef

const showHelp = {
  id: "show_help",
  name: "Show Help",
  description: "Toggle help overlay",
  category: "View",
  shortcuts: ["?"],
  execute: () => ({ type: "SHOW_HELP" }),
} satisfies CommandDef

// Fold commands
const toggleFold = {
  id: "toggle_fold",
  name: "Toggle Fold",
  description: "Fold or unfold current node",
  category: "Fold",
  shortcuts: [], // Not directly bound — z is zoom_in, H/L fold/unfold
  execute: (ctx) => {
    if (!ctx.currentNodeId) return null
    return { type: "TOGGLE_FOLD", nodeId: ctx.currentNodeId }
  },
} satisfies CommandDef

const toggleCollapse = {
  id: "toggle_collapse",
  name: "Toggle Collapse",
  description: "Collapse or expand top-level column",
  category: "Fold",
  shortcuts: ["vc"],
  execute: (ctx) => {
    if (!ctx.currentNodeId) return null
    return { type: "TOGGLE_COLLAPSE", nodeId: ctx.currentNodeId }
  },
} satisfies CommandDef

const foldNode = {
  id: "fold_node",
  name: "Fold Node",
  description: "Fold just this node",
  category: "Fold",
  shortcuts: ["H"],
  execute: () => ({ type: "FOLD_NODE" }),
} satisfies CommandDef

const unfoldNode = {
  id: "unfold_node",
  name: "Unfold Node",
  description: "Unfold just this node",
  category: "Fold",
  shortcuts: ["L"],
  execute: () => ({ type: "UNFOLD_NODE" }),
} satisfies CommandDef

const unfoldRecursive = {
  id: "unfold_recursive",
  name: "Unfold Recursive",
  description: "Unfold node and all descendants",
  category: "Fold",
  shortcuts: [], // Not directly bound in keybindings
  execute: () => ({ type: "UNFOLD_RECURSIVE" }),
} satisfies CommandDef

const foldAll = {
  id: "fold_all",
  name: "Fold All",
  description: "Fold all nodes at depth 1",
  category: "Fold",
  shortcuts: ["<"],
  execute: () => ({ type: "FOLD_LEVEL", depth: 1 }),
} satisfies CommandDef

const unfoldAll = {
  id: "unfold_all",
  name: "Unfold All",
  description: "Unfold all nodes",
  category: "Fold",
  shortcuts: [">"],
  execute: () => ({ type: "UNFOLD_LEVEL", depth: 99 }),
} satisfies CommandDef

// Ignore operations
const ignoreNode = {
  id: "ignore_node",
  name: "Ignore Node",
  description: "Hide or un-hide node from board (persisted in .km/ignored)",
  category: "Fold",
  shortcuts: [], // Not directly bound in keybindings — C is capture_dialog
  execute: () => ({ type: "IGNORE_NODE" }),
} satisfies CommandDef

const toggleShowIgnored = {
  id: "toggle_show_ignored",
  name: "Toggle Show Ignored",
  description: "Reveal/hide ignored nodes (dimmed) for un-ignoring",
  category: "Fold",
  shortcuts: ["vC"],
  execute: () => ({ type: "TOGGLE_SHOW_IGNORED" }),
} satisfies CommandDef

// View configuration
// ORPHAN: no keybinding — shortcuts </>  conflict with fold_all/unfold_all in keybindings.ts. Candidate for removal.
const increaseOutlineDepth = {
  id: "increase_outline_depth",
  name: "Increase Depth",
  description: "Show more nested levels",
  category: "View",
  shortcuts: [">"],
  execute: () => ({ type: "INCREASE_OUTLINE_DEPTH" }),
} satisfies CommandDef

// ORPHAN: no keybinding — shortcuts </>  conflict with fold_all/unfold_all in keybindings.ts. Candidate for removal.
const decreaseOutlineDepth = {
  id: "decrease_outline_depth",
  name: "Decrease Depth",
  description: "Show fewer nested levels",
  category: "View",
  shortcuts: ["<"],
  execute: () => ({ type: "DECREASE_OUTLINE_DEPTH" }),
} satisfies CommandDef

const increaseContentLines = {
  id: "increase_content_lines",
  name: "Show More Content",
  description: "Increase content preview lines",
  category: "View",
  shortcuts: ["+", "="],
  execute: () => ({ type: "INCREASE_CONTENT_LINES" }),
} satisfies CommandDef

const decreaseContentLines = {
  id: "decrease_content_lines",
  name: "Show Less Content",
  description: "Decrease content preview lines",
  category: "View",
  shortcuts: ["-", "_"],
  execute: () => ({ type: "DECREASE_CONTENT_LINES" }),
} satisfies CommandDef

const clearFilters = {
  id: "clear_filters",
  name: "Clear Filters",
  description: "Remove all active view filters (hide-done, ignore, etc.)",
  category: "View",
  shortcuts: ["v-"],
  execute: () => ({ type: "CLEAR_FILTERS" }),
} satisfies CommandDef

export const viewCommands: CommandDef[] = [
  cycleViewMode,
  cycleIconStyle,
  showHelp,
  toggleFold,
  foldNode,
  unfoldNode,
  unfoldRecursive,
  toggleCollapse,
  ignoreNode,
  toggleShowIgnored,
  foldAll,
  unfoldAll,
  increaseOutlineDepth,
  decreaseOutlineDepth,
  increaseContentLines,
  decreaseContentLines,
  clearFilters,
]
