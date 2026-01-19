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

// Cross-column navigation (preserves Y position)
export const navCrossColumnLeft: CommandDef = {
  id: "nav_cross_column_left",
  name: "Column Left",
  description: "Navigate to column on left",
  category: "Navigation",
  shortcuts: ["H"],
  execute: () => ({ type: "NAV_CROSS_COLUMN", direction: "left" }),
};

export const navCrossColumnRight: CommandDef = {
  id: "nav_cross_column_right",
  name: "Column Right",
  description: "Navigate to column on right",
  category: "Navigation",
  shortcuts: ["L"],
  execute: () => ({ type: "NAV_CROSS_COLUMN", direction: "right" }),
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
  shortcuts: ["Enter"],
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
  description: "Return to parent context",
  category: "Navigation",
  shortcuts: ["Backspace"],
  execute: (ctx) => {
    return { type: "ZOOM_OUT", nodes: ctx.boardState.nodes };
  },
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
  navCrossColumnLeft,
  navCrossColumnRight,
  navBack,
  navForward,
  zoomIn,
  zoomOut,
];
