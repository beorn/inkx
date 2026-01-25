import type {
  SimplifiedBoardAction,
  TNode,
  ViewMode,
  TaskStatus,
  NodeDirection,
} from "@km/board";

export type CommandCategory =
  | "Navigation"
  | "Selection"
  | "Edit"
  | "Task"
  | "Fold"
  | "View";

export type CommandMode = "normal" | "move" | "search" | "input";

/**
 * Command execution context.
 *
 * All fields are passed directly by the caller - no tree traversal needed.
 * Commands receive pre-computed position info and can return actions.
 */
export interface CommandContext {
  // Current node (passed by caller)
  currentNode: TNode | null;
  currentNodeId: string | null;

  // Selection
  selectedNodes: string[];

  // View
  viewMode: ViewMode;

  // Position (passed by caller, not derived from tree)
  siblingIndex: number;
  siblingCount: number;
  columnIndex: number;
  columnCount: number;

  // State flags (for commands that need them)
  moveMode: boolean;
  foldedNodes: Set<string>;
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
export interface ZoomOutwardsAction {
  type: "ZOOM_OUTWARDS";
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

export interface ZoomInwardsAction {
  type: "ZOOM_INWARDS"; // Zoom in one level closer to selected node
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
  | ZoomInwardsAction
  | PageJumpAction;

export type UIAction =
  | ZoomOutwardsAction
  | OpenDetailPaneAction
  | CloseDetailPaneAction
  | ShowHelpAction
  | HideHelpAction
  | CycleViewModeAction
  | DeleteNodeAction
  | SelectAllProgressiveAction
  | TUIAction;

// High-level navigation actions (interpreted by TUI, not dispatched to reducer)
// These are returned by commands and converted to SimplifiedBoardAction by the TUI handler
export interface CursorMoveAction {
  type: "CURSOR_MOVE";
  dir: NodeDirection;
}

export interface NavBackAction {
  type: "NAV_BACK";
}

export interface NavForwardAction {
  type: "NAV_FORWARD";
}

export interface FoldLevelAction {
  type: "FOLD_LEVEL";
  depth: number;
}

export interface UnfoldLevelAction {
  type: "UNFOLD_LEVEL";
  depth: number;
}

export interface SelectAllSiblingsAction {
  type: "SELECT_ALL_SIBLINGS";
}

export interface SelectAllAction {
  type: "SELECT_ALL";
}

export interface ExtendSelectUpAction {
  type: "EXTEND_SELECT_UP";
}

export interface ExtendSelectDownAction {
  type: "EXTEND_SELECT_DOWN";
}

export interface ExtendSelectLeftAction {
  type: "EXTEND_SELECT_LEFT";
}

export interface ExtendSelectRightAction {
  type: "EXTEND_SELECT_RIGHT";
}

export interface ShiftUpAction {
  type: "SHIFT_UP";
}

export interface ShiftDownAction {
  type: "SHIFT_DOWN";
}

export interface ShiftLeftAction {
  type: "SHIFT_LEFT";
}

export interface ShiftRightAction {
  type: "SHIFT_RIGHT";
}

export interface EnterMoveModeAction {
  type: "ENTER_MOVE_MODE";
}

export interface ConfirmMoveAction {
  type: "CONFIRM_MOVE";
}

export interface CancelMoveAction {
  type: "CANCEL_MOVE";
}

export type NavigationAction =
  | CursorMoveAction
  | NavBackAction
  | NavForwardAction
  | FoldLevelAction
  | UnfoldLevelAction
  | SelectAllSiblingsAction
  | SelectAllAction
  | ExtendSelectUpAction
  | ExtendSelectDownAction
  | ExtendSelectLeftAction
  | ExtendSelectRightAction
  | ShiftUpAction
  | ShiftDownAction
  | ShiftLeftAction
  | ShiftRightAction
  | EnterMoveModeAction
  | ConfirmMoveAction
  | CancelMoveAction;

// Combined action type that commands can return
export type CommandAction =
  | SimplifiedBoardAction
  | NavigationAction
  | TaskSetStatusAction
  | HistoryAction
  | UIAction;

// Re-export for convenience
export type { SimplifiedBoardAction, TNode, ViewMode, TaskStatus };
