/**
 * UI State Slice for Board Component
 *
 * Uses Redux Toolkit for auto-generated action creators.
 * Manages UI state separately from board navigation state.
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { ViewMode, SelectionKey } from "./types.ts";
import type { SelectionRange } from "./mouse-handler.ts";

// =============================================================================
// UI State Type
// =============================================================================

export interface UIState {
  // View configuration
  viewMode: ViewMode;
  showDetailPane: boolean;
  maxOutlineDepth: number;
  maxContentLines: number;

  // Overlays/dialogs
  showHelp: boolean;
  showProjectPicker: boolean;
  showNewItemDialog: boolean;

  // Selection state
  selectionLevel: "board" | "column" | "card";
  subIndex: number;
  inOutlineMode: boolean;
  multiSelected: Set<SelectionKey>;
  selectionAnchor: { col: number; card: number; sub: number } | null;
  selectAllLevel: number;

  // Column state
  collapsedColumns: Set<number>;

  // Mouse state
  mouseSelection: SelectionRange | null;
  isMouseDragging: boolean;

  // File drop state
  droppedFiles: string[];
  showDropNotification: boolean;

  // Navigation history
  navHistory: Array<{
    rootId: string | null;
    colIndex: number;
    cardIndex: number;
    subIndex: number;
    multiSelected: Set<SelectionKey>;
    inOutlineMode: boolean;
  }>;
  navHistoryIndex: number;

  // Recent projects for picker
  recentProjectIds: string[];

  // Terminal state
  isReady: boolean;
  dimensions: { columns: number; rows: number };
}

// =============================================================================
// Initial State Factory
// =============================================================================

export function createInitialUIState(
  initialViewMode: ViewMode,
  collapsedColumns: number[],
  dimensions: { columns: number; rows: number },
): UIState {
  return {
    viewMode: initialViewMode,
    showDetailPane: initialViewMode === "list",
    maxOutlineDepth: 2,
    maxContentLines: 3,

    showHelp: false,
    showProjectPicker: false,
    showNewItemDialog: false,

    selectionLevel: "card",
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

    isReady: false,
    dimensions,
  };
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
      const modes: ViewMode[] = ["cards", "columns", "list", "tabs"];
      const currentIndex = modes.indexOf(state.viewMode);
      const nextIndex = (currentIndex + 1) % modes.length;
      state.viewMode = modes[nextIndex] ?? "cards";
    },
    setViewMode: (state, action: PayloadAction<ViewMode>) => {
      state.viewMode = action.payload;
    },

    // Overlays
    toggleHelp: (state) => {
      state.showHelp = !state.showHelp;
    },
    showHelp: (state) => {
      state.showHelp = true;
    },
    hideHelp: (state) => {
      state.showHelp = false;
    },
    showProjectPicker: (state) => {
      state.showProjectPicker = true;
    },
    hideProjectPicker: (state) => {
      state.showProjectPicker = false;
    },
    showNewItemDialog: (state) => {
      state.showNewItemDialog = true;
    },
    hideNewItemDialog: (state) => {
      state.showNewItemDialog = false;
    },

    // Detail pane
    toggleDetailPane: (state) => {
      state.showDetailPane = !state.showDetailPane;
    },
    setDetailPane: (state, action: PayloadAction<boolean>) => {
      state.showDetailPane = action.payload;
    },

    // View configuration
    increaseOutlineDepth: (state) => {
      state.maxOutlineDepth = Math.min(10, state.maxOutlineDepth + 1);
    },
    decreaseOutlineDepth: (state) => {
      state.maxOutlineDepth = Math.max(0, state.maxOutlineDepth - 1);
    },
    increaseContentLines: (state) => {
      state.maxContentLines = Math.min(10, state.maxContentLines + 1);
    },
    decreaseContentLines: (state) => {
      state.maxContentLines = Math.max(1, state.maxContentLines - 1);
    },

    // Selection level
    setSelectionLevel: (
      state,
      action: PayloadAction<"board" | "column" | "card">,
    ) => {
      state.selectionLevel = action.payload;
    },
    enterOutlineMode: (state) => {
      state.inOutlineMode = true;
    },
    exitOutlineMode: (state) => {
      state.inOutlineMode = false;
      state.subIndex = 0;
    },
    setInOutlineMode: (state, action: PayloadAction<boolean>) => {
      state.inOutlineMode = action.payload;
    },
    setSubIndex: (state, action: PayloadAction<number>) => {
      state.subIndex = action.payload;
    },

    // Multi-selection
    setMultiSelected: (state, action: PayloadAction<Set<SelectionKey>>) => {
      state.multiSelected = action.payload;
    },
    clearMultiSelection: (state) => {
      state.multiSelected = new Set();
    },
    setSelectionAnchor: (
      state,
      action: PayloadAction<{ col: number; card: number; sub: number } | null>,
    ) => {
      state.selectionAnchor = action.payload;
    },
    setSelectAllLevel: (state, action: PayloadAction<number>) => {
      state.selectAllLevel = action.payload;
    },

    // Column collapse
    toggleColumnCollapse: (state, action: PayloadAction<number>) => {
      const colIndex = action.payload;
      if (state.collapsedColumns.has(colIndex)) {
        state.collapsedColumns.delete(colIndex);
      } else {
        state.collapsedColumns.add(colIndex);
      }
    },
    setCollapsedColumns: (state, action: PayloadAction<Set<number>>) => {
      state.collapsedColumns = action.payload;
    },

    // Mouse
    setMouseSelection: (
      state,
      action: PayloadAction<SelectionRange | null>,
    ) => {
      state.mouseSelection = action.payload;
    },
    setMouseDragging: (state, action: PayloadAction<boolean>) => {
      state.isMouseDragging = action.payload;
    },

    // File drop
    setDroppedFiles: (state, action: PayloadAction<string[]>) => {
      state.droppedFiles = action.payload;
    },
    showDropNotification: (state) => {
      state.showDropNotification = true;
    },
    hideDropNotification: (state) => {
      state.showDropNotification = false;
    },

    // Navigation history
    pushNavHistory: (
      state,
      action: PayloadAction<{
        rootId: string | null;
        colIndex: number;
        cardIndex: number;
        subIndex: number;
        multiSelected: Set<SelectionKey>;
        inOutlineMode: boolean;
      }>,
    ) => {
      // Truncate forward history when adding new entry
      state.navHistory = state.navHistory.slice(0, state.navHistoryIndex + 1);
      state.navHistory.push(action.payload);
      state.navHistoryIndex = state.navHistory.length - 1;
    },
    navBack: (state) => {
      if (state.navHistoryIndex > 0) {
        state.navHistoryIndex -= 1;
      }
    },
    navForward: (state) => {
      if (state.navHistoryIndex < state.navHistory.length - 1) {
        state.navHistoryIndex += 1;
      }
    },
    setNavHistoryIndex: (state, action: PayloadAction<number>) => {
      state.navHistoryIndex = action.payload;
    },

    // Recent projects
    addRecentProject: (state, action: PayloadAction<string>) => {
      const projectId = action.payload;
      state.recentProjectIds = [
        projectId,
        ...state.recentProjectIds.filter((id) => id !== projectId),
      ].slice(0, 10);
    },

    // Terminal
    setReady: (state, action: PayloadAction<boolean>) => {
      state.isReady = action.payload;
    },
    setDimensions: (
      state,
      action: PayloadAction<{ columns: number; rows: number }>,
    ) => {
      state.dimensions = action.payload;
    },
  },
});

// Export actions (auto-generated by createSlice)
export const {
  cycleViewMode,
  setViewMode,
  toggleHelp,
  showHelp,
  hideHelp,
  showProjectPicker,
  hideProjectPicker,
  showNewItemDialog,
  hideNewItemDialog,
  toggleDetailPane,
  setDetailPane,
  increaseOutlineDepth,
  decreaseOutlineDepth,
  increaseContentLines,
  decreaseContentLines,
  setSelectionLevel,
  enterOutlineMode,
  exitOutlineMode,
  setInOutlineMode,
  setSubIndex,
  setMultiSelected,
  clearMultiSelection,
  setSelectionAnchor,
  setSelectAllLevel,
  toggleColumnCollapse,
  setCollapsedColumns,
  setMouseSelection,
  setMouseDragging,
  setDroppedFiles,
  showDropNotification,
  hideDropNotification,
  pushNavHistory,
  navBack,
  navForward,
  setNavHistoryIndex,
  addRecentProject,
  setReady,
  setDimensions,
} = uiSlice.actions;

// Export reducer
export const uiReducer = uiSlice.reducer;

// Legacy type export for gradual migration
export type UIAction = ReturnType<
  (typeof uiSlice.actions)[keyof typeof uiSlice.actions]
>;
