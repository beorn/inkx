import type { BoardAction, BoardState, TNode, TPath, ViewMode, TaskStatus } from "@km/board";

export type CommandCategory =
  | "Navigation"
  | "Selection"
  | "Edit"
  | "Task"
  | "Fold"
  | "View";

export type CommandMode = "normal" | "move" | "search" | "input";

export interface CommandContext {
  currentNode: TNode | null;
  currentNodeId: string | null;
  selectedNodes: string[];
  cursor: TPath;
  boardState: BoardState;
  viewMode: ViewMode;
  siblingCount: number;
  siblingIndex: number;
  columnIndex: number;
  columnCount: number;
}

export interface CommandDef {
  id: string;
  name: string;
  description: string;
  category: CommandCategory;
  shortcuts?: string[];
  modes?: CommandMode[];
  execute: (ctx: CommandContext) => CommandAction | CommandAction[] | null;
}

// Custom action types for commands that operate outside the board reducer
export interface TaskSetStatusAction {
  type: "TASK_SET_STATUS";
  nodeId: string;
  status: TaskStatus;
}

// History actions for undo/redo (handled at app level, not board reducer)
export interface HistoryUndoAction {
  type: "HISTORY_UNDO";
}

export interface HistoryRedoAction {
  type: "HISTORY_REDO";
}

export type HistoryAction = HistoryUndoAction | HistoryRedoAction;

// Combined action type that commands can return
export type CommandAction = BoardAction | TaskSetStatusAction | HistoryAction;

// Re-export for convenience
export type { BoardAction, BoardState, TNode, TPath, ViewMode, TaskStatus };
