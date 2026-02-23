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
import type { BoardAction, BoardState, LayoutNode, NavHistoryEntry, PaneState, WorkspaceState } from "./board-types.ts"
import { createBoardState, createPaneState } from "./board-types.ts"
import type { UIState } from "./ui-reducer.ts"
import type { GridNavigator } from "@km/board"
import type { EditTarget } from "inkx"
import { deriveCursorAncestors, createCursorStore, type CursorStore } from "./cursor-store.ts"
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
  setSplitRatioAbsolute,
} from "./layout-helpers.ts"
import type { PersistedWorkspace, PersistedPane, PersistedLayoutNode } from "./workspace-persist.ts"

// =============================================================================
// Store Types
// =============================================================================

/**
 * The full board app store state.
 *
 * Board navigation fields are flat at store root.
 * foldDepths is the single source of truth (removed from UIState).
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
  foldDepths: Map<string, number>
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
  const pane = state.workspace.panes.get(state.workspace.focusedPaneId)
  if (!pane) throw new Error(`Focused pane "${state.workspace.focusedPaneId}" not found in workspace`)
  return pane
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
  setFoldDepths(depths: Map<string, number>): void

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
  /** Focus a specific pane by ID (for mouse click-to-focus) */
  focusPaneById(paneId: string): void

  // Workspace pane operations (Phase 5: resize, zoom, close-all, swap)
  resizeFocusedPane(delta: number, axis: "h" | "v"): void
  equalizePanes(): void
  zoomFocusedPane(): void
  closeAllButFocused(): void
  swapPaneInDirection(direction: "left" | "right" | "up" | "down"): void

  // Workspace pane operations (Phase 7: mouse support)
  /** Set absolute split ratio for drag resize */
  setSplitRatio(splitNode: LayoutNode & { type: "split" }, ratio: number): void

  // Workspace pane operations (Phase 6: pane-aware navigation)
  /** Change the focused pane's viewType from "empty" to "board" */
  activateEmptyPane(): void
}

export type BoardAppStore = BoardAppState & BoardAppActions & { [key: string]: unknown }

// =============================================================================
// Store Factory
// =============================================================================

// =============================================================================
// Pane ↔ Flat Field Sync Helpers
// =============================================================================

/**
 * Snapshot the current flat board fields into a PaneState object.
 * Used to save state before switching focus away from a pane.
 */
function snapshotFlatToPane(state: BoardAppState, pane: PaneState): PaneState {
  return {
    ...pane,
    rootId: state.rootId,
    rootPath: state.rootPath,
    cursorNodeId: state.cursorNodeId,
    selectedNodes: state.selectedNodes,
    foldDepths: state.foldDepths,
    collapsedNodes: state.collapsedNodes,
    navHistory: state.navHistory,
    navHistoryIndex: state.navHistoryIndex,
    moveMode: state.moveMode,
    moveSourceNodes: state.moveSourceNodes,
    moveSourceCursorNodeId: state.moveSourceCursorNodeId,
    curswantX: state.curswantX,
    curswantY: state.curswantY,
    cursorStore: state.cursorStore,
    isZoomLoading: state.isZoomLoading,
  }
}

/**
 * Restore flat board fields from a PaneState.
 * Used when switching focus to a different pane.
 * Returns partial state for Zustand set().
 */
function restorePaneToFlat(pane: PaneState): Partial<BoardAppState> {
  return {
    rootId: pane.rootId,
    rootPath: pane.rootPath,
    cursorNodeId: pane.cursorNodeId,
    selectedNodes: pane.selectedNodes,
    foldDepths: pane.foldDepths,
    collapsedNodes: pane.collapsedNodes,
    navHistory: pane.navHistory,
    navHistoryIndex: pane.navHistoryIndex,
    moveMode: pane.moveMode,
    moveSourceNodes: pane.moveSourceNodes,
    moveSourceCursorNodeId: pane.moveSourceCursorNodeId,
    curswantX: pane.curswantX,
    curswantY: pane.curswantY,
    cursorStore: pane.cursorStore,
    isZoomLoading: pane.isZoomLoading,
  }
}

/**
 * Build an updated panes map with the focused pane's flat fields synced in.
 * Called after mutations to keep workspace.panes in sync with flat state.
 */
