/**
 * Command System Types
 *
 * Commands produce KmOp values which are dispatched to handlers in board-actions.ts.
 * Card-level ops (delete, indent, status, move, etc.) are inherently batch-aware:
 * handlers use Selection.nodes(ctx) to operate on multi-selected or cursor card.
 *
 * Batch convention: gather → validate (all-or-nothing) → confirm? → execute → cleanup.
 * See board-actions-edit.ts header for the full pattern.
 */

import type { BoardReducerOp, TNode, ViewMode, TaskStatus, NodeDirection } from "@km/board"

export type CommandCategory = "Navigation" | "Selection" | "Edit" | "Task" | "Fold" | "View" | "TextEdit"

/** Filter categories for property-based filtering */
export type FilterCategory = "taskStatus" | "priority" | "dueDate" | "assignedTo" | "nodeType"

export type CommandMode = "normal" | "move" | "search" | "input"

/**
 * Command execution context.
 *
 * All fields are passed directly by the caller - no tree traversal needed.
 * Commands receive pre-computed position info and can return ops.
 */
export interface CommandContext {
  // Current node (passed by caller)
  currentNode: TNode | null
  currentNodeId: string | null
  /** Exact cursor position — may be a sub-block within the card (currentNodeId). */
  cursor?: string | null

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
  moveMode: boolean // derived from MoveState.active
  foldDepths: Map<string, number>

  /** Destination for location-aware commands (e.g., "i" for inbox, "1" for favorite 1) */
  targetId?: string
}

/** Result of resolving a keybinding (key → command + optional target) */
export interface ResolvedBinding {
  commandId: string
  targetId?: string
  /** Direct execute function — bypasses command registry lookup when set */
  execute?: (ctx: CommandContext) => KmOp | KmOp[] | null
}

export interface CommandDef {
  id: string
  name: string
  /** Short label for which-key popup (falls back to name) */
  shortLabel?: string
  description: string
  category: CommandCategory
  modes?: CommandMode[]
  execute: (ctx: CommandContext) => KmOp | KmOp[] | null
}

// Text editing op types (dispatched to TextEditTarget)
export type TextEditOp =
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

// Custom op types for commands that operate outside the board reducer
export interface TaskSetStatusOp {
  type: "TASK_SET_STATUS"
  nodeId: string
  status: TaskStatus
}

/**
 * Cycle task status per-card through todo → wip → blocked → done → dropped.
 *
 * Distinct from TASK_SET_STATUS so that batch cycling can advance each selected
 * card from its own current status independently, rather than all snapping to a
 * single pre-computed status based on the cursor node.
 */
export interface TaskCycleStatusOp {
  type: "TASK_CYCLE_STATUS"
  nodeId: string
}

export interface ClearTaskOp {
  type: "CLEAR_TASK"
  nodeId: string
}

// History ops for undo/redo (handled at app level, not board reducer)
export interface HistoryUndoOp {
  type: "HISTORY_UNDO"
}

export interface HistoryRedoOp {
  type: "HISTORY_REDO"
}

export type HistoryOp = HistoryUndoOp | HistoryRedoOp

// UI ops (handled by TUI, not board reducer)
interface ZoomOutwardsOp {
  type: "ZOOM_OUTWARDS"
}

interface ZoomToRootOp {
  type: "ZOOM_TO_ROOT"
}

export interface CloseDetailPaneOp {
  type: "CLOSE_DETAIL_PANE"
}

interface ToggleDetailPaneOp {
  type: "TOGGLE_DETAIL_PANE"
}

export interface ShowHelpOp {
  type: "SHOW_HELP"
}

export interface HideHelpOp {
  type: "HIDE_HELP"
}

interface HelpScrollUpOp {
  type: "HELP_SCROLL_UP"
}

interface HelpScrollDownOp {
  type: "HELP_SCROLL_DOWN"
}

export interface CycleViewModeOp {
  type: "CYCLE_VIEW_MODE"
}

interface CycleIconStyleOp {
  type: "CYCLE_ICON_STYLE"
}

export interface DeleteNodeOp {
  type: "DELETE_NODE"
  nodeId: string
}

