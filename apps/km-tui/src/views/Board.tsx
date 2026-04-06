/**
 * Ink-based Board TUI Component
 *
 * Architecture (L3 — createApp + signal store):
 * 1. BoardCore - Pure rendering, no hooks (testable)
 * 2. Board - Connector: reads store via useApp(), computes derived layout, manages effects
 * 3. BoardApp - Production entry wrapper (gets dimensions/exit from context)
 *
 * State lives in the BoardAppStore (signal store). Keys flow through term:key handler
 * in board-app.ts. Board reads data model fields (rootId, cursor, foldDepths)
 * from store and derives view concerns (columns, cursor position) via hooks.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Box,
  Text,
  Small,
  useApp,
  useRuntime,
  ErrorBoundary,
  HorizontalVirtualList,
  useContentRect,
  setWindowTitle,
  useFocusManager,
  Link,
  type PatchedConsole,
} from "@silvery/ag-react"
import { useApp as useAppStore, StoreContext } from "@silvery/create/create-app"
import { ReactiveNodeStore, ReactiveNodeStoreProvider, useNodeStore } from "../state/reactive.ts"
import { usePaneSignals, useSignal } from "../hooks/use-signal.ts"
import type { ViewMode } from "../types.ts"
import type { KNode } from "@km/core"
import { useRepo } from "../repo-context.tsx"
import { ServicesProvider, useToastQueue, useJobRunner, useUndoHandle } from "../services-context.tsx"
import { formatFilterIndicator } from "./FilterDialog.tsx"
import { Column } from "./CardColumn.tsx"
import { VerticalScrollIndicator } from "./VerticalScrollIndicator.tsx"
import { ColumnsView } from "./ColumnsView.tsx"
import { ListView } from "./ListView.tsx"
import { TabsView } from "./TabsView.tsx"
import { DetailView } from "./DetailView.tsx"
import { renderPath } from "../layout/index.ts"
import type { GridNavigator } from "@km/board"
import type { PaneUI, FilterProperties } from "../state/ui-reducer.ts"
import { hasActivePropertyFilters } from "../state/ui-reducer.ts"
import { ConstraintRoot } from "../layout/index.ts"
import { createLogger } from "loggily"
import { ensureCommandSystemInitialized } from "../board/command-bridge.ts"
import { buildNodeIndexFromTree, deriveCursorIndices, deriveDetailColumns } from "../hooks/use-columns.ts"
import { CursorDepth } from "../state/cursor-depth.ts"
import { Workspace, type BoardAppStore } from "../state/board-app-store.ts"
import { hasDetailPaneFor } from "../board/board-types.ts"
import { usePaneId, usePaneLabel } from "../pane-context.tsx"
import { useComponentTiming } from "../hooks/use-component-timing.ts"

const _log = createLogger("km:tui:board")

// Extracted modules
import { TOP_BAR_HEIGHT, BOTTOM_BAR_HEIGHT, COLLAPSED_COL_WIDTH, computeColumnWidths } from "./board-layout.ts"
import { Tree } from "@km/tree"
import {
  usePaneUI,
  TreeRenderProvider,
  deriveTreeConfig,
  findBoardRootId,
  type TreeConfig,
} from "../state/ui-context.tsx"
import { getPathSegments } from "./board-top-bar.ts"
import type { PathSegment } from "../layout/path.ts"
import { WorkspaceView } from "./WorkspaceView.tsx"
import { PaneIdProvider } from "../pane-context.tsx"
import { WorkspaceChrome, WorkspaceBottomBar } from "./WorkspaceChrome.tsx"
import { PopoverProvider } from "./Popover.tsx"
import { useLinkOpen } from "../hooks/use-link-open.ts"
import { PaneBar } from "./PaneBar.tsx"
import {
  createFileDropHandler,
  createWatcherStatusHandler,
  createBackgroundParseHandler,
  createErrorWarningHandler,
  createSyncEventCollector,
} from "./board-effects.ts"
import type { ToastQueue } from "@km/core"
import { getStatusForMarker } from "@km/core"
import { getOwnColor } from "../board/board-pills.ts"
import { getBoardColorByName, normalizeBoardName } from "../text/index.ts"
import { getNodeDisplayName } from "../state.ts"
import { findMatchingNodeIds } from "../board/board-actions-find.ts"
import { searchReplaceMatchingNodeIds } from "../board/board-actions-search-replace.ts"
import { navigateToNode } from "../navigation/navigate-to-node.ts"
import { saveNavHistoryFromPane } from "../keyboard/keyboard-helpers.ts"
import { parseKmUrl, resolveKmLink } from "../internal-link.ts"

// =============================================================================
// BoardCore - Pure Rendering (No Hooks)
// =============================================================================

/**
 * Per-column filter overlay — carries Board-level text/property filter state
 * that isn't in the lens. Card components use this to render only the filtered
 * subset and to display the "+N filtered" footer.
 */
