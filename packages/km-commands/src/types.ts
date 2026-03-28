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
  /** Exact cursor position — may be a sub-block within the card (currentNodeId). */
  cursorNodeId?: string | null

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
  foldDepths: Map<string, number>

  /** Destination for location-aware commands (e.g., "i" for inbox, "1" for favorite 1) */
  targetId?: string
}

/** Result of resolving a keybinding (key → command + optional target) */
export interface ResolvedBinding {
  commandId: string
  targetId?: string
  /** Direct execute function — bypasses command registry lookup when set */
  execute?: (ctx: CommandContext) => CommandAction | CommandAction[] | null
}

export interface CommandDef {
  id: string
  name: string
  /** Short label for which-key popup (falls back to name) */
  shortLabel?: string
  description: string
  category: CommandCategory
  modes?: CommandMode[]
  execute: (ctx: CommandContext) => CommandAction | CommandAction[] | null
}

// Text editing action types (dispatched to TextEditTarget)
export type TextEditAction =
  | { type: "TEXT_INSERT"; char: string }
  | { type: "TEXT_DELETE_BACKWARD" }
  | { type: "TEXT_DELETE_FORWARD" }
  | { type: "TEXT_CURSOR_LEFT" }
  | { type: "TEXT_CURSOR_RIGHT" }
  | { type: "TEXT_CURSOR_UP" }
  | { type: "TEXT_CURSOR_DOWN" }
  | { type: "TEXT_CURSOR_START" }
  | { type: "TEXT_CURSOR_END" }
  | { type: "TEXT_DELETE_WORD" }
  | { type: "TEXT_DELETE_TO_START" }
  | { type: "TEXT_DELETE_TO_END" }
  | { type: "TEXT_CONFIRM" }
  | { type: "TEXT_EXIT_EDIT" }
  | { type: "TEXT_YANK" }
  | { type: "TEXT_LINEBREAK_SPLIT" }
  | { type: "TEXT_LINEBREAK_BEFORE" }
  | { type: "TEXT_LINEBREAK_CHILD" }
  | { type: "TEXT_LINEBREAK_AFTER" }
  | { type: "TEXT_CHILD_BLOCK" }

// Custom action types for commands that operate outside the board reducer
export interface TaskSetStatusAction {
  type: "TASK_SET_STATUS"
  nodeId: string
  status: TaskStatus
}

