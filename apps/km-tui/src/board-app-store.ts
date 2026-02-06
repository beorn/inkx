/**
 * Board App Store — Zustand store for createApp() integration
 *
 * This is the canonical state for the board TUI. Board.tsx reads via useApp(selector).
 * The term:key handler in board-app.ts reads/writes via get()/set().
 * The driver reads via handle.store.getState().
 *
 * Phase 1: Adapter bridge — existing reducers applied via set().
 * Phase 6: Rewrite action handlers to use set() directly, delete reducers.
 */

import type { KNode, ToastQueue } from "@km/core"
import type { Repo } from "./repo-context.tsx"
import type { BoardState, BoardAction } from "@km/board"
import { boardReducer, createBoardState } from "@km/board"
import type {
  TUIBoardState,
  ViewMode,
  ColumnsLayout,
  ColumnState,
  CardState,
  SelectionKey,
} from "./types.ts"
import {
  uiReducer,
  createInitialUIState,
  actions,
  type UIState,
  type UIAction,
} from "./ui-reducer.ts"
import type { LayoutRegistry } from "./card-positions.ts"
import type { BlockEditTarget } from "./block-edit-target.ts"

// =============================================================================
// Store Types
// =============================================================================

/**
 * The full board app store state.
 *
 * Merges UI state (from uiReducer) + board nav state (from boardReducer)
 * + injected services + derived layout.
 */
export interface BoardAppState {
  // --- Board navigation (from boardReducer) ---
  boardState: BoardState

  // --- UI state (from uiReducer) ---
  ui: UIState

  // --- Derived layout (recomputed on state changes) ---
  layout: ColumnsLayout

  // --- Derived rendering state ---
  tuiBoardState: TUIBoardState

  // --- Derived selections ---
  selectedNode: KNode | null
  selectionLevel: "board" | "column" | "card"

  // --- Injected services (set once at init) ---
  repo: Repo
  toastQueue: ToastQueue
  layoutRegistry: LayoutRegistry

  // --- Text input target ---
  textEditTarget: BlockEditTarget | null

  // --- Dimensions ---
  dimensions: { columns: number; rows: number }
}

/**
 * Actions on the store.
 */
export interface BoardAppActions {
  // Adapter bridges: apply reducer actions via set()
  dispatchUI(action: UIAction): void
  dispatchBoard(action: BoardAction): void

  // Direct setters
  setTextEditTarget(target: BlockEditTarget | null): void
  setDimensions(dims: { columns: number; rows: number }): void

  // Layout update (called after columns/cursor recompute)
  updateLayout(
    layout: ColumnsLayout,
    selectedNode: KNode | null,
    selectionLevel: "board" | "column" | "card",
    tuiBoardState: TUIBoardState,
  ): void
}

export type BoardAppStore = BoardAppState &
  BoardAppActions & { [key: string]: unknown }

// =============================================================================
// Store Factory
// =============================================================================

export interface CreateBoardAppStoreParams {
  repo: Repo
  toastQueue: ToastQueue
  layoutRegistry: LayoutRegistry
  initialBoardState: BoardState
  initialUIState: UIState
  initialLayout: ColumnsLayout
  initialTUIBoardState: TUIBoardState
  initialSelectedNode: KNode | null
  initialSelectionLevel: "board" | "column" | "card"
  dimensions: { columns: number; rows: number }
}

/**
 * Create the initial store state for the board app.
 * Used as the Zustand StateCreator in createApp().
 */
export function createBoardAppStoreState(
  params: CreateBoardAppStoreParams,
): (
  set: (
    partial:
      | Partial<BoardAppStore>
      | ((state: BoardAppStore) => Partial<BoardAppStore>),
  ) => void,
  get: () => BoardAppStore,
) => BoardAppStore {
  return (set, _get) => ({
    // Board navigation state
    boardState: params.initialBoardState,

    // UI state
    ui: params.initialUIState,

    // Derived layout
    layout: params.initialLayout,
    tuiBoardState: params.initialTUIBoardState,

    // Derived
    selectedNode: params.initialSelectedNode,
    selectionLevel: params.initialSelectionLevel,

    // Injected
    repo: params.repo,
    toastQueue: params.toastQueue,
    layoutRegistry: params.layoutRegistry,

    // Text input
    textEditTarget: null,

    // Dimensions
    dimensions: params.dimensions,

    // --- Adapter bridges ---

    dispatchUI(action: UIAction) {
      set((state) => ({
        ui: uiReducer(state.ui, action),
      }))
    },

    dispatchBoard(action: BoardAction) {
      set((state) => ({
        boardState: boardReducer(state.boardState, action),
      }))
    },

    // --- Direct setters ---

    setTextEditTarget(target: BlockEditTarget | null) {
      set({ textEditTarget: target })
    },

    setDimensions(dims: { columns: number; rows: number }) {
      set((state) => ({
        dimensions: dims,
        ui: uiReducer(state.ui, actions.setDimensions(dims)),
      }))
    },

    updateLayout(layout, selectedNode, selectionLevel, tuiBoardState) {
      set({ layout, selectedNode, selectionLevel, tuiBoardState })
    },
  })
}