export interface ColumnFilterState {
  /** Card IDs that survive the filter (in order) */
  filteredCardIds: readonly string[]
  /** Total card count before filtering (for "+N filtered" footer math) */
  totalCardCount: number
  /** Descendant nodes hidden inside surviving cards (property filters) */
  hiddenDescendantCount?: number
}

/** Layout indices derived from cursor position */
export interface BoardCoreProps {
  /** Root node ID */
  rootId: string | null
  /** Column node ids in render order (post-lens, post-filter) */
  columnIds: readonly string[]
  /**
   * Per-column filter overlay. Empty map = no active filters; Card/Column
   * components fall back to the lens children. Keyed by column nodeId.
   */
  columnFilters: ReadonlyMap<string, ColumnFilterState>
  /** Current column index (derived from cursor) */
  colIndex: number
  /** Current card index (derived from cursor) */
  cardIndex: number
  /** UI state (dialogs, view mode, etc.) */
  ui: PaneUI
  /** Derived selection level from cursor depth */
  cursorDepth: "board" | "column" | "card"
  /** Terminal dimensions */
  dimensions: { columns: number; rows: number }
  /** Collapsed nodes (node IDs) */
  collapsedNodes: Set<string>
  /** Whether detail pane is open (for error boundary reset key) */
  hasDetailPane: boolean
}

// =============================================================================
// Progressive Column Reveal
// =============================================================================

/**
 * Lightweight skeleton for a single column — shows the real column header name
 * with placeholder cards below. Shown for columns not yet revealed.
 */
/**
 * TopBar - subscribes to cursor position for path display.
 * Extracted from BoardCore so BoardCore doesn't re-render on j/k.
 * Also shows compact filter indicator in the right side when filters are active.
 */
/** Long ─ fill for combined pane/top bar (truncated to fit) */

/** Shared top bar props */
interface TopBarProps {
  rootId: string | null
  termWidth: number
  filterProperties: FilterProperties
  filterText: string
  isBoardSelected: boolean
  viewMode?: string
  maxContentLines: number
}

/**
 * Clickable breadcrumb path. Each segment with an id is a Link that zooms to that node.
 * Uses color="inherit" so Link picks up parent color (works on both dark and yellow bars).
 * Preserves old styling: board root bold, others dimmed, separators dimmed.
 */
function TopBarBreadcrumb({
  segments,
  boardColor,
}: {
  segments: PathSegment[]
  boardColor?: string
}): React.ReactElement {
  const firstWithinBoardIdx = segments.findIndex((s) => s.isWithinBoard)
  const boardRootIdx =
    firstWithinBoardIdx > 0 ? firstWithinBoardIdx - 1 : firstWithinBoardIdx === -1 ? segments.length - 1 : 0

  return (
    <>
      {boardColor ? (
        <Text>
          {" "}
          <Text color={boardColor} dimColor>
            {"●"}
          </Text>{" "}
        </Text>
      ) : (
        " "
      )}
      {segments.map((seg, i) => {
        const isBoardRoot = i === boardRootIdx
        const sepEl = seg.sep ? (
          <Text key={`sep-${i}`} dimColor>
            {" "}
            {seg.sep}{" "}
          </Text>
        ) : null
        const nameEl = seg.id ? (
          <Link
            key={`seg-${i}`}
            href={`km://zoom/${seg.id}`}
            variant="arm-on-hover"
            color="inherit"
            bold={isBoardRoot}
            dimColor={!isBoardRoot}
            underline={false}
          >
            {seg.name}
          </Link>
        ) : (
          <Text key={`seg-${i}`} bold={isBoardRoot} dimColor={!isBoardRoot}>
            {seg.name}
          </Text>
        )
        return (
          <React.Fragment key={i}>
            {sepEl}
            {nameEl}
          </React.Fragment>
        )
      })}
    </>
  )
}

/**
 * PaneBoardTopBar — multi-pane board top bar.
 *
 * Renders: path > segments          CARDS VIEW  [F] filter  [1]
 * Separated into its own component so useAppStore is only called in multi-pane mode
 * (avoids "useApp must be used within createApp" errors in test setups without store context).
 *
 * Left: path segments. Right: view mode, filter indicator, [N] pane label.
 * Dimmed when pane is not focused.
 */
