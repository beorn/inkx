/**
 * History Commands (Undo/Redo)
 *
 * These commands return special HistoryOp types that are handled
 * at the application level (not by the board reducer).
 *
 * The app layer should maintain an action history stack and handle
 * HISTORY_UNDO by popping and reversing the last action,
 * HISTORY_REDO by re-applying a previously undone action.
 */

import type { CommandDef, HistoryUndoOp, HistoryRedoOp } from "../types.ts"

const undoCommand = {
  id: "undo",
  name: "Undo",
  description: "Undo the last action",
  category: "Edit",
  execute: () => {
    return { type: "HISTORY_UNDO" } satisfies HistoryUndoOp
  },
} satisfies CommandDef

const redoCommand = {
  id: "redo",
  name: "Redo",
  description: "Redo the last undone action",
  category: "Edit",
  execute: () => {
    return { type: "HISTORY_REDO" } satisfies HistoryRedoOp
  },
} satisfies CommandDef

export const historyCommands: CommandDef[] = [undoCommand, redoCommand]
