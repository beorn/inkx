export type IconStyle = "nerdfont" | "workflowy" | "regular"
export type BorderMode = "normal" | "black"

/** A sync activity event for the sync pane log */
export interface SyncEvent {
  timestamp: number
  type: "sync-start" | "sync-complete" | "state-change" | "error" | "write-complete" | "write-error"
  message: string
}

/**
 * UI State Types and Factory
 *
 * Defines the UIState interface and createInitialUIState factory.
 * State updates are done via setUI() on the Zustand store.
 */

import type { ViewMode, SelectionKey } from "./types.ts"
import type { SelectionRange } from "./handlers/mouse-handler.ts"
import type { WatcherStatus } from "@km/storage"

// =============================================================================
// UI State Type
// =============================================================================

/** Editing mode — derived from UIState, not stored separately */
export type EditMode = "node" | "text" | "dialog"

/**
 * Get the current editing mode from UI state.
 * - "text": inline editing a node (inlineEditBlock is set)
 * - "dialog": a dialog is open (search, new item, date prompt, etc.)
 * - "node": default navigation mode
 */
export function getEditMode(ui: UIState): EditMode {
  if (ui.inlineEditBlock) return "text"
  if (
    ui.showSearchDialog ||
    ui.showNewItemDialog ||
    ui.showProjectPicker ||
    ui.showFilterDialog ||
    ui.datePrompt ||
    ui.deleteConfirm ||
    ui.localSearch ||
    ui.showOmnibox ||
    ui.searchReplace
  ) {
    return "dialog"
  }
  return "node"
}

export interface UIState {
  // View configuration
  viewMode: ViewMode
  showDetailPane: boolean
  detailScrollOffset: number
  maxOutlineDepth: number
  maxContentLines: number
  iconStyle: IconStyle
  borderMode: BorderMode

  // Board context
  rootBoardId: string | null

  // Overlays/dialogs
  showHelp: boolean
  helpScrollOffset: number
  showProjectPicker: boolean
  showNewItemDialog: boolean
  showSearchDialog: boolean
  searchDialogInitialInput: string // Buffer for keypresses during dialog open transition
  /** Search scope: "all" = entire repo, "selected" = cursor node & descendants */
  searchScope: "all" | "selected"
  /** Node IDs that define the search scope when searchScope is "selected" */
  searchScopeNodeIds: string[]
  showConsole: boolean
  showSyncPane: boolean

  // Selection state (selectionLevel is now derived from cursor depth in Board.tsx)
  multiSelected: Set<SelectionKey>
  selectionAnchor: { nodeId: string } | null
  selectAllLevel: number

  // Visual mode (vim-style: v enters, hjkl extends selection, Escape exits)
  visualMode: boolean
  visualAnchor: string | null // nodeId where visual selection started

  // Column state
  collapsedColumns: Set<number>
  /** Scroll anchor for column viewport scrolling (mouse wheel).
   *  null = follow cursor (default). When set, scrolls the targeted column. */
  columnScrollAnchor: { colIdx: number; anchor: number } | null

  // Ignore mode — when true, show ignored nodes (dimmed) for un-ignoring
  showIgnored: boolean
  /** Bumped when ignore list changes, to invalidate readBoardIgnored memoization */
  ignoreVersion: number

  // Mouse state
  mouseSelection: SelectionRange | null
  isMouseDragging: boolean

  // File drop state
  droppedFiles: string[]
  showDropNotification: boolean

  // Navigation history
  navHistory: Array<{
    rootId: string | null
    colIndex: number
    cardIndex: number
    cursorNodeId: string | null
    multiSelected: Set<SelectionKey>
    foldedNodes?: Set<string>
  }>
  navHistoryIndex: number

  // Recent projects for picker
  recentProjectIds: string[]

  // Terminal state
  isReady: boolean
  dimensions: { columns: number; rows: number }

  // Loading state (for large repos)
  isLoading: boolean
  loadingStartTime: number | null
  /** True while background deferred-file parsing is in progress (discoverOnly mode). */
  backgroundParsing: boolean

  // Watcher status (for bottom bar display)
  watcherStatus: WatcherStatus | null

  // Sync activity log (for sync pane display)
  syncEvents: SyncEvent[]

  // Inline edit state - which block is being edited (null = not editing)
  // blockIndex 0 = title, 1+ = body children (1-indexed into extractBody result)
  // initialCursorPos: where to place cursor when entering edit mode via block navigation
  // stickyX: preferred cursor column preserved across block boundaries (visual column index)
  inlineEditBlock: { nodeId: string; blockIndex: number; initialCursorPos?: "start" | "end"; stickyX?: number } | null

  // Date/recurrence prompt dialog
  datePrompt: {
    field: "due_at" | "start_at" | "recurrence"
    nodeIds: string[]
    currentValue: string
  } | null

  // Delete confirmation dialog - shows impact before destructive delete
  deleteConfirm: {
    nodeIds: string[] // Node IDs to delete (single or batch)
    title: string
    childCount: number
    backlinkCount: number
    hasMetadata?: boolean
  } | null

  // Clipboard state (in-memory, not system clipboard)
  clipboard: {
    nodeIds: string[] // Source node IDs (for resolving content at paste time)
    mode: "copy" | "cut"
  } | null

  // Bell state - set when action hits boundary, cleared on next keypress
  bellState: string | null

  // Status message - user feedback for actions (selection count, mode changes)
  status: {
    level: "info" | "success" | "warning" | "error"
    message: string
  } | null