function PaneBoardTopBar({
  paneLabel,
  isBoardSelected,
  boardColor,
  viewMode,
  maxContentLines,
  filterIndicator,
  selectedPathSegments,
}: {
  paneLabel: string
  isBoardSelected: boolean
  boardColor: string | undefined
  viewMode?: string
  maxContentLines: number
  filterIndicator: string | undefined
  selectedPathSegments: PathSegment[]
}): React.ReactElement {
  const paneId = usePaneId()
  const { activeScopeId } = useFocusManager()
  const isPaneFocused = activeScopeId === null || activeScopeId === paneId

  return (
    <PaneBar
      isFocused={isPaneFocused}
      backgroundColor={isBoardSelected ? "$selection-bg" : undefined}
      paneLabel={paneLabel}
      left={
        <Text color={isBoardSelected ? "$selection" : undefined} wrap="truncate">
          <TopBarBreadcrumb segments={selectedPathSegments} boardColor={boardColor} />
        </Text>
      }
      right={
        <>
          <Text color={isBoardSelected ? "$selection" : undefined} id="view-mode">
            {" "}
            {(viewMode?.toUpperCase() ?? "CARDS") + " VIEW"}{" "}
            {viewMode === "cards" && <Text dimColor>CL:{maxContentLines} </Text>}
          </Text>
          {filterIndicator && (
            <Text color={isBoardSelected ? "$selection" : undefined} id="filter-indicator">
              {" [F] "}
              {filterIndicator}
            </Text>
          )}
        </>
      }
    />
  )
}

function BoardTopBar({
  rootId,
  termWidth,
  filterProperties,
  filterText,
  isBoardSelected,
  viewMode,
  maxContentLines,
}: TopBarProps): React.ReactElement {
  const repo = useRepo()
  const nodeStore = useNodeStore()
  const cursorCardNodeId = useSignal(nodeStore.cursorCardNodeId)
  const cursorColumnNodeId = useSignal(nodeStore.cursorColumnNodeId)
  const cursorDepth = useSignal(nodeStore.cursorDepth)
  const paneLabel = usePaneLabel()

  const pathNodeId =
    cursorDepth === "board" || !cursorColumnNodeId
      ? rootId
      : cursorDepth === "column" || !cursorCardNodeId
        ? cursorColumnNodeId
        : cursorCardNodeId
  // Let silvery's wrap="truncate" handle display width; only use renderPath for smart segment elision on very long paths
  const filterIndicator = formatFilterIndicator(filterProperties, filterText) ?? undefined
  const reservedWidth = filterIndicator ? filterIndicator.length + 6 : 0
  const selectedPathSegments = renderPath(getPathSegments(repo, pathNodeId, rootId), termWidth - 4 - reservedWidth)

  const rootNode = rootId ? repo.getNode(rootId) : null
  const boardColor = rootNode
    ? (getOwnColor(rootNode) ?? getBoardColorByName(normalizeBoardName(getNodeDisplayName(repo, rootNode))))
    : undefined

  // Multi-pane mode: delegate to PaneBoardTopBar (separate component for store access)
  if (paneLabel) {
    return (
      <PaneBoardTopBar
        paneLabel={paneLabel}
        isBoardSelected={isBoardSelected}
        boardColor={boardColor}
        viewMode={viewMode}
        maxContentLines={maxContentLines}
        filterIndicator={filterIndicator}
        selectedPathSegments={selectedPathSegments}
      />
    )
  }

  // Single-pane mode: standard top bar with PaneBar
  return (
    <PaneBar
      isFocused={true}
      backgroundColor={isBoardSelected ? "$selection-bg" : undefined}
      left={
        <Text color={isBoardSelected ? "$selection" : undefined} wrap="truncate">
          <TopBarBreadcrumb segments={selectedPathSegments} boardColor={boardColor} />
        </Text>
      }
      right={
        <>
          <Text color={isBoardSelected ? "$selection" : undefined} dimColor={!isBoardSelected} id="view-mode">
            {" "}
            {(viewMode?.toUpperCase() ?? "CARDS") + " VIEW"}{" "}
            {viewMode === "cards" && <Text dimColor>CL:{maxContentLines} </Text>}
          </Text>
          {filterIndicator && (
            <Text color={isBoardSelected ? "$selection" : undefined} id="filter-indicator">
              {" [F] "}
              {filterIndicator}
            </Text>
          )}
        </>
      }
    />
  )
}

/**
 * Pure rendering component - NO cursor subscription.
 * Uses cursorDepth prop (stable on j/k).
 * TopBar, DetailPane, and NewItemDialog subscribe independently.
 */