/** Select all (progressive: column first, then board-wide) */
export interface SelectAllProgressiveOp {
  type: "SELECT_ALL"
}

// TUI-specific ops (dialogs, quit, favorites)
export interface QuitOp {
  type: "QUIT"
}

export interface ShowNewItemDialogOp {
  type: "SHOW_NEW_ITEM_DIALOG"
}

export interface ShowItemPickerOp {
  type: "SHOW_ITEM_PICKER"
}

interface ShowSearchDialogOp {
  type: "SHOW_SEARCH_DIALOG"
}

/** Unified verb x location op. Replaces stringly-typed op types like GOTO_BOARD, JUMP_TO_FAVORITE. */
export interface VerbOp {
  type: "CURSOR_TO" | "REPARENT_TO" | "LINK_TO" | "CREATE_AT"
  locationKey: string // location key — resolved by handler using repo context
}

export interface JumpToColumnOp {
  type: "JUMP_TO_COLUMN"
  columnNumber: number // 1-9 (maps to column index 0-8)
}

export interface CloseOrQuitOp {
  type: "CLOSE_OR_QUIT" // Contextual: close dialog/pane/mode, or quit
}

interface AddLinkOp {
  type: "ADD_LINK" // Open link/reference picker
}

interface ReparentPickerOp {
  type: "REPARENT_PICKER" // Open reparent/move-to picker
}

export interface DialogNavUpOp {
  type: "DIALOG_NAV_UP"
}

export interface DialogNavDownOp {
  type: "DIALOG_NAV_DOWN"
}

export interface DialogNavLeftOp {
  type: "DIALOG_NAV_LEFT"
}

export interface DialogNavRightOp {
  type: "DIALOG_NAV_RIGHT"
}

export interface DialogConfirmOp {
  type: "DIALOG_CONFIRM"
}

export interface DialogCancelOp {
  type: "DIALOG_CANCEL"
}

interface ConsoleToggleOp {
  type: "CONSOLE_TOGGLE"
}

interface ConsoleCloseOp {
  type: "CONSOLE_CLOSE"
}

interface SyncPaneToggleOp {
  type: "SYNC_PANE_TOGGLE"
}

interface SyncPaneCloseOp {
  type: "SYNC_PANE_CLOSE"
}

interface DeleteConfirmExecuteOp {
  type: "DELETE_CONFIRM_EXECUTE"
}

interface DeleteConfirmCancelOp {
  type: "DELETE_CONFIRM_CANCEL"
}

interface ToggleSearchScopeOp {
  type: "TOGGLE_SEARCH_SCOPE"
}

interface ToastDismissOp {
  type: "TOAST_DISMISS"
}

// Fold operations (handled by TUI)
// scope: "root" = board-wide (used by fold_all/unfold_all)
// scope: undefined = cursor node (default, used by fold_node/unfold_node)
interface FoldNodeOp {
  type: "FOLD_NODE"
  scope?: "root"
}

interface UnfoldNodeOp {
  type: "UNFOLD_NODE"
  scope?: "root"
}

interface UnfoldRecursiveOp {
  type: "UNFOLD_RECURSIVE"
}

// Hide operations (hide nodes from board)
interface HideNodeOp {
  type: "HIDE_NODE"
}

interface ToggleShowHiddenOp {
  type: "TOGGLE_SHOW_HIDDEN"
}

// Filter
interface ShowFilterDialogOp {
  type: "SHOW_FILTER_DIALOG"
}
interface SetFilterOp {
  type: "SET_FILTER"
  text: string
}
interface ClearFilterOp {
  type: "CLEAR_FILTER"
}
interface ToggleFilterPropertyOp {
  type: "TOGGLE_FILTER_PROPERTY"
  category: FilterCategory
  value: string
}
interface ClearFilterCategoryOp {
  type: "CLEAR_FILTER_CATEGORY"
  category: FilterCategory
}
interface ClearAllFilterPropertiesOp {
  type: "CLEAR_ALL_FILTER_PROPERTIES"
}
interface ToggleHideDoneOp {
  type: "TOGGLE_HIDE_DONE"
}
interface ClearFiltersOp {
  type: "CLEAR_FILTERS"
}
interface CommandPaletteOp {
  type: "COMMAND_PALETTE"
}

