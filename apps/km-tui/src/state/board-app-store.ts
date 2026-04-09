/**
 * Board App Store — signal-backed store for createApp() integration
 *
 * Canonical state for the board TUI:
 * - Board.tsx reads via useApp(selector)
 * - term:key handler reads/writes via get()/set()/setUI()
 * - driver reads via handle.store.getState()
 *
 * Board navigation state lives in workspace.panes (each BoardPaneState owns
 * its rootId, foldDepths, etc). Use Workspace.getActiveBoardPane()
 * to access the currently-targeted board pane.
 *
 * UI fields are grouped under `ui`.
 *
 * Layout (columns, cursor position) is derived on demand — never stored.
 * The key handler derives layout fresh each keypress via buildOpCtx().
 * React derives layout via useSignal(pane.signals.visibleLens) + deriveColumnsFromLens.
 */

import type { ToastQueue, JobRunner } from "@km/core"
import { createJobRunner } from "@km/core"
import type { Repo } from "../repo-context.tsx"
import type {
  BoardReducerOp,
  BoardState,
  BoardPaneState,
  LayoutNode,
  PaneState,
  WorkspaceState,
} from "../board/board-types.ts"
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
} from "../board/board-types.ts"
import type { UIState, PaneUI } from "./ui-reducer.ts"
import { PANE_UI_FIELD_NAMES } from "../board/board-types.ts"
import type { GridNavigator } from "@km/board"
import type { EditTarget } from "@silvery/ag-react"
import { createSelection, type SelectionStore } from "@silvery/selection"
import { signal, effect } from "alien-signals"
import { createSelectionAdapter, type SelectionTreeSource } from "./selection-adapter.ts"
import { createPaneSignals } from "./pane-signals.ts"
import { computeHiddenNodeIds } from "../hidden.ts"
import {
  readStickyFolds,
  createStickyFoldsWriter,
  setSticky as mapSetSticky,
  removeSticky as mapRemoveSticky,
  type StickyFolds,
  type StickyState,
} from "../sticky-folds.ts"
import { classifyCursorFromLens, CARD_REMAINING_DEPTH } from "@km/board"
import { getViewNavigation } from "../navigation/view-navigation.ts"
import { createUndoStack, type UndoStack } from "../undo-stack.ts"
import { createUndoableRepo, type UndoableRepoHandle } from "../undo/undoable-repo.ts"
import {
  splitLayoutNode,
  removeLayoutNode,
  getLayoutPaneIds,
  findAdjacentPaneInLayout,
  resizeSplitForPane,
  equalizeLayout,
  swapLeaves,
  setSplitRatioAbsolute,
} from "../layout-helpers.ts"
import type { PersistedWorkspace, PersistedPane, PersistedLayoutNode } from "../workspace-persist.ts"
import { deserializeFilterProperties } from "../workspace-persist.ts"
import { computeMetadataKeys, DETAIL_META_PREFIX } from "../views/detail-pane-items.ts"
import { resolveSymlink } from "../views/symlink-display.ts"

// =============================================================================
// Store Types
// =============================================================================

/**
 * The full board app store state.
 *
 * Board navigation state (rootId, foldDepths, etc.) lives in
 * workspace.panes — each BoardPaneState holds its own navigation state.
 * Use Workspace.getActiveBoardPane(state) to access the targeted board pane.
 *
 * Layout (columns, cursor position) is NOT stored here — it's derived on
 * demand by the key handler (buildOpCtx) and by React (useSignal + visible lens).
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

  // --- Selection store (@silvery/selection — reactive selection state) ---
  sel: SelectionStore
  /** Update the selection adapter's view tree source (called after layout derivation) */
  selTreeSource: SelectionTreeSource
  /** km-specific text edit hints (block index, initial cursor pos) — complements sel.text() */
  textEditHints: import("../tui-context.ts").TextEditHints | null

  // --- Undo/redo ---
  undoStack: UndoStack
  undoHandle: UndoableRepoHandle

  // --- Handler registration for workspace chrome ---
  // Set by the focused Board connector so workspace-level components can call them.
  _findQueryHandler: ((query: string) => void) | null
  _searchReplaceSearchHandler: ((query: string) => void) | null
  _searchReplaceReplaceHandler: ((query: string) => void) | null
}

// =============================================================================
// Workspace namespace — discoverable pane accessors
// =============================================================================

/**
 * Namespace for workspace pane queries.
 *
 * Prefer `Workspace.getActiveBoardPane(state)` over accessing
 * `state.workspace.panes` directly — it encapsulates focus logic,
 * detail-pane fallback, and the pane map lookup in one place.
 */