// oxlint-disable-next-line complexity/complexity -- React component — JSX conditionals inflate score
export function BoardCore({
  rootId,
  columnIds,
  columnFilters,
  colIndex,
  cardIndex,
  ui,
  cursorDepth,
  dimensions,
  collapsedNodes,
  hasDetailPane,
}: BoardCoreProps): React.ReactElement {
  useComponentTiming(`BoardCore (${columnIds.length} columns)`)

  // Use actual pane dimensions from parent container (critical for multi-pane splits).
  // Falls back to store dimensions on first render when contentRect is still zero.
  const parentRect = useContentRect()
  const termWidth = parentRect.width > 0 ? parentRect.width : dimensions.columns
  const termHeight = parentRect.height > 0 ? parentRect.height : dimensions.rows

  const isBoardSelected = cursorDepth === "board"
  const paneLabel = usePaneLabel()

  // Calculate content area height - space between top bar and bottom of pane.
  // Bottom bar, sync pane, toasts, and dialogs are now rendered at workspace level.
  const topBarHeight = paneLabel ? 1 : TOP_BAR_HEIGHT
  const contentHeight = termHeight - topBarHeight - BOTTOM_BAR_HEIGHT

  // ErrorBoundary resetKey — changes when board navigation state changes.
  // This ensures ErrorBoundaries auto-recover after transient render errors
  // (e.g., during zoom transitions or detail pane open/close).
  // Includes rootId (zoom), viewMode, detailPane, colIndex (h/l nav),
  // and column count (structural changes) to maximize recovery opportunities.
  const errorBoundaryResetKey = `${rootId ?? "null"}-${ui.viewMode}-${hasDetailPane}-${colIndex}-${columnIds.length}`

  // Silent error handler — ErrorBoundary resetKey auto-recovers on next state change (km-tui.error-loading-cards)
  const handleRenderError = useCallback((_error: Error, _errorInfo: React.ErrorInfo) => {
    // Intentionally silent: logging here triggers console output which fails tests.
    // The resetKey mechanism auto-recovers, and DEBUG_LOG captures errors via React's own logging.
  }, [])

  // Column width calculation — distribute viewport evenly across expanded columns.
  // Subtract 2 for the always-rendered overflow indicators (1 char each side).
  // The remainder (from integer division) is distributed +1 to the first N expanded
  // columns so that column widths sum exactly to the viewport (no trailing gap).
  const COLLAPSED_WIDTH = COLLAPSED_COL_WIDTH
  const INDICATOR_RESERVED = 2
  const { expandedWidth, remainder } = computeColumnWidths(termWidth - INDICATOR_RESERVED, columnIds, collapsedNodes)

  // Build per-column width lookup: first `remainder` expanded columns get +1
  const columnWidths = useMemo(() => {
    const widths: number[] = []
    let bonusLeft = remainder
    for (const id of columnIds) {
      if (collapsedNodes.has(id)) {
        widths.push(COLLAPSED_WIDTH)
      } else {
        widths.push(expandedWidth + (bonusLeft > 0 ? 1 : 0))
        if (bonusLeft > 0) bonusLeft--
      }
    }
    return widths
  }, [columnIds, collapsedNodes, expandedWidth, remainder])

  // HorizontalVirtualList expects a mutable array; stabilize via useMemo
  const columnIdsArr = useMemo(() => [...columnIds], [columnIds])

  return (
    <ConstraintRoot>
      <Box
        id={rootId ?? undefined}
        data-view="board"
        data-board={true}
        data-col-index={colIndex}
        data-card-index={cardIndex}
        {...(isBoardSelected && { "data-cursor": true })}
        flexDirection="column"
        flexGrow={1}
        height={termHeight}
        minHeight={3}
        overflow="hidden"
        {...(ui.bellState && { "data-bell-flash": true })}
      >
        {/* Top bar — subscribes to cursor position independently */}
        <BoardTopBar
          rootId={rootId}
          termWidth={termWidth}
          filterProperties={ui.filterProperties}
          filterText={ui.filterText}
          isBoardSelected={isBoardSelected}
          viewMode={ui.viewMode}
          maxContentLines={ui.maxContentLines}
        />
        {/* Spacer below top bar */}
        <Box height={1} flexShrink={0} />
        <Box flexGrow={1} flexDirection="row" minHeight={1} maxHeight={contentHeight} overflow="hidden">
          {/* Board area — focusable container for all card/column/list views */}
          <Box focusable autoFocus testID="board-area" flexGrow={1} flexDirection="column">
            {/* Cards, Columns, List, Detail, or Tabs view */}
            {ui.viewMode === "detail" ? (
              <ErrorBoundary
                fallback={<Text color={"$error"}>Error loading detail view</Text>}
                resetKey={errorBoundaryResetKey}
                onError={handleRenderError}
              >
                <DetailView rootId={rootId} width={termWidth} height={contentHeight} />
              </ErrorBoundary>
            ) : ui.viewMode === "cards" ? (
              <ErrorBoundary
                fallback={<Text color={"$error"}>Error loading cards view</Text>}
                resetKey={errorBoundaryResetKey}
                onError={handleRenderError}
              >
                {columnIds.length === 0 ? (
                  <Box flexDirection="column" padding={1} width={termWidth} height={contentHeight}>
                    <Small>Empty board</Small>
                  </Box>
                ) : (
                  <HorizontalVirtualList
                    key={rootId ?? "root"}
                    items={columnIdsArr}
                    width={termWidth}
                    height={contentHeight}
                    itemWidth={(_id: string, index: number) => columnWidths[index] ?? expandedWidth}
                    scrollTo={isBoardSelected ? undefined : colIndex}
                    renderItem={(id, index) => {
                      const colWidth = columnWidths[index] ?? expandedWidth
                      const filter = columnFilters.get(id)
                      return (
                        <Column
                          colId={id}
                          colIndex={index}
                          isCollapsed={collapsedNodes.has(id)}
                          width={colWidth}
                          height={contentHeight}
                          filteredCardIds={filter?.filteredCardIds}
                          totalCardCount={filter?.totalCardCount}
                          hiddenDescendantCount={filter?.hiddenDescendantCount}
                        />
                      )
                    }}
                    renderOverflowIndicator={(dir, hiddenCount) => (
                      <VerticalScrollIndicator
                        direction={dir === "before" ? "left" : "right"}
                        hiddenCount={hiddenCount}
                      />
                    )}
                    overflowIndicatorWidth={1}
                    getKey={(id) => `${id}${collapsedNodes.has(id) ? "-c" : ""}`}
                  />
                )}
              </ErrorBoundary>
            ) : ui.viewMode === "columns" ? (
              <ErrorBoundary
                fallback={<Text color={"$error"}>Error loading columns view</Text>}
                resetKey={errorBoundaryResetKey}
                onError={handleRenderError}
              >
                <ColumnsView columnIds={columnIds} width={termWidth} height={contentHeight} />
              </ErrorBoundary>
            ) : ui.viewMode === "list" ? (
              <ErrorBoundary
                fallback={<Text color={"$error"}>Error loading list view</Text>}
                resetKey={errorBoundaryResetKey}
                onError={handleRenderError}
              >
                <ListView columnIds={columnIds} width={termWidth} height={contentHeight} />
              </ErrorBoundary>
            ) : (
              <ErrorBoundary
                fallback={<Text color={"$error"}>Error loading tabs view</Text>}
                resetKey={errorBoundaryResetKey}
                onError={handleRenderError}
              >
                <TabsView columnIds={columnIds} width={termWidth} height={contentHeight} />
              </ErrorBoundary>
            )}
          </Box>
        </Box>
      </Box>
    </ConstraintRoot>
  )
}

