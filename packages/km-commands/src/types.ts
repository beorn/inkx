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

// Combined action type that commands can return
export type CommandAction = BoardAction | TaskSetStatusAction;

// Re-export for convenience
export type { BoardAction, BoardState, TNode, TPath, ViewMode, TaskStatus };