  // Pending chord prefix (for which-key popup)
  pendingChord: string | null

  // Filter state — persistent property-based + text filter across views
  showFilterDialog: boolean
  filterText: string
  filterProperties: FilterProperties
  filterCursorRow: number
  filterCursorVal: number

  // Local find (inline search bar within the board)
  localSearch: LocalSearchState | null

  // Omnibox / command palette state
  showOmnibox: boolean

  // Search & replace dialog state
  searchReplace: SearchReplaceState | null
}

/** State for the search & replace dialog */
export interface SearchReplaceState {
  /** Current search query */
  searchQuery: string
  /** Current replace query */
  replaceQuery: string
  /** Whether to use regex matching */
  useRegex: boolean
  /** 0-based index of the currently focused match */
  matchIndex: number
  /** Total number of matches found */
  matchCount: number
  /** Node IDs that contain matches, in visual order */
  matchNodeIds: string[]
  /** Which input field has focus */
  focusedField: "search" | "replace"
}

/** State for the inline local find/search bar */
export interface LocalSearchState {
  /** Current search query */
  query: string
  /** True when the text input is active (typing phase) */
  isInputActive: boolean
  /** 0-based index of the currently focused match */
  matchIndex: number
  /** Total number of matches found */
  matchCount: number
  /** Node IDs that contain matches, in visual order */
  matchNodeIds: string[]
}

/** Structured filter state for property-based filtering */
export interface FilterProperties {
  taskStatus: Set<string> // "todo" | "wip" | "blocked" | "done" | "dropped"
  priority: Set<string> // "1" | "2" | "3" | "4"
  dueDate: Set<string> // "overdue" | "today" | "this-week" | "no-date"
  assignedTo: Set<string>
  nodeType: Set<string> // "h" | "p" | "code" | "quote" | "hr" | "embed" | "table"
}

export function createEmptyFilterProperties(): FilterProperties {
  return {
    taskStatus: new Set(),
    priority: new Set(),
    dueDate: new Set(),
    assignedTo: new Set(),
    nodeType: new Set(),
  }
}

/** Check if any property filters are active */
export function hasActivePropertyFilters(props: FilterProperties): boolean {
  return (
    props.taskStatus.size > 0 ||
    props.priority.size > 0 ||
    props.dueDate.size > 0 ||
    props.assignedTo.size > 0 ||
    props.nodeType.size > 0
  )
}

/** Filter row definitions for the filter panel */
export interface FilterRowDef {
  category: keyof FilterProperties
  label: string
  values: Array<{ value: string; label: string }>
}

export const FILTER_ROWS: FilterRowDef[] = [
  {
    category: "taskStatus",
    label: "Status",
    values: [
      { value: "todo", label: "todo" },
      { value: "wip", label: "wip" },
      { value: "blocked", label: "blocked" },
      { value: "done", label: "done" },
      { value: "dropped", label: "dropped" },
    ],
  },
  {
    category: "priority",
    label: "Priority",
    values: [
      { value: "1", label: "P1" },
      { value: "2", label: "P2" },
      { value: "3", label: "P3" },
      { value: "4", label: "P4" },
    ],
  },
  {
    category: "dueDate",
    label: "Due",
    values: [
      { value: "overdue", label: "overdue" },
      { value: "today", label: "today" },
      { value: "this-week", label: "week" },
      { value: "no-date", label: "none" },
    ],
  },
]

// =============================================================================
// Initial State Factory
// =============================================================================

export function createInitialUIState(
  initialViewMode: ViewMode,
  collapsedColumns: number[],
  dimensions: { columns: number; rows: number },
  rootBoardId: string | null = null,
): UIState {
  return {
    viewMode: initialViewMode,
    showDetailPane: initialViewMode === "list",
    detailScrollOffset: 0,
    maxOutlineDepth: 2,
    maxContentLines: 3,
    iconStyle: "nerdfont" as IconStyle,
    borderMode: "normal" as BorderMode,

    rootBoardId,

    showHelp: false,
    helpScrollOffset: 0,
    showProjectPicker: false,
    showNewItemDialog: false,
    showSearchDialog: false,
    searchDialogInitialInput: "",
    searchScope: "all",
    searchScopeNodeIds: [],
    showConsole: false,
    showSyncPane: false,

    multiSelected: new Set(),
    selectionAnchor: null,
    selectAllLevel: 0,

    visualMode: false,
    visualAnchor: null,

    collapsedColumns: new Set(collapsedColumns),
    columnScrollAnchor: null,

    showIgnored: false,
    ignoreVersion: 0,

    mouseSelection: null,
    isMouseDragging: false,

    droppedFiles: [],
    showDropNotification: false,

    navHistory: [],
    navHistoryIndex: 0,

    recentProjectIds: [],

    // Start as ready if dimensions are valid (not the default 80x24 placeholder)
    // This avoids waiting for useEffect to fire which may not happen in all environments
    isReady: dimensions.columns > 0 && dimensions.rows > 0,
    dimensions,

    isLoading: false,
    loadingStartTime: null,
    backgroundParsing: false,

    watcherStatus: null,
    syncEvents: [],

    inlineEditBlock: null,

    datePrompt: null,

    clipboard: null,

    deleteConfirm: null,

    bellState: null,
    status: null,
    pendingChord: null,

    showFilterDialog: false,
    filterText: "",
    filterProperties: createEmptyFilterProperties(),
    filterCursorRow: 0,
    filterCursorVal: 0,

    localSearch: null,

    showOmnibox: false,

    searchReplace: null,
  }
}
