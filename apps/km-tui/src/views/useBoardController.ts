/**
 * useBoardController — Board stateful logic, extracted from Board.tsx.
 *
 * This hook owns all lifecycle effects, signal subscriptions, and derived state
 * that the Board connector used to hold inline. It returns a prop bag for
 * BoardView (pure render) to consume.
 *
 * Split from Board.tsx as part of the tree v4 detail-unify effort:
 *   - BoardView.tsx          → JSX only
 *   - useBoardController.ts  → lifecycle effects, signal subscriptions, derived state (this file)
 *   - Board.tsx              → thin connector
 *
 * Nothing here produces JSX — the hook is callable from a connector component
 * which then passes the result to BoardView.
 */
import React, { useCallback, useEffect, useMemo, useRef } from "react"
import { useRuntime, useBoxRect, setWindowTitle, useFocusManager, type PatchedConsole } from "@silvery/ag-react"
import { useApp as useAppStore, StoreContext } from "@silvery/create"
import { createNodeStore, type NodeStore } from "../state/reactive.ts"
import { usePaneSignals, useSignal } from "../hooks/use-signal.ts"
import type { KNode } from "@km/core"
import { useRepo } from "../repo-context.tsx"
import { useToastQueue, useJobRunner, useUndoHandle } from "../services-context.tsx"
import { classifyCursorFromLens } from "@km/board"
import type { FilterProperties } from "../state/ui-reducer.ts"
import { hasActivePropertyFilters } from "../state/ui-reducer.ts"
import { buildNodeIndexFromTree, deriveCursorIndices } from "../hooks/use-columns.ts"
import { CursorDepth } from "../state/cursor-depth.ts"
import type { BoardAppStore } from "../state/board-app-store.ts"
import { hasDetailPaneFor } from "../board/board-types.ts"
import { usePaneId } from "../pane-context.tsx"
import { computeColumnWidths } from "./board-layout.ts"
import { usePaneUI, deriveTreeConfig, findBoardRootId, type TreeConfig } from "../state/ui-context.tsx"
import { getPathSegments } from "./board-top-bar.ts"
import {
  createFileDropHandler,
  createWatcherStatusHandler,
  createBackgroundParseHandler,
  createErrorWarningHandler,
  createSyncEventCollector,
} from "./board-effects.ts"
import { getStatusForMarker } from "@km/core"
import { findMatchingNodeIds } from "../board/board-actions-find.ts"
import { searchReplaceMatchingNodeIds } from "../board/board-actions-search-replace.ts"
import type { BoardViewProps, ColumnFilterState } from "./BoardView.tsx"

// =============================================================================
// Property filter matching (helpers used by controller derivation)
// =============================================================================

/** Count descendant nodes hidden by property filters within a card's subtree.
 * Only counts one level deep (direct children) — deeper nesting is rare in practice. */
function countHiddenDescendants(
  repo: { getNode(id: string): KNode | null | undefined; getChildren(parentId: string | null): KNode[] },
  parentId: string,
  filters: FilterProperties,
): number {
  const children = repo.getChildren(parentId)
  let count = 0
  for (const child of children) {
    const symlinkTarget = child.symlink_to
    const filterNode = symlinkTarget ? (repo.getNode(symlinkTarget) ?? child) : child
    if (!matchesPropertyFilters(filterNode, filters)) {
      count++
    } else {
      // Recurse into children that survived the filter
      count += countHiddenDescendants(repo, child.id, filters)
    }
  }
  return count
}

/** Check if a node matches all active property filters (AND logic between categories) */
// oxlint-disable-next-line complexity/complexity -- multi-category filter matching with early returns
function matchesPropertyFilters(node: KNode, filters: FilterProperties): boolean {
  // Task status filter — only applies to task nodes; non-task nodes (headings, paragraphs) pass through
  if (filters.taskStatus.size > 0) {
    const status = node.item?.task?.status ?? getStatusForMarker(node.item?.task?.marker)
    if (status && !filters.taskStatus.has(status)) return false
  }

  // Priority filter
  if (filters.priority.size > 0) {
    const priority = node.priority ? String(node.priority) : null
    if (!priority || !filters.priority.has(priority)) return false
  }

  // Due date filter
  if (filters.dueDate.size > 0) {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekEnd = new Date(today)
    weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()))

    if (filters.dueDate.has("no-date") && !node.due_at) return true
    if (!node.due_at) return false

    const due = new Date(node.due_at)
    let matches = false
    if (filters.dueDate.has("overdue") && due < today) matches = true
    if (filters.dueDate.has("today") && due >= today && due < new Date(today.getTime() + 86400000)) matches = true
    if (filters.dueDate.has("this-week") && due >= today && due <= weekEnd) matches = true
    if (!matches) return false
  }

  // Assigned to filter
  if (filters.assignedTo.size > 0) {
    if (!node.assigned_to || !filters.assignedTo.has(node.assigned_to)) return false
  }

  // Node type filter
  if (filters.nodeType.size > 0) {
    if (!filters.nodeType.has(node.type)) return false
  }

  return true
}