// =============================================================================
// Board - Stateful Connector (reads store, computes derived layout)
// =============================================================================

export interface BoardProps {
  /** Initial view mode (default: "cards") */
  initialViewMode?: ViewMode
  /** Terminal dimensions */
  dimensions: { columns: number; rows: number }
  /** Exit callback */
  onExit: () => void
  /** Toast queue instance (injected, not global) */
  toastQueue?: ToastQueue
  /** Optional layout registry for card position tracking (for testing) */
  navigator?: GridNavigator
  /** Patched console for debug output modal */
  patchedConsole?: PatchedConsole | null
}

/**
 * Board connector component.
 *
 * Reads ui and board nav fields from signal store via useApp() selectors,
 * computes derived layout (useColumns, useCursorPosition),
 * pushes layout back to store, renders BoardCore.
 *
 * Keys are handled by the term:key handler in board-app.ts — not here.
 */
// oxlint-disable-next-line complexity/complexity -- React connector — hooks + effects inflate score
export function Board({ patchedConsole }: BoardProps) {
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
  const nodeStore = useMemo(() => {
    const store = new ReactiveNodeStore()
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
      store.syncCursor({
        cursor,
        cursorCardNodeId,
        cursorColumnNodeId,
        cursorDepth,
      })
    }
    return store
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount
  }, [])

  // Hydrate reactive node state on initial load and root change (zoom)
  const selIds = useSignal(paneSel.node.ids) as unknown as ReadonlyArray<string>
  const selectedSet = new Set(selIds) // compat bridge for hydrate
  useEffect(() => {
    nodeStore.hydrate(repo, rootId, foldDepths, selectedSet)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- full re-hydrate only on root change
  }, [nodeStore, repo, rootId])

  // Incrementally sync fold depth changes to reactive node state
  const prevFoldDepthsRef = useRef(foldDepths)
  useEffect(() => {
    const prev = prevFoldDepthsRef.current
    if (prev !== foldDepths) {
      nodeStore.syncFoldDepths(prev, foldDepths)
      prevFoldDepthsRef.current = foldDepths
    }
  }, [nodeStore, foldDepths])

  // Incrementally sync multi-selection changes to reactive node state
  // Pass repo so descendants of selected nodes also appear visually selected
  const prevMultiSelectedRef = useRef(selectedSet)
  useEffect(() => {
    const prev = prevMultiSelectedRef.current
    if (prev !== selectedSet) {
      nodeStore.syncSelected(prev, selectedSet, repo)
      prevMultiSelectedRef.current = selectedSet
    }
  }, [nodeStore, selectedSet, repo])

  // Incrementally sync inline edit state to reactive node state
  const textEdit = useSignal(paneSel.text) as { nodeId: string; offset: number } | null
  const textEditHints = useAppStore<BoardAppStore, import("../tui-context.ts").TextEditHints | null>(
    (s) => s.textEditHints,
  )
  const editState = textEdit ? { nodeId: textEdit.nodeId as string, blockIndex: textEditHints?.blockIndex ?? 0 } : null
  const prevInlineEditRef = useRef(editState)

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
  const columnIds = useMemo((): readonly string[] => {
    if (ui.viewMode === "detail") {
      // Detail mode: virtual metadata columns need ColumnView derivation
      return deriveDetailColumns(repo, rootId, foldDepths).map((c) => c.node.id)
    }
    const lensRoot = visibleLensValue.rootId
    return lensRoot ? visibleLensValue.children(lensRoot) : []
  }, [visibleLensValue, ui.viewMode, repo, rootId, foldDepths])

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
  // Derived from the visible lens (no ColumnView dependency).
  const nodeIndex = useMemo(() => buildNodeIndexFromTree(visibleLensValue), [visibleLensValue])
  const getNode = useCallback((id: string) => repo.getNode(id), [repo])

  // Sync inline edit state. Derives cardNodeId from parent_id so callers
  // never need to pass it — if the edit node is inside a card, the card expands.
  useEffect(() => {
    const prev = prevInlineEditRef.current
    if (prev !== editState) {
      let derivedCardNodeId: string | undefined
      if (editState?.nodeId) {
        // Walk up ancestors to find the containing card via O(1) nodeIndex lookup
        for (const ancestor of Tree.ancestors(repo, editState.nodeId)) {
          const entry = nodeIndex.get(ancestor.id)
          if (entry && entry.cardIndex >= 0) {
            derivedCardNodeId = ancestor.id
            break
          }
        }
      }
      nodeStore.syncEdit(prev?.nodeId ?? null, editState?.nodeId ?? null, editState, derivedCardNodeId)
      prevInlineEditRef.current = editState
    }
  }, [nodeStore, editState, repo, nodeIndex])

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

  // Derive cursorCardNodeId and cursorColumnNodeId from layout indices via lens.
  // Uses the lens column/card lists instead of ColumnView[] for identity resolution.
  const cursorCardNodeId = useMemo(() => {
    const rootLensId = visibleLensValue.rootId
    if (!rootLensId || cursorPosition.colIndex < 0) return null
    const colIds = visibleLensValue.children(rootLensId)
    const colId = colIds[cursorPosition.colIndex]
    if (!colId || cursorPosition.cardIndex < 0) return null
    const cardIds = visibleLensValue.children(colId)
    return cardIds[cursorPosition.cardIndex] ?? null
  }, [visibleLensValue, cursorPosition.colIndex, cursorPosition.cardIndex])
  const cursorColumnNodeId = useMemo(() => {
    const rootLensId = visibleLensValue.rootId
    if (!rootLensId || cursorPosition.colIndex < 0) return null
    const colIds = visibleLensValue.children(rootLensId)
    return colIds[cursorPosition.colIndex] ?? null
  }, [visibleLensValue, cursorPosition.colIndex])

  // Sync cursor state to ReactiveNodeStore after render.
  // The initial sync happens in the useMemo above (pre-render); subsequent syncs
  // happen here via useEffect. This is safe because the store selector triggers
  // re-render, which triggers this effect, which syncs the new cursor state.
  useEffect(() => {
    nodeStore.syncCursor({
      cursor,
      cursorCardNodeId,
      cursorColumnNodeId,
      cursorDepth,
    })
  }, [nodeStore, cursor, cursorCardNodeId, cursorColumnNodeId, cursorDepth])

  // Hidden column filtering is centralized in the view lens — the computed
  // lens excludes hidden nodes at build time. When showHidden is toggled,
  // PaneSignals.hiddenNodeIds updates → computed rebuilds. No need for
  // separate column filtering here.
  const visibleColIndex = columnsLayout.colIndex

  // Per-column filter overlay — BoardCore forwards this to the Column components
  // so they can render only the filtered subset and show the "+N filtered" footer.
  // Apply text + property filters using tree card IDs (no ColumnView dependency).
  const columnFilters = useMemo(() => {
    const map = new Map<string, ColumnFilterState>()
    const hasTextFilter = !!ui.filterText
    const hasPropertyFilter = hasActivePropertyFilters(ui.filterProperties)
    if (!hasTextFilter && !hasPropertyFilter) return map
    const lowerFilter = hasTextFilter ? ui.filterText.toLowerCase() : ""
    for (const colId of columnIds) {
      const cardIds = visibleLensValue.children(colId)
      const filteredCardIds = [...cardIds].filter((cardId) => {
        const card = repo.getNode(cardId)
        if (!card) return false
        // For embeds, resolve to source node for filtering
        const embedSource = card.symlink_to
        const filterNode = embedSource ? (repo.getNode(embedSource) ?? card) : card
        // Text filter: match card content (use source node content for embeds)
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
        totalCardCount: cardIds.length,
        hiddenDescendantCount: hiddenDescendantCount > 0 ? hiddenDescendantCount : undefined,
      })
    }
    return map
  }, [columnIds, visibleLensValue, ui.filterText, ui.filterProperties, repo])

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

  // Initialize command system
  useEffect(() => {
    ensureCommandSystemInitialized()
  }, [])

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

  // Subscribe to external events
  useEffect(() => createFileDropHandler(setUI), [setUI])
  useEffect(() => createWatcherStatusHandler(setUI, toastQueue), [setUI, toastQueue])
  useEffect(() => createBackgroundParseHandler(setUI), [setUI])
  useEffect(() => createErrorWarningHandler(toastQueue), [toastQueue])
  useEffect(() => createSyncEventCollector(setUI), [setUI])

  // NO useInput — keys handled by term:key in board-app.ts

  // Card inner width for line-aware title truncation.
  // Uses actual pane width (from useContentRect) to match BoardCore's layout.
  const paneRect = useContentRect()
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

  return (
    <ReactiveNodeStoreProvider value={nodeStore}>
      <TreeRenderProvider
        treeConfig={treeConfig}
        setUI={setUI}
        sel={sel}
        rootBoardId={findBoardRootId(repo, rootId)}
        searchMatchNodeIds={searchMatchNodeIds}
        currentMatchNodeId={currentMatchNodeId}
        searchQuery={ui.localSearch?.query ?? null}
        jobRunner={jobRunner}
        undoHandle={undoHandle}
        taskStatusFilter={taskStatusFilter}
        boardFocused={boardFocused}
      >
        <BoardCore
          rootId={rootId}
          columnIds={boardColumnIds}
          columnFilters={columnFilters}
          colIndex={visibleColIndex}
          cardIndex={columnsLayout.cardIndex}
          ui={ui}
          cursorDepth={cursorDepth}
          dimensions={ui.dimensions}
          collapsedNodes={collapsedNodes}
          hasDetailPane={hasDetailPane}
        />
      </TreeRenderProvider>
    </ReactiveNodeStoreProvider>
  )
}

