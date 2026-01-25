/**
 * History Commands (Undo/Redo)
 *
 * These commands return special HistoryAction types that are handled
 * at the application level (not by the board reducer).
 *
 * The app layer should maintain an action history stack and handle
 * HISTORY_UNDO by popping and reversing the last action,
 * HISTORY_REDO by re-applying a previously undone action.
 */

import type {
  CommandDef,
  HistoryUndoAction,
  HistoryRedoAction,
} from "../types.ts"

export const undoCommand = {
  id: "undo",
  name: "Undo",
  description: "Undo the last action",
  category: "Edit",
  shortcuts: ["Ctrl+Z"],
  execute: () => {
    return { type: "HISTORY_UNDO" } satisfies HistoryUndoAction
  },
} satisfies CommandDef

export const redoCommand = {
  id: "redo",
  name: "Redo",
  description: "Redo the last undone action",
  category: "Edit",
  shortcuts: ["Ctrl+Shift+Z", "Ctrl+Y"],
  execute: () => {
    return { type: "HISTORY_REDO" } satisfies HistoryRedoAction
  },
} satisfies CommandDef

export const historyCommands: CommandDef[] = [undoCommand, redoCommand]
