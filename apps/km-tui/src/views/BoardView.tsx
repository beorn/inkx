/**
 * BoardView — Pure render layer for the board.
 *
 * Split from Board.tsx as part of the tree v4 detail-unify effort:
 *   - BoardView.tsx          → JSX only (TopBar helpers + BoardCore render + provider wrapper)
 *   - useBoardController.ts  → all lifecycle effects, signal subscriptions, derived state
 *   - Board.tsx              → thin connector: useBoardController() → BoardView
 *
 * This file contains NO useEffect. Only render-layer memoization and JSX.
 *
 * Exports:
 *   - ColumnFilterState, BoardCoreProps — types used by tests/storybook
 *   - BoardCore                         — pure rendering component (used by testing.ts + screenshot.ts)
 *   - BoardView                         — render wrapper that adds NodeStoreProvider + TreeRenderProvider
 *     around BoardCore, taking provider props from the controller hook.
 */
import React, { useCallback, useMemo } from "react"
import {
  Box,
  Text,
  Small,
  ErrorBoundary,
  HorizontalVirtualList,
  useBoxRect,
  useFocusManager,
  Link,
  useTheme,
} from "@silvery/ag-react"
import { selectedBg } from "../theme.ts"
import { NodeStoreProvider, useNodeStore, type NodeStore } from "../state/reactive.ts"
import { useSignal } from "../hooks/use-signal.ts"
import { useRepo } from "../repo-context.tsx"
import { formatFilterIndicator } from "./FilterDialog.tsx"
import { Column } from "./CardColumn.tsx"
import { VerticalScrollIndicator } from "./VerticalScrollIndicator.tsx"
import { ColumnsView } from "./ColumnsView.tsx"
import { ListView } from "./ListView.tsx"
import { TabsView } from "./TabsView.tsx"
import { DetailView } from "./DetailView.tsx"
import { renderPath } from "../layout/index.ts"
import type { PaneUI, FilterProperties } from "../state/ui-reducer.ts"
import { ConstraintRoot } from "../layout/index.ts"
import { TOP_BAR_HEIGHT, BOTTOM_BAR_HEIGHT, COLLAPSED_COL_WIDTH, computeColumnWidths } from "./board-layout.ts"
import { TreeRenderProvider, type TreeConfig } from "../state/ui-context.tsx"
import { PopoverProvider } from "./Popover.tsx"
import { getPathSegments } from "./board-top-bar.ts"
import type { PathSegment } from "../layout/path.ts"
import { usePaneId, usePaneLabel } from "../pane-context.tsx"
import { PaneBar } from "./PaneBar.tsx"
import { getOwnColor } from "../board/board-pills.ts"
import { getBoardColorByName, normalizeBoardName } from "../text/index.ts"
import { getNodeDisplayName } from "../state.ts"
import { useComponentTiming } from "../hooks/use-component-timing.ts"
import type { JobRunner } from "@km/core"
import type { UndoableRepoHandle } from "../undo/undoable-repo.ts"
import type { SelectionStore } from "@silvery/selection"
import type { BoardAppStore } from "../state/board-app-store.ts"

// =============================================================================
// Types (shared with tests/storybook/testing.ts)
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
  /** Current cursor node ID (null = deselected, rootId = at board level) */
  cursor: string | null
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
// TopBar helpers
// =============================================================================

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
      backgroundColor={isBoardSelected ? "$selectionbg" : undefined}
      paneLabel={paneLabel}
      left={
        <Text color={isBoardSelected ? "$selection" : undefined} wrap="truncate">
          <TopBarBreadcrumb segments={selectedPathSegments} boardColor={boardColor} />
        </Text>
      }
      right={
        <>
          <Box data-view="view-mode-button">
            <Text color={isBoardSelected ? "$selection" : undefined} id="view-mode">
              {" "}
              {(viewMode?.toUpperCase() ?? "CARDS") + " VIEW"}{" "}
              {viewMode === "cards" && <Text dimColor>CL:{maxContentLines} </Text>}
            </Text>
          </Box>
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

  // Derive the node whose path is shown in the breadcrumb. Virtual nodes
  // (__body__*, __meta__*) don't exist in the repo, so fall back to their
  // real parent (rootId for body columns, the card for meta items).
  const rawPathNodeId =
    cursorDepth === "board" || !cursorColumnNodeId
      ? rootId
      : cursorDepth === "column" || !cursorCardNodeId
        ? cursorColumnNodeId
        : cursorCardNodeId
  const pathNodeId =
    rawPathNodeId && (rawPathNodeId.startsWith("__body__") || rawPathNodeId.startsWith("__meta__"))
      ? rootId
      : rawPathNodeId
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
      backgroundColor={isBoardSelected ? "$selectionbg" : undefined}
      left={
        <Text color={isBoardSelected ? "$selection" : undefined} wrap="truncate">
          <TopBarBreadcrumb segments={selectedPathSegments} boardColor={boardColor} />
        </Text>
      }
      right={
        <>
          <Box data-view="view-mode-button">
            <Text color={isBoardSelected ? "$selection" : undefined} dimColor={!isBoardSelected} id="view-mode">
              {" "}
              {(viewMode?.toUpperCase() ?? "CARDS") + " VIEW"}{" "}
              {viewMode === "cards" && <Text dimColor>CL:{maxContentLines} </Text>}
            </Text>
          </Box>
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

// =============================================================================
// BoardCore — pure rendering component (no lifecycle hooks)
// =============================================================================

/**
 * Pure rendering component - NO cursor subscription.
 * Uses cursorDepth prop (stable on j/k).
 * TopBar, DetailPane, and NewItemDialog subscribe independently.
 */
// oxlint-disable-next-line complexity/complexity -- React component — JSX conditionals inflate score
export function BoardCore({
  rootId,
  cursor,
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
  // Falls back to store dimensions on first render when boxRect is still zero.
  const parentRect = useBoxRect()
  const termWidth = parentRect.width > 0 ? parentRect.width : dimensions.columns
  const termHeight = parentRect.height > 0 ? parentRect.height : dimensions.rows

  // "Board level selected" means cursor is *intentionally* at the board
  // root (via navigate-up), NOT "cursor is null because user deselected".
  // cursorDepth collapses both cases to "board"; we distinguish here so
  // clicking empty space produces no board tint while walk-up nav still does.
  const isBoardSelected = cursorDepth === "board" && cursor === rootId
  const paneLabel = usePaneLabel()

  // Board selection: subtle primary bg tint at board level.
  const boardTheme = useTheme()
  const boardBg = isBoardSelected ? selectedBg(boardTheme) : undefined

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
        backgroundColor={boardBg}
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
                <ColumnsView
                  columnIds={columnIds}
                  width={termWidth}
                  height={contentHeight}
                  columnFilters={columnFilters}
                />
              </ErrorBoundary>
            ) : ui.viewMode === "list" ? (
              <ErrorBoundary
                fallback={<Text color={"$error"}>Error loading list view</Text>}
                resetKey={errorBoundaryResetKey}
                onError={handleRenderError}
              >
                <ListView
                  columnIds={columnIds}
                  width={termWidth}
                  height={contentHeight}
                  columnFilters={columnFilters}
                />
              </ErrorBoundary>
            ) : (
              <ErrorBoundary
                fallback={<Text color={"$error"}>Error loading tabs view</Text>}
                resetKey={errorBoundaryResetKey}
                onError={handleRenderError}
              >
                <TabsView
                  columnIds={columnIds}
                  width={termWidth}
                  height={contentHeight}
                  columnFilters={columnFilters}
                />
              </ErrorBoundary>
            )}
          </Box>
        </Box>
      </Box>
    </ConstraintRoot>
  )
}