// Edit operations
interface InsertAboveOp {
  type: "INSERT_ABOVE"
}

interface InsertBelowOp {
  type: "INSERT_BELOW"
}

interface InsertChildOp {
  type: "INSERT_CHILD"
}

interface InsertAtParentOp {
  type: "INSERT_AT_PARENT"
}

interface DuplicateNodeOp {
  type: "DUPLICATE_NODE"
  nodeId: string
}

// Property ops
interface SetDueDateOp {
  type: "SET_DUE_DATE"
  nodeId: string
}

interface SetStartDateOp {
  type: "SET_START_DATE"
  nodeId: string
}

interface SetRecurringOp {
  type: "SET_RECURRING"
  nodeId: string
}

interface SetPriorityOp {
  type: "SET_PRIORITY"
  nodeId: string
}

interface SetPriority0Op {
  type: "SET_PRIORITY_0"
  nodeId: string
}

interface SetPriority1Op {
  type: "SET_PRIORITY_1"
  nodeId: string
}

interface SetPriority2Op {
  type: "SET_PRIORITY_2"
  nodeId: string
}

interface SetPriority3Op {
  type: "SET_PRIORITY_3"
  nodeId: string
}

interface SetPriority4Op {
  type: "SET_PRIORITY_4"
  nodeId: string
}

// Date prompt dialog ops
interface DatePromptConfirmOp {
  type: "DATE_PROMPT_CONFIRM"
}

interface DatePromptCancelOp {
  type: "DATE_PROMPT_CANCEL"
}

interface SetLabelOp {
  type: "SET_LABEL"
}

interface SetAssigneeOp {
  type: "SET_ASSIGNEE"
}

interface IncreaseOutlineDepthOp {
  type: "INCREASE_OUTLINE_DEPTH"
}

interface DecreaseOutlineDepthOp {
  type: "DECREASE_OUTLINE_DEPTH"
}

interface DevTestToastOp {
  type: "DEV_TEST_TOAST"
}

interface NoopOp {
  type: "NOOP"
}

interface OpenInSystemOp {
  type: "OPEN_IN_SYSTEM"
  nodeId: string
}

interface OpenInTerminalOp {
  type: "OPEN_IN_TERMINAL"
  nodeId: string
}

interface EnterInlineEditOp {
  type: "ENTER_INLINE_EDIT"
  nodeId: string
  blockIndex?: number // 0 = title (default), 1+ = body children
}

export interface EditBlockNavigateOp {
  type: "EDIT_BLOCK_NAVIGATE"
  direction: "up" | "down"
}

interface IndentNodeOp {
  type: "INDENT_NODE"
}

export interface OutdentNodeOp {
  type: "OUTDENT_NODE"
}

interface NavSiblingBoardOp {
  type: "NAV_SIBLING_BOARD"
  direction: "next" | "prev"
}

interface ZoomInwardsOp {
  type: "ZOOM_INWARDS" // Zoom in one level closer to selected node
}

interface FollowLinkOp {
  type: "FOLLOW_LINK" // Navigate to embedded link target in context
}

interface PageJumpOp {
  type: "PAGE_JUMP"
  direction: "up" | "down"
}

// Move mode command ops (TUI augments with context before dispatching to board)
// These are returned by commands and converted to full BoardOp by board-actions.ts
// Visual mode (vim-style range selection)
interface VisualModeEnterOp {
  type: "VISUAL_MODE_ENTER"
}

interface VisualModeExitOp {
  type: "VISUAL_MODE_EXIT"
}

interface EnterMoveModeOp {
  type: "ENTER_MOVE_MODE"
}

interface ConfirmMoveOp {
  type: "CONFIRM_MOVE"
}

interface CancelMoveOp {
  type: "CANCEL_MOVE"
}

type MoveOp = EnterMoveModeOp | ConfirmMoveOp | CancelMoveOp

// Clipboard ops
interface ClipboardCopyOp {
  type: "CLIPBOARD_COPY"
}

interface ClipboardCutOp {
  type: "CLIPBOARD_CUT"
}

interface ClipboardPasteOp {
  type: "CLIPBOARD_PASTE"
}

