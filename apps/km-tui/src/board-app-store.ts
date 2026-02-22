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
import type { BoardAction, BoardState, NavHistoryEntry, PaneState, WorkspaceState } from "./board-types.ts"
import { createBoardState, createPaneState } from "./board-types.ts"
import type { UIState } from "./ui-reducer.ts"
import type { GridNavigator } from "@km/board"
import type { EditTarget } from "inkx"
import { deriveCursorAncestors, type CursorStore } from "./cursor-store.ts"
import { createUndoStack, type UndoStack } from "./undo-stack.ts"
import { createUndoableRepo, type UndoableRepoHandle } from "./undo/undoable-repo.ts"
import {
  splitLayoutNode,
  removeLayoutNode,
  getLayoutPaneIds,
  findAdjacentPaneInLayout,
  resizeSplitForPane,
  equalizeLayout,
  swapLeaves,
} from "./layout-helpers.ts"

// =============================================================================
// Store Types
// =============================================================================

/**
 * The full board app store state.
 *
 * Board navigation fields are flat at store root.
 * foldedNodes is the single source of truth (removed from UIState).
 *
 * Layout (columns, cursor position) is NOT stored here — it's derived on
 * demand by the key handler (buildActionCtx) and by React (useColumns hook).
 *
 * Phase 1 Windowing: `workspace` holds the pane structure (single pane).
 * Flat board fields remain as the canonical source — workspace.panes[focusedPaneId]
 * mirrors them. Future phases will invert this: workspace becomes canonical,
 * flat fields become derived.
 */
export interface BoardAppState {
  // --- Workspace (Phase 1: single pane, mirrors flat fields) ---
  workspace: WorkspaceState

  // --- Board navigation (flat — source of truth for Phase 1) ---
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

  // --- Zoom loading (deferred fold computation for large boards) ---
  isZoomLoading: boolean
}

/**
 * Get the focused pane's state from the workspace.
 * Convenience accessor for consumers that want to read from the workspace structure.
 * In Phase 1, the returned PaneState mirrors the flat store fields.
 */
export function getFocusedPane(state: BoardAppState): PaneState {
  return state.workspace.panes.get(state.workspace.focusedPaneId)!
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

  // Workspace pane operations (Phase 2: detail pane as workspace pane)
  openDetailPane(): void
  closeDetailPane(): void
  toggleDetailPane(): void

  // Workspace pane operations (Phase 3: splitting)
  splitFocusedPane(direction: "h" | "v"): void
  closeFocusedPane(): void

  // Workspace pane operations (Phase 4: focus navigation)
  focusPaneInDirection(direction: "left" | "right" | "up" | "down"): void
  focusPreviousPane(): void
  cyclePaneFocus(direction: "next" | "prev"): void
  focusPaneByNumber(number: number): void

  // Workspace pane operations (Phase 5: resize, zoom, close-all, swap)
  resizeFocusedPane(delta: number, axis: "h" | "v"): void
  equalizePanes(): void
  zoomFocusedPane(): void
  closeAllButFocused(): void
  swapPaneInDirection(direction: "left" | "right" | "up" | "down"): void

  // Workspace pane operations (Phase 6: pane-aware navigation)
  /** Change the focused pane's viewType from "empty" to "board" */
  activateEmptyPane(): void
}

export type BoardAppStore = BoardAppState & BoardAppActions & { [key: string]: unknown }

// =============================================================================
// Store Factory
// =============================================================================

// =============================================================================
// Default Fold Computation
// =============================================================================

/** Depth threshold for initial folds: fold nodes with children at this depth or deeper inside each card. */
const DEFAULT_FOLD_DEPTH = 2

/** Above this column count, fold ALL cards aggressively (fold at depth 0) to stay responsive. */
const AGGRESSIVE_FOLD_THRESHOLD = 20

/**
 * Compute default fold set for a given root.
 * Folds all non-leaf nodes at depth >= DEFAULT_FOLD_DEPTH within each card.
 * If existingFolds is non-empty, returns it unchanged (user has explicit folds).
 *
 * For large boards (>AGGRESSIVE_FOLD_THRESHOLD columns), folds all cards at depth 0
 * to avoid expensive tree traversal. The user can unfold specific areas with >.
 */
