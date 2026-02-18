/**
 * Command System Types
 *
 * Commands produce CommandActions which are dispatched to handlers in board-actions.ts.
 * Card-level actions (delete, indent, status, move, etc.) are inherently batch-aware:
 * handlers use getSelectedCards(ctx) to operate on multi-selected or cursor card.
 *
 * Batch convention: gather → validate (all-or-nothing) → confirm? → execute → cleanup.
 * See board-actions-edit.ts header for the full pattern.
 */

import type { BoardAction, TNode, ViewMode, TaskStatus, NodeDirection } from "@km/board"

export type CommandCategory = "Navigation" | "Selection" | "Edit" | "Task" | "Fold" | "View" | "TextEdit"

/** Filter categories for property-based filtering */
export type FilterCategory = "taskStatus" | "priority" | "dueDate" | "assignedTo" | "nodeType"

export type CommandMode = "normal" | "move" | "search" | "input"

/**
 * Command execution context.
 *
 * All fields are passed directly by the caller - no tree traversal needed.
 * Commands receive pre-computed position info and can return actions.
 */
export interface CommandContext {
  // Current node (passed by caller)
  currentNode: TNode | null
  currentNodeId: string | null

  // Selection
  selectedNodes: string[]

  // View
  viewMode: ViewMode

  // Position (passed by caller, not derived from tree)
  siblingIndex: number
  siblingCount: number
  columnIndex: number
  columnCount: number

  // State flags (for commands that need them)
  moveMode: boolean
  foldedNodes: Set<string>
}

export interface CommandDef {
  id: string
  name: string
  description: string
  category: CommandCategory
  shortcuts?: string[]
  modes?: CommandMode[]
  execute: (ctx: CommandContext) => CommandAction | CommandAction[] | null
}

// Text editing action types (dispatched to TextEditTarget)
export interface TextInsertAction {
  type: "TEXT_INSERT"
  char: string
}

export interface TextDeleteBackwardAction {
  type: "TEXT_DELETE_BACKWARD"
}

export interface TextDeleteForwardAction {
  type: "TEXT_DELETE_FORWARD"
}

export interface TextCursorLeftAction {
  type: "TEXT_CURSOR_LEFT"
}

export interface TextCursorRightAction {
  type: "TEXT_CURSOR_RIGHT"
}

export interface TextCursorUpAction {
  type: "TEXT_CURSOR_UP"
}

export interface TextCursorDownAction {
  type: "TEXT_CURSOR_DOWN"
}

export interface TextCursorStartAction {
  type: "TEXT_CURSOR_START"
}

export interface TextCursorEndAction {
  type: "TEXT_CURSOR_END"
}

export interface TextDeleteWordAction {
  type: "TEXT_DELETE_WORD"
}

export interface TextDeleteToStartAction {
  type: "TEXT_DELETE_TO_START"
}

export interface TextDeleteToEndAction {
  type: "TEXT_DELETE_TO_END"
}

export interface TextConfirmAction {
  type: "TEXT_CONFIRM"
}

export interface TextExitEditAction {
  type: "TEXT_EXIT_EDIT"
}

export interface TextYankAction {
  type: "TEXT_YANK"
}

export type TextEditAction =
  | TextInsertAction
  | TextDeleteBackwardAction
  | TextDeleteForwardAction
  | TextCursorLeftAction
  | TextCursorRightAction
  | TextCursorUpAction
  | TextCursorDownAction
  | TextCursorStartAction
  | TextCursorEndAction
  | TextDeleteWordAction
  | TextDeleteToStartAction
  | TextDeleteToEndAction
  | TextConfirmAction
  | TextExitEditAction
  | TextYankAction

// Detail pane action
export interface DetailPaneCloseAction {
  type: "DETAIL_PANE_CLOSE"
}

// Custom action types for commands that operate outside the board reducer
export interface TaskSetStatusAction {
  type: "TASK_SET_STATUS"
  nodeId: string
  status: TaskStatus
}