function syncFlatToFocusedPane(state: BoardAppState): Map<string, PaneState> {
  const focusedPaneId = state.workspace.focusedPaneId
  const pane = state.workspace.panes.get(focusedPaneId)
  if (!pane) return state.workspace.panes

  const updated = snapshotFlatToPane(state, pane)
  const newPanes = new Map(state.workspace.panes)
  newPanes.set(focusedPaneId, updated)
  return newPanes
}

/**
 * Switch focus from one pane to another.
 * Saves the old pane's state, restores the new pane's state to flat fields,
 * and updates the workspace's focused pane ID.
 */
function switchFocusedPane(state: BoardAppState, newPaneId: string): Partial<BoardAppStore> {
  const oldPaneId = state.workspace.focusedPaneId
  const oldPane = state.workspace.panes.get(oldPaneId)
  const newPane = state.workspace.panes.get(newPaneId)
  if (!oldPane || !newPane) return {}

  // Save current flat fields into old pane
  const savedOldPane = snapshotFlatToPane(state, oldPane)

  // Build updated panes map
  const newPanes = new Map(state.workspace.panes)
  newPanes.set(oldPaneId, savedOldPane)

  // Restore new pane's fields to flat state
  const flatUpdate = restorePaneToFlat(newPane)

  return {
    ...flatUpdate,
    workspace: {
      ...state.workspace,
      panes: newPanes,
      focusedPaneId: newPaneId,
      previousFocusedPaneId: oldPaneId,
    },
  }
}

// =============================================================================
// Default Fold Computation
// =============================================================================

/**
 * Compute default fold depths for a given root.
 * Sets rootId depth to 1: cards show their titles + body, sub-items folded.
 *
 * If existingDepths is non-empty, returns a copy unchanged (user has explicit folds).
 * User can unfold specific areas with L or > (progressive disclosure).
 */
function computeDefaultFoldDepths(rootId: string | null, existingDepths: Map<string, number>): Map<string, number> {
  if (!rootId || existingDepths.size > 0) return new Map(existingDepths)

  // Depth 1 on root: columns visible, cards visible with their direct content,
  // but card children (sub-items, sections) are folded.
  const foldDepths = new Map<string, number>()
  foldDepths.set(rootId, 1)
  return foldDepths
}

export interface CreateBoardAppStoreParams {
  repo: Repo
  toastQueue: ToastQueue
  navigator: GridNavigator
  cursorStore: CursorStore
  initialBoardState: BoardState
  initialUIState: UIState
  dimensions: { columns: number; rows: number }
  /** Saved workspace to restore (layout + panes). If provided, overrides the default single-pane workspace. */
  savedWorkspace?: PersistedWorkspace | null
}

/**
 * Restore a workspace from a persisted state.
 *
 * Resolves each pane's rootNodePath back to a rootId via repo.resolveNode().
 * Panes whose rootNodePath can't be resolved get the fallback rootId/rootPath.
 * Returns null if the persisted workspace is empty or structurally invalid.
 */
function restoreWorkspaceFromPersisted(
  saved: PersistedWorkspace,
  repo: Repo,
  fallbackBoardState: BoardState,
  cursorStore: CursorStore,
): WorkspaceState | null {
  const panes = new Map<string, PaneState>()

  for (const persisted of saved.panes) {
    const resolvedBoard = resolvePersistedPane(persisted, repo, fallbackBoardState)
    const pane = createPaneState(persisted.id, resolvedBoard, {
      viewType: persisted.viewType,
      viewMode: persisted.viewMode as "cards" | "list" | "columns" | "tabs",
      cursorStore:
        persisted.id === saved.focusedPaneId
          ? cursorStore
          : createCursorStore({
              cursorNodeId: null,
              cursorCardNodeId: null,
              cursorColumnNodeId: null,
              selectionLevel: "board",
            }),
      isZoomLoading: false,
    })
    panes.set(persisted.id, pane)
  }

  if (panes.size === 0) return null

  // Convert persisted layout to live LayoutNode (structurally identical)
  const layout = deserializeLayout(saved.layout)

  return {
    panes,
    focusedPaneId: saved.focusedPaneId,
    previousFocusedPaneId: null,
    layout,
    preZoomLayout: null,
    preZoomPanes: null,
  }
}

/** Resolve a persisted pane's rootNodePath to a BoardState. */
function resolvePersistedPane(persisted: PersistedPane, repo: Repo, fallback: BoardState): BoardState {
  if (!persisted.rootNodePath) {
    return createBoardState(fallback.rootId, fallback.rootPath)
  }

  // Try to resolve the file path to a node
  const node = repo.resolveNode(persisted.rootNodePath)
  if (node) {
    return createBoardState(node.id, fallback.rootPath, null)
  }

  // File no longer exists — fall back to default root
  return createBoardState(fallback.rootId, fallback.rootPath)
}

