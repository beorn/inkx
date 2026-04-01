import type { CommandDef } from "../types.ts"

// Cursor movement - structural (not bound to default keys in board view)
// These are available for tree/outline views or programmatic use
const cursorPrev = {
  id: "cursor_prev",
  name: "Move to Previous",
  description: "Move cursor to previous sibling",
  category: "Navigation",
  execute: () => ({ type: "CURSOR_MOVE", dir: "prev" }),
} satisfies CommandDef

const cursorNext = {
  id: "cursor_next",
  name: "Move to Next",
  description: "Move cursor to next sibling",
  category: "Navigation",
  execute: () => ({ type: "CURSOR_MOVE", dir: "next" }),
} satisfies CommandDef

const cursorIn = {
  id: "cursor_in",
  name: "Move to Child",
  description: "Move cursor into first child",
  category: "Navigation",
  execute: () => ({ type: "CURSOR_MOVE", dir: "in" }),
} satisfies CommandDef

const cursorOut = {
  id: "cursor_out",
  name: "Move to Parent",
  description: "Move cursor to parent",
  category: "Navigation",
  execute: () => ({ type: "CURSOR_MOVE", dir: "out" }),
} satisfies CommandDef

const cursorFirst = {
  id: "cursor_first",
  name: "Move to First",
  shortLabel: "top",
  description: "Move cursor to first sibling",
  category: "Navigation",
  execute: () => ({ type: "CURSOR_MOVE", dir: "first" }),
} satisfies CommandDef

const cursorLast = {
  id: "cursor_last",
  name: "Move to Last",
  description: "Move cursor to last sibling",
  category: "Navigation",
  execute: () => ({ type: "CURSOR_MOVE", dir: "last" }),
} satisfies CommandDef

// Cursor movement - visual (j/k/h/l + arrows behave identically per docs/06-ui.md)
const cursorUp = {
  id: "cursor_up",
  name: "Move Up",
  description: "Move cursor up visually",
  category: "Navigation",
  execute: () => ({ type: "CURSOR_MOVE", dir: "up" }),
} satisfies CommandDef

const cursorDown = {
  id: "cursor_down",
  name: "Move Down",
  description: "Move cursor down visually",
  category: "Navigation",
  execute: () => ({ type: "CURSOR_MOVE", dir: "down" }),
} satisfies CommandDef

const cursorLeft = {
  id: "cursor_left",
  name: "Move Left",
  description: "Move cursor left (cross-column)",
  category: "Navigation",
  execute: () => ({ type: "CURSOR_MOVE", dir: "left" }),
} satisfies CommandDef

const cursorRight = {
  id: "cursor_right",
  name: "Move Right",
  description: "Move cursor right (cross-column)",
  category: "Navigation",
  execute: () => ({ type: "CURSOR_MOVE", dir: "right" }),
} satisfies CommandDef

// History navigation
const navBack = {
  id: "nav_back",
  name: "Navigate Back",
  description: "Go back in navigation history",
  category: "Navigation",
  execute: () => ({ type: "NAV_BACK" }),
} satisfies CommandDef

const navForward = {
  id: "nav_forward",
  name: "Navigate Forward",
  description: "Go forward in navigation history",
  category: "Navigation",
  execute: () => ({ type: "NAV_FORWARD" }),
} satisfies CommandDef

// Zoom - these need context
const zoomIn = {
  id: "zoom_in",
  name: "Zoom In",
  description: "Focus on current node as root",
  category: "Navigation",
  execute: (ctx) => {
    if (!ctx.currentNode) return null
    // BoardAction: just the nodeId, no tree data needed
    return { type: "ZOOM_IN", nodeId: ctx.currentNode.id }
  },
} satisfies CommandDef

// Zoom outwards one level (to parent of current root)
const zoomOutwards = {
  id: "zoom_outwards",
  name: "Zoom Outwards",
  description: "Zoom out one level (to parent of current root)",
  category: "Navigation",
  execute: () => ({ type: "ZOOM_OUTWARDS" }),
} satisfies CommandDef

// Smart-D: context-aware detail pane toggle (v2 spec)
// Closed -> open+focus, open+board-focused -> focus pane, open+pane-focused -> close
const toggleDetailPane = {
  id: "toggle_detail_pane",
  name: "Toggle Detail",
  description: "Smart detail pane toggle (open+focus / focus / close)",
  category: "Navigation",
  execute: () => ({ type: "TOGGLE_DETAIL_PANE" }),
} satisfies CommandDef

// Close detail pane unconditionally (Cmd+W)
const closeDetailPane = {
  id: "close_detail_pane",
  name: "Close Detail",
  description: "Close detail pane regardless of focus state",
  category: "Navigation",
  execute: () => ({ type: "CLOSE_DETAIL_PANE" }),
} satisfies CommandDef

// Page-based cursor jump (vim Ctrl+D/Ctrl+U style)
const pageDown = {
  id: "page_down",
  name: "Page Down",
  description: "Jump cursor down half a page",
  category: "Navigation",
  execute: () => ({ type: "PAGE_JUMP", direction: "down" }),
} satisfies CommandDef

const pageUp = {
  id: "page_up",
  name: "Page Up",
  description: "Jump cursor up half a page",
  category: "Navigation",
  execute: () => ({ type: "PAGE_JUMP", direction: "up" }),
} satisfies CommandDef

// Sibling board navigation (Ctrl+J/Ctrl+K)
const siblingBoardNext = {
  id: "sibling_board_next",
  name: "Next Sibling Board",
  description: "Navigate to next sibling board",
  category: "Navigation",
  execute: () => ({ type: "NAV_SIBLING_BOARD", direction: "next" }),
} satisfies CommandDef