// History actions for undo/redo (handled at app level, not board reducer)
export interface HistoryUndoAction {
  type: "HISTORY_UNDO"
}

export interface HistoryRedoAction {
  type: "HISTORY_REDO"
}

export type HistoryAction = HistoryUndoAction | HistoryRedoAction

// UI actions (handled by TUI, not board reducer)
interface ZoomOutwardsAction {
  type: "ZOOM_OUTWARDS"
}

interface OpenDetailPaneAction {
  type: "OPEN_DETAIL_PANE"
}

interface CloseDetailPaneAction {
  type: "CLOSE_DETAIL_PANE"
}

interface ToggleDetailPaneAction {
  type: "TOGGLE_DETAIL_PANE"
}

interface ShowHelpAction {
  type: "SHOW_HELP"
}

interface HideHelpAction {
  type: "HIDE_HELP"
}

interface CycleViewModeAction {
  type: "CYCLE_VIEW_MODE"
}

interface CycleIconStyleAction {
  type: "CYCLE_ICON_STYLE"
}

interface DeleteNodeAction {
  type: "DELETE_NODE"
  nodeId: string
}

interface SelectAllProgressiveAction {
  type: "SELECT_ALL_PROGRESSIVE"
}

// TUI-specific actions (dialogs, quit, favorites)
interface QuitAction {
  type: "QUIT"
}

interface ShowNewItemDialogAction {
  type: "SHOW_NEW_ITEM_DIALOG"
}

interface ShowProjectPickerAction {
  type: "SHOW_PROJECT_PICKER"
}

interface ShowSearchDialogAction {
  type: "SHOW_SEARCH_DIALOG"
}

interface JumpToFavoriteAction {
  type: "JUMP_TO_FAVORITE"
  favoriteNumber: number // 1-9
}

interface JumpToColumnAction {
  type: "JUMP_TO_COLUMN"
  columnNumber: number // 1-9 (maps to column index 0-8)
}

interface CloseOrQuitAction {
  type: "CLOSE_OR_QUIT" // Contextual: close dialog/pane/mode, or quit
}

interface DialogNavUpAction {
  type: "DIALOG_NAV_UP"
}

interface DialogNavDownAction {
  type: "DIALOG_NAV_DOWN"
}

interface DialogNavLeftAction {
  type: "DIALOG_NAV_LEFT"
}

interface DialogNavRightAction {
  type: "DIALOG_NAV_RIGHT"
}

interface DialogConfirmAction {
  type: "DIALOG_CONFIRM"
}

interface DialogCancelAction {
  type: "DIALOG_CANCEL"
}

interface ConsoleToggleAction {
  type: "CONSOLE_TOGGLE"
}

interface ConsoleCloseAction {
  type: "CONSOLE_CLOSE"
}

interface SyncPaneToggleAction {
  type: "SYNC_PANE_TOGGLE"
}

interface SyncPaneCloseAction {
  type: "SYNC_PANE_CLOSE"
}

interface DeleteConfirmExecuteAction {
  type: "DELETE_CONFIRM_EXECUTE"
}

interface DeleteConfirmCancelAction {
  type: "DELETE_CONFIRM_CANCEL"
}

interface ToggleSearchScopeAction {
  type: "TOGGLE_SEARCH_SCOPE"
}

interface ToastDismissAction {
  type: "TOAST_DISMISS"
}

interface DevTestToastAction {
  type: "DEV_TEST_TOAST"
}

// Fold operations (single-node, handled by TUI)
interface FoldNodeAction {
  type: "FOLD_NODE"
}

interface UnfoldNodeAction {
  type: "UNFOLD_NODE"
}

interface UnfoldRecursiveAction {
  type: "UNFOLD_RECURSIVE"
}

// Ignore operations (hide nodes from board)
interface IgnoreNodeAction {
  type: "IGNORE_NODE"
}

interface ToggleShowIgnoredAction {
  type: "TOGGLE_SHOW_IGNORED"
}

