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

import type { CommandDef, HistoryUndoAction, HistoryRedoAction } from "../types.ts";

export const undoCommand: CommandDef = {
  id: "undo",
  name: "Undo",
  description: "Undo the last action",
  category: "Edit",
  shortcuts: ["Ctrl-z", "u"],
  execute: () => {
    return { type: "HISTORY_UNDO" } satisfies HistoryUndoAction;
  },
};

export const redoCommand: CommandDef = {
  id: "redo",
  name: "Redo",
  description: "Redo the last undone action",
  category: "Edit",
  shortcuts: ["Ctrl-Shift-z", "Ctrl-y"],
  execute: () => {
    return { type: "HISTORY_REDO" } satisfies HistoryRedoAction;
  },
};

export const historyCommands: CommandDef[] = [undoCommand, redoCommand];