// =============================================================================
// BoardApp - Production Entry (used by tui.tsx)
// =============================================================================

export interface BoardAppProps {
  /** Initial view mode (default: "cards") */
  initialViewMode?: ViewMode
  /** Toast queue instance (injected from runBoard) */
  toastQueue?: ToastQueue
  /** Optional layout registry for card position tracking (for testing) */
  navigator?: GridNavigator
  /** Patched console for capturing console output (optional) */
  patchedConsole?: PatchedConsole | null
}

/**
 * Production entry component with external integrations.
 * Gets repo, dimensions, exit from context/hooks.
 */
export function BoardApp({ initialViewMode = "cards", toastQueue, navigator, patchedConsole }: BoardAppProps) {
  const { exit } = useApp()
  const repo = useRepo()
  const storeApi = React.useContext(StoreContext) as
    | import("../state/signal-store.ts").SignalStoreApi<BoardAppStore>
    | null

  // Handle clicks on links — opens external URLs, dispatches internal km:// links.
  // Supported schemes: km://node/{id}, km://wiki/{name}, km://block/{id}, km://zoom/{id}
  const handleInternalLink = useCallback(
    (href: string) => {
      if (!storeApi) return

      // km://zoom/{id} — always zoom to node (used by breadcrumb segments)
      if (href.startsWith("km://zoom/")) {
        const targetId = href.slice("km://zoom/".length)
        if (!targetId) return
        const state = storeApi.getState()
        const boardPane = Workspace.getActiveBoardPane(state)
        if (boardPane) saveNavHistoryFromPane(state.setUI, boardPane)
        state.dispatchBoard({ type: "ZOOM_IN", nodeId: targetId })
        state.sel.node.select([targetId as import("@silvery/selection").ID])
        return
      }

      const parsed = parseKmUrl(href)
      if (!parsed) return
      const targetId = resolveKmLink(parsed, repo)
      if (!targetId) return

      // Read current state imperatively (event handler, not render)
      const state = storeApi.getState()
      const boardPane = Workspace.getActiveBoardPane(state)
      const rootId = boardPane?.rootId ?? null

      // In detail view: clicking a link zooms the detail view to that node
      if (boardPane?.viewMode === "detail") {
        if (boardPane) saveNavHistoryFromPane(state.setUI, boardPane)
        state.dispatchBoard({ type: "ZOOM_IN", nodeId: targetId })
        state.sel.node.select([targetId as import("@silvery/selection").ID])
        return
      }

      const nav = navigateToNode(targetId, rootId, repo)
      if (!nav) return

      // Save nav history before navigating (enables { / } back/forward)
      if (boardPane) {
        saveNavHistoryFromPane(state.setUI, boardPane)
      }

      if (nav.action === "SELECT") {
        state.sel.node.select([nav.cursorTarget as import("@silvery/selection").ID])
      } else if (nav.action === "DETAIL_VIEW" && nav.zoomTarget) {
        state.dispatchBoard({ type: "ZOOM_IN", nodeId: nav.zoomTarget })
        if (nav.cursorTarget) state.sel.node.select([nav.cursorTarget as import("@silvery/selection").ID])
        state.openDetailPane()
      } else if (nav.zoomTarget) {
        state.dispatchBoard({ type: "ZOOM_IN", nodeId: nav.zoomTarget })
        if (nav.cursorTarget) state.sel.node.select([nav.cursorTarget as import("@silvery/selection").ID])
      }
    },
    [repo, storeApi],
  )
  useLinkOpen(handleInternalLink)

  const storeDimensions = useAppStore<BoardAppStore, { columns: number; rows: number }>((s) => s.ui.dimensions)
  const workspace = useAppStore<BoardAppStore, BoardAppStore["workspace"]>((s) => s.workspace)
  const focusPaneById = useAppStore<BoardAppStore, (id: string) => void>((s) => s.focusPaneById)
  const storeToastQueue = useAppStore<BoardAppStore, import("@km/core").ToastQueue>((s) => s.toastQueue)
  const jobRunner = useAppStore<BoardAppStore, import("@km/core").JobRunner>((s) => s.jobRunner)
  const undoHandle = useAppStore<BoardAppStore, import("../undo/undoable-repo.ts").UndoableRepoHandle>(
    (s) => s.undoHandle,
  )
  const servicesProviderToastQueue = toastQueue ?? storeToastQueue

  // Resize is handled via "term:resize" event in board-app.ts → store.setDimensions().
  // createApp provides a mock stdout to StdoutContext, so stdout.on("resize") is a no-op.

  // Console stats via direct subscription (workspace-level, shared across panes)
  const [consoleStats, setConsoleStats] = useState<{ total: number; errors: number; warnings: number } | undefined>()
  useEffect(() => {
    if (!patchedConsole) return
    const initial = patchedConsole.getStats()
    let prevTotal = initial.total
    if (initial.total > 0) setConsoleStats(initial)
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const unsub = patchedConsole.subscribe(() => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        debounceTimer = null
        const stats = patchedConsole.getStats()
        if (stats.total === prevTotal) return
        prevTotal = stats.total
        setConsoleStats(stats)
      }, 200)
    })
    return () => {
      unsub()
      if (debounceTimer) clearTimeout(debounceTimer)
    }
  }, [patchedConsole])

  const renderPane = useCallback(
    (paneId: string) => (
      <PaneIdProvider value={paneId}>
        <Board
          initialViewMode={initialViewMode}
          dimensions={storeDimensions}
          onExit={exit}
          toastQueue={toastQueue}
          navigator={navigator}
          patchedConsole={patchedConsole}
        />
      </PaneIdProvider>
    ),
    [initialViewMode, storeDimensions, exit, toastQueue, navigator, patchedConsole],
  )

  // Workspace chrome (bottom bar, dialogs, toasts) rendered once for entire terminal
  const chrome = (
    <WorkspaceChrome
      termWidth={storeDimensions.columns}
      termHeight={storeDimensions.rows}
      consoleStats={consoleStats}
      toastQueue={toastQueue}
    />
  )

  const bottomBar = <WorkspaceBottomBar consoleStats={consoleStats} />

  // Single pane (common case) — render Board directly, no wrapper overhead
  if (workspace.panes.size <= 1) {
    return (
      <ServicesProvider toastQueue={servicesProviderToastQueue} jobRunner={jobRunner} undoHandle={undoHandle}>
        <PopoverProvider>
          <Box flexDirection="column" height={storeDimensions.rows}>
            {renderPane("main")}
            {bottomBar}
            {chrome}
          </Box>
        </PopoverProvider>
      </ServicesProvider>
    )
  }

  // Multiple panes — use WorkspaceView for split layout
  return (
    <ServicesProvider toastQueue={servicesProviderToastQueue} jobRunner={jobRunner} undoHandle={undoHandle}>
      <PopoverProvider>
        <Box flexDirection="column" width={storeDimensions.columns} height={storeDimensions.rows}>
          <WorkspaceView
            layout={workspace.layout}
            panes={workspace.panes}
            focusedPaneId={workspace.focusedPaneId}
            renderPane={renderPane}
            onPaneClick={focusPaneById}
          />
          {bottomBar}
          {chrome}
        </Box>
      </PopoverProvider>
    </ServicesProvider>
  )
}

// =============================================================================
// Property Filter Matching
// =============================================================================

/** Check if a node matches all active property filters (AND logic between categories) */
// oxlint-disable-next-line complexity/complexity -- multi-category filter matching with early returns
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
    const embedSource = child.symlink_to
    const filterNode = embedSource ? (repo.getNode(embedSource) ?? child) : child
    if (!matchesPropertyFilters(filterNode, filters)) {
      count++
    } else {
      // Recurse into children that survived the filter
      count += countHiddenDescendants(repo, child.id, filters)
    }
  }
  return count
}

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