/** Convert persisted layout to live LayoutNode (structurally identical). */
function deserializeLayout(node: PersistedLayoutNode): LayoutNode {
  if (node.type === "leaf") {
    return { type: "leaf", paneId: node.paneId }
  }
  return {
    type: "split",
    direction: node.direction,
    ratio: node.ratio,
    left: deserializeLayout(node.left),
    right: deserializeLayout(node.right),
  }
}

/** Create the default single-pane workspace for fresh sessions. */
function createDefaultWorkspace(initialPaneBoard: BoardState, params: CreateBoardAppStoreParams): WorkspaceState {
  const defaultPaneId = "main"
  const initialPane = createPaneState(defaultPaneId, initialPaneBoard, {
    viewMode: params.initialUIState.viewMode,
    cursorStore: params.cursorStore,
    isZoomLoading: false,
  })
  return {
    panes: new Map([[defaultPaneId, initialPane]]),
    focusedPaneId: defaultPaneId,
    previousFocusedPaneId: null,
    layout: { type: "leaf", paneId: defaultPaneId },
    preZoomLayout: null,
    preZoomPanes: null,
  }
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

  // Compute initial fold depths: set root depth to 1 for instant startup.
  const initialFoldDepths = computeDefaultFoldDepths(bs.rootId, bs.foldDepths)

  return (set, _get) => {
    // Create undo system: wrap repo so mutations are auto-recorded
    const undoStack = createUndoStack()
    const { repo: undoableRepo, handle: undoHandle } = createUndoableRepo(params.repo, undoStack)

    // Try to restore workspace from saved state, otherwise create default single-pane workspace.
    const initialPaneBoard: BoardState = {
      ...bs,
      foldDepths: initialFoldDepths,
    }

    let workspace: WorkspaceState

    if (params.savedWorkspace) {
      const restored = restoreWorkspaceFromPersisted(
        params.savedWorkspace,
        params.repo,
        initialPaneBoard,
        params.cursorStore,
      )
      if (restored) {
        workspace = restored
      } else {
        workspace = createDefaultWorkspace(initialPaneBoard, params)
      }
    } else {
      workspace = createDefaultWorkspace(initialPaneBoard, params)
    }

    return {
      // Workspace (Phase 1: single pane mirrors flat fields)
      workspace,

      // Board navigation (flat — source of truth for Phase 1)
      rootId: bs.rootId,
      rootPath: bs.rootPath,
      cursorNodeId: bs.cursorNodeId,
      selectedNodes: bs.selectedNodes,
      foldDepths: initialFoldDepths,
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
          // Also silently sync to focused pane's PaneState
          const focusedPane = s.workspace.panes.get(s.workspace.focusedPaneId)
          if (focusedPane) {
            focusedPane.cursorNodeId = action.nodeId
            focusedPane.curswantX = null
            focusedPane.curswantY = null
          }
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
          // Also silently sync to focused pane's PaneState
          const focusedPane = s.workspace.panes.get(s.workspace.focusedPaneId)
          if (focusedPane) {
            if (action.x !== undefined) focusedPane.curswantX = action.x
            if (action.y !== undefined) focusedPane.curswantY = action.y
          }
          return
        }

        // Two-phase zoom: deferred update applied after skeleton paints.
        // Phase 1 (immediate): set isZoomLoading: true with OLD rootId → fast render → skeleton visible.
        // Phase 2 (setTimeout): set new rootId/foldDepths + clear isZoomLoading → heavy computation.
        // Without this, useColumns runs the heavy deriveColumnsFromRepo DURING the skeleton render
        // (React hooks can't be conditional), so the terminal freezes before the skeleton even paints.
        let deferredZoom: Partial<BoardAppState> | null = null

        set((state) => {
          let flatUpdate: Partial<BoardAppState>

          switch (action.type) {
            // SELECT and SET_CURSWANT handled above (fast path)
            case "SELECT":
            case "SET_CURSWANT":
              return state

            case "TOGGLE_FOLD": {
              const newDepths = new Map(state.foldDepths)
              if (newDepths.has(action.nodeId)) {
                newDepths.delete(action.nodeId)
              } else {
                newDepths.set(action.nodeId, 0)
              }
              flatUpdate = { foldDepths: newDepths }
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
              const zoomNodeId = action.nodeId
              const zoomDepths = computeDefaultFoldDepths(zoomNodeId, new Map())
              if (!globalThis.IS_REACT_ACT_ENVIRONMENT) {
                // Phase 1: skeleton only (keep old rootId → useColumns hits memo cache → fast)
                flatUpdate = { isZoomLoading: true }
                deferredZoom = {
                  rootId: zoomNodeId,
                  cursorNodeId: action.cursorNodeId ?? null,
                  foldDepths: zoomDepths,
                  curswantX: null,
                  curswantY: null,
                  isZoomLoading: false,
                }
              } else {
                // Test env: synchronous update (no skeleton)
                flatUpdate = {
                  rootId: zoomNodeId,
                  cursorNodeId: action.cursorNodeId ?? null,
                  foldDepths: zoomDepths,
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
              const rootDepths = computeDefaultFoldDepths(action.rootId, new Map())
              if (!globalThis.IS_REACT_ACT_ENVIRONMENT) {
                // Phase 1: skeleton only (keep old rootId → useColumns hits memo cache → fast)
                flatUpdate = { isZoomLoading: true }
                deferredZoom = {
                  rootId: action.rootId,
                  rootPath: action.rootPath,
                  cursorNodeId: action.cursorNodeId,
                  foldDepths: rootDepths,
                  navHistory: newHistory,
                  navHistoryIndex: newHistory.length,
                  curswantX: null,
                  curswantY: null,
                  isZoomLoading: false,
                }
              } else {
                flatUpdate = {
                  rootId: action.rootId,
                  rootPath: action.rootPath,
                  cursorNodeId: action.cursorNodeId,
                  foldDepths: rootDepths,
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

          // Sync flat fields to the focused pane's PaneState
          const merged = { ...state, ...flatUpdate }
          const syncedPanes = syncFlatToFocusedPane(merged as BoardAppState)
          return {
            ...flatUpdate,
            workspace: { ...state.workspace, panes: syncedPanes },
          }
        })

        if (deferredZoom) {
          // Two-phase zoom: Phase 1 just rendered skeleton (isZoomLoading: true, old rootId).
          // Show loading indicator, then schedule Phase 2 after skeleton paints.
          set((state) => ({
            ui: { ...state.ui, isLoading: true, loadingStartTime: Date.now() },
          }))
          const deferred = deferredZoom
          setTimeout(() => {
            // Phase 2: Apply the real rootId/foldDepths change.
            // This triggers useColumns → deriveColumnsFromRepo (heavy computation).
            // The terminal will freeze here, but the skeleton was visible before this point.
            set((state) => {
              const merged = { ...state, ...deferred }
              const syncedPanes = syncFlatToFocusedPane(merged as BoardAppState)
              return {
                ...deferred,
                workspace: { ...state.workspace, panes: syncedPanes },
              }
            })
            // Update cursor store for the new rootId
            const s = _get()
            const getNode = (id: string) => s.repo.getNode(id)
            const ancestors = deriveCursorAncestors(getNode, s.rootId, s.cursorNodeId, (pid) => s.repo.getChildren(pid))
            s.cursorStore.setState({
              cursorNodeId: s.cursorNodeId,
              ...ancestors,
            })
            // Clear loading indicator after the heavy render
            setTimeout(() => {
              set((state) => ({
                ui: { ...state.ui, isLoading: false, loadingStartTime: null },
              }))
            }, 0)
          }, 16) // 16ms = one frame, ensures skeleton paints before heavy computation
        } else {
          // Non-zoom: update cursor store synchronously
          const s = _get()
          const getNode = (id: string) => s.repo.getNode(id)
          const ancestors = deriveCursorAncestors(getNode, s.rootId, s.cursorNodeId, (pid) => s.repo.getChildren(pid))
          s.cursorStore.setState({
            cursorNodeId: s.cursorNodeId,
            ...ancestors,
          })
        }
      },

      // --- Direct setters ---

      setUI(partial: Partial<UIState> | ((prev: UIState) => Partial<UIState>)) {
        set((state) => {
          const updates = typeof partial === "function" ? partial(state.ui) : partial
          return { ui: { ...state.ui, ...updates } }
        })
      },

      setFoldDepths(depths: Map<string, number>) {
        set((state) => {
          const merged = { ...state, foldDepths: depths }
          const syncedPanes = syncFlatToFocusedPane(merged)
          return {
            foldDepths: depths,
            workspace: { ...state.workspace, panes: syncedPanes },
          }
        })
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
            return { ui: { ...state.ui, showDetailPane: true, detailScrollOffset: 0, detailCursorIndex: 0 } }
          }

          // Create a detail pane with an empty board state (detail doesn't navigate).
          const detailPane = createPaneState(detailPaneId, createBoardState(), {
            viewType: "detail",
            viewMode: state.ui.viewMode,
            cursorStore: state.cursorStore,
            isZoomLoading: false,
          })

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
            ui: { ...state.ui, showDetailPane: true, detailScrollOffset: 0, detailCursorIndex: 0 },
          }
        })
      },

      closeDetailPane() {
        set((state) => {
          const detailPaneId = "main-detail"
          // Not open? Just ensure flat state is consistent.
          if (!state.workspace.panes.has(detailPaneId)) {
            return { ui: { ...state.ui, showDetailPane: false, detailScrollOffset: 0, detailCursorIndex: 0 } }
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
            ui: { ...state.ui, showDetailPane: false, detailScrollOffset: 0, detailCursorIndex: 0 },
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

          // Create a new CursorStore for the new pane (independent cursor state)
          const newPaneCursorStore = createCursorStore({
            cursorNodeId: null,
            cursorCardNodeId: null,
            cursorColumnNodeId: null,
            selectionLevel: "board",
          })

          // Create an empty pane with its own cursor store
          const emptyPane = createPaneState(newPaneId, createBoardState(), {
            viewType: "empty",
            viewMode: state.ui.viewMode,
            cursorStore: newPaneCursorStore,
            isZoomLoading: false,
          })

          // Split the layout tree at the focused pane
          const newLayout = splitLayoutNode(workspace.layout, focusedId, direction, newPaneId)

          // Also snapshot current flat fields into the focused pane before adding new pane
          const focusedPane = workspace.panes.get(focusedId)
          const newPanes = new Map(workspace.panes)
          if (focusedPane) {
            newPanes.set(focusedId, snapshotFlatToPane(state, focusedPane))
          }
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

          // Restore the new focused pane's state to flat fields
          const newFocusedPane = newPanes.get(newFocusedId)
          const flatUpdate = newFocusedPane ? restorePaneToFlat(newFocusedPane) : {}

          return {
            ...flatUpdate,
            workspace: {
              ...workspace,
              panes: newPanes,
              layout: newLayout,
              focusedPaneId: newFocusedId,
              previousFocusedPaneId:
                workspace.previousFocusedPaneId === focusedId ? null : workspace.previousFocusedPaneId,
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

          return switchFocusedPane(state, targetPaneId)
        })
      },

      focusPreviousPane() {
        set((state) => {
          const { workspace } = state
          const prevId = workspace.previousFocusedPaneId
          if (!prevId || !workspace.panes.has(prevId)) return state
          if (prevId === workspace.focusedPaneId) return state

          return switchFocusedPane(state, prevId)
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

          return switchFocusedPane(state, targetPaneId)
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

          return switchFocusedPane(state, targetPaneId)
        })
      },

      focusPaneById(paneId: string) {
        set((state) => {
          const { workspace } = state
          if (paneId === workspace.focusedPaneId) return state
          if (!workspace.panes.has(paneId)) return state
          return switchFocusedPane(state, paneId)
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

      // --- Workspace pane operations (Phase 7: mouse support) ---

      setSplitRatio(splitNode: LayoutNode & { type: "split" }, ratio: number) {
        set((state) => {
          const { workspace } = state
          const newLayout = setSplitRatioAbsolute(workspace.layout, splitNode, ratio)
          if (newLayout === workspace.layout) return state
          return { workspace: { ...workspace, layout: newLayout } }
        })
      },

      // --- Workspace pane operations (Phase 6: pane-aware navigation) ---

      activateEmptyPane() {
        set((state) => {
          const { workspace } = state
          const focusedPane = workspace.panes.get(workspace.focusedPaneId)
          if (focusedPane?.viewType !== "empty") return state

          // Copy current flat rootId/rootPath into the pane (the user just navigated)
          const updatedPane: PaneState = {
            ...focusedPane,
            viewType: "board",
            rootId: state.rootId,
            rootPath: state.rootPath,
            cursorNodeId: state.cursorNodeId,
            foldDepths: state.foldDepths,
            collapsedNodes: state.collapsedNodes,
            cursorStore: state.cursorStore,
          }
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