// =============================================================================
// BoardView — render wrapper (providers + BoardCore)
// =============================================================================

/**
 * Props for BoardView. Produced by useBoardController in Board.tsx.
 *
 * The controller hook consolidates all lifecycle state (effects, signals, derived
 * data) into this single prop bag. BoardView is pure render: given these props
 * it knows exactly what to display.
 */
export interface BoardViewProps extends BoardCoreProps {
  /** NodeStore instance for the NodeStoreProvider — per-pane scope */
  nodeStore: NodeStore
  /** Tree rendering config for the TreeRenderProvider */
  treeConfig: TreeConfig
  /** Global setUI fn from the app store */
  setUI: BoardAppStore["setUI"]
  /** Pane selection handle */
  sel: SelectionStore
  /** Board root id for inherited styling lookups in TreeNode */
  rootBoardId: string | null
  /** Highlighted match node ids for local search */
  searchMatchNodeIds: ReadonlySet<string> | undefined
  /** The currently-active search match (for extra highlight) */
  currentMatchNodeId: string | null
  /** Current local search query, used for match highlighting */
  searchQuery: string | null
  /** Job runner for detail-pane actions */
  jobRunner: JobRunner
  /** Undo handle for detail-pane actions */
  undoHandle: UndoableRepoHandle
  /** Task-status filter set (from ui.filterProperties.taskStatus) */
  taskStatusFilter: ReadonlySet<string>
  /** Whether this board pane owns focus */
  boardFocused: boolean
}

/**
 * BoardView — provider wrapper around BoardCore.
 *
 * Pure render: no useEffect, no signal subscriptions, no derived state.
 * Given a fully-computed prop bag from useBoardController, it wraps BoardCore
 * in NodeStoreProvider + TreeRenderProvider.
 */
export function BoardView({
  nodeStore,
  treeConfig,
  setUI,
  sel,
  rootBoardId,
  searchMatchNodeIds,
  currentMatchNodeId,
  searchQuery,
  jobRunner,
  undoHandle,
  taskStatusFilter,
  boardFocused,
  // BoardCore props
  rootId,
  cursor,
  columnIds,
  columnFilters,
  colIndex,
  cardIndex,
  ui,
  cursorDepth,
  dimensions,
  collapsedNodes,
  hasDetailPane,
}: BoardViewProps): React.ReactElement {
  // PopoverProvider is nested INSIDE the per-pane NodeStoreProvider and
  // TreeRenderProvider so that PopoverOverlay (rendered as a sibling of
  // BoardCore by PopoverProvider) is a fiber-descendant of both. This lets
  // contexts cascade naturally into popover content — no bridging needed.
  // See km-tui.popover-nodestore.
  return (
    <NodeStoreProvider value={nodeStore}>
      <TreeRenderProvider
        treeConfig={treeConfig}
        setUI={setUI}
        sel={sel}
        rootBoardId={rootBoardId}
        searchMatchNodeIds={searchMatchNodeIds}
        currentMatchNodeId={currentMatchNodeId}
        searchQuery={searchQuery}
        jobRunner={jobRunner}
        undoHandle={undoHandle}
        taskStatusFilter={taskStatusFilter}
        boardFocused={boardFocused}
      >
        <PopoverProvider>
          <BoardCore
            rootId={rootId}
            cursor={cursor}
            columnIds={columnIds}
            columnFilters={columnFilters}
            colIndex={colIndex}
            cardIndex={cardIndex}
            ui={ui}
            cursorDepth={cursorDepth}
            dimensions={dimensions}
            collapsedNodes={collapsedNodes}
            hasDetailPane={hasDetailPane}
          />
        </PopoverProvider>
      </TreeRenderProvider>
    </NodeStoreProvider>
  )
}
