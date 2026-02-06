/**
 * UI State Slice for Board Component
 *
 * Uses Redux Toolkit for auto-generated action creators.
 * Manages UI state separately from board navigation state.
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit"
import { enableMapSet } from "immer"
import type { ViewMode, SelectionKey } from "./types.ts"
import type { SelectionRange } from "./handlers/mouse-handler.ts"
import type { WatcherStatus } from "@km/storage"

// Enable Immer's MapSet plugin for Set/Map support in Redux state
enableMapSet()

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

  // Node fold state (which tree nodes are collapsed)
  foldedNodes: Set<string>

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

    foldedNodes: new Set(),

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

// =============================================================================
// UI Slice (Redux Toolkit)
// =============================================================================

const uiSlice = createSlice({
  name: "ui",
  initialState: createInitialUIState("cards", [], { columns: 80, rows: 24 }),
  reducers: {
    // View mode
    cycleViewMode: (state) => {
      const modes: ViewMode[] = ["cards", "columns", "list", "tabs"]
      const currentIndex = modes.indexOf(state.viewMode)
      const nextIndex = (currentIndex + 1) % modes.length
      state.viewMode = modes[nextIndex] ?? "cards"
    },
    setViewMode: (state, action: PayloadAction<ViewMode>) => {
      state.viewMode = action.payload
    },

    // Overlays
    toggleHelp: (state) => {
      state.showHelp = !state.showHelp
    },
    showHelp: (state) => {
      state.showHelp = true
    },
    hideHelp: (state) => {
      state.showHelp = false
    },
    showProjectPicker: (state) => {
      state.showProjectPicker = true
    },
    hideProjectPicker: (state) => {
      state.showProjectPicker = false
    },
    showNewItemDialog: (state) => {
      state.showNewItemDialog = true
    },
    hideNewItemDialog: (state) => {
      state.showNewItemDialog = false
    },
    showSearchDialog: (state) => {
      state.showSearchDialog = true
      state.searchDialogInitialInput = "" // Clear buffer when opening
    },
    hideSearchDialog: (state) => {
      state.showSearchDialog = false
      state.searchDialogInitialInput = "" // Clear buffer when closing
    },
    appendSearchDialogInput: (state, action: PayloadAction<string>) => {
      // Buffer keypresses that arrive before dialog's useInput is registered
      state.searchDialogInitialInput += action.payload
    },
    clearSearchDialogInput: (state) => {
      state.searchDialogInitialInput = ""
    },
    toggleConsole: (state) => {
      state.showConsole = !state.showConsole
    },
    showConsole: (state) => {
      state.showConsole = true
    },
    hideConsole: (state) => {
      state.showConsole = false
    },

    // Detail pane
    toggleDetailPane: (state) => {
      state.showDetailPane = !state.showDetailPane
    },
    setDetailPane: (state, action: PayloadAction<boolean>) => {
      state.showDetailPane = action.payload
    },

    // View configuration
    increaseOutlineDepth: (state) => {
      state.maxOutlineDepth = Math.min(10, state.maxOutlineDepth + 1)
    },
    decreaseOutlineDepth: (state) => {
      state.maxOutlineDepth = Math.max(0, state.maxOutlineDepth - 1)
    },
    increaseContentLines: (state) => {
      state.maxContentLines = Math.min(10, state.maxContentLines + 1)
    },
    decreaseContentLines: (state) => {
      state.maxContentLines = Math.max(1, state.maxContentLines - 1)
    },

    // Outline mode (selectionLevel is now derived from cursor depth in Board.tsx)
    enterOutlineMode: (state) => {
      state.inOutlineMode = true
    },
    exitOutlineMode: (state) => {
      state.inOutlineMode = false
      state.subIndex = 0
    },
    setInOutlineMode: (state, action: PayloadAction<boolean>) => {
      state.inOutlineMode = action.payload
    },
    setSubIndex: (state, action: PayloadAction<number>) => {
      state.subIndex = action.payload
    },

    // Multi-selection
    setMultiSelected: (state, action: PayloadAction<Set<SelectionKey>>) => {
      state.multiSelected = action.payload
    },
    clearMultiSelection: (state) => {
      state.multiSelected = new Set()
    },
    setSelectionAnchor: (
      state,
      action: PayloadAction<{ col: number; card: number; sub: number } | null>,
    ) => {
      state.selectionAnchor = action.payload
    },
    setSelectAllLevel: (state, action: PayloadAction<number>) => {
      state.selectAllLevel = action.payload
    },

    // Column collapse
    toggleColumnCollapse: (state, action: PayloadAction<number>) => {
      const colIndex = action.payload
      if (state.collapsedColumns.has(colIndex)) {
        state.collapsedColumns.delete(colIndex)
      } else {
        state.collapsedColumns.add(colIndex)
      }
    },
    setCollapsedColumns: (state, action: PayloadAction<Set<number>>) => {
      state.collapsedColumns = action.payload
    },

    // Node folding
    toggleFold: (state, action: PayloadAction<string>) => {
      const nodeId = action.payload
      if (state.foldedNodes.has(nodeId)) {
        state.foldedNodes.delete(nodeId)
      } else {
        state.foldedNodes.add(nodeId)
      }
    },
    setFoldedNodes: (state, action: PayloadAction<Set<string>>) => {
      state.foldedNodes = action.payload
    },
    foldAll: (state, action: PayloadAction<string[]>) => {
      for (const nodeId of action.payload) {
        state.foldedNodes.add(nodeId)
      }
    },
    unfoldAll: (state, action: PayloadAction<string[]>) => {
      for (const nodeId of action.payload) {
        state.foldedNodes.delete(nodeId)
      }
    },

    // Mouse
    setMouseSelection: (
      state,
      action: PayloadAction<SelectionRange | null>,
    ) => {
      state.mouseSelection = action.payload
    },
    setMouseDragging: (state, action: PayloadAction<boolean>) => {
      state.isMouseDragging = action.payload
    },

    // File drop
    setDroppedFiles: (state, action: PayloadAction<string[]>) => {
      state.droppedFiles = action.payload
    },
    showDropNotification: (state) => {
      state.showDropNotification = true
    },
    hideDropNotification: (state) => {
      state.showDropNotification = false
    },

    // Navigation history
    pushNavHistory: (
      state,
      action: PayloadAction<{
        rootId: string | null
        colIndex: number
        cardIndex: number
        cursorNodeId: string | null
        subIndex: number
        multiSelected: Set<SelectionKey>
        inOutlineMode: boolean
        foldedNodes?: Set<string>
      }>,
    ) => {
      // Truncate forward history when adding new entry
      state.navHistory = state.navHistory.slice(0, state.navHistoryIndex)
      state.navHistory.push(action.payload)
      state.navHistoryIndex = state.navHistory.length
    },
    navBack: (state) => {
      if (state.navHistoryIndex > 0) {
        state.navHistoryIndex -= 1
      }
    },
    navForward: (state) => {
      if (state.navHistoryIndex < state.navHistory.length - 1) {
        state.navHistoryIndex += 1
      }
    },
    setNavHistoryIndex: (state, action: PayloadAction<number>) => {
      state.navHistoryIndex = action.payload
    },

    // Recent projects
    addRecentProject: (state, action: PayloadAction<string>) => {
      const projectId = action.payload
      state.recentProjectIds = [
        projectId,
        ...state.recentProjectIds.filter((id) => id !== projectId),
      ].slice(0, 10)
    },

    // Terminal
    setReady: (state, action: PayloadAction<boolean>) => {
      state.isReady = action.payload
    },
    setDimensions: (
      state,
      action: PayloadAction<{ columns: number; rows: number }>,
    ) => {
      state.dimensions = action.payload
    },

    // Board context
    setRootBoardId: (state, action: PayloadAction<string | null>) => {
      state.rootBoardId = action.payload
    },

    // Loading state
    startLoading: (state) => {
      state.isLoading = true
      state.loadingStartTime = Date.now()
    },
    stopLoading: (state) => {
      state.isLoading = false
      state.loadingStartTime = null
    },

    // Watcher status
    setWatcherStatus: (state, action: PayloadAction<WatcherStatus | null>) => {
      state.watcherStatus = action.payload
    },

    // Inline edit (block-level: title = index 0, body children = 1+)
    enterInlineEdit: (
      state,
      action: PayloadAction<{ nodeId: string; blockIndex: number }>,
    ) => {
      state.inlineEditBlock = action.payload
    },
    exitInlineEdit: (state) => {
      state.inlineEditBlock = null
    },
    setEditBlockIndex: (state, action: PayloadAction<number>) => {
      if (state.inlineEditBlock) {
        state.inlineEditBlock.blockIndex = action.payload
      }
    },

    // Bell state (for boundary feedback)
    setBell: (state, action: PayloadAction<string>) => {
      state.bellState = action.payload
    },
    clearBell: (state) => {
      state.bellState = null
    },

    // Status message (for action feedback)
    setStatus: (
      state,
      action: PayloadAction<{
        level: "info" | "success" | "warning" | "error"
        message: string
      }>,
    ) => {
      state.status = action.payload
    },
    clearStatus: (state) => {
      state.status = null
    },
  },
})

// Export actions object for namespace import: `import { actions } from ...`
export const actions = uiSlice.actions

// Export reducer
export const uiReducer = uiSlice.reducer

// Action union type for dispatch signatures
export type UIAction = ReturnType<
  (typeof uiSlice.actions)[keyof typeof uiSlice.actions]
>
