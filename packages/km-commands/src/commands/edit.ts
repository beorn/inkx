import type { CommandDef } from "../types.ts"

// Move mode commands return minimal actions (MoveAction types).
// TUI handler in board-actions.ts augments with context before dispatching to board.
const enterMoveMode = {
  id: "enter_move_mode",
  name: "Enter Move Mode",
  description: "Start moving selected nodes",
  category: "Edit",
  shortcuts: ["m"],
  execute: () => ({ type: "ENTER_MOVE_MODE" }),
} satisfies CommandDef

const confirmMove = {
  id: "confirm_move",
  name: "Confirm Move",
  description: "Confirm node movement to current position",
  category: "Edit",
  shortcuts: ["Enter"],
  modes: ["move"],
  execute: () => ({ type: "CONFIRM_MOVE" }),
} satisfies CommandDef

const cancelMove = {
  id: "cancel_move",
  name: "Cancel Move",
  description: "Cancel move operation",
  category: "Edit",
  shortcuts: ["Escape"],
  modes: ["move"],
  execute: () => ({ type: "CANCEL_MOVE" }),
} satisfies CommandDef

// Shifting (visual reorder)
const shiftUp = {
  id: "shift_up",
  name: "Shift Up",
  description: "Move node up among siblings",
  category: "Edit",
  shortcuts: ["Alt+ArrowUp", "Alt+k"],
  execute: () => ({ type: "SHIFT_UP" }),
} satisfies CommandDef

const shiftDown = {
  id: "shift_down",
  name: "Shift Down",
  description: "Move node down among siblings",
  category: "Edit",
  shortcuts: ["Alt+ArrowDown", "Alt+j"],
  execute: () => ({ type: "SHIFT_DOWN" }),
} satisfies CommandDef

const shiftLeft = {
  id: "shift_left",
  name: "Shift Left",
  description: "Move node to parent level (outdent)",
  category: "Edit",
  shortcuts: ["Alt+ArrowLeft", "Alt+h", "Shift+Tab"],
  execute: () => ({ type: "SHIFT_LEFT" }),
} satisfies CommandDef

const shiftRight = {
  id: "shift_right",
  name: "Shift Right",
  description: "Move node under previous sibling (indent)",
  category: "Edit",
  shortcuts: ["Alt+ArrowRight", "Alt+l", "Tab"],
  execute: () => ({ type: "SHIFT_RIGHT" }),
} satisfies CommandDef

const enterInlineEdit = {
  id: "enter_inline_edit",
  name: "Edit Inline",
  description: "Edit node title inline",
  category: "Edit",
  shortcuts: ["Enter"],
  execute: (ctx) =>
    ctx.currentNodeId
      ? { type: "ENTER_INLINE_EDIT", nodeId: ctx.currentNodeId }
      : null,
} satisfies CommandDef

const deleteNode = {
  id: "delete_node",
  name: "Delete Node",
  description: "Delete current node",
  category: "Edit",
  shortcuts: ["D"],
  execute: (ctx) => {
    if (!ctx.currentNodeId) return null
    return { type: "DELETE_NODE", nodeId: ctx.currentNodeId }
  },
} satisfies CommandDef

export const editCommands: CommandDef[] = [
  enterMoveMode,
  confirmMove,
  cancelMove,
  enterInlineEdit,
  shiftUp,
  shiftDown,
  shiftLeft,
  shiftRight,
  deleteNode,
]
