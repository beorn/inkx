import type { CommandDef } from "../types.ts"

// Cursor movement - structural (not bound to default keys in board view)
// These are available for tree/outline views or programmatic use
const cursorPrev = {
  id: "cursor_prev",
  name: "Move to Previous",
  description: "Move cursor to previous sibling",
  category: "Navigation",
  shortcuts: [], // Not bound by default
  execute: () => ({ type: "CURSOR_MOVE", dir: "prev" }),
} satisfies CommandDef

const cursorNext = {
  id: "cursor_next",
  name: "Move to Next",
  description: "Move cursor to next sibling",
  category: "Navigation",
  shortcuts: [], // Not bound by default
  execute: () => ({ type: "CURSOR_MOVE", dir: "next" }),
} satisfies CommandDef

const cursorIn = {
  id: "cursor_in",
  name: "Move to Child",
  description: "Move cursor into first child",
  category: "Navigation",
  shortcuts: [], // Not bound by default (h/l do cross-column in board view)
  execute: () => ({ type: "CURSOR_MOVE", dir: "in" }),
} satisfies CommandDef

const cursorOut = {
  id: "cursor_out",
  name: "Move to Parent",
  description: "Move cursor to parent",
  category: "Navigation",
  shortcuts: [], // Not bound by default (h/l do cross-column in board view)
  execute: () => ({ type: "CURSOR_MOVE", dir: "out" }),
} satisfies CommandDef

const cursorFirst = {
  id: "cursor_first",
  name: "Move to First",
  description: "Move cursor to first sibling",
  category: "Navigation",
  shortcuts: ["g"],
  execute: () => ({ type: "CURSOR_MOVE", dir: "first" }),
} satisfies CommandDef

const cursorLast = {
  id: "cursor_last",
  name: "Move to Last",
  description: "Move cursor to last sibling",
  category: "Navigation",
  shortcuts: ["G"],
  execute: () => ({ type: "CURSOR_MOVE", dir: "last" }),
} satisfies CommandDef

// Cursor movement - visual (j/k/h/l + arrows behave identically per docs/06-ui.md)
const cursorUp = {
  id: "cursor_up",
  name: "Move Up",
  description: "Move cursor up visually",
  category: "Navigation",
  shortcuts: ["k", "ArrowUp"],
  execute: () => ({ type: "CURSOR_MOVE", dir: "up" }),
} satisfies CommandDef

const cursorDown = {
  id: "cursor_down",
  name: "Move Down",
  description: "Move cursor down visually",
  category: "Navigation",
  shortcuts: ["j", "ArrowDown"],
  execute: () => ({ type: "CURSOR_MOVE", dir: "down" }),
} satisfies CommandDef

const cursorLeft = {
  id: "cursor_left",
  name: "Move Left",
  description: "Move cursor left (cross-column)",
  category: "Navigation",
  shortcuts: ["h", "ArrowLeft"],
  execute: () => ({ type: "CURSOR_MOVE", dir: "left" }),
} satisfies CommandDef

const cursorRight = {
  id: "cursor_right",
  name: "Move Right",
  description: "Move cursor right (cross-column)",
  category: "Navigation",
  shortcuts: ["l", "ArrowRight"],
  execute: () => ({ type: "CURSOR_MOVE", dir: "right" }),
} satisfies CommandDef

// History navigation
const navBack = {
  id: "nav_back",
  name: "Navigate Back",
  description: "Go back in navigation history",
  category: "Navigation",
  shortcuts: ["["],
  execute: () => ({ type: "NAV_BACK" }),
} satisfies CommandDef

const navForward = {
  id: "nav_forward",
  name: "Navigate Forward",
  description: "Go forward in navigation history",
  category: "Navigation",
  shortcuts: ["]"],
  execute: () => ({ type: "NAV_FORWARD" }),
} satisfies CommandDef

// Zoom - these need context
const zoomIn = {
  id: "zoom_in",
  name: "Zoom In",
  description: "Focus on current node as root",
  category: "Navigation",
  shortcuts: ["e"],
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
  shortcuts: ["u"],
  execute: () => ({ type: "ZOOM_OUTWARDS" }),
} satisfies CommandDef

// Open detail pane for current node
const openDetailPane = {
  id: "open_detail_pane",
  name: "Open Detail",
  description: "Open detail pane for current node",
  category: "Navigation",
  shortcuts: ["Enter"],
  execute: () => ({ type: "OPEN_DETAIL_PANE" }),
} satisfies CommandDef

// Smart-P: context-aware detail pane toggle (v2 spec)
// Closed -> open+focus, open+board-focused -> focus pane, open+pane-focused -> close
const toggleDetailPane = {
  id: "toggle_detail_pane",
  name: "Toggle Detail",
  description: "Smart detail pane toggle (open+focus / focus / close)",
  category: "Navigation",
  shortcuts: ["P"],
  execute: () => ({ type: "TOGGLE_DETAIL_PANE" }),
} satisfies CommandDef

// Close detail pane unconditionally (Cmd+W)
const closeDetailPane = {
  id: "close_detail_pane",
  name: "Close Detail",
  description: "Close detail pane regardless of focus state",
  category: "Navigation",
  shortcuts: ["Cmd+W"],
  execute: () => ({ type: "CLOSE_DETAIL_PANE" }),
} satisfies CommandDef

// Page-based cursor jump (vim Ctrl+D/Ctrl+U style)
const pageDown = {
  id: "page_down",
  name: "Page Down",
  description: "Jump cursor down half a page",
  category: "Navigation",
  shortcuts: ["Ctrl+D"],
  execute: () => ({ type: "PAGE_JUMP", direction: "down" }),
} satisfies CommandDef

