/**
 * Board App Store — Zustand store for createApp() integration
 *
 * Canonical state for the board TUI:
 * - Board.tsx reads via useApp(selector)
 * - term:key handler reads/writes via get()/set()/setUI()
 * - driver reads via handle.store.getState()
 *
 * Board navigation state lives in workspace.panes (each BoardPaneState owns
 * its rootId, cursorNodeId, foldDepths, etc). Use getActiveBoardPane() to
 * access the currently-targeted board pane.
 *
 * UI fields are grouped under `ui`.
 *
 * Layout (columns, cursor position) is derived on demand — never stored.
 * The key handler derives layout fresh each keypress via buildActionCtx().
 * React derives layout via useColumns + useCursorPosition.
 */

import type { ToastQueue, JobRunner } from "@km/core"
import { createJobRunner } from "@km/core"
import type { Repo } from "./repo-context.tsx"
import type { BoardAction, BoardState, BoardPaneState, LayoutNode, PaneState, WorkspaceState } from "./board-types.ts"
import {
  createBoardState,
  createPaneState,
  createEmptyPaneState,
  isBoardPane,
  isDetailViewPane,
  mergePaneUI,
  detailPaneIdFor,
  ownerPaneId,
  isDetailPaneId,
  getDetailPaneFor,
  hasDetailPaneFor,
} from "./board-types.ts"
import type { UIState, PaneUI } from "./ui-reducer.ts"
import { PANE_UI_FIELD_NAMES } from "./board-types.ts"
import type { GridNavigator } from "@km/board"
import type { EditTarget } from "@silvery/ag-react"
import { deriveCursorAncestors, createCursorStore, type CursorStore } from "./cursor-store.ts"
import { getViewNavigation } from "./view-navigation.ts"
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
import { deserializeFilterProperties } from "./workspace-persist.ts"
import { computeMetadataKeys, DETAIL_META_PREFIX } from "./views/detail-pane-items.ts"

// =============================================================================
// Store Types
// =============================================================================

/**
 * The full board app store state.
 *
 * Board navigation state (rootId, cursorNodeId, foldDepths, etc.) lives in
 * workspace.panes — each BoardPaneState holds its own navigation state.
 * Use getActiveBoardPane(state) to access the targeted board pane.
 *
 * Layout (columns, cursor position) is NOT stored here — it's derived on
 * demand by the key handler (buildActionCtx) and by React (useColumns hook).
 */
export interface BoardAppState {
  // --- Workspace (canonical source of board navigation state) ---
  workspace: WorkspaceState

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

  // --- Handler registration for workspace chrome ---
  // Set by the focused Board connector so workspace-level components can call them.
  _findQueryHandler: ((query: string) => void) | null
  _searchReplaceSearchHandler: ((query: string) => void) | null
  _searchReplaceReplaceHandler: ((query: string) => void) | null
}

/**
 * Get the focused pane's state from the workspace.
 */
export function getFocusedPane(state: BoardAppState): PaneState {
  const pane = state.workspace.panes.get(state.workspace.focusedPaneId)
  if (!pane) throw new Error(`Focused pane "${state.workspace.focusedPaneId}" not found in workspace`)
  return pane
}

/**
 * Get the board pane that keyboard commands and navigation should target.
 *
 * If the focused pane is a board, returns it directly.
 * If focused on a detail pane, returns the detail pane itself (it IS a board pane).
 * For empty panes, falls back to any board pane.
 */
export function getActiveBoardPane(state: BoardAppState): BoardPaneState | null {
  const focusedId = state.workspace.focusedPaneId
  const focused = state.workspace.panes.get(focusedId)
  if (focused && isBoardPane(focused)) {
    return focused
  }

  // Last resort (empty pane focused): find any board pane
  for (const pane of state.workspace.panes.values()) {
    if (isBoardPane(pane)) return pane
  }
  return null
}

/**
 * Get the parent board pane for a detail pane.
 * Returns null if the focused pane is not a detail pane.
 */
