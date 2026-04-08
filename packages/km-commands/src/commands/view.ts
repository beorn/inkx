import type { CommandDef } from "../types.ts"

// View mode
const cycleViewMode = {
  id: "cycle_view_mode",
  name: "Cycle View Mode",
  description: "Cycle through view modes (columns, list, detail)",
  category: "View",
  shortLabel: "view",
  execute: () => ({ type: "CYCLE_VIEW_MODE" }),
} satisfies CommandDef

const cycleIconStyle = {
  id: "cycle_icon_style",
  name: "Cycle Icon Style",
  description: "Cycle between nerdfont, workflowy, and regular bullet icons",
  category: "View",
  shortLabel: "icons",
  execute: () => ({ type: "CYCLE_ICON_STYLE" }),
} satisfies CommandDef

const showHelp = {
  id: "show_help",
  name: "Show Help",
  description: "Toggle help overlay",
  category: "View",
  shortLabel: "help",
  execute: () => ({ type: "SHOW_HELP" }),
} satisfies CommandDef

// Fold commands
const toggleFold = {
  id: "toggle_fold",
  name: "Toggle Fold",
  description: "Fold or unfold current node",
  category: "Fold",
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
  shortLabel: "collapse",
  execute: (ctx) => {
    if (!ctx.currentNodeId) return null
    return { type: "TOGGLE_COLLAPSE", nodeId: ctx.currentNodeId }
  },
} satisfies CommandDef

const toggleStickyFold = {
  id: "toggle_sticky_fold",
  name: "Toggle Sticky Fold",
  description:
    "Pin the current node's fold state so fold-all / unfold-all skip it (cycles sticky-folded → sticky-unfolded → off)",
  category: "Fold",
  shortLabel: "sticky",
  execute: () => ({ type: "TOGGLE_STICKY_FOLD" }),
} satisfies CommandDef

const foldNode = {
  id: "fold_more",
  name: "Fold Node",
  description: "Fold just this node",
  category: "Fold",
  shortLabel: "fold",
  execute: () => ({ type: "FOLD_NODE" }),
} satisfies CommandDef

const unfoldNode = {
  id: "unfold_more",
  name: "Unfold Node",
  description: "Unfold just this node",
  category: "Fold",
  shortLabel: "unfold",
  execute: () => ({ type: "UNFOLD_NODE" }),
} satisfies CommandDef

const unfoldRecursive = {
  id: "unfold_recursive",
  name: "Unfold Recursive",
  description: "Unfold node and all descendants",
  category: "Fold",
  execute: () => ({ type: "UNFOLD_RECURSIVE" }),
} satisfies CommandDef

const foldAll = {
  id: "fold_all_more",
  name: "Fold All",
  description: "Fold all nodes at depth 1",
  category: "Fold",
  execute: () => ({ type: "FOLD_LEVEL", depth: 1 }),
} satisfies CommandDef

const unfoldAll = {
  id: "unfold_all_more",
  name: "Unfold All",
  description: "Unfold all nodes",
  category: "Fold",
  execute: () => ({ type: "UNFOLD_LEVEL", depth: 99 }),
} satisfies CommandDef

// Hide operations
const hideNode = {
  id: "hide_node",
  name: "Hide Node",
  description: "Hide or un-hide node from board (persisted in .km/hidden)",
  category: "Fold",
  shortLabel: "hide",
  execute: () => ({ type: "HIDE_NODE" }),
} satisfies CommandDef

const toggleShowHidden = {
  id: "toggle_show_hidden",
  name: "Toggle Show Hidden",
  description: "Reveal/hide hidden nodes (dimmed) for un-hiding",
  category: "Fold",
  shortLabel: "hidden",
  execute: () => ({ type: "TOGGLE_SHOW_HIDDEN" }),
} satisfies CommandDef

// View configuration
// ORPHAN: no keybinding — shortcuts </>  conflict with fold_all/unfold_all in keybindings.ts. Candidate for removal.
const increaseOutlineDepth = {
  id: "increase_outline_depth",
  name: "Increase Depth",
  description: "Show more nested levels",
  category: "View",
  execute: () => ({ type: "INCREASE_OUTLINE_DEPTH" }),
} satisfies CommandDef

// ORPHAN: no keybinding — shortcuts </>  conflict with fold_all/unfold_all in keybindings.ts. Candidate for removal.
const decreaseOutlineDepth = {
  id: "decrease_outline_depth",
  name: "Decrease Depth",
  description: "Show fewer nested levels",
  category: "View",
  execute: () => ({ type: "DECREASE_OUTLINE_DEPTH" }),
} satisfies CommandDef

const increaseContentLines = {
  id: "increase_content_lines",
  name: "Show More Content",
  description: "Increase content preview lines",
  category: "View",
  execute: () => ({ type: "INCREASE_CONTENT_LINES" }),
} satisfies CommandDef

const decreaseContentLines = {
  id: "decrease_content_lines",
  name: "Show Less Content",
  description: "Decrease content preview lines",
  category: "View",
  execute: () => ({ type: "DECREASE_CONTENT_LINES" }),
} satisfies CommandDef

const clearFilters = {
  id: "clear_filters",
  name: "Clear Filters",
  description: "Remove all active view filters (hide-done, hidden, etc.)",
  category: "View",
  shortLabel: "clear",
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
  toggleStickyFold,
  hideNode,
  toggleShowHidden,
  foldAll,
  unfoldAll,
  increaseOutlineDepth,
  decreaseOutlineDepth,
  increaseContentLines,
  decreaseContentLines,
  clearFilters,
]