const siblingBoardPrev = {
  id: "sibling_board_prev",
  name: "Previous Sibling Board",
  description: "Navigate to previous sibling board",
  category: "Navigation",
  execute: () => ({ type: "NAV_SIBLING_BOARD", direction: "prev" }),
} satisfies CommandDef

// Zoom inwards one level closer to selected node
const zoomInwards = {
  id: "zoom_inwards",
  name: "Zoom Inwards",
  description: "Zoom in one level closer to selected node",
  category: "Navigation",
  execute: () => ({ type: "ZOOM_INWARDS" }),
} satisfies CommandDef

// Follow embedded link target
const followLink = {
  id: "follow_link",
  name: "Follow Link",
  description: "Go to embedded link target in context",
  category: "Navigation",
  execute: () => ({ type: "FOLLOW_LINK" }),
} satisfies CommandDef

// Composable goto command — dispatches to board or favorite based on ctx.targetId
const goto = {
  id: "goto",
  name: "Go to",
  shortLabel: "goto",
  description: "Navigate to a board or favorite by target",
  category: "Navigation",
  execute: (ctx) => {
    const t = ctx.targetId
    if (!t) return null

    if (t.startsWith("pick:")) return { type: "SHOW_ITEM_PICKER" } // pickers stay for now
    return { type: "CURSOR_TO", locationKey: t }
  },
} satisfies CommandDef

// Open file/folder in macOS default app (Finder for folders, default editor for files)
const openInSystem = {
  id: "open_in_system",
  name: "Open in System",
  shortLabel: "open",
  description: "Open file/folder in macOS (Finder for folders, default app for files)",
  category: "Navigation",
  execute: (ctx) => {
    // nodeId can be empty — handler falls back to repo root
    return { type: "OPEN_IN_SYSTEM", nodeId: ctx.currentNodeId ?? "" }
  },
} satisfies CommandDef

// Open terminal at closest folder
const openInTerminal = {
  id: "open_in_terminal",
  name: "Open in Terminal",
  shortLabel: "terminal",
  description: "Open terminal at the closest folder",
  category: "Navigation",
  execute: (ctx) => {
    // nodeId can be empty — handler falls back to repo root
    return { type: "OPEN_IN_TERMINAL", nodeId: ctx.currentNodeId ?? "" }
  },
} satisfies CommandDef

// Filter dialog
const filter = {
  id: "filter",
  name: "Filter",
  shortLabel: "filter",
  description: "Open filter dialog to filter visible cards",
  category: "Navigation",
  execute: () => ({ type: "SHOW_FILTER_DIALOG" }),
} satisfies CommandDef

// Command palette (stub)
const commandPalette = {
  id: "command_palette",
  name: "Command Palette",
  shortLabel: "palette",
  description: "Open command palette",
  category: "Navigation",
  execute: () => ({ type: "COMMAND_PALETTE" }),
} satisfies CommandDef

// Tree-traversal navigation (J/K — enter children / exit to parent)
const blockNavDown = {
  id: "block_nav_down",
  name: "Enter Children",
  description: "Move into first child (tree traversal)",
  category: "Navigation",
  execute: () => ({ type: "CURSOR_MOVE", dir: "in" }),
} satisfies CommandDef

const blockNavUp = {
  id: "block_nav_up",
  name: "Exit to Parent",
  description: "Move to parent (tree traversal)",
  category: "Navigation",
  execute: () => ({ type: "CURSOR_MOVE", dir: "out" }),
} satisfies CommandDef

// Settings / view modes
const settings = {
  id: "settings",
  name: "Settings",
  shortLabel: "settings",
  description: "Open settings / view mode preferences",
  category: "Navigation",
  execute: () => ({ type: "SETTINGS" }),
} satisfies CommandDef

// Focus board (Cmd+h — kitty)
const focusBoard = {
  id: "focus_board",
  name: "Focus Board",
  shortLabel: "board",
  description: "Switch focus to the board pane",
  category: "Navigation",
  execute: () => ({ type: "FOCUS_BOARD" }),
} satisfies CommandDef

// Manage favorites dialog
const manageFavorites = {
  id: "manage_favorites",
  name: "Manage Favorites",
  shortLabel: "favorites",
  description: "Open manage favorites dialog (mnemonics/memory)",
  category: "Navigation",
  execute: () => ({ type: "MANAGE_FAVORITES" }),
} satisfies CommandDef

// Focus detail pane (Cmd+l — kitty)
const focusDetail = {
  id: "focus_detail",
  name: "Focus Detail",
  shortLabel: "detail",
  description: "Switch focus to the detail pane",
  category: "Navigation",
  execute: () => ({ type: "FOCUS_DETAIL" }),
} satisfies CommandDef

export const navigationCommands: CommandDef[] = [
  cursorPrev,
  cursorNext,
  cursorIn,
  cursorOut,
  cursorFirst,
  cursorLast,
  cursorUp,
  cursorDown,
  cursorLeft,
  cursorRight,
  navBack,
  navForward,
  zoomIn,
  zoomOutwards,
  toggleDetailPane,
  closeDetailPane,
  pageDown,
  pageUp,
  siblingBoardNext,
  siblingBoardPrev,
  zoomInwards,
  followLink,
  openInSystem,
  openInTerminal,
  filter,
  commandPalette,
  goto,
  blockNavDown,
  blockNavUp,
  settings,
  focusBoard,
  focusDetail,
  manageFavorites,
]
