/**
 * Board App Store — Zustand store for createApp() integration
 *
 * Canonical state for the board TUI:
 * - Board.tsx reads via useApp(selector)
 * - term:key handler reads/writes via get()/set()/setUI()
 * - driver reads via handle.store.getState()
 *
 * Board nav fields are flat at store root. UI fields are grouped under `ui`.
 */

import type { KNode, ToastQueue } from "@km/core"
import type { Repo } from "./repo-context.tsx"
import type { BoardAction, BoardState, NavHistoryEntry } from "./board-types.ts"
import type { TUIBoardState, ColumnsLayout } from "./types.ts"
import type { UIState } from "./ui-reducer.ts"
import type { LayoutRegistry } from "./card-positions.ts"
import type { BlockEditTarget } from "./block-edit-target.ts"
import { deriveColumnsFromRepo } from "./hooks/use-columns.ts"
import { deriveCursorPosition } from "./hooks/use-cursor-position.ts"

// =============================================================================
// Store Types
// =============================================================================

/**
 * The full board app store state.
 *
 * Board navigation fields are flat at store root.
 * foldedNodes is the single source of truth (removed from UIState).
 * maxOutlineDepth/maxContentLines live in ui only.
 */
export interface BoardAppState {
  // --- Board navigation (flat — source of truth) ---
  rootId: string | null
  rootPath: string | null
  cursorNodeId: string | null
  selectedNodes: Set<string>
  foldedNodes: Set<string>
  collapsedNodes: Set<string>
  navHistory: NavHistoryEntry[]
  navHistoryIndex: number
  moveMode: boolean
  moveSourceNodes: string[]
  moveSourceCursorNodeId: string | null
  curswantX: number | null
  curswantY: number | null

  // --- UI state ---
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
  // Board action dispatcher (inlined from boardReducer)
  dispatchBoard(action: BoardAction): void

  // Direct UI state update (shallow merge into ui)
  setUI(partial: Partial<UIState> | ((prev: UIState) => Partial<UIState>)): void

  // Fold operations (single source of truth at store root)
  setFoldedNodes(nodes: Set<string>): void

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
// Helpers
// =============================================================================

/**
 * Synchronously derive layout from state and silently update the store.
 * Called after dispatchBoard() and setFoldedNodes() to ensure the store
 * has fresh layout data immediately — no React effect round-trip needed.
 *
 * Uses silent mutation (direct property assignment on getState()) so Zustand
 * subscribers are NOT notified. This is safe because:
 * - React already has the correct layout from useColumns/useCursorPosition hooks
 * - The key handler just needs fresh layout data for the NEXT keypress
 */
function recomputeLayout(get: () => BoardAppStore): void {
  const s = get()
  const columns = deriveColumnsFromRepo(s.repo, s.rootId, s.foldedNodes)
  const cursor = deriveCursorPosition(columns, s.cursorNodeId)

  const layout: ColumnsLayout = {
    columns,
    colIndex: cursor.colIndex,
    cardIndex: cursor.cardIndex,
    subPath: [],
    isAtCardLevel: cursor.isAtCardLevel,
    isInOutlineMode: false,
  }

  const selectedCol = columns[cursor.colIndex]
  const selectedCard = selectedCol?.cards[cursor.cardIndex]
  const selectedNode = selectedCard?.node ?? selectedCol?.node ?? null

  // Silent mutation — no Zustand notification
  s.layout = layout
  s.selectedNode = selectedNode
  s.selectionLevel = cursor.selectionLevel
}

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
  const bs = params.initialBoardState