export function getParentBoardPane(state: BoardAppState): BoardPaneState | null {
  const focused = getActiveBoardPane(state)
  if (!focused || !isDetailViewPane(focused) || !focused.parentPaneId) return null
  const parent = state.workspace.panes.get(focused.parentPaneId)
  if (parent && isBoardPane(parent)) return parent
  return null
}

/**
 * Actions on the store.
 */
export interface BoardAppActions {
  // Board action dispatcher (inlined from boardReducer)
  dispatchBoard(action: BoardAction): void

  // UI state update — accepts both global and per-pane fields.
  // Automatically routes per-pane fields (viewMode, multiSelected, etc.) to the focused BoardPaneState,
  // and global fields (showHelp, bellState, etc.) to the UIState.
  setUI(partial: Partial<PaneUI> | ((prev: PaneUI) => Partial<PaneUI>)): void

  // Fold operations (single source of truth at store root)
  setFoldDepths(depths: Map<string, number>): void

  // Direct setters
  setTextEditTarget(target: EditTarget | null): void
  setDimensions(dims: { columns: number; rows: number }): void

  // Detail pane cursor (Phase 2: detail pane as workspace pane)
  /** Get the detail pane cursor ID (from detail view pane's cursorNodeId) */
  getDetailCursorId(): string | null
  /** Set the detail pane cursor ID */
  setDetailCursor(id: string | null): void

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

export interface CreateBoardAppStoreParams {
  repo: Repo
  toastQueue: ToastQueue
  navigator: GridNavigator
  cursorStore: CursorStore
  initialBoardState: BoardState
  initialUIState: UIState
  /** Initial view mode for the default pane (per-pane field, not stored in UIState) */
  initialViewMode?: import("./types.ts").ViewMode
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

  // Give the real cursor store to the first board pane (not the focused pane,
  // which might be a detail pane with no cursor).
  const firstBoardPaneId = saved.panes.find((p) => p.viewType === "board")?.id
  let cursorStoreUsed = false

  for (const persisted of saved.panes) {
    const paneCursorStore =
      persisted.id === firstBoardPaneId && !cursorStoreUsed
        ? ((cursorStoreUsed = true), cursorStore)
        : createCursorStore({
            cursorNodeId: null,
            cursorCardNodeId: null,
            cursorColumnNodeId: null,
            selectionLevel: "board",
          })

    let pane: PaneState
    if (persisted.viewType === "detail") {
      // Legacy detail panes are rehydrated as board panes with viewMode "detail"
      pane = createPaneState(persisted.id, createBoardState(), {
        viewMode: "detail",
        cursorStore: paneCursorStore,
      })
      ;(pane as BoardPaneState).parentPaneId = ownerPaneId(persisted.id)
    } else if (persisted.viewType === "empty") {
      pane = createEmptyPaneState(persisted.id, paneCursorStore)
    } else {
      const resolvedBoard = resolvePersistedPane(persisted, repo, fallbackBoardState)
      pane = createPaneState(persisted.id, resolvedBoard, {
        viewMode: persisted.viewMode as "cards" | "list" | "columns" | "tabs",
        cursorStore: paneCursorStore,
      })
    }
    // Restore persisted filter properties (hide done, tag filters, etc.)
    if (persisted.filterProperties && isBoardPane(pane)) {
      ;(pane as BoardPaneState).filterProperties = deserializeFilterProperties(persisted.filterProperties)
    }
    panes.set(persisted.id, pane)
  }

  if (panes.size === 0) return null

  // Convert persisted layout to live LayoutNode (structurally identical)
  const layout = deserializeLayout(saved.layout)

  // If the saved focus was on a non-board pane (e.g. detail), focus the first
  // board pane instead so the cursor is visible and navigation works immediately.
  const savedFocus = panes.get(saved.focusedPaneId)
  const focusedPaneId =
    savedFocus && isBoardPane(savedFocus) && !isDetailViewPane(savedFocus)
      ? saved.focusedPaneId
      : (firstBoardPaneId ?? saved.focusedPaneId)

