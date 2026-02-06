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

export interface UIState {
  // View configuration
  viewMode: ViewMode
  showDetailPane: boolean
  maxOutlineDepth: number
  maxContentLines: number

  // Board context
  rootBoardId: string | null

  // Overlays/dialogs
  showHelp: boolean
  showProjectPicker: boolean
  showNewItemDialog: boolean
  showSearchDialog: boolean
  searchDialogInitialInput: string // Buffer for keypresses during dialog open transition
  showConsole: boolean

  // Selection state (selectionLevel is now derived from cursor depth in Board.tsx)
  subIndex: number
  inOutlineMode: boolean
  multiSelected: Set<SelectionKey>
  selectionAnchor: { col: number; card: number; sub: number } | null
  selectAllLevel: number

  // Column state
  collapsedColumns: Set<number>

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
    subIndex: number
    multiSelected: Set<SelectionKey>
    inOutlineMode: boolean
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

  // Watcher status (for bottom bar display)
  watcherStatus: WatcherStatus | null

  // Inline edit state - which block is being edited (null = not editing)
  // blockIndex 0 = title, 1+ = body children (1-indexed into extractBody result)
  inlineEditBlock: { nodeId: string; blockIndex: number } | null

  // Bell state - set when action hits boundary, cleared on next keypress
  bellState: string | null

  // Status message - user feedback for actions (selection count, mode changes)
  status: {
    level: "info" | "success" | "warning" | "error"
    message: string
  } | null
}

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
    maxOutlineDepth: 2,
    maxContentLines: 3,

    rootBoardId,

    showHelp: false,
    showProjectPicker: false,
    showNewItemDialog: false,
    showSearchDialog: false,
    searchDialogInitialInput: "",
    showConsole: false,

    subIndex: 0,
    inOutlineMode: false,
    multiSelected: new Set(),
    selectionAnchor: null,
    selectAllLevel: 0,

    collapsedColumns: new Set(collapsedColumns),

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

    watcherStatus: null,

    inlineEditBlock: null,

    bellState: null,
    status: null,
  }
}