export const Workspace = {
  /** Get the focused pane's state (throws if not found). */
  getFocusedPane(state: BoardAppState): PaneState {
    const pane = state.workspace.panes.get(state.workspace.focusedPaneId)
    if (!pane) throw new Error(`Focused pane "${state.workspace.focusedPaneId}" not found in workspace`)
    return pane
  },

  /** Get the focused pane's ID. */
  getFocusedPaneId(state: BoardAppState): string {
    return state.workspace.focusedPaneId
  },

  /** Look up a pane by ID (returns undefined if not found). */
  getPane(state: BoardAppState, paneId: string): PaneState | undefined {
    return state.workspace.panes.get(paneId)
  },

  /**
   * Get the board pane that keyboard commands and navigation should target.
   *
   * If the focused pane is a board, returns it directly.
   * If focused on a detail pane, returns the detail pane itself (it IS a board pane).
   * For empty panes, falls back to any board pane.
   */
  getActiveBoardPane(state: BoardAppState): BoardPaneState | null {
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
  },

  /**
   * Get the parent board pane for a detail pane.
   * Returns null if the focused pane is not a detail pane.
   */
  getParentBoardPane(state: BoardAppState): BoardPaneState | null {
    const focused = Workspace.getActiveBoardPane(state)
    if (!focused || !isDetailViewPane(focused) || !focused.parentPaneId) return null
    const parent = state.workspace.panes.get(focused.parentPaneId)
    if (parent && isBoardPane(parent)) return parent
    return null
  },
}

// Bare aliases for backward compatibility (used extensively in tests and internal store code)
export const getFocusedPane = Workspace.getFocusedPane
export const getActiveBoardPane = Workspace.getActiveBoardPane
export const getParentBoardPane = Workspace.getParentBoardPane

/**
 * Actions on the store.
 */
export interface BoardAppActions {
  // Board action dispatcher (inlined from boardReducer)
  dispatchBoard(action: BoardReducerOp): void

  // UI state update — accepts both global and per-pane fields.
  // Automatically routes per-pane fields (viewMode, etc.) to the focused BoardPaneState,
  // and global fields (showHelp, bellState, etc.) to the UIState.
  setUI(partial: Partial<PaneUI> | ((prev: PaneUI) => Partial<PaneUI>)): void

  // Fold operations (single source of truth at store root)
  setFoldDepths(depths: Map<string, number>): void

  // Sticky fold operations (per-node fold state that persists + survives fold-all/unfold-all)
  /** Pin a node as sticky-folded or sticky-unfolded (persisted to .km/sticky-folds.json) */
  setStickyFold(nodeId: string, state: "folded" | "unfolded"): void
  /** Remove a node's sticky fold state (persisted) */
  removeStickyFold(nodeId: string): void
  /** Check whether a node currently has any sticky fold state. */
  isStickyFold(nodeId: string): boolean

  // Direct setters
  setTextEditTarget(target: EditTarget | null): void
  setDimensions(dims: { columns: number; rows: number }): void

  // Detail pane cursor (Phase 2: detail pane as workspace pane)
  /** Get the detail pane cursor ID (from detail view pane's sel.node.cursor()) */
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

  // NodeStore registration — Board connector registers its per-pane NodeStore so
  // that syncPaneSignals and dispatchBoard can push fold/sticky/cursor/selection/edit
  // state directly, eliminating sync useEffects in Board.tsx.
  registerNodeStore(paneId: string, nodeStore: import("./reactive.ts").NodeStore): void
  unregisterNodeStore(paneId: string): void
}

export type BoardAppStore = BoardAppState & BoardAppActions & { [key: string]: unknown }

// =============================================================================
// Store Factory
// =============================================================================

