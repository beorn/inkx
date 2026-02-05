/**
 * Board Store - Zustand store for driver/AI state access
 *
 * This module provides a unified state interface for the board that can be
 * read directly by the driver via store.getState().
 *
 * The store consolidates:
 * - Board navigation state (cursorNodeId, foldedNodes, etc.)
 * - UI state (dialogs, viewMode, etc.)
 * - Derived layout (columns, colIndex, cardIndex)
 *
 * NOTE: This is designed as a "view" of state for the driver, not the
 * canonical source of truth. The Board component still uses useReducer
 * internally. This store is populated via a state capture callback.
 *
 * Future direction: Migrate Board to use this store directly via useApp().
 * See bead km-inkx-cmds.state for the full migration plan.
 */

import { createStore, type StoreApi } from "zustand"
import type { ViewMode } from "./types.ts"
import type { KNode } from "@km/core"
import type { BoardState } from "@km/board"
import type { UIState } from "./ui-reducer.ts"
import type { ColumnsLayout, ColumnState } from "./types.ts"

// =============================================================================
// Types
// =============================================================================

/**
 * Dialog state in the TUI - matches driver.ts DialogState
 */
export interface DialogState {
  search: boolean
  newItem: boolean
  projectPicker: boolean
  help: boolean
}

/**
 * Cursor position in the board - matches driver.ts CursorPosition
 */
export interface CursorPosition {
  col: number
  card: number
  level: "board" | "column" | "card"
}

/**
 * Unified board state for driver access.
 * This is the shape that driver.getState() returns.
 */
export interface BoardStoreState {
  // Navigation state
  rootId: string | null
  cursorNodeId: string | null
  foldedNodes: Set<string>
  selectedNodes: Set<string>
  moveMode: boolean

  // Cursor position (derived from layout)
  cursor: CursorPosition

  // UI state
  viewMode: ViewMode
  dialogs: DialogState
  detailPaneOpen: boolean

  // Selected node (derived)
  selectedNode: KNode | null

  // Columns layout for navigation context
  columns: ColumnState[]
  colIndex: number
  cardIndex: number

  // Raw state references for advanced access
  _boardState: BoardState | null
  _uiState: UIState | null
  _layout: ColumnsLayout | null
}

/**
 * Actions for updating the store.
 * These are internal - used by the state capture callback.
 */
export interface BoardStoreActions {
  /**
   * Update the store with captured state from Board component.
   * Called by the Board's onStateCaptureREPLACE_WITH_CREATEAPP_STORE callback.
   */
  captureState(captured: {
    boardState: BoardState
    ui: UIState
    layout: ColumnsLayout
    selectedNode: KNode | null
    selectionLevel: "board" | "column" | "card"
  }): void
}

export type BoardStore = BoardStoreState & BoardStoreActions

// =============================================================================
// Store Factory
// =============================================================================

/**
 * Create the initial store state.
 */
function createInitialState(): BoardStoreState {
  return {
    rootId: null,
    cursorNodeId: null,
    foldedNodes: new Set(),
    selectedNodes: new Set(),
    moveMode: false,

    cursor: { col: 0, card: 0, level: "card" },

    viewMode: "cards",
    dialogs: {
      search: false,
      newItem: false,
      projectPicker: false,
      help: false,
    },
    detailPaneOpen: false,

    selectedNode: null,

    columns: [],
    colIndex: 0,
    cardIndex: 0,

    _boardState: null,
    _uiState: null,
    _layout: null,
  }
}

/**
 * Create a board store instance.
 *
 * @example
 * ```typescript
 * const store = createBoardStore()
 *
 * // Read state
 * const state = store.getState()
 * console.log(state.cursorNodeId)
 * console.log(state.dialogs.search)
 *
 * // Subscribe to changes
 * store.subscribe((state) => {
 *   console.log('Cursor moved to:', state.selectedNode?.id)
 * })
 * ```
 */
export function createBoardStore(): StoreApi<BoardStore> {
  return createStore<BoardStore>((set) => ({
    ...createInitialState(),

    captureState(captured) {
      const { boardState, ui, layout, selectedNode, selectionLevel } = captured

      set({
        // Navigation state from boardState
        rootId: boardState.rootId,
        cursorNodeId: boardState.cursorNodeId,
        foldedNodes: boardState.foldedNodes,
        selectedNodes: boardState.selectedNodes,
        moveMode: boardState.moveMode,

        // Cursor position from layout
        cursor: {
          col: layout.colIndex,
          card: layout.cardIndex,
          level: selectionLevel,
        },

        // UI state
        viewMode: ui.viewMode,
        dialogs: {
          search: ui.showSearchDialog,
          newItem: ui.showNewItemDialog,
          projectPicker: ui.showProjectPicker,
          help: ui.showHelp,
        },
        detailPaneOpen: ui.showDetailPane,

        // Selected node
        selectedNode,

        // Layout details
        columns: layout.columns,
        colIndex: layout.colIndex,
        cardIndex: layout.cardIndex,

        // Raw state references
        _boardState: boardState,
        _uiState: ui,
        _layout: layout,
      })
    },
  }))
}

// =============================================================================
// Singleton for driver access
// =============================================================================

/**
 * Global board store instance for driver access.
 * The driver uses this to read state via getState().
 */
let globalStore: StoreApi<BoardStore> | null = null

/**
 * Get or create the global board store.
 * Used by the driver to access state directly.
 */
export function getBoardStore(): StoreApi<BoardStore> {
  if (!globalStore) {
    globalStore = createBoardStore()
  }
  return globalStore
}

/**
 * Reset the global store (for testing).
 */
export function resetBoardStore(): void {
  globalStore = null
}