const pageUp = {
  id: "page_up",
  name: "Page Up",
  description: "Jump cursor up half a page",
  category: "Navigation",
  shortcuts: ["Ctrl+U"],
  execute: () => ({ type: "PAGE_JUMP", direction: "up" }),
} satisfies CommandDef

// Sibling board navigation (Ctrl+J/Ctrl+K)
const siblingBoardNext = {
  id: "sibling_board_next",
  name: "Next Sibling Board",
  description: "Navigate to next sibling board",
  category: "Navigation",
  shortcuts: ["Ctrl+J"],
  execute: () => ({ type: "NAV_SIBLING_BOARD", direction: "next" }),
} satisfies CommandDef

const siblingBoardPrev = {
  id: "sibling_board_prev",
  name: "Previous Sibling Board",
  description: "Navigate to previous sibling board",
  category: "Navigation",
  shortcuts: ["Ctrl+K"],
  execute: () => ({ type: "NAV_SIBLING_BOARD", direction: "prev" }),
} satisfies CommandDef

// Zoom inwards one level closer to selected node
const zoomInwards = {
  id: "zoom_inwards",
  name: "Zoom Inwards",
  description: "Zoom in one level closer to selected node",
  category: "Navigation",
  shortcuts: ["i"],
  execute: () => ({ type: "ZOOM_INWARDS" }),
} satisfies CommandDef

// Follow embedded link target
const followLink = {
  id: "follow_link",
  name: "Follow Link",
  description: "Go to embedded link target in context",
  category: "Navigation",
  shortcuts: ["P"],
  execute: () => ({ type: "FOLLOW_LINK" }),
} satisfies CommandDef

// Goto board commands (g-prefix chords)
const gotoInbox = {
  id: "goto_inbox",
  name: "Go to Inbox",
  description: "Navigate to inbox board",
  category: "Navigation",
  shortcuts: ["gi"],
  execute: () => ({ type: "GOTO_BOARD", boardId: "@inbox" }),
} satisfies CommandDef

const gotoJournal = {
  id: "goto_journal",
  name: "Go to Journal",
  description: "Navigate to journal board",
  category: "Navigation",
  shortcuts: ["gj"],
  execute: () => ({ type: "GOTO_BOARD", boardId: "@journal" }),
} satisfies CommandDef

const gotoHome = {
  id: "goto_home",
  name: "Go to Home",
  description: "Navigate to home (root) board",
  category: "Navigation",
  shortcuts: ["gh"],
  execute: () => ({ type: "GOTO_BOARD", boardId: "@home" }),
} satisfies CommandDef

const gotoNext = {
  id: "goto_next",
  name: "Go to Next Actions",
  description: "Navigate to next actions board",
  category: "Navigation",
  shortcuts: ["ge"],
  execute: () => ({ type: "GOTO_BOARD", boardId: "@next" }),
} satisfies CommandDef

// All navigation commands
// Open file/folder in macOS default app (Finder for folders, default editor for files)
const openInSystem = {
  id: "open_in_system",
  name: "Open in System",
  description: "Open file/folder in macOS (Finder for folders, default app for files)",
  category: "Navigation",
  shortcuts: ["o"],
  execute: (ctx) => {
    // nodeId can be empty — handler falls back to repo root
    return { type: "OPEN_IN_SYSTEM", nodeId: ctx.currentNodeId ?? "" }
  },
} satisfies CommandDef

// Open terminal at closest folder
const openInTerminal = {
  id: "open_in_terminal",
  name: "Open in Terminal",
  description: "Open terminal at the closest folder",
  category: "Navigation",
  shortcuts: ["O"],
  execute: (ctx) => {
    // nodeId can be empty — handler falls back to repo root
    return { type: "OPEN_IN_TERMINAL", nodeId: ctx.currentNodeId ?? "" }
  },
} satisfies CommandDef

// Filter dialog
const filter = {
  id: "filter",
  name: "Filter",
  description: "Open filter dialog to filter visible cards",
  category: "Navigation",
  shortcuts: ["Ctrl+/"],
  execute: () => ({ type: "SHOW_FILTER_DIALOG" }),
} satisfies CommandDef

// Command palette (stub)
const commandPalette = {
  id: "command_palette",
  name: "Command Palette",
  description: "Open command palette",
  category: "Navigation",
  shortcuts: ["\\"],
  execute: () => ({ type: "COMMAND_PALETTE" }),
} satisfies CommandDef

// Block-by-block navigation (J/K — auto-unfolds, jumps blocks)
const blockNavDown = {
  id: "block_nav_down",
  name: "Block Down",
  description: "Move cursor down by block (auto-unfolds)",
  category: "Navigation",
  shortcuts: ["J"],
  execute: () => ({ type: "CURSOR_MOVE", dir: "block_down" }),
} satisfies CommandDef

const blockNavUp = {
  id: "block_nav_up",
  name: "Block Up",
  description: "Move cursor up by block (auto-unfolds)",
  category: "Navigation",
  shortcuts: ["K"],
  execute: () => ({ type: "CURSOR_MOVE", dir: "block_up" }),
} satisfies CommandDef

// Settings / view modes
const settings = {
  id: "settings",
  name: "Settings",
  description: "Open settings / view mode preferences",
  category: "Navigation",
  shortcuts: [","],
  execute: () => ({ type: "SETTINGS" }),
} satisfies CommandDef

// Goto archive board
const gotoArchive = {
  id: "goto_archive",
  name: "Go to Archive",
  description: "Navigate to archive board",
  category: "Navigation",
  shortcuts: ["ge"],
  execute: () => ({ type: "GOTO_BOARD", boardId: "@archive" }),
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
  openDetailPane,
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
  gotoInbox,
  gotoJournal,
  gotoHome,
  gotoNext,
  gotoArchive,
  blockNavDown,
  blockNavUp,
  settings,
]
