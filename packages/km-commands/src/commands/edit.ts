import type { KmOp, CommandDef } from "../types.ts"
import { moveTo as moveToVerb, addTo as addToVerb } from "../verb-locations.ts"

// Move mode commands return minimal actions (MoveAction types).
// TUI handler in board-actions.ts augments with context before dispatching to board.
const enterMoveMode = {
  id: "enter_move_mode",
  name: "Enter Move Mode",
  shortLabel: "move",
  description: "Start moving selected nodes",
  category: "Edit",
  execute: () => ({ type: "ENTER_MOVE_MODE" }),
} satisfies CommandDef

const confirmMove = {
  id: "confirm_move",
  name: "Confirm Move",
  description: "Confirm node movement to current position",
  category: "Edit",
  modes: ["move"],
  execute: () => ({ type: "CONFIRM_MOVE" }),
} satisfies CommandDef

const cancelMove = {
  id: "cancel_move",
  name: "Cancel Move",
  description: "Cancel move operation",
  category: "Edit",
  modes: ["move"],
  execute: () => ({ type: "CANCEL_MOVE" }),
} satisfies CommandDef

// Shifting (visual reorder)
const shiftUp = {
  id: "shift_up",
  name: "Shift Up",
  description: "Move node up among siblings",
  category: "Edit",
  execute: () => ({ type: "SHIFT_UP" }),
} satisfies CommandDef

const shiftDown = {
  id: "shift_down",
  name: "Shift Down",
  description: "Move node down among siblings",
  category: "Edit",
  execute: () => ({ type: "SHIFT_DOWN" }),
} satisfies CommandDef

const shiftLeft = {
  id: "shift_left",
  name: "Shift Left",
  description: "Move node left between columns",
  category: "Edit",
  execute: () => ({ type: "SHIFT_LEFT" }),
} satisfies CommandDef

const shiftRight = {
  id: "shift_right",
  name: "Shift Right",
  description: "Move node right between columns",
  category: "Edit",
  execute: () => ({ type: "SHIFT_RIGHT" }),
} satisfies CommandDef

const enterInlineEdit = {
  id: "enter_inline_edit",
  name: "Edit Inline",
  description: "Edit node title inline (or create first item on empty board)",
  category: "Edit",
  execute: (ctx) => {
    const nodeId = ctx.cursor ?? ctx.currentNodeId
    if (nodeId) return { type: "ENTER_INLINE_EDIT", nodeId }
    // Empty board — fall back to insert below (creates first child)
    return { type: "INSERT_BELOW" }
  },
} satisfies CommandDef

/**
 * Enter key behavior: zoom into heading cards with children, edit leaf cards.
 *
 * Heading cards (sections) with children act as containers — Enter drills in.
 * Leaf cards (no children) enter inline edit. This prevents accidentally
 * entering edit mode on section headings where the intent is navigation.
 */
const enterOrZoom = {
  id: "enter_or_zoom",
  name: "Enter / Zoom",
  description: "Zoom into cards with children, edit leaf cards",
  category: "Edit",
  execute: (ctx) => {
    const nodeId = ctx.cursor ?? ctx.currentNodeId
    if (!nodeId) return { type: "INSERT_BELOW" }

    // If the current node has children, zoom in instead of editing
    const childCount = ctx.currentNode?.childCount ?? 0
    if (childCount > 0) return { type: "ZOOM_INWARDS" }

    // Leaf node — enter inline edit
    return { type: "ENTER_INLINE_EDIT", nodeId }
  },
} satisfies CommandDef

const enterBodyEdit = {
  id: "enter_body_edit",
  name: "Edit Body",
  description: "Edit node body (first body block)",
  category: "Edit",
  execute: (ctx) =>
    ctx.currentNodeId ? { type: "ENTER_INLINE_EDIT", nodeId: ctx.currentNodeId, blockIndex: 1 } : null,
} satisfies CommandDef

const renameNode = {
  id: "rename_node",
  name: "Rename",
  description: "Rename current node",
  category: "Edit",
  execute: (ctx) => (ctx.currentNodeId ? { type: "ENTER_INLINE_EDIT", nodeId: ctx.currentNodeId } : null),
} satisfies CommandDef

const deleteNode = {
  id: "delete_node",
  name: "Delete Node",
  description: "Delete current node",
  category: "Edit",
  execute: (ctx) => {
    if (!ctx.currentNodeId) return null
    return { type: "DELETE_NODE", nodeId: ctx.currentNodeId }
  },
} satisfies CommandDef

const indentNode = {
  id: "indent_node",
  name: "Indent",
  description: "Reparent node under previous sibling",
  category: "Edit",
  execute: () => ({ type: "INDENT_NODE" }),
} satisfies CommandDef

const insertAbove = {
  id: "insert_above",
  name: "Insert Above",
  description: "Insert sibling above and enter inline edit",
  category: "Edit",
  execute: () => ({ type: "INSERT_ABOVE" }),
} satisfies CommandDef

const insertBelow = {
  id: "insert_below",
  name: "Insert Below",
  description: "Insert sibling below and enter inline edit",
  category: "Edit",
  execute: () => ({ type: "INSERT_BELOW" }),
} satisfies CommandDef