interface ShiftUpOp {
  type: "SHIFT_UP"
}

interface ShiftDownOp {
  type: "SHIFT_DOWN"
}

interface ShiftLeftOp {
  type: "SHIFT_LEFT"
}

interface ShiftRightOp {
  type: "SHIFT_RIGHT"
}

// Stub ops for v2 keybindings (TODO: implement handlers)
interface ArchiveNodeOp {
  type: "ARCHIVE_NODE"
  nodeId: string
}

interface CaptureOp {
  type: "CAPTURE"
  /** Preset location (e.g., "inbox"). Undefined = open dialog with picker. */
  location?: string
}

interface SettingsOp {
  type: "SETTINGS"
}

// Pane operations (Ctrl+W chords — windowing)
interface PaneSplitOp {
  type: "PANE_SPLIT"
  direction: "vertical" | "horizontal"
}

interface PaneCloseOp {
  type: "PANE_CLOSE"
}

interface PaneFocusOp {
  type: "PANE_FOCUS"
  direction: "left" | "right" | "up" | "down"
}

interface PaneFocusPreviousOp {
  type: "PANE_FOCUS_PREVIOUS"
}

interface PaneFocusCycleOp {
  type: "PANE_FOCUS_CYCLE"
  direction: "next" | "prev"
}

interface PaneFocusNumberOp {
  type: "PANE_FOCUS_NUMBER"
  number: number
}

interface PaneResizeOp {
  type: "PANE_RESIZE"
  delta: number
}

interface PaneResizeVerticalOp {
  type: "PANE_RESIZE_VERTICAL"
  delta: number
}

interface PaneEqualizeOp {
  type: "PANE_EQUALIZE"
}

interface PaneZoomOp {
  type: "PANE_ZOOM"
}

interface PaneOnlyOp {
  type: "PANE_ONLY"
}

interface PaneSwapOp {
  type: "PANE_SWAP"
  direction: "left" | "right" | "up" | "down"
}

interface PaneSplitAndPickOp {
  type: "PANE_SPLIT_AND_PICK"
}

// Focus switching (Cmd+h/l — kitty protocol)
interface FocusBoardOp {
  type: "FOCUS_BOARD"
}

interface FocusDetailOp {
  type: "FOCUS_DETAIL"
}

// Text formatting (Cmd+b/i — kitty protocol, text edit only)
interface TextBoldOp {
  type: "TEXT_BOLD"
}

interface TextItalicOp {
  type: "TEXT_ITALIC"
}

// Task dialog (Cmd+t — kitty protocol)
interface ShowTaskDialogOp {
  type: "SHOW_TASK_DIALOG"
}

// Local find (inline search bar)
interface LocalFindOpenOp {
  type: "LOCAL_FIND_OPEN"
}

interface LocalFindNextOp {
  type: "LOCAL_FIND_NEXT"
}

interface LocalFindPrevOp {
  type: "LOCAL_FIND_PREV"
}

interface LocalFindCloseOp {
  type: "LOCAL_FIND_CLOSE"
}

interface LocalFindConfirmOp {
  type: "LOCAL_FIND_CONFIRM"
}

type LocalFindOp = LocalFindOpenOp | LocalFindNextOp | LocalFindPrevOp | LocalFindCloseOp | LocalFindConfirmOp

// Search & replace dialog ops
interface SearchReplaceOpenOp {
  type: "SEARCH_REPLACE_OPEN"
}

interface SearchReplaceCloseOp {
  type: "SEARCH_REPLACE_CLOSE"
}

interface SearchReplaceNextOp {
  type: "SEARCH_REPLACE_NEXT"
}

interface SearchReplacePrevOp {
  type: "SEARCH_REPLACE_PREV"
}

interface SearchReplaceDoReplaceOp {
  type: "SEARCH_REPLACE_DO_REPLACE"
}

interface SearchReplaceDoReplaceAllOp {
  type: "SEARCH_REPLACE_DO_REPLACE_ALL"
}

interface SearchReplaceToggleRegexOp {
  type: "SEARCH_REPLACE_TOGGLE_REGEX"
}

interface FocusNextOp {
  type: "FOCUS_NEXT"
}