  return {
    panes,
    focusedPaneId,
    previousFocusedPaneId: saved.focusedPaneId !== focusedPaneId ? saved.focusedPaneId : null,
    layout,
    preZoomLayout: null,
    preZoomPanes: null,
  }
}

/** Resolve a persisted pane's rootNodePath to a BoardState. */
function resolvePersistedPane(persisted: PersistedPane, repo: Repo, fallback: BoardState): BoardState {
  if (!persisted.rootNodePath) {
    return createBoardState(fallback.rootId, fallback.rootPath, fallback.cursorNodeId)
  }

  // Try to resolve the file path to a node
  const node = repo.resolveNode(persisted.rootNodePath)
  if (node) {
    // Carry the fallback cursor if the root matches, otherwise null (will be resolved on first keypress)
    const cursor = node.id === fallback.rootId ? fallback.cursorNodeId : null
    return createBoardState(node.id, fallback.rootPath, cursor)
  }

  // File no longer exists — fall back to default root
  return createBoardState(fallback.rootId, fallback.rootPath, fallback.cursorNodeId)
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

/** Create the default single-pane workspace for fresh sessions.
 * List view auto-opens a detail pane (replaces the old showDetailPane flag). */
function createDefaultWorkspace(initialPaneBoard: BoardState, params: CreateBoardAppStoreParams): WorkspaceState {
  const defaultPaneId = "main"
  const initialPane = createPaneState(defaultPaneId, initialPaneBoard, {
    viewMode: params.initialViewMode ?? "columns",
    cursorStore: params.cursorStore,
  })

  const panes = new Map<string, PaneState>([[defaultPaneId, initialPane]])
  const layout: LayoutNode = { type: "leaf", paneId: defaultPaneId }

  return {
    panes,
    focusedPaneId: defaultPaneId,
    previousFocusedPaneId: null,
    layout,
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
      // Workspace (canonical source of board navigation state)
      workspace,

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

      // Handler registration for workspace chrome (null until Board connector mounts)
      _findQueryHandler: null,
      _searchReplaceSearchHandler: null,
      _searchReplaceReplaceHandler: null,

      // --- Board action dispatcher (inlined from boardReducer) ---

      // oxlint-disable-next-line complexity/complexity -- Exhaustive switch over BoardAction union
      dispatchBoard(action: BoardAction) {
        // --- Fast path: SELECT bypasses Zustand set() entirely ---
        if (action.type === "SELECT") {
          const s = _get()
          // Silent mutation on focused board pane (no Zustand subscriber notification)
          const focusedPane = s.workspace.panes.get(s.workspace.focusedPaneId)
          if (focusedPane && isBoardPane(focusedPane)) {
            focusedPane.cursorNodeId = action.nodeId
            focusedPane.curswantX = null
            focusedPane.curswantY = null
          }
          // Derive cursor ancestors from tree structure
          const rootId = focusedPane && isBoardPane(focusedPane) ? focusedPane.rootId : null
          const viewNav = getViewNavigation(focusedPane && isBoardPane(focusedPane) ? focusedPane.viewMode : "cards")
          const ancestors = viewNav.classifyCursor(action.nodeId, rootId, s.repo)
          // When a cardNodeId hint is provided (e.g., click inside an embed or keyboard
          // nav within embedded children), use it if the derived card doesn't match AND
          // the target node isn't a data-model descendant of the derived card. This
          // distinguishes embeds (target's parent chain goes to wrong card) from normal
          // card-to-card navigation (derived card is correct, hint is the old card).
          if (action.cardNodeId && ancestors.cursorCardNodeId !== action.cardNodeId) {
            // Check: is target actually a descendant of the derived card?
            // If not, derivation followed an embed's parent chain → use the hint.
            let isDescendantOfDerived = false
            if (ancestors.cursorCardNodeId && action.nodeId) {
              let walkId: string | null = action.nodeId
              for (let i = 0; i < 100 && walkId; i++) {
                if (walkId === ancestors.cursorCardNodeId) { isDescendantOfDerived = true; break }
                const n = s.repo.getNode(walkId)
                walkId = n?.parent_id ?? null
              }
            }
            if (!isDescendantOfDerived) {
              const hintAncestors = viewNav.classifyCursor(action.cardNodeId, rootId, s.repo)
              if (hintAncestors.selectionLevel === "card") {
                ancestors.cursorCardNodeId = hintAncestors.cursorCardNodeId
                ancestors.cursorColumnNodeId = hintAncestors.cursorColumnNodeId
              }
            }
          }
          // Sync detail pane when board cursor moves to a different card.
          // Detail pane's rootId = the cursor card, so update it and reset its cursor.
          // Must use set() (not silent mutation) so the detail Board re-renders with new rootId.
          const detailPane = getDetailPaneFor(s.workspace, s.workspace.focusedPaneId)
          if (detailPane) {
            const newCardId = ancestors.cursorCardNodeId ?? ancestors.cursorColumnNodeId
            const prevCardId = s.cursorStore.getState().cursorCardNodeId
            if (!isDetailPaneId(s.workspace.focusedPaneId) && newCardId && newCardId !== prevCardId) {
              // Initial cursor = first metadata row, then first child
              const newRootNode = s.repo.getNode(newCardId)
              const newMetaKeys = newRootNode ? computeMetadataKeys(newRootNode) : []
              const newChildren = s.repo.getChildren(newCardId)
              const newFirstItemId =
                newMetaKeys.length > 0
                  ? `${DETAIL_META_PREFIX}${newMetaKeys[0]}`
                  : newChildren.length > 0
                    ? (newChildren[0]?.id ?? null)
                    : null
              const newPanes = new Map(s.workspace.panes)
              const updatedDetail = { ...detailPane, rootId: newCardId, cursorNodeId: newFirstItemId }
              newPanes.set(detailPane.id, updatedDetail)
              set({ workspace: { ...s.workspace, panes: newPanes } })
              if (detailPane.cursorStore) {
                detailPane.cursorStore.setState({
                  cursorNodeId: newFirstItemId,
                  cursorCardNodeId: newFirstItemId,
                  cursorColumnNodeId: null,
                  selectionLevel: newFirstItemId ? "card" : "board",
                })
              }
            }
          }
          // Notify CursorStore subscribers (only cursor-aware components re-render).
          // Route to the focused pane's own cursor store (detail pane has its own).
          const targetCursorStore =
            focusedPane && isBoardPane(focusedPane) && focusedPane.cursorStore ? focusedPane.cursorStore : s.cursorStore
          targetCursorStore.setState({
            cursorNodeId: action.nodeId,
            ...ancestors,
          })
          return
        }

        // --- Fast path: SET_CURSWANT also bypasses Zustand set() entirely ---
        if (action.type === "SET_CURSWANT") {
          const s = _get()
          // Silent mutation on focused board pane
          const focusedPane = s.workspace.panes.get(s.workspace.focusedPaneId)
          if (focusedPane && isBoardPane(focusedPane)) {
            if (action.x !== undefined) focusedPane.curswantX = action.x
            if (action.y !== undefined) focusedPane.curswantY = action.y
          }
          return
        }

        // Zoom updates rootId + foldDepths atomically. BoardCore's useColumnReveal
        // handles the transition: resets to 1 column, then progressively reveals
        // new columns with skeleton placeholders showing real column headers.

        set((state) => {
          const focusedPaneId = state.workspace.focusedPaneId
          const pane = state.workspace.panes.get(focusedPaneId)
          if (!pane || !isBoardPane(pane)) return state

          let paneUpdate: Partial<BoardPaneState>

          switch (action.type) {
            case "TOGGLE_FOLD": {
              const newDepths = new Map(pane.foldDepths)
              if (newDepths.has(action.nodeId)) {
                newDepths.delete(action.nodeId)
              } else {
                newDepths.set(action.nodeId, 0)
              }
              paneUpdate = { foldDepths: newDepths }
              break
            }

            case "TOGGLE_COLLAPSE": {
              const newCollapsed = new Set(pane.collapsedNodes)
              if (newCollapsed.has(action.nodeId)) {
                newCollapsed.delete(action.nodeId)
              } else {
                newCollapsed.add(action.nodeId)
              }
              paneUpdate = { collapsedNodes: newCollapsed }
              break
            }

            case "ZOOM_IN": {
              const zoomNodeId = action.nodeId
              const zoomDepths = computeDefaultFoldDepths(zoomNodeId, new Map())
              // Don't set cursor to the root itself — navigate() can't find an ancestor
              // of a node under itself. Default to first child when cursor === root.
              let cursorId = action.cursorNodeId ?? null
              if (cursorId && cursorId === zoomNodeId) {
                const children = state.repo.getChildren(zoomNodeId)
                cursorId = children[0]?.id ?? null
              }
              paneUpdate = {
                rootId: zoomNodeId,
                cursorNodeId: cursorId,
                foldDepths: zoomDepths,
                curswantX: null,
                curswantY: null,
              }
              break
            }

            case "SET_ROOT": {
              const newHistory = [
                ...pane.navHistory.slice(0, pane.navHistoryIndex + 1),
                {
                  rootId: pane.rootId,
                  rootPath: pane.rootPath,
                  cursorNodeId: pane.cursorNodeId,
                },
              ]
              const rootDepths = computeDefaultFoldDepths(action.rootId, new Map())
              paneUpdate = {
                rootId: action.rootId,
                rootPath: action.rootPath,
                cursorNodeId: action.cursorNodeId,
                foldDepths: rootDepths,
                navHistory: newHistory,
                navHistoryIndex: newHistory.length,
                curswantX: null,
                curswantY: null,
              }
              break
            }

            case "SELECT_NODE_ADD": {
              const newSelected = new Set(pane.selectedNodes)
              newSelected.add(action.nodeId)
              paneUpdate = { selectedNodes: newSelected }
              break
            }

            case "SELECT_NODE_REMOVE": {
              const newSelected = new Set(pane.selectedNodes)
              newSelected.delete(action.nodeId)
              paneUpdate = { selectedNodes: newSelected }
              break
            }

            case "SELECT_NODE_TOGGLE": {
              const newSelected = new Set(pane.selectedNodes)
              if (newSelected.has(action.nodeId)) {
                newSelected.delete(action.nodeId)
              } else {
                newSelected.add(action.nodeId)
              }
              paneUpdate = { selectedNodes: newSelected }
              break
            }

            case "CLEAR_SELECTION": {
              paneUpdate = { selectedNodes: new Set() }
              break
            }

            case "ENTER_MOVE_MODE": {
              if (action.nodeIds.length === 0) return state
              paneUpdate = {
                moveMode: true,
                moveSourceNodes: action.nodeIds,
                moveSourceCursorNodeId: action.cursorNodeId,
              }
              break
            }

            case "CONFIRM_MOVE": {
              paneUpdate = {
                moveMode: false,
                moveSourceNodes: [],
                moveSourceCursorNodeId: null,
                selectedNodes: new Set(),
              }
              break
            }

            case "CANCEL_MOVE": {
              paneUpdate = {
                moveMode: false,
                moveSourceNodes: [],
                cursorNodeId: pane.moveSourceCursorNodeId ?? pane.cursorNodeId,
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

          // Update the focused board pane directly
          const newPanes = updateBoardPane(state.workspace, focusedPaneId, pane, paneUpdate)
          return {
            workspace: { ...state.workspace, panes: newPanes },
          }
        })

        // Update cursor store synchronously (progressive reveal in Board handles transition UX)
        const s = _get()
        const board = getActiveBoardPane(s)
        if (board) {
          const getNode = (id: string) => s.repo.getNode(id)
          const ancestors = deriveCursorAncestors(getNode, board.rootId, board.cursorNodeId, (pid) =>
            s.repo.getChildren(pid),
          )
          s.cursorStore.setState({
            cursorNodeId: board.cursorNodeId,
            ...ancestors,
          })
        }
      },

      // --- Direct setters ---

      setUI(partial: Partial<PaneUI> | ((prev: PaneUI) => Partial<PaneUI>)) {
        set((state) => {
          // Resolve function variant
          let resolved: Partial<PaneUI>
          if (typeof partial === "function") {
            const board = getActiveBoardPane(state)
            const effective: PaneUI = board ? mergePaneUI(state.ui, board) : (state.ui as unknown as PaneUI) // Safe: function variant only used with active board pane
            resolved = partial(effective)
          } else {
            resolved = partial
          }

          // Route fields: per-pane → focused BoardPaneState, global → UIState
          const globalUpdates: Record<string, unknown> = {}
          const paneUpdates: Record<string, unknown> = {}
          let hasGlobal = false
          let hasPane = false
          for (const [k, v] of Object.entries(resolved)) {
            if (PANE_UI_FIELD_NAMES.has(k)) {
              paneUpdates[k] = v
              hasPane = true
            } else {
              globalUpdates[k] = v
              hasGlobal = true
            }
          }

          const result: Partial<BoardAppStore> = {}
          if (hasGlobal) {
            result.ui = { ...state.ui, ...globalUpdates } as UIState
          }
          if (hasPane) {
            const targetPaneId = state.workspace.focusedPaneId
            const pane = state.workspace.panes.get(targetPaneId)
            if (pane && isBoardPane(pane)) {
              let newPanes = updateBoardPane(state.workspace, targetPaneId, pane, paneUpdates)
              // Propagate filterProperties to detail pane (if open)
              const fp = paneUpdates.filterProperties as BoardPaneState["filterProperties"] | undefined
              if (fp && !isDetailPaneId(targetPaneId)) {
                const detailId = detailPaneIdFor(targetPaneId)
                const detailPane = newPanes.get(detailId)
                if (detailPane && isBoardPane(detailPane)) {
                  newPanes = updateBoardPane({ ...state.workspace, panes: newPanes }, detailId, detailPane, {
                    filterProperties: fp,
                  })
                }
              }
              result.workspace = { ...state.workspace, panes: newPanes }
            }
          }
          return result
        })
      },

      setFoldDepths(depths: Map<string, number>) {
        set((state) => {
          const focusedPaneId = state.workspace.focusedPaneId
          const pane = state.workspace.panes.get(focusedPaneId)
          if (!pane || !isBoardPane(pane)) return state
          const newPanes = updateBoardPane(state.workspace, focusedPaneId, pane, { foldDepths: depths })
          return { workspace: { ...state.workspace, panes: newPanes } }
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

      // --- Detail pane cursor ---

      getDetailCursorId(): string | null {
        const s = _get()
        const detail = getDetailPaneFor(s.workspace, s.workspace.focusedPaneId)
        return detail?.cursorNodeId ?? null
      },

      setDetailCursor(id: string | null) {
        set((state) => {
          const detail = getDetailPaneFor(state.workspace, state.workspace.focusedPaneId)
          if (!detail) return state
          const newPanes = new Map(state.workspace.panes)
          newPanes.set(detail.id, { ...detail, cursorNodeId: id })
          return { workspace: { ...state.workspace, panes: newPanes } }
        })
      },

      // --- Workspace pane operations (Phase 2: detail pane as workspace pane) ---

      openDetailPane() {
        set((state) => {
          const focusedPaneId = state.workspace.focusedPaneId
          // openDetailPane is always called from a board pane context (board is focused)
          const detailId = detailPaneIdFor(focusedPaneId)
          // Already open? No-op.
          if (state.workspace.panes.has(detailId)) return state

          // Get the focused board pane to derive initial state
          const parentPane = state.workspace.panes.get(focusedPaneId)
          if (!parentPane || !isBoardPane(parentPane)) return state

          // Detail pane root = parent's cursor card (what we're showing details of)
          const cursorState = state.cursorStore.getState()
          const detailRootId = cursorState.cursorCardNodeId ?? cursorState.cursorColumnNodeId ?? parentPane.rootId

          // Initial cursor = first metadata row, then first child
          const rootNode = detailRootId ? state.repo.getNode(detailRootId) : null
          const metaKeys = rootNode ? computeMetadataKeys(rootNode) : []
          const children = state.repo.getChildren(detailRootId)
          const firstItemId =
            metaKeys.length > 0
              ? `${DETAIL_META_PREFIX}${metaKeys[0]}`
              : children.length > 0
                ? (children[0]?.id ?? null)
                : null

          // Create a BoardPaneState with its OWN CursorStore (independent cursor)
          const detailCursorStore = createCursorStore({
            cursorNodeId: firstItemId,
            cursorCardNodeId: firstItemId,
            cursorColumnNodeId: null,
            selectionLevel: firstItemId ? "card" : "board",
          })
          const detailPane = createPaneState(detailId, createBoardState(detailRootId, null, firstItemId), {
            viewMode: "detail",
            cursorStore: detailCursorStore,
          })
          detailPane.parentPaneId = focusedPaneId
          // Inherit filter state from parent board pane (e.g., hide-done toggle)
          detailPane.filterProperties = { ...parentPane.filterProperties }

          const newPanes = new Map(state.workspace.panes)
          newPanes.set(detailId, detailPane)

          const newLayout: WorkspaceState["layout"] = {
            type: "split",
            direction: "h",
            ratio: 0.65,
            left: { type: "leaf", paneId: focusedPaneId },
            right: { type: "leaf", paneId: detailId },
          }

          return {
            workspace: {
              ...state.workspace,
              panes: newPanes,
              layout: newLayout,
            },
          }
        })
      },

      closeDetailPane() {
        set((state) => {
          const focusedPaneId = state.workspace.focusedPaneId
          // If focused on a detail pane, close self and focus owner; otherwise close the detail for the focused board pane
          const isDetail = isDetailPaneId(focusedPaneId)
          const detailId = isDetail ? focusedPaneId : detailPaneIdFor(focusedPaneId)
          const boardId = isDetail ? ownerPaneId(focusedPaneId) : focusedPaneId
          if (!state.workspace.panes.has(detailId)) return state

          const newPanes = new Map(state.workspace.panes)
          newPanes.delete(detailId)

          const newLayout: WorkspaceState["layout"] = {
            type: "leaf",
            paneId: boardId,
          }

          return {
            workspace: {
              ...state.workspace,
              panes: newPanes,
              layout: newLayout,
              focusedPaneId: boardId,
            },
          }
        })
      },

      toggleDetailPane() {
        const state = _get()
        const focusedPaneId = state.workspace.focusedPaneId
        if (hasDetailPaneFor(state.workspace, focusedPaneId)) {
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
          const emptyPane = createEmptyPaneState(newPaneId, newPaneCursorStore)

          // Split the layout tree at the focused pane
          const newLayout = splitLayoutNode(workspace.layout, focusedId, direction, newPaneId)

          // Add the new pane (focused pane's state is already in workspace.panes)
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

          // Don't close the last pane — ring bell for feedback
          if (workspace.panes.size <= 1) {
            return { ui: { ...state.ui, bellState: "visual" } }
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

          // Create a board pane from the active board's state (inherits root, folds, etc.)
          const activeBoard = getActiveBoardPane(state)
          const boardState = activeBoard
            ? createBoardState(activeBoard.rootId, activeBoard.rootPath, activeBoard.cursorNodeId)
            : createBoardState()
          if (activeBoard) {
            boardState.foldDepths = activeBoard.foldDepths
            boardState.collapsedNodes = activeBoard.collapsedNodes
          }
          const updatedPane = createPaneState(focusedPane.id, boardState, {
            viewMode: activeBoard?.viewMode ?? "columns",
            cursorStore: focusedPane.cursorStore,
          })
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

// =============================================================================
// Pane Focus Helpers
// =============================================================================

/**
 * Switch focus from one pane to another.
 * Workspace.panes is the canonical state — no syncing needed.
 */
function switchFocusedPane(state: BoardAppState, newPaneId: string): Partial<BoardAppStore> {
  if (!state.workspace.panes.has(newPaneId)) return {}

  return {
    workspace: {
      ...state.workspace,
      focusedPaneId: newPaneId,
      previousFocusedPaneId: state.workspace.focusedPaneId,
    },
  }
}

/**
 * Update a board pane's state within the workspace panes map.
 * Returns an updated panes map with the specified pane replaced.
 */
function updateBoardPane(
  workspace: WorkspaceState,
  paneId: string,
  pane: BoardPaneState,
  update: Partial<BoardPaneState>,
): Map<string, PaneState> {
  const newPanes = new Map(workspace.panes)
  newPanes.set(paneId, { ...pane, ...update })
  return newPanes
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
  return new Map([[rootId, 1]])
}