export interface ClearTaskAction {
  type: "CLEAR_TASK"
  nodeId: string
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

interface ZoomToRootAction {
  type: "ZOOM_TO_ROOT"
}

export interface CloseDetailPaneAction {
  type: "CLOSE_DETAIL_PANE"
}

interface ToggleDetailPaneAction {
  type: "TOGGLE_DETAIL_PANE"
}

export interface ShowHelpAction {
  type: "SHOW_HELP"
}

export interface HideHelpAction {
  type: "HIDE_HELP"
}

interface HelpScrollUpAction {
  type: "HELP_SCROLL_UP"
}

interface HelpScrollDownAction {
  type: "HELP_SCROLL_DOWN"
}

export interface CycleViewModeAction {
  type: "CYCLE_VIEW_MODE"
}

interface CycleIconStyleAction {
  type: "CYCLE_ICON_STYLE"
}

export interface DeleteNodeAction {
  type: "DELETE_NODE"
  nodeId: string
}

/** Select all (progressive: column first, then board-wide) */
export interface SelectAllProgressiveAction {
  type: "SELECT_ALL"
}

// TUI-specific actions (dialogs, quit, favorites)
export interface QuitAction {
  type: "QUIT"
}

export interface ShowNewItemDialogAction {
  type: "SHOW_NEW_ITEM_DIALOG"
}

export interface ShowItemPickerAction {
  type: "SHOW_ITEM_PICKER"
}

interface ShowSearchDialogAction {
  type: "SHOW_SEARCH_DIALOG"
}

/** Unified verb x location action. Replaces stringly-typed action types like GOTO_BOARD, JUMP_TO_FAVORITE. */
export interface VerbAction {
  type: "CURSOR_TO" | "REPARENT_TO" | "LINK_TO" | "CREATE_AT"
  locationKey: string // location key — resolved by handler using repo context
}

export interface JumpToColumnAction {
  type: "JUMP_TO_COLUMN"
  columnNumber: number // 1-9 (maps to column index 0-8)
}

export interface CloseOrQuitAction {
  type: "CLOSE_OR_QUIT" // Contextual: close dialog/pane/mode, or quit
}

interface AddLinkAction {
  type: "ADD_LINK" // Open link/reference picker
}

interface ReparentPickerAction {
  type: "REPARENT_PICKER" // Open reparent/move-to picker
}

export interface DialogNavUpAction {
  type: "DIALOG_NAV_UP"
}

export interface DialogNavDownAction {
  type: "DIALOG_NAV_DOWN"
}

export interface DialogNavLeftAction {
  type: "DIALOG_NAV_LEFT"
}

export interface DialogNavRightAction {
  type: "DIALOG_NAV_RIGHT"
}

export interface DialogConfirmAction {
  type: "DIALOG_CONFIRM"
}

export interface DialogCancelAction {
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

// Fold operations (handled by TUI)
// scope: "root" = board-wide (used by fold_all/unfold_all)
// scope: undefined = cursor node (default, used by fold_node/unfold_node)
interface FoldNodeAction {
  type: "FOLD_NODE"
  scope?: "root"
}

interface UnfoldNodeAction {
  type: "UNFOLD_NODE"
  scope?: "root"
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
interface ClearFiltersAction {
  type: "CLEAR_FILTERS"
}
type FilterAction =
  | ShowFilterDialogAction
  | SetFilterAction
  | ClearFilterAction
  | ToggleFilterPropertyAction
  | ClearFilterCategoryAction
  | ClearAllFilterPropertiesAction
  | ToggleHideDoneAction
  | ClearFiltersAction

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

interface InsertChildAction {
  type: "INSERT_CHILD"
}

interface InsertAtParentAction {
  type: "INSERT_AT_PARENT"
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

interface SetPriority0Action {
  type: "SET_PRIORITY_0"
  nodeId: string
}

interface SetPriority1Action {
  type: "SET_PRIORITY_1"
  nodeId: string
}

interface SetPriority2Action {
  type: "SET_PRIORITY_2"
  nodeId: string
}

interface SetPriority3Action {
  type: "SET_PRIORITY_3"
  nodeId: string
}

interface SetPriority4Action {
  type: "SET_PRIORITY_4"
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

interface IncreaseOutlineDepthAction {
  type: "INCREASE_OUTLINE_DEPTH"
}

interface DecreaseOutlineDepthAction {
  type: "DECREASE_OUTLINE_DEPTH"
}

interface DevTestToastAction {
  type: "DEV_TEST_TOAST"
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

export interface EditBlockNavigateAction {
  type: "EDIT_BLOCK_NAVIGATE"
  direction: "up" | "down"
}

interface IndentNodeAction {
  type: "INDENT_NODE"
}

export interface OutdentNodeAction {
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
// Visual mode (vim-style range selection)
interface VisualModeEnterAction {
  type: "VISUAL_MODE_ENTER"
}

interface VisualModeExitAction {
  type: "VISUAL_MODE_EXIT"
}

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

// Stub actions for v2 keybindings (TODO: implement handlers)
interface ArchiveNodeAction {
  type: "ARCHIVE_NODE"
  nodeId: string
}

interface CaptureAction {
  type: "CAPTURE"
  /** Preset location (e.g., "inbox"). Undefined = open dialog with picker. */
  location?: string
}

interface SettingsAction {
  type: "SETTINGS"
}

// Pane operations (Ctrl+W chords — windowing)
interface PaneSplitAction {
  type: "PANE_SPLIT"
  direction: "vertical" | "horizontal"
}

interface PaneCloseAction {
  type: "PANE_CLOSE"
}

interface PaneFocusAction {
  type: "PANE_FOCUS"
  direction: "left" | "right" | "up" | "down"
}

interface PaneFocusPreviousAction {
  type: "PANE_FOCUS_PREVIOUS"
}

interface PaneFocusCycleAction {
  type: "PANE_FOCUS_CYCLE"
  direction: "next" | "prev"
}

interface PaneFocusNumberAction {
  type: "PANE_FOCUS_NUMBER"
  number: number
}

interface PaneResizeAction {
  type: "PANE_RESIZE"
  delta: number
}

interface PaneResizeVerticalAction {
  type: "PANE_RESIZE_VERTICAL"
  delta: number
}

interface PaneEqualizeAction {
  type: "PANE_EQUALIZE"
}

interface PaneZoomAction {
  type: "PANE_ZOOM"
}

interface PaneOnlyAction {
  type: "PANE_ONLY"
}

interface PaneSwapAction {
  type: "PANE_SWAP"
  direction: "left" | "right" | "up" | "down"
}

interface PaneSplitAndPickAction {
  type: "PANE_SPLIT_AND_PICK"
}

// Focus switching (Cmd+h/l — kitty protocol)
interface FocusBoardAction {
  type: "FOCUS_BOARD"
}

interface FocusDetailAction {
  type: "FOCUS_DETAIL"
}

// Text formatting (Cmd+b/i — kitty protocol, text edit only)
interface TextBoldAction {
  type: "TEXT_BOLD"
}

interface TextItalicAction {
  type: "TEXT_ITALIC"
}

// Task dialog (Cmd+t — kitty protocol)
interface ShowTaskDialogAction {
  type: "SHOW_TASK_DIALOG"
}

// Local find (inline search bar)
interface LocalFindOpenAction {
  type: "LOCAL_FIND_OPEN"
}

interface LocalFindNextAction {
  type: "LOCAL_FIND_NEXT"
}

interface LocalFindPrevAction {
  type: "LOCAL_FIND_PREV"
}

interface LocalFindCloseAction {
  type: "LOCAL_FIND_CLOSE"
}

interface LocalFindConfirmAction {
  type: "LOCAL_FIND_CONFIRM"
}

type LocalFindAction =
  | LocalFindOpenAction
  | LocalFindNextAction
  | LocalFindPrevAction
  | LocalFindCloseAction
  | LocalFindConfirmAction

// Search & replace dialog actions
interface SearchReplaceOpenAction {
  type: "SEARCH_REPLACE_OPEN"
}

interface SearchReplaceCloseAction {
  type: "SEARCH_REPLACE_CLOSE"
}

interface SearchReplaceNextAction {
  type: "SEARCH_REPLACE_NEXT"
}

interface SearchReplacePrevAction {
  type: "SEARCH_REPLACE_PREV"
}

interface SearchReplaceDoReplaceAction {
  type: "SEARCH_REPLACE_DO_REPLACE"
}

interface SearchReplaceDoReplaceAllAction {
  type: "SEARCH_REPLACE_DO_REPLACE_ALL"
}

interface SearchReplaceToggleRegexAction {
  type: "SEARCH_REPLACE_TOGGLE_REGEX"
}

interface FocusNextAction {
  type: "FOCUS_NEXT"
}

interface FocusPrevAction {
  type: "FOCUS_PREV"
}

interface ManageFavoritesAction {
  type: "MANAGE_FAVORITES"
}

interface FavoritesSelectKeyAction {
  type: "FAVORITES_SELECT_KEY"
  key: string
}

interface FavoritesAssignAction {
  type: "FAVORITES_ASSIGN"
}

interface FavoritesClearAction {
  type: "FAVORITES_CLEAR"
}

interface FavoritesBackAction {
  type: "FAVORITES_BACK"
}

type SearchReplaceAction =
  | SearchReplaceOpenAction
  | SearchReplaceCloseAction
  | SearchReplaceNextAction
  | SearchReplacePrevAction
  | SearchReplaceDoReplaceAction
  | SearchReplaceDoReplaceAllAction
  | SearchReplaceToggleRegexAction

export type TUIAction =
  | QuitAction
  | ShowNewItemDialogAction
  | ShowItemPickerAction
  | ShowSearchDialogAction
  | VerbAction
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
  | VisualModeEnterAction
  | VisualModeExitAction
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
  | InsertChildAction
  | InsertAtParentAction
  | DuplicateNodeAction
  | SetDueDateAction
  | SetStartDateAction
  | SetRecurringAction
  | SetPriorityAction
  | SetPriority0Action
  | SetPriority1Action
  | SetPriority2Action
  | SetPriority3Action
  | SetPriority4Action
  | SetLabelAction
  | SetAssigneeAction
  | DatePromptConfirmAction
  | DatePromptCancelAction
  | ClipboardCopyAction
  | ClipboardCutAction
  | ClipboardPasteAction
  | AddLinkAction
  | ReparentPickerAction
  | ArchiveNodeAction
  | CaptureAction
  | SettingsAction
  | PaneSplitAction
  | PaneCloseAction
  | PaneFocusAction
  | PaneFocusPreviousAction
  | PaneFocusCycleAction
  | PaneFocusNumberAction
  | PaneResizeAction
  | PaneResizeVerticalAction
  | PaneEqualizeAction
  | PaneZoomAction
  | PaneOnlyAction
  | PaneSwapAction
  | PaneSplitAndPickAction
  | FocusBoardAction
  | FocusDetailAction
  | TextBoldAction
  | TextItalicAction
  | ShowTaskDialogAction
  | LocalFindAction
  | SearchReplaceAction
  | FocusNextAction
  | FocusPrevAction
  | ManageFavoritesAction
  | FavoritesSelectKeyAction
  | FavoritesAssignAction
  | FavoritesClearAction
  | FavoritesBackAction
  | IncreaseOutlineDepthAction
  | DecreaseOutlineDepthAction
  | DevTestToastAction

export type UIAction =
  | ZoomOutwardsAction
  | ZoomToRootAction
  | CloseDetailPaneAction
  | ToggleDetailPaneAction
  | ShowHelpAction
  | HideHelpAction
  | HelpScrollUpAction
  | HelpScrollDownAction
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
  | ExtendSelectUpAction
  | ExtendSelectDownAction
  | ExtendSelectLeftAction
  | ExtendSelectRightAction

// Combined action type that commands can return
export type CommandAction =
  | BoardAction
  | NavigationAction
  | TaskSetStatusAction
  | ClearTaskAction
  | HistoryAction
  | UIAction
  | TextEditAction

// Re-export for convenience
export type { BoardAction, TNode, ViewMode, TaskStatus }