export interface CreateBoardAppStoreParams {
  repo: Repo
  toastQueue: ToastQueue
  navigator: GridNavigator
  initialBoardState: BoardState
  initialUIState: UIState
  /** Initial view mode for the default pane (per-pane field, not stored in UIState) */
  initialViewMode?: import("../types.ts").ViewMode
  /** Initial cursor for the default pane's sel store */
  initialCursor?: string | null
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
): WorkspaceState | null {
  const panes = new Map<string, PaneState>()

  const firstBoardPaneId = saved.panes.find((p) => p.viewType === "board")?.id

  for (const persisted of saved.panes) {
    let pane: PaneState
    if (persisted.viewType === "detail") {
      // Legacy detail panes are rehydrated as board panes with viewMode "detail"
      pane = createPaneState(persisted.id, createBoardState(), {
        viewMode: "detail",
      })
      ;(pane as BoardPaneState).parentPaneId = ownerPaneId(persisted.id)
    } else if (persisted.viewType === "empty") {
      pane = createEmptyPaneState(persisted.id)
    } else {
      const resolvedBoard = resolvePersistedPane(persisted, repo, fallbackBoardState)
      // Compute initial cursor from repo so the pane starts with a valid cursor.
      // Without this, sel.node.cursor() is null after workspace restoration.
      const rId = resolvedBoard.rootId
      const initialCursor = rId
        ? (computeInitialCursorFromRepo(repo, rId) as import("@silvery/selection").ID | null)
        : null
      pane = createPaneState(persisted.id, resolvedBoard, {
        viewMode: persisted.viewMode as "cards" | "list" | "columns" | "tabs",
        initialCursor: initialCursor ?? undefined,
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
    return createBoardState(fallback.rootId, fallback.rootPath)
  }

  // Try to resolve the file path to a node
  const node = repo.resolveNode(persisted.rootNodePath)
  if (node) {
    return createBoardState(node.id, fallback.rootPath)
  }

  // File no longer exists — fall back to default root
  return createBoardState(fallback.rootId, fallback.rootPath)
}

/**
 * Compute an initial cursor for a board root by finding the first card
 * in the first column (section). Used when restoring a workspace to a
 * board that differs from the default.
 */
function computeInitialCursorFromRepo(repo: Repo, rootId: string): string | null {
  const columns = repo.getChildren(rootId)
  if (columns.length === 0) return null
  const firstCol = columns[0]
  if (!firstCol) return null
  const cards = repo.getChildren(firstCol.id)
  if (cards.length > 0) return cards[0]?.id ?? firstCol.id
  return firstCol.id
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
    initialCursor: (params.initialCursor as import("@silvery/selection").ID) ?? undefined,
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
 * Compute the initial cursor ID for a detail pane showing the given node.
 * Resolves symlinks to their target, then picks first metadata key or first child.
 */
function computeDetailInitialCursor(repo: Repo, nodeId: string | null): string | null {
  if (!nodeId) return null
  const rawNode = repo.getNode(nodeId)
  const { displayNode } = rawNode ? resolveSymlink(repo, rawNode) : { displayNode: null }
  const effectiveId = displayNode?.id ?? nodeId
  const metaKeys = displayNode ? computeMetadataKeys(displayNode) : []
  if (metaKeys.length > 0) return `${DETAIL_META_PREFIX}${metaKeys[0]}`
  const children = repo.getChildren(effectiveId)
  return children[0]?.id ?? null
}

/**
 * Create the initial store state for the board app.
 * Used as the store StateCreator in createApp().
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

    // Load sticky folds from disk — one .km/sticky-folds.json per repo, shared by all panes.
    // Writes are debounced to avoid thrashing the filesystem on rapid toggles.
    const initialStickyFolds: StickyFolds = params.repo.path ? readStickyFolds(params.repo.path) : new Map()
    const stickyFoldsWriter = params.repo.path ? createStickyFoldsWriter(params.repo.path) : null

    // Bridge repo's subscribe/getSnapshot to alien-signals.
    // The repoVersion signal is a dependency for the computed view lens —
    // when repo mutates, this signal bumps, which invalidates the computed.
    const repoVersion$ = signal(undoableRepo.getSnapshot())
    undoableRepo.subscribe(() => repoVersion$(undoableRepo.getSnapshot()))

    // Try to restore workspace from saved state, otherwise create default single-pane workspace.
    const initialPaneBoard: BoardState = {
      ...bs,
      foldDepths: initialFoldDepths,
    }

    let workspace: WorkspaceState

    if (params.savedWorkspace) {
      const restored = restoreWorkspaceFromPersisted(params.savedWorkspace, params.repo, initialPaneBoard)
      if (restored) {
        workspace = restored
      } else {
        workspace = createDefaultWorkspace(initialPaneBoard, params)
      }
    } else {
      workspace = createDefaultWorkspace(initialPaneBoard, params)
    }

    // Initialize each board pane's PaneSignals + lens computeds.
    // The computed view lens auto-invalidates when repo/rootId/foldDepths change.
    // The sel adapter reads from the lens — no manual auto-refresh needed.
    function initPaneSignals(pane: BoardPaneState): void {
      // Seed the pane's sticky folds from the initial repo load if it hasn't been set.
      // The sticky folds file is per-repo, so every pane shares the same initial map.
      if (pane.stickyFolds.size === 0 && initialStickyFolds.size > 0) {
        pane.stickyFolds = new Map(initialStickyFolds)
      }
      pane.signals = createPaneSignals({
        id: pane.id,
        sel: pane.sel,
        selTreeSource: pane.selTreeSource,
        repo: undoableRepo,
        repoVersion: repoVersion$,
        rootId: pane.rootId,
        rootPath: pane.rootPath ?? null,
        foldDepths: pane.foldDepths,
        collapsedNodes: pane.collapsedNodes,
        stickyFolds: pane.stickyFolds,
        viewMode: pane.viewMode,
        moveState: pane.moveState,
        taskStatusFilter: pane.filterProperties?.taskStatus,
      })
      // Connect sel adapter: before each tree read, ensure visible lens is current.
      // Reading pane.signals.visibleLens() triggers the computed — if stale, rebuilds.
      pane.selTreeSource.setBeforeRead(() => {
        pane.selTreeSource.update(pane.signals!.visibleLens())
      })
      // Initialize the adapter with the first lens
      pane.selTreeSource.update(pane.signals.visibleLens())
      // Sync ViewTree when visibleLens changes
      effect(() => {
        const lens = pane.signals!.visibleLens()
        pane.signals!.viewTree.sync(lens)
      })
    }

    for (const pane of workspace.panes.values()) {
      if (isBoardPane(pane)) {
        initPaneSignals(pane)
      }
    }

    /**
     * Sync store pane fields → PaneSignals after a dispatchBoard set().
     * This keeps signals in sync so the computed view lens auto-invalidates.
     * Called after every structural dispatch (TOGGLE_FOLD, ZOOM_IN, SET_ROOT, etc.).
     *
     * Also syncs NodeStore (fold overrides, sticky folds) — eliminates the
     * Board.tsx useEffects that previously mirrored these values.
     */
    function syncPaneSignals(pane: BoardPaneState): void {
      if (!pane.signals) return
      pane.signals.rootId(pane.rootId)
      pane.signals.rootPath(pane.rootPath)
      pane.signals.foldDepths(pane.foldDepths)
      pane.signals.collapsedNodes(pane.collapsedNodes)
      pane.signals.stickyFolds(pane.stickyFolds)
      pane.signals.moveState(pane.moveState)
      pane.signals.viewMode(pane.viewMode)
      // Sync sel root when rootId changes (zoom/SET_ROOT). Without this,
      // getWalkOrder() uses the old root to scope the walk → empty walkOrder
      // when the old root doesn't exist in the new view lens → cursor null.
      pane.sel.root.set((pane.rootId as import("@silvery/selection").ID) ?? null)
      // Sync NodeStore fold/sticky state (replaces Board.tsx useEffects)
      if (pane.nodeStore) {
        pane.nodeStore.replaceFoldOverrides(pane.foldDepths)
        pane.nodeStore.replaceStickyFolds(pane.stickyFolds)
      }
    }

    // Helper: get the focused pane's sel (delegates global sel to per-pane sel).
    function getActiveSel(): SelectionStore {
      const s = _get()
      const pane = s.workspace.panes.get(s.workspace.focusedPaneId)
      if (pane && isBoardPane(pane)) return pane.sel
      // Fallback: find any board pane
      for (const p of s.workspace.panes.values()) {
        if (isBoardPane(p)) return p.sel
      }
      // Should not happen — create a throwaway sel as last resort
      const { app } = createSelectionAdapter()
      return createSelection(app)
    }

    function getActiveSelTreeSource(): SelectionTreeSource {
      const s = _get()
      const pane = s.workspace.panes.get(s.workspace.focusedPaneId)
      if (pane && isBoardPane(pane)) return pane.selTreeSource
      for (const p of s.workspace.panes.values()) {
        if (isBoardPane(p)) return p.selTreeSource
      }
      return createSelectionAdapter().source
    }

    // Create stable routing proxy for sel that delegates to the focused pane's sel.
    // This survives Zustand's shallow merge (spread) because it's a concrete object,
    // not a getter. Every method call delegates to getActiveSel() at call time.
    const routingSel: SelectionStore = {
      get node() {
        return getActiveSel().node
      },
      get sub() {
        return getActiveSel().sub
      },
      set sub(v) {
        getActiveSel().sub = v
      },
      get subComputed() {
        return getActiveSel().subComputed
      },
      get text() {
        return getActiveSel().text
      },
      get drag() {
        return getActiveSel().drag
      },
      get root() {
        return getActiveSel().root
      },
      get kind() {
        return getActiveSel().kind
      },
      deselect() {
        getActiveSel().deselect()
      },
      selectAll(parent) {
        getActiveSel().selectAll(parent)
      },
      get snapshot() {
        return getActiveSel().snapshot
      },
      reconcile() {
        getActiveSel().reconcile()
      },
    }

    // Create stable routing proxy for selTreeSource.
    const routingSelTreeSource: SelectionTreeSource = {
      update(lens) {
        getActiveSelTreeSource().update(lens)
      },
      setBeforeRead(cb) {
        getActiveSelTreeSource().setBeforeRead(cb)
      },
    }

    // Curswant-clearing effect: resets curswant when cursor moves in any pane.
    // (The old _selBridge also notified store subscribers for useAppStore sel
    // readers — no longer needed since all sel reads now use useSignal directly.)
    const watchedSels = new Set<SelectionStore>()
    function watchCurswant(paneSel: SelectionStore): void {
      if (watchedSels.has(paneSel)) return
      watchedSels.add(paneSel)
      let firstRun = true
      effect(() => {
        paneSel.node.cursor()
        if (firstRun) {
          firstRun = false
          return
        }
        const s = _get()
        if (!s?.workspace) return
        const focusedPane = s.workspace.panes.get(s.workspace.focusedPaneId)
        if (focusedPane && isBoardPane(focusedPane) && focusedPane.sel === paneSel) {
          focusedPane.curswantX = null
          focusedPane.curswantY = null
        }
      })
    }

    for (const pane of workspace.panes.values()) {
      if (isBoardPane(pane)) {
        watchCurswant(pane.sel)
      }
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

      // Selection store — stable proxy that delegates to the focused pane's per-pane sel.
      // Must be a concrete object (not a getter) because Zustand's shallow merge (spread)
      // copies property values, not getter descriptors.
      sel: routingSel,
      selTreeSource: routingSelTreeSource,
      textEditHints: null,

      // Undo/redo
      undoStack,
      undoHandle,

      // Handler registration for workspace chrome (null until Board connector mounts)
      _findQueryHandler: null,
      _searchReplaceSearchHandler: null,
      _searchReplaceReplaceHandler: null,

      // --- Board action dispatcher (inlined from boardReducer) ---

      // oxlint-disable-next-line complexity/complexity -- Exhaustive switch over BoardReducerOp union
      dispatchBoard(action: BoardReducerOp) {
        // --- Fast path: SELECT bypasses store set() entirely ---
        if (action.type === "SELECT") {
          const s = _get()
          // Silent mutation on focused board pane (no store subscriber notification)
          const focusedPane = s.workspace.panes.get(s.workspace.focusedPaneId)
          if (focusedPane && isBoardPane(focusedPane)) {
            focusedPane.curswantX = null
            focusedPane.curswantY = null
          }
          // Update sel store cursor — this is the canonical cursor source
          // for Board.tsx and all components reading sel.node.cursor().
          if (action.nodeId) {
            const ids = s.sel.node.ids()
            // If multi-selection is active, preserve it and just move cursor.
            // Otherwise, set cursor with a single-item selection.
            if (ids.length <= 1) {
              s.sel.node.select([action.nodeId as import("@silvery/selection").ID])
            }
          }
          // Derive cursor ancestors from the visible lens (O(depth) parent walk).
          const rootId = focusedPane && isBoardPane(focusedPane) ? focusedPane.rootId : null
          const lens =
            focusedPane && isBoardPane(focusedPane) && focusedPane.signals ? focusedPane.signals.visibleLens() : null
          const ancestors = lens
            ? classifyCursorFromLens(lens, action.nodeId)
            : getViewNavigation(
                focusedPane && isBoardPane(focusedPane) ? focusedPane.viewMode : "cards",
              ).classifyCursor(action.nodeId, rootId, s.repo)
          // Click hint: the click handler always knows the exact visual card. When
          // clicking inside a symlink, the data model parent chain leads to the source
          // card, not the visual card. The click hint overrides unconditionally.
          if (
            action.cardNodeId &&
            action.cardHintSource === "click" &&
            ancestors.cursorCardNodeId !== action.cardNodeId
          ) {
            const hintAncestors = lens
              ? classifyCursorFromLens(lens, action.cardNodeId)
              : getViewNavigation(
                  focusedPane && isBoardPane(focusedPane) ? focusedPane.viewMode : "cards",
                ).classifyCursor(action.cardNodeId, rootId, s.repo)
            if (hintAncestors.cursorDepth === "card") {
              ancestors.cursorCardNodeId = hintAncestors.cursorCardNodeId
              ancestors.cursorColumnNodeId = hintAncestors.cursorColumnNodeId
            }
          }
          // Sync detail pane when board cursor moves to a different card.
          // Detail pane's rootId = the cursor card, so update it and reset its cursor.
          // Must use set() (not silent mutation) so the detail Board re-renders with new rootId.
          const detailPane = getDetailPaneFor(s.workspace, s.workspace.focusedPaneId)
          if (detailPane) {
            const newCardId = ancestors.cursorCardNodeId ?? ancestors.cursorColumnNodeId
            // Derive previous card from the detail pane's current rootId (which tracks the card)
            const prevCardId = detailPane.rootId
            if (!isDetailPaneId(s.workspace.focusedPaneId) && newCardId && newCardId !== prevCardId) {
              const newFirstItemId = computeDetailInitialCursor(s.repo, newCardId)
              const newPanes = new Map(s.workspace.panes)
              const updatedDetail = { ...detailPane, rootId: newCardId }
              newPanes.set(detailPane.id, updatedDetail)
              set({ workspace: { ...s.workspace, panes: newPanes } })
              // Sync detail pane's PaneSignals with new rootId
              if (detailPane.signals) detailPane.signals.rootId(newCardId)
              // Sync the detail pane's sel with the new cursor
              if (newFirstItemId) {
                detailPane.sel.node.select([newFirstItemId as import("@silvery/selection").ID])
              }
            }
          }
          return
        }

        // --- Fast path: SET_CURSWANT also bypasses store set() entirely ---
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

            case "SET_COLLAPSED_NODES": {
              paneUpdate = { collapsedNodes: new Set(action.nodeIds) }
              break
            }

            case "ZOOM_IN": {
              const zoomNodeId = action.nodeId
              const zoomDepths = computeDefaultFoldDepths(zoomNodeId, new Map())
              paneUpdate = {
                rootId: zoomNodeId,
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
                  cursor: pane.sel.node.cursor() as string | null,
                },
              ]
              const rootDepths = computeDefaultFoldDepths(action.rootId, new Map())
              paneUpdate = {
                rootId: action.rootId,
                rootPath: action.rootPath,
                foldDepths: rootDepths,
                navHistory: newHistory,
                navHistoryIndex: newHistory.length,
                curswantX: null,
                curswantY: null,
              }
              break
            }

            case "ENTER_MOVE_MODE": {
              if (action.nodeIds.length === 0) return state
              paneUpdate = {
                moveState: {
                  active: true,
                  sourceNodes: action.nodeIds,
                  sourceCursor: pane.sel.node.cursor() as string | null,
                },
              }
              break
            }

            case "CONFIRM_MOVE": {
              paneUpdate = {
                moveState: { active: false },
              }
              break
            }

            case "CANCEL_MOVE": {
              const sourceCursor = pane.moveState.active ? pane.moveState.sourceCursor : null
              paneUpdate = {
                moveState: { active: false },
                curswantX: null,
                curswantY: null,
              }
              // Restore cursor to pre-move position via sel store
              if (sourceCursor) {
                pane.sel.node.select([sourceCursor as import("@silvery/selection").ID])
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

        // Sync PaneSignals with updated store state so the computed view lens
        // auto-invalidates. Must happen before cursor rescue (which reads the lens).
        const s = _get()
        const board = getActiveBoardPane(s)
        if (board?.signals) {
          syncPaneSignals(board)
        }

        // Cursor rescue via visible lens — the lens handles fold + hidden filtering.
        if (board?.signals) {
          const lens = board.signals.visibleLens()

          // Cursor rescue: if cursor node is hidden by fold state, move it to the
          // nearest visible ancestor.
          let cursorId = board.sel.node.cursor() as string | null
          if (cursorId) {
            const rescuedId = findVisibleAncestor(cursorId, lens, board.foldDepths)
            if (rescuedId !== cursorId) {
              cursorId = rescuedId
            }
          }

          // Sync sel store cursor after structural changes (fold, zoom, etc.)
          if (cursorId) {
            s.selTreeSource.update(lens)
            const ids = s.sel.node.ids()
            if (ids.length <= 1) {
              s.sel.node.select([cursorId as import("@silvery/selection").ID])
            }
          }
          // NodeStore cursor/fold/sticky sync is handled by alien-signals effects
          // registered in registerNodeStore — no manual sync needed here.
        }
      },

      // --- Direct setters ---

      setUI(partial: Partial<PaneUI> | ((prev: PaneUI) => Partial<PaneUI>)) {
        // Capture which keys actually got resolved so the post-set sync covers
        // both the object and function variants. Without this, function-variant
        // setUI calls (e.g., HIDE_NODE bumping hiddenVersion via a callback)
        // skip the signal sync entirely and the view lens never updates — see
        // km-tui.hide-column-broken.
        let resolvedKeys: Set<string> = new Set()
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
          resolvedKeys = new Set(Object.keys(resolved))

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
        // Sync per-pane fields to PaneSignals when they change.
        // Use resolvedKeys (captured inside set()) so this works for BOTH the
        // object variant and the function variant of setUI — function-variant
        // updates (e.g., HIDE_NODE bumping hiddenVersion via a callback) must
        // trigger signal sync the same way object-variant updates do.
        const afterS = _get()
        const afterPane = getActiveBoardPane(afterS)
        if (afterPane?.signals) {
          if (resolvedKeys.has("viewMode")) afterPane.signals.viewMode(afterPane.viewMode)
          // Hidden state change: recompute hiddenNodeIds so the view lens filters correctly
          if (resolvedKeys.has("hiddenVersion") || resolvedKeys.has("showHidden")) {
            const hidden = afterPane.showHidden
              ? new Set<string>()
              : computeHiddenNodeIds(afterS.repo, afterPane.rootId)
            afterPane.signals.hiddenNodeIds(hidden)
          }
          // Sync taskStatusFilter signal when filterProperties change
          if (resolvedKeys.has("filterProperties")) {
            const taskFilter = afterPane.filterProperties?.taskStatus ?? new Set<string>()
            afterPane.signals.taskStatusFilter(taskFilter)
            // Also sync detail pane's signal (filterProperties propagate to detail pane in zustand)
            if (!isDetailPaneId(afterPane.id)) {
              const detailId = detailPaneIdFor(afterPane.id)
              const detailPane = afterS.workspace.panes.get(detailId)
              if (detailPane && isBoardPane(detailPane) && detailPane.signals) {
                detailPane.signals.taskStatusFilter(taskFilter)
              }
            }
          }
        }
      },

      setFoldDepths(depths: Map<string, number>) {
        set((state) => {
          const focusedPaneId = state.workspace.focusedPaneId
          const pane = state.workspace.panes.get(focusedPaneId)
          if (!pane || !isBoardPane(pane)) return state

          const newPanes = updateBoardPane(state.workspace, focusedPaneId, pane, { foldDepths: depths })
          return { workspace: { ...state.workspace, panes: newPanes } }
        })

        // Sync PaneSignals + cursor rescue via visible lens
        const s = _get()
        const boardPane = getActiveBoardPane(s)
        if (boardPane?.signals) {
          syncPaneSignals(boardPane)
          const lens = boardPane.signals.visibleLens()

          // Cursor rescue: if cursor is on a node that will be hidden by the new
          // fold depths, move it to the nearest visible ancestor before applying.
          const boardPaneCursorId = (boardPane.sel.node.cursor() as string | null) ?? null
          if (boardPaneCursorId) {
            const rescuedId = findVisibleAncestor(boardPaneCursorId, lens, boardPane.foldDepths)
            if (rescuedId !== null && rescuedId !== boardPaneCursorId) {
              boardPane.sel.node.select([rescuedId as import("@silvery/selection").ID])
            }
            s.selTreeSource.update(lens)
            const ids = s.sel.node.ids()
            if (ids.length <= 1) {
              s.sel.node.select([(rescuedId ?? boardPaneCursorId) as import("@silvery/selection").ID])
            }
          }
        }
      },

      // --- Sticky folds ---
      //
      // Sticky folds are per-node fold pins that survive fold-all/unfold-all
      // and are persisted to .km/sticky-folds.json. Writes are debounced.
      //
      // Phase 1 wiring: state plumbing only — not yet consulted by fold-all /
      // unfold-all, and not yet exposed via a command. See km-tui.sticky-fold.

      setStickyFold(nodeId: string, state: StickyState) {
        set((s) => {
          const focusedPaneId = s.workspace.focusedPaneId
          const pane = s.workspace.panes.get(focusedPaneId)
          if (!pane || !isBoardPane(pane)) return s
          const nextFolds = mapSetSticky(pane.stickyFolds, nodeId, state)
          const newPanes = updateBoardPane(s.workspace, focusedPaneId, pane, { stickyFolds: nextFolds })
          return { workspace: { ...s.workspace, panes: newPanes } }
        })
        const boardPane = getActiveBoardPane(_get())
        if (boardPane?.signals) syncPaneSignals(boardPane)
        // Persist (debounced) — uses the focused pane's map as the authoritative copy.
        if (stickyFoldsWriter && boardPane) stickyFoldsWriter.schedule(boardPane.stickyFolds)
      },

      removeStickyFold(nodeId: string) {
        set((s) => {
          const focusedPaneId = s.workspace.focusedPaneId
          const pane = s.workspace.panes.get(focusedPaneId)
          if (!pane || !isBoardPane(pane)) return s
          const nextFolds = mapRemoveSticky(pane.stickyFolds, nodeId)
          if (nextFolds === pane.stickyFolds) return s
          const newPanes = updateBoardPane(s.workspace, focusedPaneId, pane, { stickyFolds: nextFolds })
          return { workspace: { ...s.workspace, panes: newPanes } }
        })
        const boardPane = getActiveBoardPane(_get())
        if (boardPane?.signals) syncPaneSignals(boardPane)
        if (stickyFoldsWriter && boardPane) stickyFoldsWriter.schedule(boardPane.stickyFolds)
      },

      isStickyFold(nodeId: string): boolean {
        const boardPane = getActiveBoardPane(_get())
        return boardPane?.stickyFolds.has(nodeId) ?? false
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
        return (detail?.sel.node.cursor() as string | null) ?? null
      },

      setDetailCursor(id: string | null) {
        set((state) => {
          const detail = getDetailPaneFor(state.workspace, state.workspace.focusedPaneId)
          if (!detail) return state
          // Set cursor via sel store (sole authority)
          if (id) {
            detail.sel.node.select([id as import("@silvery/selection").ID])
          }
          return state
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
          // Walk up via lens to find containing card, then column, then fallback to root.
          const cursorId = parentPane.sel.node.cursor() as string | null
          let detailRootId: string | null = parentPane.rootId
          if (cursorId && parentPane.signals) {
            const lens = parentPane.signals.visibleLens()
            let cardId: string | null = null
            let columnId: string | null = null
            let walker: string | null = cursorId
            while (walker) {
              const role = lens.role(walker)
              if (role === "card" && !cardId) cardId = walker
              if ((role === "column" || role === "body-column") && !columnId) columnId = walker
              walker = lens.parent(walker)
            }
            detailRootId = cardId ?? columnId ?? parentPane.rootId
          }

          const firstItemId = computeDetailInitialCursor(state.repo, detailRootId)

          const detailPane = createPaneState(detailId, createBoardState(detailRootId, null), {
            viewMode: "detail",
            initialCursor: firstItemId as import("@silvery/selection").ID | undefined,
          })
          detailPane.parentPaneId = focusedPaneId
          // Inherit filter state from parent board pane (e.g., hide-done toggle)
          detailPane.filterProperties = { ...parentPane.filterProperties }
          initPaneSignals(detailPane)
          // Initialize the detail pane's sel with the initial cursor
          if (firstItemId && detailPane.signals) {
            detailPane.selTreeSource.update(detailPane.signals.visibleLens())
            detailPane.sel.node.select([firstItemId as import("@silvery/selection").ID])
          }

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
        // Watch the new detail pane's sel for curswant clearing
        const s = _get()
        const detailId = detailPaneIdFor(s.workspace.focusedPaneId)
        const detailPane = s.workspace.panes.get(detailId)
        if (detailPane && isBoardPane(detailPane)) {
          watchCurswant(detailPane.sel)
        }
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

          // Create an empty pane
          const emptyPane = createEmptyPaneState(newPaneId)

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
          const focusedPane = workspace.panes.get(focusedId)

          // Don't close the last board pane — the app requires at least one
          // board pane for rendering (WorkspaceChrome, key handlers, etc.).
          // Closing the last board pane would leave only empty panes, which
          // crashes because components like Board/WorkspaceChrome assume a
          // board pane with signals always exists.
          if (focusedPane && isBoardPane(focusedPane)) {
            let otherBoardPaneExists = false
            for (const [id, pane] of workspace.panes) {
              if (id !== focusedId && isBoardPane(pane)) {
                otherBoardPaneExists = true
                break
              }
            }
            if (!otherBoardPaneExists) {
              return { ui: { ...state.ui, bellState: "visual" } }
            }
          }

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
          const activeBoardCursor = activeBoard ? (activeBoard.sel.node.cursor() as string | null) : null
          const boardState = activeBoard
            ? createBoardState(activeBoard.rootId, activeBoard.rootPath)
            : createBoardState()
          if (activeBoard) {
            boardState.foldDepths = activeBoard.foldDepths
            boardState.collapsedNodes = activeBoard.collapsedNodes
          }
          const updatedPane = createPaneState(focusedPane.id, boardState, {
            viewMode: activeBoard?.viewMode ?? "columns",
            initialCursor: (activeBoardCursor as import("@silvery/selection").ID) ?? undefined,
          })
          initPaneSignals(updatedPane)
          // Initialize the new pane's sel with the cursor
          if (activeBoardCursor && updatedPane.signals) {
            updatedPane.selTreeSource.update(updatedPane.signals.visibleLens())
            updatedPane.sel.node.select([activeBoardCursor as import("@silvery/selection").ID])
          }
          const newPanes = new Map(workspace.panes)
          newPanes.set(workspace.focusedPaneId, updatedPane)

          return {
            workspace: { ...workspace, panes: newPanes },
          }
        })
        // Watch the newly activated pane's sel for curswant clearing
        const s = _get()
        const activatedPane = s.workspace.panes.get(s.workspace.focusedPaneId)
        if (activatedPane && isBoardPane(activatedPane)) {
          watchCurswant(activatedPane.sel)
        }
      },

      registerNodeStore(paneId: string, nodeStore: import("./reactive.ts").NodeStore) {
        const s = _get()
        const pane = s.workspace.panes.get(paneId)
        if (!pane || !isBoardPane(pane)) return
        // Unregister previous if present (shouldn't happen, but defensive)
        if (pane.nodeStoreCleanup) pane.nodeStoreCleanup()
        // Attach nodeStore to pane (mutable — not part of Zustand shallow merge)
        pane.nodeStore = nodeStore
        // Set up alien-signals effects for selection and edit sync.
        // These replace the Board.tsx useEffects that observed sel.node.ids and sel.text.
        // Cursor sync remains as a useEffect in Board.tsx because it requires React render
        // cycle coordination (useSignal subscriptions in TreeNode components need React
        // to process the change within act() — alien-signals effects fire outside React's lifecycle).
        const repo = s.repo
        const stopSelEffect = effect(() => {
          const ids = pane.sel.node.ids()
          const cursorId = pane.sel.node.cursor() as string | null
          // Exclude cursor from multi-selection set — the cursor card's visual tint
          // is handled by CardColumn's cardBg (selectedBg). Including it causes
          // setSelection to expand descendants and mark all sub-items as selected,
          // creating a zebra pattern (sections get multiSelectedBg, leaves inherit selectedBg).
          const selectedSet = new Set(ids as unknown as string[])
          if (cursorId) selectedSet.delete(cursorId)
          nodeStore.setSelection(selectedSet, repo)
        })
        const stopEditEffect = effect(() => {
          const textEdit = pane.sel.text() as { nodeId: string; offset: number } | null
          // Read textEditHints from store (not reactive — but updated synchronously before edit signals)
          const hints = _get().textEditHints
          if (textEdit) {
            nodeStore.beginEdit(textEdit.nodeId, hints?.blockIndex ?? 0)
          } else {
            nodeStore.endEdit()
          }
        })
        pane.nodeStoreCleanup = () => {
          stopSelEffect()
          stopEditEffect()
          pane.nodeStore = undefined
          pane.nodeStoreCleanup = undefined
        }
      },

      unregisterNodeStore(paneId: string) {
        const s = _get()
        const pane = s.workspace.panes.get(paneId)
        if (!pane || !isBoardPane(pane)) return
        if (pane.nodeStoreCleanup) pane.nodeStoreCleanup()
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
  const updatedPane = { ...pane, ...update }
  newPanes.set(paneId, updatedPane)
  return newPanes
}

// =============================================================================
// Cursor Visibility Check
// =============================================================================

/**
 * Check if a node is visible given the current fold state, and if not,
 * find its nearest visible ancestor in the ViewTree.
 *
 * A node is hidden when:
 * - Any ancestor card/column has a foldDepths entry of 0, OR
 * - The node is deeper than CARD_REMAINING_DEPTH inside its card AND
 *   no explicit fold override exists for intermediate ancestors
 *
 * Uses the ViewTree parent chain — walks up from the cursor node checking
 * each ancestor's fold state until reaching a visible node.
 *
 * @returns The original nodeId if visible, or the nearest visible ancestor's ID
 */
function findVisibleAncestor(
  nodeId: string,
  lens: import("@km/board").TreeLens,
  foldDepths: Map<string, number>,
): string | null {
  const role = lens.role(nodeId)
  if (!role) return nodeId // Node not in view tree — leave it

  // Board and column nodes are always visible
  if (role === "board" || role === "column" || role === "body-column") return nodeId

  // Cards are always visible (they're direct children of columns in the ViewTree)
  if (role === "card") return nodeId

  // For subitems: walk up to find if any ancestor hides this node via fold
  let currentId = lens.parent(nodeId)
  let depthFromCard = 0
  while (currentId) {
    const currentRole = lens.role(currentId)
    if (currentRole === "card") {
      // The card's fold depth determines if its children are visible
      const cardFold = foldDepths.get(currentId)
      if (cardFold !== undefined && cardFold <= 0) {
        return currentId
      }
      const effectiveDepth = cardFold ?? CARD_REMAINING_DEPTH
      if (depthFromCard >= effectiveDepth) {
        return currentId
      }
      return nodeId
    }
    if (currentRole === "subitem") {
      const subFold = foldDepths.get(currentId)
      if (subFold !== undefined && subFold <= 0) {
        return currentId
      }
      depthFromCard++
    }
    if (currentRole === "column" || currentRole === "body-column" || currentRole === "board") {
      return nodeId
    }
    currentId = lens.parent(currentId)
  }

  return nodeId
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