  return (set, _get) => ({
    // Board navigation (flat — source of truth)
    rootId: bs.rootId,
    rootPath: bs.rootPath,
    cursorNodeId: bs.cursorNodeId,
    selectedNodes: bs.selectedNodes,
    foldedNodes: bs.foldedNodes,
    collapsedNodes: bs.collapsedNodes,
    navHistory: bs.navHistory,
    navHistoryIndex: bs.navHistoryIndex,
    moveMode: bs.moveMode,
    moveSourceNodes: bs.moveSourceNodes,
    moveSourceCursorNodeId: bs.moveSourceCursorNodeId,
    curswantX: bs.curswantX,
    curswantY: bs.curswantY,

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

    // --- Board action dispatcher (inlined from boardReducer) ---

    // oxlint-disable-next-line complexity/max-cognitive -- Exhaustive switch over BoardAction union
    dispatchBoard(action: BoardAction) {
      set((state) => {
        let flatUpdate: Partial<BoardAppState>

        switch (action.type) {
          case "SELECT": {
            flatUpdate = {
              cursorNodeId: action.nodeId,
              curswantX: null,
              curswantY: null,
            }
            break
          }

          case "TOGGLE_FOLD": {
            const newFolded = new Set(state.foldedNodes)
            if (newFolded.has(action.nodeId)) {
              newFolded.delete(action.nodeId)
            } else {
              newFolded.add(action.nodeId)
            }
            flatUpdate = { foldedNodes: newFolded }
            break
          }

          case "TOGGLE_COLLAPSE": {
            const newCollapsed = new Set(state.collapsedNodes)
            if (newCollapsed.has(action.nodeId)) {
              newCollapsed.delete(action.nodeId)
            } else {
              newCollapsed.add(action.nodeId)
            }
            flatUpdate = { collapsedNodes: newCollapsed }
            break
          }

          case "ZOOM_IN": {
            flatUpdate = {
              rootId: action.nodeId,
              cursorNodeId: action.cursorNodeId ?? null,
              curswantX: null,
              curswantY: null,
            }
            break
          }

          case "SET_ROOT": {
            const newHistory = [
              ...state.navHistory.slice(0, state.navHistoryIndex + 1),
              {
                rootId: state.rootId,
                rootPath: state.rootPath,
                cursorNodeId: state.cursorNodeId,
              },
            ]
            flatUpdate = {
              rootId: action.rootId,
              rootPath: action.rootPath,
              cursorNodeId: action.cursorNodeId,
              navHistory: newHistory,
              navHistoryIndex: newHistory.length,
              curswantX: null,
              curswantY: null,
            }
            break
          }

          case "SELECT_NODE_ADD": {
            const newSelected = new Set(state.selectedNodes)
            newSelected.add(action.nodeId)
            flatUpdate = { selectedNodes: newSelected }
            break
          }

          case "SELECT_NODE_REMOVE": {
            const newSelected = new Set(state.selectedNodes)
            newSelected.delete(action.nodeId)
            flatUpdate = { selectedNodes: newSelected }
            break
          }

          case "SELECT_NODE_TOGGLE": {
            const newSelected = new Set(state.selectedNodes)
            if (newSelected.has(action.nodeId)) {
              newSelected.delete(action.nodeId)
            } else {
              newSelected.add(action.nodeId)
            }
            flatUpdate = { selectedNodes: newSelected }
            break
          }

          case "CLEAR_SELECTION": {
            flatUpdate = { selectedNodes: new Set() }
            break
          }

          case "ENTER_MOVE_MODE": {
            if (action.nodeIds.length === 0) return state
            flatUpdate = {
              moveMode: true,
              moveSourceNodes: action.nodeIds,
              moveSourceCursorNodeId: action.cursorNodeId,
            }
            break
          }

          case "CONFIRM_MOVE": {
            flatUpdate = {
              moveMode: false,
              moveSourceNodes: [],
              moveSourceCursorNodeId: null,
              selectedNodes: new Set(),
            }
            break
          }

          case "CANCEL_MOVE": {
            flatUpdate = {
              moveMode: false,
              moveSourceNodes: [],
              cursorNodeId: state.moveSourceCursorNodeId ?? state.cursorNodeId,
              moveSourceCursorNodeId: null,
              curswantX: null,
              curswantY: null,
            }
            break
          }

          // View config: kept in UIState only via setUI.
          // These cases are kept for backward compat with @km/board's BoardAction type.
          case "INCREASE_OUTLINE_DEPTH":
          case "DECREASE_OUTLINE_DEPTH":
          case "INCREASE_CONTENT_LINES":
          case "DECREASE_CONTENT_LINES":
            return state

          case "SET_CURSWANT": {
            flatUpdate = {
              curswantX: action.x !== undefined ? action.x : state.curswantX,
              curswantY: action.y !== undefined ? action.y : state.curswantY,
            }
            break
          }

          default: {
            const unhandled = action as { type: string }
            throw new Error(
              `[km:board] Unhandled board action: ${unhandled.type}`,
            )
          }
        }

        return flatUpdate
      })
      // Synchronously derive layout so key handler has fresh data immediately
      recomputeLayout(_get)
    },

    // --- Direct setters ---

    setUI(partial: Partial<UIState> | ((prev: UIState) => Partial<UIState>)) {
      set((state) => {
        const updates =
          typeof partial === "function" ? partial(state.ui) : partial
        return { ui: { ...state.ui, ...updates } }
      })
    },

    setFoldedNodes(nodes: Set<string>) {
      set({ foldedNodes: nodes })
      recomputeLayout(_get)
    },

    setTextEditTarget(target: BlockEditTarget | null) {
      set({ textEditTarget: target })
    },

    setDimensions(dims: { columns: number; rows: number }) {
      set((state) => ({
        dimensions: dims,
        ui: { ...state.ui, dimensions: dims },
      }))
    },

    updateLayout(layout, selectedNode, selectionLevel, tuiBoardState) {
      // Silent mutation: update derived fields WITHOUT triggering Zustand
      // subscribers. This prevents the double-render-per-keypress issue:
      //   1. Key handler sets cursorNodeId → doRender() → React renders Board
      //   2. Board effect computes new layout → calls updateLayout
      //   3. If updateLayout calls set(), Zustand fires subscriber → pendingRerender → 2nd doRender()
      //   4. The 2nd render is WASTED — React already has the correct state
      //
      // By mutating getState() directly, the key handler sees fresh layout
      // (via get().layout) without triggering a re-render cycle.
      const state = _get()
      state.layout = layout
      state.selectedNode = selectedNode
      state.selectionLevel = selectionLevel
      state.tuiBoardState = tuiBoardState
    },
  })
}
