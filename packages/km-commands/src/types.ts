import type {
  BoardAction,
  BoardState,
  TNode,
  TPath,
  ViewMode,
  TaskStatus,
} from "@km/board";

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

// UI actions (handled by TUI, not board reducer)
export interface GoUpPathAction {
  type: "GO_UP_PATH";
}

export interface OpenDetailPaneAction {
  type: "OPEN_DETAIL_PANE";
}

export interface CloseDetailPaneAction {
  type: "CLOSE_DETAIL_PANE";
}

export interface ShowHelpAction {
  type: "SHOW_HELP";
}

export interface HideHelpAction {
  type: "HIDE_HELP";
}

export interface CycleViewModeAction {
  type: "CYCLE_VIEW_MODE";
}

export interface DeleteNodeAction {
  type: "DELETE_NODE";
  nodeId: string;
}

export interface SelectAllProgressiveAction {
  type: "SELECT_ALL_PROGRESSIVE";
}

// TUI-specific actions (dialogs, quit, favorites)
export interface QuitAction {
  type: "QUIT";
}

export interface ShowNewItemDialogAction {
  type: "SHOW_NEW_ITEM_DIALOG";
}

export interface ShowProjectPickerAction {
  type: "SHOW_PROJECT_PICKER";
}

export interface JumpToFavoriteAction {
  type: "JUMP_TO_FAVORITE";
  favoriteNumber: number; // 1-9
}

export interface JumpToColumnAction {
  type: "JUMP_TO_COLUMN";
  columnNumber: number; // 1-9 (maps to column index 0-8)
}

export interface CloseOrQuitAction {
  type: "CLOSE_OR_QUIT"; // Contextual: close dialog/pane/mode, or quit
}

export interface OutdentNodeAction {
  type: "OUTDENT_NODE";
}

export interface NavSiblingBoardAction {
  type: "NAV_SIBLING_BOARD";
  direction: "next" | "prev";
}

export interface EnterNodeAction {
  type: "ENTER_NODE"; // Like zoom_in but stays in board view
}

export interface PageJumpAction {
  type: "PAGE_JUMP";
  direction: "up" | "down";
}

export type TUIAction =
  | QuitAction
  | ShowNewItemDialogAction
  | ShowProjectPickerAction
  | JumpToFavoriteAction
  | JumpToColumnAction
  | CloseOrQuitAction
  | OutdentNodeAction
  | NavSiblingBoardAction
  | EnterNodeAction
  | PageJumpAction;

export type UIAction =
  | GoUpPathAction
  | OpenDetailPaneAction
  | CloseDetailPaneAction
  | ShowHelpAction
  | HideHelpAction
  | CycleViewModeAction
  | DeleteNodeAction
  | SelectAllProgressiveAction
  | TUIAction;

// Combined action type that commands can return
export type CommandAction =
  | BoardAction
  | TaskSetStatusAction
  | HistoryAction
  | UIAction;

// Re-export for convenience
export type { BoardAction, BoardState, TNode, TPath, ViewMode, TaskStatus };