interface FocusPrevOp {
  type: "FOCUS_PREV"
}

interface ManageFavoritesOp {
  type: "MANAGE_FAVORITES"
}

interface FavoritesSelectKeyOp {
  type: "FAVORITES_SELECT_KEY"
  key: string
}

interface FavoritesAssignOp {
  type: "FAVORITES_ASSIGN"
}

interface FavoritesClearOp {
  type: "FAVORITES_CLEAR"
}

interface FavoritesBackOp {
  type: "FAVORITES_BACK"
}

type SearchReplaceOp =
  | SearchReplaceOpenOp
  | SearchReplaceCloseOp
  | SearchReplaceNextOp
  | SearchReplacePrevOp
  | SearchReplaceDoReplaceOp
  | SearchReplaceDoReplaceAllOp
  | SearchReplaceToggleRegexOp

// =============================================================================
// Focused Sub-Unions
//
// KmOp is decomposed into focused sub-unions by domain. Each sub-union
// maps to a dedicated handler function in board-actions.ts. The individual op
// interfaces above are unchanged — only the grouping is new.
// =============================================================================

// High-level navigation ops (interpreted by TUI, not dispatched to reducer)
interface CursorMoveOp {
  type: "CURSOR_MOVE"
  dir: NodeDirection
}

interface NavBackOp {
  type: "NAV_BACK"
}

interface NavForwardOp {
  type: "NAV_FORWARD"
}

interface FoldLevelOp {
  type: "FOLD_LEVEL"
  depth: number
}

interface UnfoldLevelOp {
  type: "UNFOLD_LEVEL"
  depth: number
}

interface SelectAllSiblingsOp {
  type: "SELECT_ALL_SIBLINGS"
}

interface ExtendSelectUpOp {
  type: "EXTEND_SELECT_UP"
}

interface ExtendSelectDownOp {
  type: "EXTEND_SELECT_DOWN"
}

interface ExtendSelectLeftOp {
  type: "EXTEND_SELECT_LEFT"
}

interface ExtendSelectRightOp {
  type: "EXTEND_SELECT_RIGHT"
}

// VerbOp is defined above as the interface (line ~188)

/** Navigation — cursor movement, zoom, page jumps, history. */
export type NavOp =
  | CursorMoveOp
  | NavBackOp
  | NavForwardOp
  | NavSiblingBoardOp
  | ZoomInwardsOp
  | ZoomOutwardsOp
  | ZoomToRootOp
  | FollowLinkOp
  | PageJumpOp
  | JumpToColumnOp
  | FoldLevelOp
  | UnfoldLevelOp

/** Structural editing — insert, delete, move, indent, clipboard, open. */
export type EditOp =
  | EnterInlineEditOp
  | EditBlockNavigateOp
  | IndentNodeOp
  | OutdentNodeOp
  | InsertAboveOp
  | InsertBelowOp
  | InsertChildOp
  | InsertAtParentOp
  | DeleteNodeOp
  | DuplicateNodeOp
  | OpenInSystemOp
  | OpenInTerminalOp
  | ClipboardCopyOp
  | ClipboardCutOp
  | ClipboardPasteOp
  | AddLinkOp
  | ReparentPickerOp
  | ArchiveNodeOp
  | TaskSetStatusOp
  | TaskCycleStatusOp
  | ClearTaskOp
  | ShiftUpOp
  | ShiftDownOp
  | ShiftLeftOp
  | ShiftRightOp

/** Text editing — character-level operations dispatched to EditTarget. */
export type TextOp = TextEditOp | TextBoldOp | TextItalicOp

/**
 * Multi-select and view config ops.
 * These are command-layer ops handled by the TUI's op handler (via per-pane UI state),
 * NOT by the board reducer. They exist here because commands emit them as part of BoardOp.
 */
interface SelectNodeAddOp {
  type: "SELECT_NODE_ADD"
  nodeId: string
}

interface SelectNodeRemoveOp {
  type: "SELECT_NODE_REMOVE"
  nodeId: string
}

interface SelectNodeToggleOp {
  type: "SELECT_NODE_TOGGLE"
  nodeId: string
}