// Filter
interface ShowFilterDialogAction {
  type: "SHOW_FILTER_DIALOG"
}
interface SetFilterAction {
  type: "SET_FILTER"
  text: string
}
interface ClearFilterAction {
  type: "CLEAR_FILTER"
}
interface ToggleFilterPropertyAction {
  type: "TOGGLE_FILTER_PROPERTY"
  category: FilterCategory
  value: string
}
interface ClearFilterCategoryAction {
  type: "CLEAR_FILTER_CATEGORY"
  category: FilterCategory
}
interface ClearAllFilterPropertiesAction {
  type: "CLEAR_ALL_FILTER_PROPERTIES"
}
interface ToggleHideDoneAction {
  type: "TOGGLE_HIDE_DONE"
}
type FilterAction =
  | ShowFilterDialogAction
  | SetFilterAction
  | ClearFilterAction
  | ToggleFilterPropertyAction
  | ClearFilterCategoryAction
  | ClearAllFilterPropertiesAction
  | ToggleHideDoneAction

interface CommandPaletteAction {
  type: "COMMAND_PALETTE"
}

// Edit operations
interface InsertAboveAction {
  type: "INSERT_ABOVE"
}

interface InsertBelowAction {
  type: "INSERT_BELOW"
}

interface DuplicateNodeAction {
  type: "DUPLICATE_NODE"
  nodeId: string
}

// Property actions
interface SetDueDateAction {
  type: "SET_DUE_DATE"
  nodeId: string
}

interface SetStartDateAction {
  type: "SET_START_DATE"
  nodeId: string
}

interface SetRecurringAction {
  type: "SET_RECURRING"
  nodeId: string
}

interface SetPriorityAction {
  type: "SET_PRIORITY"
  nodeId: string
}

// Date prompt dialog actions
interface DatePromptConfirmAction {
  type: "DATE_PROMPT_CONFIRM"
}

interface DatePromptCancelAction {
  type: "DATE_PROMPT_CANCEL"
}

interface SetLabelAction {
  type: "SET_LABEL"
}

interface SetAssigneeAction {
  type: "SET_ASSIGNEE"
}

interface NoopAction {
  type: "NOOP"
}

interface OpenInSystemAction {
  type: "OPEN_IN_SYSTEM"
  nodeId: string
}

interface OpenInTerminalAction {
  type: "OPEN_IN_TERMINAL"
  nodeId: string
}

interface EnterInlineEditAction {
  type: "ENTER_INLINE_EDIT"
  nodeId: string
  blockIndex?: number // 0 = title (default), 1+ = body children
}

interface EditBlockNavigateAction {
  type: "EDIT_BLOCK_NAVIGATE"
  direction: "up" | "down"
}

interface IndentNodeAction {
  type: "INDENT_NODE"
}

interface OutdentNodeAction {
  type: "OUTDENT_NODE"
}

interface NavSiblingBoardAction {
  type: "NAV_SIBLING_BOARD"
  direction: "next" | "prev"
}

interface ZoomInwardsAction {
  type: "ZOOM_INWARDS" // Zoom in one level closer to selected node
}

interface FollowLinkAction {
  type: "FOLLOW_LINK" // Navigate to embedded link target in context
}

interface PageJumpAction {
  type: "PAGE_JUMP"
  direction: "up" | "down"
}

// Move mode command actions (TUI augments with context before dispatching to board)
// These are returned by commands and converted to full BoardAction by board-actions.ts
interface EnterMoveModeAction {
  type: "ENTER_MOVE_MODE"
}

interface ConfirmMoveAction {
  type: "CONFIRM_MOVE"
}

interface CancelMoveAction {
  type: "CANCEL_MOVE"
}

type MoveAction = EnterMoveModeAction | ConfirmMoveAction | CancelMoveAction

// Clipboard actions
interface ClipboardCopyAction {
  type: "CLIPBOARD_COPY"
}

interface ClipboardCutAction {
  type: "CLIPBOARD_CUT"
}

interface ClipboardPasteAction {
  type: "CLIPBOARD_PASTE"
}