function computeDefaultFolds(repo: Repo, rootId: string | null, existingFolds: Set<string>): Set<string> {
  const foldedNodes = new Set(existingFolds)
  if (!rootId || foldedNodes.size > 0) return foldedNodes

  const columns = repo.getChildren(rootId)

  // For large boards, fold ALL cards aggressively to keep zoom instant.
  // Only need columns(depth 1) + cards(depth 2) — no deeper walk needed.
  if (columns.length > AGGRESSIVE_FOLD_THRESHOLD) {
    repo.preloadSubtree(rootId, 2)
    for (const col of columns) {
      const cards = repo.getChildren(col.id)
      for (const card of cards) {
        // Fold every card that has children (fold at depth 0)
        const children = repo.getChildren(card.id)
        if (children.length > 0) {
          foldedNodes.add(card.id)
        }
      }
    }
    return foldedNodes
  }

  // Normal boards: preload deeper subtree and use standard fold depth
  repo.preloadSubtree(rootId, DEFAULT_FOLD_DEPTH + 2)

  for (const col of columns) {
    const cards = repo.getChildren(col.id)
    for (const card of cards) {
      const foldDeep = (nodeId: string, depth: number) => {
        const children = repo.getChildren(nodeId)
        if (children.length === 0) return
        if (depth >= DEFAULT_FOLD_DEPTH) {
          foldedNodes.add(nodeId)
        } else {
          for (const child of children) foldDeep(child.id, depth + 1)
        }
      }
      foldDeep(card.id, 0)
    }
  }
  return foldedNodes
}

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

  // Compute initial folds: fold all foldable nodes at depth >= DEFAULT_FOLD_DEPTH
  // within each card.
  const initialFoldedNodes = computeDefaultFolds(params.repo, bs.rootId, bs.foldedNodes)

  return (set, _get) => {
    // Create undo system: wrap repo so mutations are auto-recorded
    const undoStack = createUndoStack()
    const { repo: undoableRepo, handle: undoHandle } = createUndoableRepo(params.repo, undoStack)

    // Phase 1 workspace: single pane mirroring the flat board state.
    // The pane's foldedNodes uses the computed initial folds.
    const initialPaneBoard: BoardState = {
      ...bs,
      foldedNodes: initialFoldedNodes,
    }
    const defaultPaneId = "main"
    const initialPane = createPaneState(defaultPaneId, initialPaneBoard, {
      viewMode: params.initialUIState.viewMode,
      cursorStore: params.cursorStore,
      isZoomLoading: false,
    })
    const workspace: WorkspaceState = {
      panes: new Map([[defaultPaneId, initialPane]]),
      focusedPaneId: defaultPaneId,
      previousFocusedPaneId: null,
      layout: { type: "leaf", paneId: defaultPaneId },
      preZoomLayout: null,
      preZoomPanes: null,
    }

    return {
      // Workspace (Phase 1: single pane mirrors flat fields)
      workspace,

      // Board navigation (flat — source of truth for Phase 1)
      rootId: bs.rootId,
      rootPath: bs.rootPath,
      cursorNodeId: bs.cursorNodeId,
      selectedNodes: bs.selectedNodes,
      foldedNodes: initialFoldedNodes,
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

      // Zoom loading
      isZoomLoading: false,

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
              // For large boards (>AGGRESSIVE_FOLD_THRESHOLD columns), defer fold
              // computation so the UI can show a loading indicator instead of blocking.
              const zoomChildren = undoableRepo.getChildren(action.nodeId)
              if (zoomChildren.length > AGGRESSIVE_FOLD_THRESHOLD) {
                flatUpdate = {
                  rootId: action.nodeId,
                  cursorNodeId: action.cursorNodeId ?? null,
                  foldedNodes: new Set<string>(),
                  isZoomLoading: true,
                  curswantX: null,
                  curswantY: null,
                }
                const zoomNodeId = action.nodeId
                setTimeout(() => {
                  const folds = computeDefaultFolds(undoableRepo, zoomNodeId, new Set())
                  set({ foldedNodes: folds, isZoomLoading: false })
                }, 0)
              } else {
                const zoomFolded = computeDefaultFolds(undoableRepo, action.nodeId, new Set())
                flatUpdate = {
                  rootId: action.nodeId,
                  cursorNodeId: action.cursorNodeId ?? null,
                  foldedNodes: zoomFolded,
                  curswantX: null,
                  curswantY: null,
                }
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
              // For large boards, defer fold computation
              const setRootChildren = undoableRepo.getChildren(action.rootId)
              if (setRootChildren.length > AGGRESSIVE_FOLD_THRESHOLD) {
                flatUpdate = {
                  rootId: action.rootId,
                  rootPath: action.rootPath,
                  cursorNodeId: action.cursorNodeId,
                  foldedNodes: new Set<string>(),
                  isZoomLoading: true,
                  navHistory: newHistory,
                  navHistoryIndex: newHistory.length,
                  curswantX: null,
                  curswantY: null,
                }
                const setRootId = action.rootId
                setTimeout(() => {
                  const folds = computeDefaultFolds(undoableRepo, setRootId, new Set())
                  set({ foldedNodes: folds, isZoomLoading: false })
                }, 0)
              } else {
                const rootFolded = computeDefaultFolds(undoableRepo, action.rootId, new Set())
                flatUpdate = {
                  rootId: action.rootId,
                  rootPath: action.rootPath,
                  cursorNodeId: action.cursorNodeId,
                  foldedNodes: rootFolded,
                  navHistory: newHistory,
                  navHistoryIndex: newHistory.length,
                  curswantX: null,
                  curswantY: null,
                }
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

      // --- Workspace pane operations (Phase 2: detail pane as workspace pane) ---

      openDetailPane() {
        set((state) => {
          const detailPaneId = "main-detail"
          // Already open? No-op.
          if (state.workspace.panes.has(detailPaneId)) {
            return { ui: { ...state.ui, showDetailPane: true, detailScrollOffset: 0 } }
          }

          // Create a detail pane with an empty board state (detail doesn't navigate).
          const detailPane = createPaneState(
            detailPaneId,
            createBoardState(),
            {
              viewType: "detail",
              viewMode: state.ui.viewMode,
              cursorStore: state.cursorStore,
              isZoomLoading: false,
            },
          )

          const newPanes = new Map(state.workspace.panes)
          newPanes.set(detailPaneId, detailPane)

          const newLayout: WorkspaceState["layout"] = {
            type: "split",
            direction: "h",
            ratio: 0.65,
            left: { type: "leaf", paneId: "main" },
            right: { type: "leaf", paneId: detailPaneId },
          }

          return {
            workspace: {
              ...state.workspace,
              panes: newPanes,
              layout: newLayout,
            },
            ui: { ...state.ui, showDetailPane: true, detailScrollOffset: 0 },
          }
        })
      },

      closeDetailPane() {
        set((state) => {
          const detailPaneId = "main-detail"
          // Not open? Just ensure flat state is consistent.
          if (!state.workspace.panes.has(detailPaneId)) {
            return { ui: { ...state.ui, showDetailPane: false, detailScrollOffset: 0 } }
          }

          const newPanes = new Map(state.workspace.panes)
          newPanes.delete(detailPaneId)

          const newLayout: WorkspaceState["layout"] = {
            type: "leaf",
            paneId: "main",
          }

          return {
            workspace: {
              ...state.workspace,
              panes: newPanes,
              layout: newLayout,
            },
            ui: { ...state.ui, showDetailPane: false, detailScrollOffset: 0 },
          }
        })
      },

      toggleDetailPane() {
        const state = _get()
        if (state.workspace.panes.has("main-detail")) {
          state.closeDetailPane()
        } else {
          state.openDetailPane()
        }
      },

      // --- Workspace pane operations (Phase 3: splitting) ---

      splitFocusedPane(direction: "h" | "v") {
        set((state) => {
          const { workspace } = state
          const focusedId = workspace.focusedPaneId

          // Generate unique pane ID
          const existingIds = new Set(workspace.panes.keys())
          let counter = existingIds.size + 1
          let newPaneId = `pane-${counter}`
          while (existingIds.has(newPaneId)) {
            counter++
            newPaneId = `pane-${counter}`
          }

          // Create an empty pane
          const emptyPane = createPaneState(
            newPaneId,
            createBoardState(),
            {
              viewType: "empty",
              viewMode: state.ui.viewMode,
              cursorStore: state.cursorStore,
              isZoomLoading: false,
            },
          )

          // Split the layout tree at the focused pane
          const newLayout = splitLayoutNode(workspace.layout, focusedId, direction, newPaneId)

          const newPanes = new Map(workspace.panes)
          newPanes.set(newPaneId, emptyPane)

          return {
            workspace: {
              ...workspace,
              panes: newPanes,
              layout: newLayout,
              // Keep focus on the original pane
              focusedPaneId: focusedId,
            },
          }
        })
      },

      closeFocusedPane() {
        set((state) => {
          const { workspace } = state

          // Don't close the last pane
          if (workspace.panes.size <= 1) {
            return state
          }

          const focusedId = workspace.focusedPaneId

          // Remove from layout tree
          const newLayout = removeLayoutNode(workspace.layout, focusedId)
          if (!newLayout) return state // Should not happen (we checked size > 1)

          // Remove from panes map
          const newPanes = new Map(workspace.panes)
          newPanes.delete(focusedId)

          // Pick a new focused pane (first available)
          const newFocusedId = getLayoutPaneIds(newLayout)[0] ?? "main"

          return {
            workspace: {
              ...workspace,
              panes: newPanes,
              layout: newLayout,
              focusedPaneId: newFocusedId,
              previousFocusedPaneId: workspace.previousFocusedPaneId === focusedId
                ? null
                : workspace.previousFocusedPaneId,
            },
          }
        })
      },

      // --- Workspace pane operations (Phase 4: focus navigation) ---

      focusPaneInDirection(direction: "left" | "right" | "up" | "down") {
        set((state) => {
          const { workspace } = state
          const targetPaneId = findAdjacentPaneInLayout(workspace.layout, workspace.focusedPaneId, direction)
          if (!targetPaneId || targetPaneId === workspace.focusedPaneId) return state
          if (!workspace.panes.has(targetPaneId)) return state

          return {
            workspace: {
              ...workspace,
              focusedPaneId: targetPaneId,
              previousFocusedPaneId: workspace.focusedPaneId,
            },
          }
        })
      },

      focusPreviousPane() {
        set((state) => {
          const { workspace } = state
          const prevId = workspace.previousFocusedPaneId
          if (!prevId || !workspace.panes.has(prevId)) return state
          if (prevId === workspace.focusedPaneId) return state

          return {
            workspace: {
              ...workspace,
              focusedPaneId: prevId,
              previousFocusedPaneId: workspace.focusedPaneId,
            },
          }
        })
      },

      cyclePaneFocus(direction: "next" | "prev") {
        set((state) => {
          const { workspace } = state
          const tabOrder = getLayoutPaneIds(workspace.layout)
          if (tabOrder.length <= 1) return state

          const currentIndex = tabOrder.indexOf(workspace.focusedPaneId)
          if (currentIndex < 0) return state

          let nextIndex: number
          if (direction === "next") {
            nextIndex = (currentIndex + 1) % tabOrder.length
          } else {
            nextIndex = (currentIndex - 1 + tabOrder.length) % tabOrder.length
          }

          const targetPaneId = tabOrder[nextIndex]
          if (!targetPaneId || targetPaneId === workspace.focusedPaneId) return state

          return {
            workspace: {
              ...workspace,
              focusedPaneId: targetPaneId,
              previousFocusedPaneId: workspace.focusedPaneId,
            },
          }
        })
      },

      focusPaneByNumber(number: number) {
        set((state) => {
          const { workspace } = state
          const tabOrder = getLayoutPaneIds(workspace.layout)
          // Pane numbers are 1-indexed
          const targetIndex = number - 1
          if (targetIndex < 0 || targetIndex >= tabOrder.length) return state

          const targetPaneId = tabOrder[targetIndex]
          if (!targetPaneId || targetPaneId === workspace.focusedPaneId) return state

          return {
            workspace: {
              ...workspace,
              focusedPaneId: targetPaneId,
              previousFocusedPaneId: workspace.focusedPaneId,
            },
          }
        })
      },

      // --- Workspace pane operations (Phase 5: resize, zoom, close-all, swap) ---

      resizeFocusedPane(delta: number, axis: "h" | "v") {
        set((state) => {
          const { workspace } = state
          const newLayout = resizeSplitForPane(workspace.layout, workspace.focusedPaneId, delta, axis)
          if (newLayout === workspace.layout) return state
          return {
            workspace: { ...workspace, layout: newLayout },
          }
        })
      },

      equalizePanes() {
        set((state) => {
          const { workspace } = state
          const newLayout = equalizeLayout(workspace.layout)
          if (newLayout === workspace.layout) return state
          return {
            workspace: { ...workspace, layout: newLayout },
          }
        })
      },

      zoomFocusedPane() {
        set((state) => {
          const { workspace } = state

          // Already zoomed — restore
          if (workspace.preZoomLayout && workspace.preZoomPanes) {
            // Restore the pre-zoom panes, but update the focused pane with its current state
            const restoredPanes = new Map(workspace.preZoomPanes)
            const currentFocused = workspace.panes.get(workspace.focusedPaneId)
            if (currentFocused) {
              restoredPanes.set(workspace.focusedPaneId, currentFocused)
            }
            return {
              workspace: {
                ...workspace,
                layout: workspace.preZoomLayout,
                panes: restoredPanes,
                preZoomLayout: null,
                preZoomPanes: null,
              },
            }
          }

          // Only one pane — nothing to zoom
          if (workspace.panes.size <= 1) return state

          // Save current state and zoom to a single leaf
          return {
            workspace: {
              ...workspace,
              preZoomLayout: workspace.layout,
              preZoomPanes: new Map(workspace.panes),
              layout: { type: "leaf", paneId: workspace.focusedPaneId },
            },
          }
        })
      },

      closeAllButFocused() {
        set((state) => {
          const { workspace } = state

          // Only one pane — nothing to close
          if (workspace.panes.size <= 1) return state

          const focusedId = workspace.focusedPaneId
          const focusedPane = workspace.panes.get(focusedId)
          if (!focusedPane) return state

          const newPanes = new Map<string, PaneState>()
          newPanes.set(focusedId, focusedPane)

          return {
            workspace: {
              ...workspace,
              panes: newPanes,
              layout: { type: "leaf", paneId: focusedId },
              previousFocusedPaneId: null,
              // Clear zoom state since we're now down to a single pane
              preZoomLayout: null,
              preZoomPanes: null,
            },
          }
        })
      },

      swapPaneInDirection(direction: "left" | "right" | "up" | "down") {
        set((state) => {
          const { workspace } = state
          const targetPaneId = findAdjacentPaneInLayout(workspace.layout, workspace.focusedPaneId, direction)
          if (!targetPaneId || targetPaneId === workspace.focusedPaneId) return state

          const newLayout = swapLeaves(workspace.layout, workspace.focusedPaneId, targetPaneId)
          if (newLayout === workspace.layout) return state

          return {
            workspace: { ...workspace, layout: newLayout },
          }
        })
      },

      // --- Workspace pane operations (Phase 6: pane-aware navigation) ---

      activateEmptyPane() {
        set((state) => {
          const { workspace } = state
          const focusedPane = workspace.panes.get(workspace.focusedPaneId)
          if (!focusedPane || focusedPane.viewType !== "empty") return state

          const updatedPane: PaneState = { ...focusedPane, viewType: "board" }
          const newPanes = new Map(workspace.panes)
          newPanes.set(workspace.focusedPaneId, updatedPane)

          return {
            workspace: { ...workspace, panes: newPanes },
          }
        })
      },
    }
  }
}
