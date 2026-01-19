import type { CommandDef } from "../types.ts";

export const selectToggle: CommandDef = {
  id: "select_toggle",
  name: "Toggle Selection",
  description: "Toggle selection on current node",
  category: "Selection",
  shortcuts: ["v"],
  execute: (ctx) => {
    if (!ctx.currentNodeId) return null;
    return { type: "SELECT_NODE_TOGGLE", nodeId: ctx.currentNodeId };
  },
};

export const selectAdd: CommandDef = {
  id: "select_add",
  name: "Add to Selection",
  description: "Add current node to selection",
  category: "Selection",
  execute: (ctx) => {
    if (!ctx.currentNodeId) return null;
    return { type: "SELECT_NODE_ADD", nodeId: ctx.currentNodeId };
  },
};

export const selectRemove: CommandDef = {
  id: "select_remove",
  name: "Remove from Selection",
  description: "Remove current node from selection",
  category: "Selection",
  execute: (ctx) => {
    if (!ctx.currentNodeId) return null;
    return { type: "SELECT_NODE_REMOVE", nodeId: ctx.currentNodeId };
  },
};

export const selectAllSiblings: CommandDef = {
  id: "select_all_siblings",
  name: "Select All Siblings",
  description: "Select all siblings of current node",
  category: "Selection",
  shortcuts: ["V"],
  execute: () => ({ type: "SELECT_ALL_SIBLINGS" }),
};

export const selectAll: CommandDef = {
  id: "select_all",
  name: "Select All",
  description: "Select all visible nodes",
  category: "Selection",
  shortcuts: ["Ctrl+A"],
  execute: () => ({ type: "SELECT_ALL" }),
};

export const clearSelection: CommandDef = {
  id: "clear_selection",
  name: "Clear Selection",
  description: "Clear all selections",
  category: "Selection",
  shortcuts: ["Escape"],
  execute: () => ({ type: "CLEAR_SELECTION" }),
};

// Extend selection (shift+direction)
export const extendSelectUp: CommandDef = {
  id: "extend_select_up",
  name: "Extend Selection Up",
  description: "Extend selection upward",
  category: "Selection",
  shortcuts: ["Shift+ArrowUp"],
  execute: () => ({ type: "EXTEND_SELECT_UP" }),
};

export const extendSelectDown: CommandDef = {
  id: "extend_select_down",
  name: "Extend Selection Down",
  description: "Extend selection downward",
  category: "Selection",
  shortcuts: ["Shift+ArrowDown"],
  execute: () => ({ type: "EXTEND_SELECT_DOWN" }),
};

export const extendSelectLeft: CommandDef = {
  id: "extend_select_left",
  name: "Extend Selection Left",
  description: "Extend selection leftward",
  category: "Selection",
  shortcuts: ["Shift+ArrowLeft"],
  execute: () => ({ type: "EXTEND_SELECT_LEFT" }),
};

export const extendSelectRight: CommandDef = {
  id: "extend_select_right",
  name: "Extend Selection Right",
  description: "Extend selection rightward",
  category: "Selection",
  shortcuts: ["Shift+ArrowRight"],
  execute: () => ({ type: "EXTEND_SELECT_RIGHT" }),
};

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
];
