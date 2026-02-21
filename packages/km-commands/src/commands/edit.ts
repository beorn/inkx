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
  description: "Move node left between columns",
  category: "Edit",
  shortcuts: ["Alt+ArrowLeft", "Alt+h"],
  execute: () => ({ type: "SHIFT_LEFT" }),
} satisfies CommandDef

const shiftRight = {
  id: "shift_right",
  name: "Shift Right",
  description: "Move node right between columns",
  category: "Edit",
  shortcuts: ["Alt+ArrowRight", "Alt+l"],
  execute: () => ({ type: "SHIFT_RIGHT" }),
} satisfies CommandDef

const enterInlineEdit = {
  id: "enter_inline_edit",
  name: "Edit Inline",
  description: "Edit node title inline",
  category: "Edit",
  shortcuts: ["Enter"],
  execute: (ctx) => (ctx.currentNodeId ? { type: "ENTER_INLINE_EDIT", nodeId: ctx.currentNodeId } : null),
} satisfies CommandDef

const renameNode = {
  id: "rename_node",
  name: "Rename",
  description: "Rename current node",
  category: "Edit",
  shortcuts: ["sr"],
  execute: (ctx) => (ctx.currentNodeId ? { type: "ENTER_INLINE_EDIT", nodeId: ctx.currentNodeId } : null),
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

const indentNode = {
  id: "indent_node",
  name: "Indent",
  description: "Reparent node under previous sibling",
  category: "Edit",
  shortcuts: ["Tab"],
  execute: () => ({ type: "INDENT_NODE" }),
} satisfies CommandDef

const insertAbove = {
  id: "insert_above",
  name: "Insert Above",
  description: "Insert sibling above and enter inline edit",
  category: "Edit",
  shortcuts: ["p"],
  execute: () => ({ type: "INSERT_ABOVE" }),
} satisfies CommandDef

const insertBelow = {
  id: "insert_below",
  name: "Insert Below",
  description: "Insert sibling below and enter inline edit",
  category: "Edit",
  shortcuts: ["n"],
  execute: () => ({ type: "INSERT_BELOW" }),
} satisfies CommandDef

const duplicateNode = {
  id: "duplicate_node",
  name: "Duplicate",
  description: "Duplicate current node",
  category: "Edit",
  shortcuts: ["d"],
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
  shortcuts: ["Ctrl+C"],
  execute: () => ({ type: "CLIPBOARD_COPY" }),
} satisfies CommandDef

const clipboardCut = {
  id: "clipboard_cut",
  name: "Cut",
  description: "Cut selected node(s) to clipboard",
  category: "Edit",
  shortcuts: ["Ctrl+X"],
  execute: () => ({ type: "CLIPBOARD_CUT" }),
} satisfies CommandDef

const clipboardPaste = {
  id: "clipboard_paste",
  name: "Paste",
  description: "Paste node(s) from clipboard",
  category: "Edit",
  shortcuts: ["Ctrl+V"],
  execute: () => ({ type: "CLIPBOARD_PASTE" }),
} satisfies CommandDef

// Move-to-board commands (m-prefix chords)
const moveToInbox = {
  id: "move_to_inbox",
  name: "Move to Inbox",
  description: "Move selected node(s) to inbox",
  category: "Edit",
  shortcuts: ["mi"],
  execute: () => ({ type: "MOVE_TO_BOARD", boardId: "@inbox" }),
} satisfies CommandDef

const moveToJournal = {
  id: "move_to_journal",
  name: "Move to Journal",
  description: "Move selected node(s) to journal",
  category: "Edit",
  shortcuts: ["mj"],
  execute: () => ({ type: "MOVE_TO_BOARD", boardId: "@journal" }),
} satisfies CommandDef

const moveToNext = {
  id: "move_to_next",
  name: "Move to Next Actions",
  description: "Move selected node(s) to next actions",
  category: "Edit",
  shortcuts: ["me"],
  execute: () => ({ type: "MOVE_TO_BOARD", boardId: "@next" }),
} satisfies CommandDef

// Link/reparent pickers
const addLink = {
  id: "add_link",
  name: "Add Link",
  description: "Open link/reference picker to add a link",
  category: "Edit",
  shortcuts: ["Ctrl+L"],
  execute: () => ({ type: "ADD_LINK" }),
} satisfies CommandDef

const reparentPicker = {
  id: "reparent_picker",
  name: "Reparent/Move",
  description: "Open reparent picker to move node to a new parent",
  category: "Edit",
  shortcuts: ["Ctrl+R"],
  execute: () => ({ type: "REPARENT_PICKER" }),
} satisfies CommandDef

// Archive (remove from view, still searchable) — stub
const archiveNode = {
  id: "archive",
  name: "Archive",
  description: "Archive node (remove from view, still searchable)",
  category: "Edit",
  shortcuts: ["e"],
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
  description: "Quick-add a new item to inbox",
  category: "Edit",
  shortcuts: ["c"],
  execute: () => ({ type: "CAPTURE_INBOX" }),
} satisfies CommandDef

// Capture with dialog — stub
const captureDialog = {
  id: "capture_dialog",
  name: "Capture with Dialog",
  description: "Add a new item via capture dialog",
  category: "Edit",
  shortcuts: ["C"],
  execute: () => ({ type: "CAPTURE_DIALOG" }),
} satisfies CommandDef

// Add child item (a-prefix chord: ai)
const insertChild = {
  id: "insert_child",
  name: "Add Child",
  description: "Insert a child item under the current node",
  category: "Edit",
  shortcuts: ["ai"],
  execute: () => ({ type: "INSERT_CHILD" }),
} satisfies CommandDef

// Add sibling below (a-prefix chord: aj) — alias for insert_below
const addSiblingBelow = {
  id: "add_sibling_below",
  name: "Add Sibling Below",
  description: "Insert a sibling item below the current node",
  category: "Edit",
  shortcuts: ["aj"],
  execute: () => ({ type: "INSERT_BELOW" }),
} satisfies CommandDef

// Add item at parent level (a-prefix chord: ah)
const insertAtParent = {
  id: "insert_at_parent",
  name: "Add at Parent Level",
  description: "Insert an item at the parent's level (uncle node)",
  category: "Edit",
  shortcuts: ["ah"],
  execute: () => ({ type: "INSERT_AT_PARENT" }),
} satisfies CommandDef

// Add tag (a-prefix chord: a#)
const addTag = {
  id: "add_tag",
  name: "Add Tag",
  description: "Add a tag to the current node",
  category: "Edit",
  shortcuts: ["a#"],
  execute: () => ({ type: "SET_LABEL" }),
} satisfies CommandDef

// Add assignee (a-prefix chord: a@)
const addAssignee = {
  id: "add_assignee",
  name: "Add Assignee",
  description: "Assign a person to the current node",
  category: "Edit",
  shortcuts: ["a@"],
  execute: () => ({ type: "SET_ASSIGNEE" }),
} satisfies CommandDef

// Add dep/project (a-prefix chord: a+)
const addProject = {
  id: "add_project",
  name: "Add to Project",
  description: "Add to a project / add dependency",
  category: "Edit",
  shortcuts: ["a+"],
  execute: () => ({ type: "REPARENT_PICKER" }),
} satisfies CommandDef

// Add backlink/label (a-prefix chord: a[)
const addBacklink = {
  id: "add_backlink",
  name: "Add Backlink",
  description: "Add a backlink or label reference",
  category: "Edit",
  shortcuts: ["a["],
  execute: () => ({ type: "ADD_LINK" }),
} satisfies CommandDef

// Move to home board (mh chord)
const moveToHome = {
  id: "move_to_home",
  name: "Move to Home",
  description: "Move selected node(s) to home board",
  category: "Edit",
  shortcuts: ["mh"],
  execute: () => ({ type: "MOVE_TO_BOARD", boardId: "@home" }),
} satisfies CommandDef

export const editCommands: CommandDef[] = [
  enterMoveMode,
  confirmMove,
  cancelMove,
  enterInlineEdit,
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
  moveToInbox,
  moveToJournal,
  moveToNext,
  moveToHome,
  addLink,
  reparentPicker,
  archiveNode,
  captureInbox,
  captureDialog,
  insertChild,
  addSiblingBelow,
  insertAtParent,
  addTag,
  addAssignee,
  addProject,
  addBacklink,
]