const duplicateNode = {
  id: "duplicate_node",
  name: "Duplicate",
  description: "Duplicate current node",
  category: "Edit",
  execute: (ctx) => {
    if (!ctx.currentNodeId) return null
    return { type: "DUPLICATE_NODE", nodeId: ctx.currentNodeId }
  },
} satisfies CommandDef

const clipboardCopy = {
  id: "clipboard_copy",
  name: "Copy",
  description: "Copy selected node(s) to clipboard",
  category: "Edit",
  execute: () => ({ type: "CLIPBOARD_COPY" }),
} satisfies CommandDef

const clipboardCut = {
  id: "clipboard_cut",
  name: "Cut",
  description: "Cut selected node(s) to clipboard",
  category: "Edit",
  execute: () => ({ type: "CLIPBOARD_CUT" }),
} satisfies CommandDef

const clipboardPaste = {
  id: "clipboard_paste",
  name: "Paste",
  description: "Paste node(s) from clipboard",
  category: "Edit",
  execute: () => ({ type: "CLIPBOARD_PASTE" }),
} satisfies CommandDef

// Composable move command — replaces individual move_to_inbox, move_to_journal, etc.
// Target is resolved via ctx.targetId from keybinding (e.g., "i" → @inbox)
const move = {
  id: "move",
  name: "Move to",
  shortLabel: "move",
  description: "Move selected node(s) to a target board",
  category: "Edit",
  execute: (ctx): KmOp | null => {
    const t = ctx.targetId
    if (!t) return null
    return moveToVerb(t)(ctx) as KmOp | null
  },
} satisfies CommandDef

// Composable add command — replaces individual add_tag, add_assignee, etc.
// Target is resolved via ctx.targetId from keybinding (e.g., "#" → SET_LABEL)
const add = {
  id: "add",
  name: "Add",
  shortLabel: "add",
  description: "Add a property or link to the current node",
  category: "Edit",
  execute: (ctx): KmOp | null => {
    const t = ctx.targetId
    if (!t) return null
    return addToVerb(t)(ctx) as KmOp | null
  },
} satisfies CommandDef

// Link/reparent pickers
const addLink = {
  id: "add_link",
  name: "Add Link",
  description: "Open link/reference picker to add a link",
  category: "Edit",
  execute: () => ({ type: "ADD_LINK" }),
} satisfies CommandDef

const reparentPicker = {
  id: "reparent_picker",
  name: "Reparent/Move",
  shortLabel: "reparent",
  description: "Open reparent picker to move node to a new parent",
  category: "Edit",
  execute: () => ({ type: "REPARENT_PICKER" }),
} satisfies CommandDef

// Archive (remove from view, still searchable) — stub
const archiveNode = {
  id: "archive",
  name: "Archive",
  shortLabel: "archive",
  description: "Archive node (remove from view, still searchable)",
  category: "Edit",
  execute: (ctx) => {
    if (!ctx.currentNodeId) return null
    // TODO: implement archive action
    return { type: "ARCHIVE_NODE", nodeId: ctx.currentNodeId }
  },
} satisfies CommandDef

// Capture new item to inbox (quick-add) — stub
const captureInbox = {
  id: "capture_inbox",
  name: "Capture to Inbox",
  shortLabel: "inbox",
  description: "Quick-add a new item to inbox",
  category: "Edit",
  execute: () => ({ type: "CAPTURE", location: "inbox" }),
} satisfies CommandDef

// Capture with dialog — stub
const captureDialog = {
  id: "capture_dialog",
  name: "Capture with Dialog",
  shortLabel: "dialog",
  description: "Add a new item via capture dialog",
  category: "Edit",
  execute: () => ({ type: "CAPTURE" }),
} satisfies CommandDef

// Add child item
const insertChild = {
  id: "insert_child",
  name: "Add Child",
  shortLabel: "child",
  description: "Insert a child item under the current node",
  category: "Edit",
  execute: () => ({ type: "INSERT_CHILD" }),
} satisfies CommandDef

// Add sibling below — alias for insert_below
const addSiblingBelow = {
  id: "add_sibling_below",
  name: "Add Sibling Below",
  shortLabel: "below",
  description: "Insert a sibling item below the current node",
  category: "Edit",
  execute: () => ({ type: "INSERT_BELOW" }),
} satisfies CommandDef

// Add item at parent level
const insertAtParent = {
  id: "insert_at_parent",
  name: "Add at Parent Level",
  shortLabel: "parent",
  description: "Insert an item at the parent's level (uncle node)",
  category: "Edit",
  execute: () => ({ type: "INSERT_AT_PARENT" }),
} satisfies CommandDef

export const editCommands: CommandDef[] = [
  enterMoveMode,
  confirmMove,
  cancelMove,
  enterInlineEdit,
  enterBodyEdit,
  renameNode,
  shiftUp,
  shiftDown,
  shiftLeft,
  shiftRight,
  indentNode,
  deleteNode,
  insertAbove,
  insertBelow,
  duplicateNode,
  clipboardCopy,
  clipboardCut,
  clipboardPaste,
  move,
  add,
  addLink,
  reparentPicker,
  archiveNode,
  captureInbox,
  captureDialog,
  insertChild,
  addSiblingBelow,
  insertAtParent,
]