interface ShiftUpAction {
  type: "SHIFT_UP"
}

interface ShiftDownAction {
  type: "SHIFT_DOWN"
}

interface ShiftLeftAction {
  type: "SHIFT_LEFT"
}

interface ShiftRightAction {
  type: "SHIFT_RIGHT"
}

export type TUIAction =
  | QuitAction
  | ShowNewItemDialogAction
  | ShowProjectPickerAction
  | ShowSearchDialogAction
  | JumpToFavoriteAction
  | JumpToColumnAction
  | CloseOrQuitAction
  | EnterInlineEditAction
  | EditBlockNavigateAction
  | IndentNodeAction
  | OutdentNodeAction
  | NavSiblingBoardAction
  | ZoomInwardsAction
  | FollowLinkAction
  | PageJumpAction
  | ShiftUpAction
  | ShiftDownAction
  | ShiftLeftAction
  | ShiftRightAction
  | MoveAction
  | OpenInSystemAction
  | OpenInTerminalAction
  | DialogNavUpAction
  | DialogNavDownAction
  | DialogNavLeftAction
  | DialogNavRightAction
  | DialogConfirmAction
  | DialogCancelAction
  | ToggleSearchScopeAction
  | ConsoleToggleAction
  | ConsoleCloseAction
  | SyncPaneToggleAction
  | SyncPaneCloseAction
  | DeleteConfirmExecuteAction
  | DeleteConfirmCancelAction
  | ToastDismissAction
  | DevTestToastAction
  | NoopAction
  | FoldNodeAction
  | UnfoldNodeAction
  | UnfoldRecursiveAction
  | IgnoreNodeAction
  | ToggleShowIgnoredAction
  | FilterAction
  | CommandPaletteAction
  | InsertAboveAction
  | InsertBelowAction
  | DuplicateNodeAction
  | SetDueDateAction
  | SetStartDateAction
  | SetRecurringAction
  | SetPriorityAction
  | SetLabelAction
  | SetAssigneeAction
  | DatePromptConfirmAction
  | DatePromptCancelAction
  | ClipboardCopyAction
  | ClipboardCutAction
  | ClipboardPasteAction

export type UIAction =
  | ZoomOutwardsAction
  | OpenDetailPaneAction
  | CloseDetailPaneAction
  | ToggleDetailPaneAction
  | ShowHelpAction
  | HideHelpAction
  | CycleViewModeAction
  | CycleIconStyleAction
  | DeleteNodeAction
  | SelectAllProgressiveAction
  | TUIAction

// High-level navigation actions (interpreted by TUI, not dispatched to reducer)
// These are returned by commands and converted to BoardAction by the TUI handler
interface CursorMoveAction {
  type: "CURSOR_MOVE"
  dir: NodeDirection
}

interface NavBackAction {
  type: "NAV_BACK"
}

interface NavForwardAction {
  type: "NAV_FORWARD"
}

interface FoldLevelAction {
  type: "FOLD_LEVEL"
  depth: number
}

interface UnfoldLevelAction {
  type: "UNFOLD_LEVEL"
  depth: number
}

interface SelectAllSiblingsAction {
  type: "SELECT_ALL_SIBLINGS"
}

interface SelectAllAction {
  type: "SELECT_ALL"
}

interface ExtendSelectUpAction {
  type: "EXTEND_SELECT_UP"
}

interface ExtendSelectDownAction {
  type: "EXTEND_SELECT_DOWN"
}

interface ExtendSelectLeftAction {
  type: "EXTEND_SELECT_LEFT"
}

interface ExtendSelectRightAction {
  type: "EXTEND_SELECT_RIGHT"
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

// Combined action type that commands can return
export type CommandAction =
  | BoardAction
  | NavigationAction
  | TaskSetStatusAction
  | HistoryAction
  | UIAction
  | TextEditAction
  | DetailPaneCloseAction

// Re-export for convenience
export type { BoardAction, TNode, ViewMode, TaskStatus }
