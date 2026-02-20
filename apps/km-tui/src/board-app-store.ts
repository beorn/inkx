/**
 * Board App Store — Zustand store for createApp() integration
 *
 * Canonical state for the board TUI:
 * - Board.tsx reads via useApp(selector)
 * - term:key handler reads/writes via get()/set()/setUI()
 * - driver reads via handle.store.getState()
 *
 * Board nav fields are flat at store root. UI fields are grouped under `ui`.
 *
 * Layout (columns, cursor position) is derived on demand — never stored.
 * The key handler derives layout fresh each keypress via buildActionCtx().
 * React derives layout via useColumns + useCursorPosition.
 */

import type { ToastQueue, JobRunner } from "@km/core"
import { createJobRunner } from "@km/core"
import type { Repo } from "./repo-context.tsx"
import type { BoardAction, BoardState, NavHistoryEntry } from "./board-types.ts"
import type { UIState } from "./ui-reducer.ts"
import type { GridNavigator } from "@km/board"
import type { EditTarget } from "inkx"
import { deriveCursorAncestors, type CursorStore } from "./cursor-store.ts"
import { createUndoStack, type UndoStack } from "./undo-stack.ts"
import { createUndoableRepo, type UndoableRepoHandle } from "./undo/undoable-repo.ts"

// =============================================================================
// Store Types
// =============================================================================

/**
 * The full board app store state.
 *
 * Board navigation fields are flat at store root.
 * foldedNodes is the single source of truth (removed from UIState).
 * maxOutlineDepth/maxContentLines live in ui only.
 *
 * Layout (columns, cursor position) is NOT stored here — it's derived on
 * demand by the key handler (buildActionCtx) and by React (useColumns hook).
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

  // --- Injected services (set once at init) ---
  repo: Repo
  toastQueue: ToastQueue
  jobRunner: JobRunner
  navigator: GridNavigator

  // --- Text input target ---
  textEditTarget: EditTarget | null

  // --- Dimensions ---
  dimensions: { columns: number; rows: number }

  // --- Cursor store (lightweight pub/sub, bypasses Zustand for cursor moves) ---
  cursorStore: CursorStore

  // --- Undo/redo ---
  undoStack: UndoStack
  undoHandle: UndoableRepoHandle
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
  setTextEditTarget(target: EditTarget | null): void
  setDimensions(dims: { columns: number; rows: number }): void
}

export type BoardAppStore = BoardAppState & BoardAppActions & { [key: string]: unknown }

// =============================================================================
// Store Factory
// =============================================================================

export interface CreateBoardAppStoreParams {
  repo: Repo
  toastQueue: ToastQueue
  navigator: GridNavigator
  cursorStore: CursorStore
  initialBoardState: BoardState
  initialUIState: UIState
  dimensions: { columns: number; rows: number }
}

/**
 * Create the initial store state for the board app.
 * Used as the Zustand StateCreator in createApp().
 */
export function createBoardAppStoreState(
  params: CreateBoardAppStoreParams,
): (
  set: (partial: Partial<BoardAppStore> | ((state: BoardAppStore) => Partial<BoardAppStore>)) => void,
  get: () => BoardAppStore,
) => BoardAppStore {
  const bs = params.initialBoardState

  return (set, _get) => {
    // Create undo system: wrap repo so mutations are auto-recorded
    const undoStack = createUndoStack()
    const { repo: undoableRepo, handle: undoHandle } = createUndoableRepo(params.repo, undoStack)

    return {
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

      // Injected — use the undoable-wrapped repo so mutations auto-record
      repo: undoableRepo,
      toastQueue: params.toastQueue,
      jobRunner: createJobRunner(params.toastQueue),
      navigator: params.navigator,

      // Text input
      textEditTarget: null,

      // Dimensions
      dimensions: params.dimensions,

      // Cursor store
      cursorStore: params.cursorStore,

      // Undo/redo
      undoStack,
      undoHandle,

      // --- Board action dispatcher (inlined from boardReducer) ---

      // oxlint-disable-next-line complexity/complexity -- Exhaustive switch over BoardAction union
      dispatchBoard(action: BoardAction) {
        // --- Fast path: SELECT bypasses Zustand set() entirely ---
        if (action.type === "SELECT") {
          const s = _get()
          // Silent mutation on Zustand state (no subscriber notification)
          s.cursorNodeId = action.nodeId
          s.curswantX = null
          s.curswantY = null
          // Derive cursor ancestors from tree structure
          const getNode = (id: string) => s.repo.getNode(id)
          const ancestors = deriveCursorAncestors(getNode, s.rootId, action.nodeId, (pid) => s.repo.getChildren(pid))
          // Notify CursorStore subscribers (only cursor-aware components re-render)
          s.cursorStore.setState({
            cursorNodeId: action.nodeId,
            ...ancestors,
          })
          return
        }

        // --- Fast path: SET_CURSWANT also bypasses Zustand set() ---
        if (action.type === "SET_CURSWANT") {
          const s = _get()
          if (action.x !== undefined) s.curswantX = action.x
          if (action.y !== undefined) s.curswantY = action.y
          return
        }

        set((state) => {
          let flatUpdate: Partial<BoardAppState>

          switch (action.type) {
            // SELECT and SET_CURSWANT handled above (fast path)
            case "SELECT":
            case "SET_CURSWANT":
              return state

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

            default: {
              const unhandled = action as { type: string }
              throw new Error(`[km:board] Unhandled board action: ${unhandled.type}`)
            }
          }

          return flatUpdate
        })

        // After state mutation, notify CursorStore so cursor-aware components update
        // (e.g., ZOOM_IN changes cursorNodeId, CANCEL_MOVE restores it)
        const s = _get()
        const getNode = (id: string) => s.repo.getNode(id)
        const ancestors = deriveCursorAncestors(getNode, s.rootId, s.cursorNodeId, (pid) => s.repo.getChildren(pid))
        s.cursorStore.setState({
          cursorNodeId: s.cursorNodeId,
          ...ancestors,
        })
      },

      // --- Direct setters ---

      setUI(partial: Partial<UIState> | ((prev: UIState) => Partial<UIState>)) {
        set((state) => {
          const updates = typeof partial === "function" ? partial(state.ui) : partial
          return { ui: { ...state.ui, ...updates } }
        })
      },

      setFoldedNodes(nodes: Set<string>) {
        set({ foldedNodes: nodes })
      },

      setTextEditTarget(target: EditTarget | null) {
        set({ textEditTarget: target })
      },

      setDimensions(dims: { columns: number; rows: number }) {
        set((state) => ({
          dimensions: dims,
          ui: { ...state.ui, dimensions: dims },
        }))
      },
    }
  }
}