interface ClearSelectionOp {
  type: "CLEAR_SELECTION"
}

interface IncreaseContentLinesOp {
  type: "INCREASE_CONTENT_LINES"
}

interface DecreaseContentLinesOp {
  type: "DECREASE_CONTENT_LINES"
}

/** Board state — selection, fold, visual mode, move mode, content lines. */
export type BoardOp =
  | BoardReducerOp
  | SelectNodeAddOp
  | SelectNodeRemoveOp
  | SelectNodeToggleOp
  | ClearSelectionOp
  | IncreaseContentLinesOp
  | DecreaseContentLinesOp
  | FoldNodeOp
  | UnfoldNodeOp
  | UnfoldRecursiveOp
  | SelectAllProgressiveOp
  | VisualModeEnterOp
  | VisualModeExitOp
  | ExtendSelectUpOp
  | ExtendSelectDownOp
  | ExtendSelectLeftOp
  | ExtendSelectRightOp
  | SelectAllSiblingsOp
  | MoveOp
  | HideNodeOp
  | ToggleShowHiddenOp

/** Dialogs — pickers, filter, favorites, date prompts, confirmations, search. */
export type DialogOp =
  | ShowNewItemDialogOp
  | ShowItemPickerOp
  | ShowTaskDialogOp
  | ShowSearchDialogOp
  | ShowFilterDialogOp
  | SetFilterOp
  | ClearFilterOp
  | ToggleFilterPropertyOp
  | ClearFilterCategoryOp
  | ClearAllFilterPropertiesOp
  | ToggleHideDoneOp
  | ClearFiltersOp
  | CommandPaletteOp
  | DialogNavUpOp
  | DialogNavDownOp
  | DialogNavLeftOp
  | DialogNavRightOp
  | DialogConfirmOp
  | DialogCancelOp
  | ToggleSearchScopeOp
  | DeleteConfirmExecuteOp
  | DeleteConfirmCancelOp
  | ManageFavoritesOp
  | FavoritesSelectKeyOp
  | FavoritesAssignOp
  | FavoritesClearOp
  | FavoritesBackOp
  | SetDueDateOp
  | SetStartDateOp
  | SetRecurringOp
  | SetPriorityOp
  | SetPriority0Op
  | SetPriority1Op
  | SetPriority2Op
  | SetPriority3Op
  | SetPriority4Op
  | SetLabelOp
  | SetAssigneeOp
  | DatePromptConfirmOp
  | DatePromptCancelOp
  | LocalFindOp
  | SearchReplaceOp
  | FocusNextOp
  | FocusPrevOp

/** Pane management — split, close, focus, resize, detail pane. */
export type PaneOp =
  | PaneSplitOp
  | PaneCloseOp
  | PaneFocusOp
  | PaneFocusPreviousOp
  | PaneFocusCycleOp
  | PaneFocusNumberOp
  | PaneResizeOp
  | PaneResizeVerticalOp
  | PaneEqualizeOp
  | PaneZoomOp
  | PaneOnlyOp
  | PaneSwapOp
  | PaneSplitAndPickOp
  | CloseDetailPaneOp
  | ToggleDetailPaneOp

/** View & app — lifecycle, view modes, help, console, history, misc. */
export type ViewOp =
  | QuitOp
  | CloseOrQuitOp
  | CycleViewModeOp
  | CycleIconStyleOp
  | ShowHelpOp
  | HideHelpOp
  | HelpScrollUpOp
  | HelpScrollDownOp
  | FocusBoardOp
  | FocusDetailOp
  | HistoryUndoOp
  | HistoryRedoOp
  | ConsoleToggleOp
  | ConsoleCloseOp
  | SyncPaneToggleOp
  | SyncPaneCloseOp
  | ToastDismissOp
  | NoopOp
  | IncreaseOutlineDepthOp
  | DecreaseOutlineDepthOp
  | CaptureOp
  | SettingsOp
  | DevTestToastOp

// Combined op type — union of all focused sub-unions
export type KmOp = VerbOp | NavOp | EditOp | TextOp | BoardOp | DialogOp | PaneOp | ViewOp

// Re-export for convenience
export type { BoardReducerOp, TNode, ViewMode, TaskStatus }
