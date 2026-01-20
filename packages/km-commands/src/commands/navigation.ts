import type { CommandDef } from "../types.ts";

// Cursor movement - structural (hjkl style)
export const cursorPrev: CommandDef = {
  id: "cursor_prev",
  name: "Move to Previous",
  description: "Move cursor to previous sibling",
  category: "Navigation",
  shortcuts: ["k"],
  execute: () => ({ type: "CURSOR_MOVE", dir: "prev" }),
};

export const cursorNext: CommandDef = {
  id: "cursor_next",
  name: "Move to Next",
  description: "Move cursor to next sibling",
  category: "Navigation",
  shortcuts: ["j"],
  execute: () => ({ type: "CURSOR_MOVE", dir: "next" }),
};

export const cursorIn: CommandDef = {
  id: "cursor_in",
  name: "Move to Child",
  description: "Move cursor into first child",
  category: "Navigation",
  shortcuts: ["l"],
  execute: () => ({ type: "CURSOR_MOVE", dir: "in" }),
};

export const cursorOut: CommandDef = {
  id: "cursor_out",
  name: "Move to Parent",
  description: "Move cursor to parent",
  category: "Navigation",
  shortcuts: ["h"],
  execute: () => ({ type: "CURSOR_MOVE", dir: "out" }),
};

export const cursorFirst: CommandDef = {
  id: "cursor_first",
  name: "Move to First",
  description: "Move cursor to first sibling",
  category: "Navigation",
  shortcuts: ["g"],
  execute: () => ({ type: "CURSOR_MOVE", dir: "first" }),
};

export const cursorLast: CommandDef = {
  id: "cursor_last",
  name: "Move to Last",
  description: "Move cursor to last sibling",
  category: "Navigation",
  shortcuts: ["G"],
  execute: () => ({ type: "CURSOR_MOVE", dir: "last" }),
};

// Cursor movement - visual (arrow style)
export const cursorUp: CommandDef = {
  id: "cursor_up",
  name: "Move Up",
  description: "Move cursor up visually",
  category: "Navigation",
  shortcuts: ["ArrowUp"],
  execute: () => ({ type: "CURSOR_MOVE", dir: "up" }),
};

export const cursorDown: CommandDef = {
  id: "cursor_down",
  name: "Move Down",
  description: "Move cursor down visually",
  category: "Navigation",
  shortcuts: ["ArrowDown"],
  execute: () => ({ type: "CURSOR_MOVE", dir: "down" }),
};

export const cursorLeft: CommandDef = {
  id: "cursor_left",
  name: "Move Left",
  description: "Move cursor left (cross-column)",
  category: "Navigation",
  shortcuts: ["ArrowLeft"],
  execute: () => ({ type: "CURSOR_MOVE", dir: "left" }),
};

export const cursorRight: CommandDef = {
  id: "cursor_right",
  name: "Move Right",
  description: "Move cursor right (cross-column)",
  category: "Navigation",
  shortcuts: ["ArrowRight"],
  execute: () => ({ type: "CURSOR_MOVE", dir: "right" }),
};

// History navigation
export const navBack: CommandDef = {
  id: "nav_back",
  name: "Navigate Back",
  description: "Go back in navigation history",
  category: "Navigation",
  shortcuts: ["["],
  execute: () => ({ type: "NAV_BACK" }),
};

export const navForward: CommandDef = {
  id: "nav_forward",
  name: "Navigate Forward",
  description: "Go forward in navigation history",
  category: "Navigation",
  shortcuts: ["]"],
  execute: () => ({ type: "NAV_FORWARD" }),
};

// Zoom - these need context
export const zoomIn: CommandDef = {
  id: "zoom_in",
  name: "Zoom In",
  description: "Focus on current node as root",
  category: "Navigation",
  shortcuts: ["o"], // TUI uses 'o' for zoom in
  execute: (ctx) => {
    if (!ctx.currentNode) return null;
    return {
      type: "ZOOM_IN",
      nodeId: ctx.currentNode.id,
      nodes: [ctx.currentNode],
    };
  },
};

export const zoomOut: CommandDef = {
  id: "zoom_out",
  name: "Zoom Out",
  description: "Return to previous zoom level (from zoom stack)",
  category: "Navigation",
  shortcuts: [], // Not directly bound - see goUpPath
  execute: (ctx) => {
    return { type: "ZOOM_OUT", nodes: ctx.boardState.nodes };
  },
};

// Go up physical path - different from zoomOut
// This navigates to the parent of the current root node
export const goUpPath: CommandDef = {
  id: "go_up_path",
  name: "Go Up Path",
  description: "Navigate to parent of current root",
  category: "Navigation",
  shortcuts: ["u"],
  execute: () => ({ type: "GO_UP_PATH" }),
};

// Open detail pane for current node
export const openDetailPane: CommandDef = {
  id: "open_detail_pane",
  name: "Open Detail",
  description: "Open detail pane for current node",
  category: "Navigation",
  shortcuts: ["Enter"],
  execute: () => ({ type: "OPEN_DETAIL_PANE" }),
};

// Page-based cursor jump (vim Ctrl+D/Ctrl+U style)
export const pageDown: CommandDef = {
  id: "page_down",
  name: "Page Down",
  description: "Jump cursor down half a page",
  category: "Navigation",
  shortcuts: ["Ctrl+D"],
  execute: () => ({ type: "PAGE_JUMP", direction: "down" }),
};

export const pageUp: CommandDef = {
  id: "page_up",
  name: "Page Up",
  description: "Jump cursor up half a page",
  category: "Navigation",
  shortcuts: ["Ctrl+U"],
  execute: () => ({ type: "PAGE_JUMP", direction: "up" }),
};

// Sibling board navigation (Ctrl+J/Ctrl+K)
export const siblingBoardNext: CommandDef = {
  id: "sibling_board_next",
  name: "Next Sibling Board",
  description: "Navigate to next sibling board",
  category: "Navigation",
  shortcuts: ["Ctrl+J"],
  execute: () => ({ type: "NAV_SIBLING_BOARD", direction: "next" }),
};

export const siblingBoardPrev: CommandDef = {
  id: "sibling_board_prev",
  name: "Previous Sibling Board",
  description: "Navigate to previous sibling board",
  category: "Navigation",
  shortcuts: ["Ctrl+K"],
  execute: () => ({ type: "NAV_SIBLING_BOARD", direction: "prev" }),
};

// Enter node as board (like zoom but TUI-specific)
export const enterNode: CommandDef = {
  id: "enter_node",
  name: "Enter Node",
  description: "Enter current node as a board",
  category: "Navigation",
  shortcuts: ["i"],
  execute: () => ({ type: "ENTER_NODE" }),
};

// All navigation commands
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
  zoomOut,
  goUpPath,
  openDetailPane,
  pageDown,
  pageUp,
  siblingBoardNext,
  siblingBoardPrev,
  enterNode,
];