// =============================================================================
// useBoardController — consolidates all Board lifecycle logic
// =============================================================================

export interface UseBoardControllerArgs {
  /** Patched console for capturing console output when the console modal opens */
  patchedConsole?: PatchedConsole | null
}

/**
 * Board connector hook: owns all signal subscriptions, effects, and derived
 * state for a single board pane. Returns a prop bag that BoardView consumes.
 *
 * Behavior is a direct extraction from the original Board component body —
 * no logic changes beyond moving hooks into a hook. See Board.tsx history for
 * the previous inline implementation.
 */
// oxlint-disable-next-line complexity/complexity -- controller hook — hooks + effects inflate score
export function useBoardController({ patchedConsole }: UseBoardControllerArgs): BoardViewProps {
  // Access RuntimeContext directly (not useApp()) to get the mutable object.
  // In the createApp() path, pause/resume are assigned to the context object
  // AFTER the initial render. useApp() would snapshot undefined at render time,
  // and since Board never re-renders, those stale values would persist.
  // By holding the context object ref and reading .pause/.resume lazily inside
  // the useEffect, we always get the up-to-date values.
  const runtimeCtx = useRuntime()
  const repo = useRepo()
  const paneId = usePaneId()
  const ps = usePaneSignals()

  // Read effective UI state — global UIState merged with this pane's per-pane fields.
  const ui = usePaneUI()
  const rootId = useSignal(ps.rootId)
  // Cursor: subscribe directly to per-pane sel's cursor computed signal.
  // No bridge needed — useSignal tracks the alien-signals computed directly.
  const paneSel = ps.sel
  const cursor = useSignal(paneSel.node.cursor) as string | null
  const foldDepths = useSignal(ps.foldDepths)
  const stickyFolds = useSignal(ps.stickyFolds)
  const storeCollapsedNodes = useSignal(ps.collapsedNodes)
  const toastQueue = useToastQueue()
  const setUI = useAppStore<BoardAppStore, BoardAppStore["setUI"]>((s) => s.setUI)
  const sel = ps.sel
  const dispatchBoard = useAppStore<BoardAppStore, BoardAppStore["dispatchBoard"]>((s) => s.dispatchBoard)
  const jobRunner = useJobRunner()
  const undoHandle = useUndoHandle()
  const taskStatusFilter = ui.filterProperties.taskStatus

  // Board focus state — derived from silvery focus scope system.
  // activeScopeId is set by syncFocusScope() when pane focus changes.
  // null means no scope activated yet (first render) — treat as focused.
  const { activeScopeId } = useFocusManager()
  const boardFocused = activeScopeId === null || activeScopeId === paneId
  const hasDetailPane = useAppStore<BoardAppStore, boolean>((s) => hasDetailPaneFor(s.workspace, paneId))

  // Reactive node store — per-pane scope, stable across re-renders.
  // Pre-populate cursor state so child components have valid cursor on first render.
  // Registers the nodeStore on the pane AND sets up alien-signals effects synchronously
  // (during initial render) so that cursor/selection/edit/fold/sticky sync is active
  // before any useEffects fire. This eliminates 5 sync useEffects.
  const storeApiForReg = React.useContext(StoreContext) as
    | import("../state/signal-store.ts").SignalStoreApi<BoardAppStore>
    | null
  const nodeStore = useMemo<NodeStore>(() => {
    const store = createNodeStore()
    // Derive initial cursor classification from the visible lens
    if (cursor && rootId) {
      const lens = ps.visibleLens()
      // Walk up from cursor to find the containing card and column
      let cursorCardNodeId: string | null = null
      let cursorColumnNodeId: string | null = null
      let cursorDepth: "board" | "column" | "card" = "board"
      let current: string | null = cursor
      while (current && current !== rootId) {
        const role = lens.role(current)
        if (role === "card" && !cursorCardNodeId) cursorCardNodeId = current
        if ((role === "column" || role === "body-column") && !cursorColumnNodeId) cursorColumnNodeId = current
        current = lens.parent(current)
      }
      if (cursorCardNodeId) cursorDepth = "card"
      else if (cursorColumnNodeId) cursorDepth = "column"
      // Write cursor signals — setCursor handles per-node boolean + store signal
      store.setCursor(cursor)
      store.cursorCardNodeId(cursorCardNodeId)
      store.cursorColumnNodeId(cursorColumnNodeId)
      store.cursorDepth(cursorDepth)
    }
    // Register nodeStore on the pane AND set up alien-signals effects synchronously.
    // Must happen during render (not in useEffect) so the effects are active before
    // any keypress — action handlers call sel.node.select() directly (not through
    // dispatchBoard(SELECT)), so the effects must catch those changes immediately.
    if (storeApiForReg) {
      storeApiForReg.getState().registerNodeStore(paneId, store)
    }
    return store
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount
  }, [])

  // Cleanup alien-signals effects on unmount
  const unregisterNodeStore = useAppStore<BoardAppStore, BoardAppStore["unregisterNodeStore"]>(
    (s) => s.unregisterNodeStore,
  )
  useEffect(() => {
    return () => unregisterNodeStore(paneId)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup only on unmount
  }, [])

  // Hydrate reactive node state on initial load and root change (zoom)
  const selIds = useSignal(paneSel.node.ids) as unknown as ReadonlyArray<string>
  const cursorId = useSignal(paneSel.node.cursor) as string | null
  // Exclude cursor from multi-selection set — the cursor card's visual tint is
  // handled by CardColumn's cardBg (selectedBg). Including it causes hydrate to
  // expand descendants, and TreeNode applies multiSelectedBg on their head rows
  // creating a zebra pattern (depth-1 get multiSelectedBg, depth-2 inherit selectedBg).
  const selectedSet = useMemo(() => {
    const s = new Set(selIds)
    if (cursorId) s.delete(cursorId)
    return s
  }, [selIds, cursorId])
  useEffect(() => {
    nodeStore.hydrate(repo, rootId, foldDepths, selectedSet, stickyFolds)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- full re-hydrate only on root change
  }, [nodeStore, repo, rootId])

  // Layout is derived on demand — no store sync needed

  // Screen switching for console
  // Read pause/resume lazily from runtimeCtx (not captured at render time).
  // In the createApp() path, these are assigned after the initial render.
  useEffect(() => {
    if (!ui.showConsole) return
    const onPause = runtimeCtx?.pause
    const onResume = runtimeCtx?.resume
    if (!onPause || !onResume) return
    onPause() // Leaves alt screen + shows cursor
    if (patchedConsole) {
      const entries = patchedConsole.getSnapshot()
      for (const entry of entries) {
        const stream = entry.stream === "stderr" ? process.stderr : process.stdout
        const args = entry.args.map((a: unknown) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")
        stream.write(args + "\n")
      }
    }
    return () => {
      onResume() // Re-enters alt screen + hides cursor + re-renders
    }
  }, [ui.showConsole, runtimeCtx, patchedConsole])

  // Derive column IDs from ViewTree (per-node signals via lens).
  // useSignal(ps.visibleLens) ensures re-derivation on tree changes.
  const visibleLensValue = useSignal(ps.visibleLens)
  // viewLensValue — unfiltered by taskStatusFilter, used to compute the
  // pre-filter total card count for "+N filtered" footer math.
  const viewLensValue = useSignal(ps.viewLens)
  const columnIds = useMemo((): readonly string[] => {
    if (ui.viewMode === "detail") {
      // Detail mode: no column derivation needed. DetailView renders metadata rows
      // as focusable React components and children directly. Return an empty array
      // since the detail view path in JSX doesn't use columnIds.
      return []
    }
    const lensRoot = visibleLensValue.rootId
    return lensRoot ? visibleLensValue.children(lensRoot) : []
  }, [visibleLensValue, ui.viewMode])

  // Sync rule-based collapse (km.collapse:: true) into the store's collapsedNodes.
  // On root change (zoom), columns with rules.collapse should start collapsed.
  // The user can then toggle them with 'c'. We only add — never remove — so user toggles stick.
  const prevSyncedRootRef = useRef<string | null | undefined>(undefined)
  const collapsedNodes = storeCollapsedNodes
  useEffect(() => {
    if (prevSyncedRootRef.current === rootId) return
    prevSyncedRootRef.current = rootId

    for (const colId of columnIds) {
      const rules = visibleLensValue.rules(colId)
      if (rules?.collapse === true && !storeCollapsedNodes.has(colId)) {
        dispatchBoard({ type: "TOGGLE_COLLAPSE", nodeId: colId })
      }
    }
  }, [rootId, columnIds, visibleLensValue, storeCollapsedNodes, dispatchBoard])

  // Lazy nodeIndex: only indexes column headers + cards (no descendant queries).
  // deriveCursorIndices walks up parent chain on miss via getNode.
  // Derived from the visible lens.
  const nodeIndex = useMemo(() => buildNodeIndexFromTree(visibleLensValue), [visibleLensValue])
  const getNode = useCallback((id: string) => repo.getNode(id), [repo])

  // Derive cursor position from cursor + columns
  // getNode enables parent-walk fallback for descendant nodes not in the lazy index
  const cursorPosition = useMemo(
    () => deriveCursorIndices({ length: columnIds.length }, cursor, nodeIndex, getNode),
    [columnIds.length, cursor, nodeIndex, getNode],
  )

  const columnsLayout = useMemo(
    () => ({
      colIndex: cursorPosition.colIndex,
      cardIndex: cursorPosition.cardIndex,
      isAtCardLevel: cursorPosition.isAtCardLevel,
      nodeIndex,
    }),
    [cursorPosition, nodeIndex],
  )

  const cursorDepth = CursorDepth.fromIndices(cursorPosition.colIndex, cursorPosition.isAtCardLevel)

  // Sync cursor to NodeStore — must remain as useEffect because TreeNode components
  // read per-node cursor signals via useSignal, which requires React render cycle
  // coordination. Alien-signals effects fire outside React's lifecycle and don't
  // trigger the useSignal subscriptions within act().
  useEffect(() => {
    nodeStore.setCursor(cursor)
    if (ui.viewMode === "detail") {
      // Detail mode uses a flat cursor: cursor IS the cursorCardNodeId. Every
      // focusable entry (metadata rows, doc nodes, title) is addressed directly.
      // Walking ancestors via classifyCursorFromLens would incorrectly resolve
      // cursor back to the detail root (the board card being shown).
      nodeStore.cursorCardNodeId(cursor)
      nodeStore.cursorColumnNodeId(null)
      nodeStore.cursorDepth(cursor ? "card" : "board")
    } else {
      const ancestors = classifyCursorFromLens(visibleLensValue, cursor)
      nodeStore.cursorCardNodeId(ancestors.cursorCardNodeId)
      nodeStore.cursorColumnNodeId(ancestors.cursorColumnNodeId)
      nodeStore.cursorDepth(ancestors.cursorDepth)
    }
  }, [nodeStore, cursor, visibleLensValue, ui.viewMode])

  // Hidden column filtering is centralized in the view lens — the computed
  // lens excludes hidden nodes at build time. When showHidden is toggled,
  // PaneSignals.hiddenNodeIds updates → computed rebuilds. No need for
  // separate column filtering here.
  const visibleColIndex = columnsLayout.colIndex

  // Per-column filter overlay — BoardCore forwards this to the Column components
  // so they can render only the filtered subset and show the "+N filtered" footer.
  // Apply text + property filters using tree card IDs.
  const columnFilters = useMemo(() => {
    const map = new Map<string, ColumnFilterState>()
    const hasTextFilter = !!ui.filterText
    const hasPropertyFilter = hasActivePropertyFilters(ui.filterProperties)
    if (!hasTextFilter && !hasPropertyFilter) return map
    const lowerFilter = hasTextFilter ? ui.filterText.toLowerCase() : ""
    for (const colId of columnIds) {
      // viewLens: ignores taskStatusFilter so we can count pre-filter totals.
      // visibleLens: post-filter, used as the starting list.
      const rawCardIds = viewLensValue.children(colId)
      const cardIds = visibleLensValue.children(colId)
      const filteredCardIds = [...cardIds].filter((cardId) => {
        const card = repo.getNode(cardId)
        if (!card) return false
        // For symlinks, resolve to target node for filtering
        const symlinkTarget = card.symlink_to
        const filterNode = symlinkTarget ? (repo.getNode(symlinkTarget) ?? card) : card
        // Text filter: match card content (use target node content for symlinks)
        if (hasTextFilter) {
          const name = (filterNode.content ?? "").toLowerCase()
          if (!name.includes(lowerFilter)) return false
        }
        // Property filters (AND logic between categories)
        if (hasPropertyFilter) {
          if (!matchesPropertyFilters(filterNode, ui.filterProperties)) return false
        }
        return true
      })
      // Count descendants hidden by property filters within surviving cards
      let hiddenDescendantCount = 0
      if (hasPropertyFilter) {
        for (const cardId of filteredCardIds) {
          hiddenDescendantCount += countHiddenDescendants(repo, cardId, ui.filterProperties)
        }
      }
      map.set(colId, {
        filteredCardIds,
        // Pre-filter total: use viewLens (ignores taskStatusFilter) so the
        // "+N filtered" footer reflects how many cards were hidden by the
        // active property filters.
        totalCardCount: rawCardIds.length,
        hiddenDescendantCount: hiddenDescendantCount > 0 ? hiddenDescendantCount : undefined,
      })
    }
    return map
  }, [columnIds, visibleLensValue, viewLensValue, ui.filterText, ui.filterProperties, repo])

  // boardColumnIds = columnIds (already string IDs from the tree)
  const boardColumnIds = columnIds

  // Register find/search-replace handlers for workspace chrome.
  // These run in the focused Board connector which has access to filtered columns.
  const storeRef = React.useContext(StoreContext)
  const findTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const handleFindQueryChange = useCallback(
    (query: string) => {
      setUI((prev) => ({
        localSearch: {
          query,
          isInputActive: true,
          matchIndex: 0,
          matchCount: prev.localSearch?.matchCount ?? 0,
          matchNodeIds: prev.localSearch?.matchNodeIds ?? [],
        },
      }))
      clearTimeout(findTimerRef.current)
      const computeMatches = () => {
        const matchNodeIds = findMatchingNodeIds(ps.viewTree, query)
        if (matchNodeIds.length > 0 && matchNodeIds[0]) {
          sel.node.select([matchNodeIds[0] as import("@silvery/selection").ID])
        }
        setUI({
          localSearch: {
            query,
            isInputActive: true,
            matchIndex: 0,
            matchCount: matchNodeIds.length,
            matchNodeIds,
          },
        })
      }
      // @ts-expect-error - React internal flag set by silvery test renderer
      if (globalThis.IS_REACT_ACT_ENVIRONMENT) {
        computeMatches()
      } else {
        findTimerRef.current = setTimeout(computeMatches, 200)
      }
    },
    [setUI, sel],
  )

  const searchReplaceRef = useRef(ui.searchReplace)
  searchReplaceRef.current = ui.searchReplace
  const srTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const handleSearchReplaceSearchChange = useCallback(
    (searchQuery: string) => {
      const sr = searchReplaceRef.current
      if (!sr) return
      setUI({ searchReplace: { ...sr, searchQuery } })
      clearTimeout(srTimerRef.current)
      const computeMatches = () => {
        const latestSr = searchReplaceRef.current
        if (!latestSr) return
        const matchNodeIds = searchReplaceMatchingNodeIds(ps.viewTree, repo, searchQuery, latestSr.useRegex)
        if (matchNodeIds.length > 0 && matchNodeIds[0]) {
          sel.node.select([matchNodeIds[0] as import("@silvery/selection").ID])
        }
        setUI({
          searchReplace: {
            ...latestSr,
            searchQuery,
            matchIndex: 0,
            matchCount: matchNodeIds.length,
            matchNodeIds,
          },
        })
      }
      // @ts-expect-error - React internal flag set by silvery test renderer
      if (globalThis.IS_REACT_ACT_ENVIRONMENT) {
        computeMatches()
      } else {
        srTimerRef.current = setTimeout(computeMatches, 200)
      }
    },
    [setUI, sel, repo],
  )

  const handleSearchReplaceReplaceChange = useCallback(
    (replaceQuery: string) => {
      const sr = searchReplaceRef.current
      if (!sr) return
      setUI({ searchReplace: { ...sr, replaceQuery } })
    },
    [setUI],
  )

  // Register handlers in the store for workspace chrome to read
  useEffect(() => {
    if (!storeRef) return
    const store = storeRef as import("../state/signal-store.ts").SignalStoreApi<BoardAppStore>
    store.setState({
      _findQueryHandler: handleFindQueryChange,
      _searchReplaceSearchHandler: handleSearchReplaceSearchChange,
      _searchReplaceReplaceHandler: handleSearchReplaceReplaceChange,
    })
    return () => {
      store.setState({
        _findQueryHandler: null,
        _searchReplaceSearchHandler: null,
        _searchReplaceReplaceHandler: null,
      })
    }
  }, [storeRef, handleFindQueryChange, handleSearchReplaceSearchChange, handleSearchReplaceReplaceChange])

  // Auto-dismiss bell (150ms flash) and status (7s for bell messages, 3s otherwise).
  // Bell is also cleared at the start of the next keypress (board-app.ts line 104).
  useEffect(() => {
    if (!ui.bellState && !ui.status) return
    const timers: ReturnType<typeof setTimeout>[] = []
    if (ui.bellState) {
      timers.push(setTimeout(() => setUI({ bellState: null }), 150))
    }
    if (ui.status) {
      // Unmapped key messages (bell) stay visible longer so users can read them
      const statusDelay = ui.bellState ? 7000 : 3000
      timers.push(setTimeout(() => setUI({ status: null }), statusDelay))
    }
    return () => timers.forEach(clearTimeout)
  }, [ui.bellState, ui.status, setUI])

  // Set terminal window title to breadcrumb path: "km — Projects > Sprint 1 > My Task"
  // Only the focused pane updates the title to avoid conflicts in multi-pane mode.
  useEffect(() => {
    if (!boardFocused || !cursor) return
    const segments = getPathSegments(repo, cursor, rootId)
    // Skip the repo root segment (folder icon) and build a plain breadcrumb
    const breadcrumb = segments
      .slice(1)
      .map((seg) => seg.name.trim())
      .filter(Boolean)
      .join(" > ")
    if (breadcrumb) {
      setWindowTitle(process.stdout, `km — ${breadcrumb}`)
    }
  }, [boardFocused, cursor, repo, rootId])

  // Subscribe to external events (combined into single effect)
  useEffect(() => {
    const cleanups = [
      createFileDropHandler(setUI),
      createWatcherStatusHandler(setUI, toastQueue),
      createBackgroundParseHandler(setUI),
      createErrorWarningHandler(toastQueue),
      createSyncEventCollector(setUI),
    ]
    return () => cleanups.forEach((cleanup) => cleanup?.())
  }, [setUI, toastQueue])

  // NO useInput — keys handled by term:key in board-app.ts

  // Card inner width for line-aware title truncation.
  // Uses actual pane width (from useBoxRect) to match BoardCore's layout.
  const paneRect = useBoxRect()
  const cardInnerWidth = useMemo(() => {
    const termWidth = paneRect.width > 0 ? paneRect.width : ui.dimensions.columns
    const { expandedWidth } = computeColumnWidths(termWidth - 2, boardColumnIds, collapsedNodes)
    return expandedWidth - 3 // card width is expandedWidth - 1 (CardColumn renderItem), minus 2 for padding left + right
  }, [paneRect.width, ui.dimensions.columns, boardColumnIds, collapsedNodes])

  // Memoize treeConfig — stable across cursor moves (only changes on view mode / outline changes)
  const treeConfig: TreeConfig = useMemo(
    () => deriveTreeConfig(ui.viewMode, ui.maxContentLines, ui, cardInnerWidth),
    [ui.viewMode, ui.maxContentLines, ui.iconStyle, ui.borderMode, cardInnerWidth],
  )

  // Derive search highlight state for TreeNode rendering
  const searchMatchNodeIds = useMemo(
    () => (ui.localSearch ? new Set(ui.localSearch.matchNodeIds) : undefined),
    [ui.localSearch?.matchNodeIds],
  )
  const currentMatchNodeId = ui.localSearch?.matchNodeIds[ui.localSearch.matchIndex] ?? null

  return {
    // Provider props
    nodeStore,
    treeConfig,
    setUI,
    sel,
    rootBoardId: findBoardRootId(repo, rootId),
    searchMatchNodeIds,
    currentMatchNodeId,
    searchQuery: ui.localSearch?.query ?? null,
    jobRunner,
    undoHandle,
    taskStatusFilter,
    boardFocused,
    // BoardCore render props
    rootId,
    cursor,
    columnIds: boardColumnIds,
    columnFilters,
    colIndex: visibleColIndex,
    cardIndex: columnsLayout.cardIndex,
    ui,
    cursorDepth,
    dimensions: ui.dimensions,
    collapsedNodes,
    hasDetailPane,
  }
}
