/**
 * Ink-based Board TUI Component
 *
 * Architecture (L3 — createApp + Zustand):
 * 1. BoardCore - Pure rendering, no hooks (testable)
 * 2. Board - Connector: reads store via useApp(), computes derived layout, manages effects
 * 3. BoardApp - Production entry wrapper (gets dimensions/exit from context)
 *
 * State lives in the BoardAppStore (Zustand). Keys flow through term:key handler
 * in board-app.ts. Board reads data model fields (rootId, cursorNodeId, foldDepths)
 * from store and derives view concerns (columns, cursor position) via hooks.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import {
  Box,
  Text,
  useApp,
  ErrorBoundary,
  HorizontalVirtualList,
  useContentRect,
  useInterval,
  type PatchedConsole,
} from "inkx"
import { useApp as useAppStore, StoreContext } from "inkx/runtime"
import type { ColumnView, ViewMode } from "../types.ts"
import type { KNode } from "@km/core"
import { useRepo } from "../repo-context.tsx"
import { DetailPane } from "./DetailPane.tsx"
import { ProjectPicker } from "./ProjectPicker.tsx"
import { HelpOverlay } from "./HelpOverlay.tsx"
import { NewItemDialog } from "./NewItemDialog.tsx"
import { DatePromptDialog } from "./DatePromptDialog.tsx"
import { SearchDialog } from "./SearchDialog.tsx"
import { FilterDialog, formatFilterIndicator } from "./FilterDialog.tsx"
import { Omnibox } from "./Omnibox.tsx"
import { Column } from "./CardColumn.tsx"
import { VerticalScrollIndicator, ColumnSeparator } from "./VerticalScrollIndicator.tsx"
import { ColumnsView } from "./ColumnsView.tsx"
import { ConfirmDialog } from "./shared-components.tsx"
import { ListView } from "./ListView.tsx"
import { TabsView } from "./TabsView.tsx"
import { renderPath } from "../layout/index.ts"
import type { GridNavigator } from "@km/board"
import type { UIState, FilterProperties } from "../ui-reducer.ts"
import { hasActivePropertyFilters } from "../ui-reducer.ts"
import { useBoardDialogs } from "./use-board-dialogs.ts"
import { ConstraintRoot } from "../layout/index.ts"
import { createLogger } from "@beorn/logger"
import { ensureCommandSystemInitialized } from "../command-bridge.ts"
import { dispatchCommandById } from "../board-app.ts"
import { popDialogMode } from "../dialog-guard.ts"
import { useColumns, buildNodeIndex, deriveCursorIndices } from "../hooks/use-columns.ts"
import { CursorStoreProvider, useCursorNodePosition } from "../cursor-context.tsx"
import type { CursorStore } from "../cursor-store.ts"
import type { BoardAppStore } from "../board-app-store.ts"
import { usePaneId } from "../pane-context.tsx"

const log = createLogger("km:tui:board")

// Extracted modules
import {
  TOP_BAR_HEIGHT,
  BOTTOM_BAR_HEIGHT,
  FILTER_PANEL_WIDTH,
  COLLAPSED_COL_WIDTH,
  computeColumnWidths,
} from "./board-layout.ts"
import { TreeRenderProvider, deriveTreeConfig, type TreeConfig } from "../ui-context.tsx"
import { getPathSegments, renderTopBarContent } from "./board-top-bar.ts"
import { WorkspaceView } from "./WorkspaceView.tsx"
import { PaneIdProvider } from "../pane-context.tsx"
import { CommandBox } from "./CommandBox.tsx"
import { WhichKeyPopup } from "./WhichKeyPopup.tsx"
import { ToastStack } from "./ToastStack.tsx"
import { SyncPane } from "./SyncPane.tsx"
import { FindBar } from "./FindBar.tsx"
import { SearchReplaceDialog } from "./SearchReplaceDialog.tsx"
import {
  createFileDropHandler,
  createWatcherStatusHandler,
  createBackgroundParseHandler,
  createErrorWarningHandler,
  createSyncEventCollector,
} from "./board-effects.ts"
import type { ToastQueue } from "@km/core"
import { getStatusForMarker } from "@km/core"
import { getOwnColor } from "../board-pills.ts"
import { getBoardColorByName, normalizeBoardName } from "../text/index.ts"
import { getNodeDisplayName } from "../state.ts"
import { readBoardIgnored, isIgnored } from "../ignored.ts"
import { findMatchingNodeIds } from "../board/board-actions-find.ts"
import { searchReplaceMatchingNodeIds } from "../board/board-actions-search-replace.ts"

export { makeSelectionKey } from "../types.ts"

// =============================================================================
// BoardCore - Pure Rendering (No Hooks)
// =============================================================================

/** Layout indices derived from cursor position */
export interface BoardCoreProps {
  /** Root node ID */
  rootId: string | null
  /** Filesystem path to the board root (for display in bottom bar) */
  rootPath: string | null
  /** Derived columns for rendering */
  columns: ColumnView[]
  /** Current column index (derived from cursorNodeId) */
  colIndex: number
  /** Current card index (derived from cursorNodeId) */
  cardIndex: number
  /** UI state (dialogs, view mode, etc.) */
  ui: UIState
  /** Derived selection level from cursor depth */
  derivedSelectionLevel: "board" | "column" | "card"
  /** Terminal dimensions */
  dimensions: { columns: number; rows: number }
  /** Direct UI state setter */
  setUI: BoardAppStore["setUI"]
  /** Dialog handlers (types match ProjectPicker, NewItemDialog, and SearchDialog props) */
  dialogHandlers: {
    handleProjectSelect: (targetNode: KNode) => void
    handleProjectCancel: () => void
    handleNewItemCreate: (newNodeId: string) => void
    handleNewItemCancel: () => void
    handleSearchSelect: (targetNode: KNode) => void
    handleSearchCancel: () => void
    handleDatePromptConfirm: () => void
    handleDatePromptCancel: () => void
    handleOmniboxSelect: (result: import("./Omnibox.tsx").OmniboxResult) => void
    handleOmniboxCancel: () => void
  }
  /** Collapsed nodes (node IDs) */
  collapsedNodes: Set<string>
  /** Move mode active (from board state) */
  moveMode: boolean
  /** Console stats for bottom bar indicator */
  consoleStats?: { total: number; errors: number; warnings: number }
  /** Toast queue instance (injected, not global). Optional for static render tests. */
  toastQueue?: ToastQueue
  /** Board dispatch (for cursor navigation from find bar) */
  dispatchBoard?: BoardAppStore["dispatchBoard"]
  /** Fold depths — used by progressive reveal to reset on fold changes */
  foldDepths?: Map<string, number>
}

// =============================================================================
// Progressive Column Reveal
// =============================================================================

/**
 * Progressive column reveal via state-based mount chaining.
 * Returns revealedCount — columns up to that index render normally,
 * the rest show ColumnSkeleton placeholders.
 *
 * Column 0 renders on first frame. After it mounts, a useEffect fires
 * setTimeout(0) which bumps revealedCount to 2. Each subsequent column
 * gets a paint frame for its skeleton before the next real column renders.
 * This yields to the event loop between each column, preventing long blocks.
 *
 * Returns columnCount in tests (IS_REACT_ACT_ENVIRONMENT) for synchronous rendering.
 */
function useColumnReveal(
  columnCount: number,
  rootId: string | null,
  foldDepths: Map<string, number> | undefined,
): number {
  // @ts-expect-error - React internal flag set by inkx test renderer
  const isTest = globalThis.IS_REACT_ACT_ENVIRONMENT as boolean
  const [revealedCount, setRevealedCount] = useState(isTest ? columnCount : Math.min(1, columnCount))
  const prevRef = useRef<{ rootId: string | null; foldDepths: Map<string, number> | undefined }>({
    rootId,
    foldDepths,
  })

  // Reset on rootId change (zoom) or foldDepths change (fold/unfold all).
  // foldDepths uses reference identity — board-actions creates a new Map on every fold op.
  // When foldDepths is undefined (tests), only rootId triggers reset.
  if (rootId !== prevRef.current.rootId || (foldDepths !== undefined && foldDepths !== prevRef.current.foldDepths)) {
    prevRef.current = { rootId, foldDepths }
    if (!isTest && columnCount > 0 && revealedCount !== 1) {
      setRevealedCount(1)
    }
  }

  // Chain: after each column renders, reveal the next one via setTimeout(0).
  // Each column gets one event-loop tick for inkx to paint before the next mounts.
  useEffect(() => {
    if (isTest || revealedCount >= columnCount) return
    const id = setTimeout(() => setRevealedCount((c) => c + 1), 0)
    return () => clearTimeout(id)
  }, [revealedCount, columnCount, isTest])

  return isTest ? columnCount : revealedCount
}

/**
 * Lightweight skeleton for a single column — shows the real column header name
 * with placeholder cards below. Shown for columns not yet revealed.
 */
function ColumnSkeleton({
  name,
  width,
  height,
  colIndex,
}: {
  name: string
  width: number
  height: number
  colIndex: number
}): React.ReactElement {
  const [pulse, setPulse] = useState(false)
  useInterval(() => setPulse((p) => !p), 500)
  const fill = pulse ? "▒" : "░"
  const cardHeight = 3
  const headerHeight = 2
  const cardCount = Math.max(1, Math.floor((height - headerHeight) / cardHeight))
  return (
    <Box flexDirection="column" width={width} height={height}>
      <Box height={1}>
        <Text dimColor wrap="truncate">
          {name || fill.repeat(8)}
        </Text>
      </Box>
      <Text dimColor>{"─".repeat(width)}</Text>
      {Array.from({ length: cardCount }, (_, ri) => (
        <Box key={ri} borderStyle="round" borderDimColor width={width} height={cardHeight}>
          <Text dimColor wrap="truncate">
            {fill.repeat(6 + ((ri * 5 + colIndex * 7) % 12))}
          </Text>
        </Box>
      ))}
    </Box>
  )
}

/**
 * TopBar - subscribes to cursor position for path display.
 * Extracted from BoardCore so BoardCore doesn't re-render on j/k.
 * Also shows compact filter indicator in the right side when filters are active.
 */
function BoardTopBar({
  rootId,
  termWidth,
  filterProperties,
  filterText,
  isBoardSelected,
}: {
  rootId: string | null
  termWidth: number
  filterProperties: FilterProperties
  filterText: string
  isBoardSelected: boolean
}): React.ReactElement {
  const repo = useRepo()
  const cursorPos = useCursorNodePosition()
  const { cursorCardNodeId, cursorColumnNodeId, selectionLevel } = cursorPos

  const pathNodeId =
    selectionLevel === "board" || !cursorColumnNodeId
      ? rootId
      : selectionLevel === "column" || !cursorCardNodeId
        ? cursorColumnNodeId
        : cursorCardNodeId
  // Let inkx's wrap="truncate" handle display width; only use renderPath for smart segment elision on very long paths
  const filterIndicator = formatFilterIndicator(filterProperties, filterText)
  const reservedWidth = filterIndicator ? filterIndicator.length + 6 : 0
  const selectedPathSegments = renderPath(getPathSegments(repo, pathNodeId, rootId), termWidth - 4 - reservedWidth)

  const rootNode = rootId ? repo.getNode(rootId) : null
  const boardColor = rootNode
    ? (getOwnColor(rootNode) ?? getBoardColorByName(normalizeBoardName(getNodeDisplayName(repo, rootNode))))
    : undefined

  return (
    <Box id="top-bar" flexShrink={0} flexDirection="column" backgroundColor={isBoardSelected ? "yellow" : "white"}>
      <Box flexDirection="row">
        <Box flexGrow={1} overflow="hidden">
          <Text color={isBoardSelected ? "black" : "gray"} wrap="truncate">
            {renderTopBarContent(selectedPathSegments, isBoardSelected, boardColor)}
          </Text>
        </Box>
        {filterIndicator && (
          <Box flexShrink={0}>
            <Text color="cyan" id="filter-indicator">
              {" F: "}
              {filterIndicator}{" "}
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  )
}

/**
 * CursorAwareDetailPane - only subscribes to cursor position when visible.
 * Prevents BoardCore from subscribing just for detail pane cursor tracking.
 */
function CursorAwareDetailPane({ width, height }: { width: number; height: number }): React.ReactElement | null {
  const cursorPos = useCursorNodePosition()
  const detailScrollOffset = useAppStore<BoardAppStore, number>((s) => s.ui.detailScrollOffset)
  const detailCursorIndex = useAppStore<BoardAppStore, number>((s) => s.ui.detailCursorIndex)
  const setUI = useAppStore<BoardAppStore, BoardAppStore["setUI"]>((s) => s.setUI)
  const repo = useRepo()
  // Show detail for card, column, or board node (whichever cursor level)
  const nodeId = cursorPos.cursorCardNodeId ?? cursorPos.cursorColumnNodeId
  const node = nodeId ? repo.getNode(nodeId) : undefined
  // Reset scroll offset and cursor when selected node changes
  const prevNodeIdRef = React.useRef(node?.id)
  React.useEffect(() => {
    if (node?.id !== prevNodeIdRef.current) {
      prevNodeIdRef.current = node?.id
      setUI({ detailScrollOffset: 0, detailCursorIndex: 0 })
    }
  }, [node?.id, setUI])
  // Use 0 during the transitional render where node changed but effect hasn't fired yet
  const effectiveScrollOffset = node?.id !== prevNodeIdRef.current ? 0 : detailScrollOffset
  const effectiveCursorIndex = node?.id !== prevNodeIdRef.current ? 0 : detailCursorIndex
  if (!node) return null
  return (
    <DetailPane
      node={node}
      width={width}
      height={height}
      scrollOffset={effectiveScrollOffset}
      cursorIndex={effectiveCursorIndex}
    />
  )
}

/**
 * CursorAwareNewItemDialog - subscribes to cursor position for cursorNode.
 */
function CursorAwareNewItemDialog({
  onCreate,
  onCancel,
  width,
  height,
}: {
  onCreate: (newNodeId: string) => void
  onCancel: () => void
  width: number
  height: number
}): React.ReactElement {
  const cursorPos = useCursorNodePosition()
  const repo = useRepo()
  const cursorNode = cursorPos.cursorCardNodeId ? (repo.getNode(cursorPos.cursorCardNodeId) ?? null) : null
  return <NewItemDialog cursorNode={cursorNode} onCreate={onCreate} onCancel={onCancel} width={width} height={height} />
}

/**
 * Pure rendering component - NO cursor subscription.
 * Uses derivedSelectionLevel prop (stable on j/k).
 * TopBar, DetailPane, and NewItemDialog subscribe independently.
 */
// oxlint-disable-next-line complexity/complexity -- React component — JSX conditionals inflate score
export function BoardCore({
  rootId,
  rootPath,
  columns,
  colIndex,
  cardIndex,
  ui,
  derivedSelectionLevel,
  dimensions,
  setUI,
  dialogHandlers,
  collapsedNodes,
  moveMode,
  consoleStats,
  toastQueue,
  dispatchBoard,
  foldDepths: foldDepthsProp,
}: BoardCoreProps): React.ReactElement {
  const repo = useRepo()

  // Use actual pane dimensions from parent container (critical for multi-pane splits).
  // Falls back to store dimensions on first render when contentRect is still zero.
  const parentRect = useContentRect()
  const termWidth = parentRect.width > 0 ? parentRect.width : dimensions.columns
  const termHeight = parentRect.height > 0 ? parentRect.height : dimensions.rows

  const isBoardSelected = derivedSelectionLevel === "board"

  // Progressive column reveal — stagger one column per paint frame.
  // Returns how many columns to render (rest show skeletons).
  // Uses foldDepths so reveal resets on fold/unfold-all, spreading the heavy
  // re-render across frames instead of blocking for 10s.
  const revealedCount = useColumnReveal(columns.length, rootId, foldDepthsProp)

  // Calculate widths for split view
  const detailPaneWidth = ui.showDetailPane ? Math.floor(termWidth * 0.4) : 0
  const boardWidth = termWidth - detailPaneWidth

  // Calculate content area height - space between top and bottom bars
  // BOTTOM_BAR_HEIGHT = 1 (CommandBox). FindBar adds 1 row when active.
  const SYNC_PANE_HEIGHT = 6
  const findBarHeight = ui.localSearch ? 1 : 0
  const contentHeight =
    termHeight - TOP_BAR_HEIGHT - BOTTOM_BAR_HEIGHT - findBarHeight - (ui.showSyncPane ? SYNC_PANE_HEIGHT : 0)

  // ErrorBoundary resetKey — changes when board navigation state changes.
  // This ensures ErrorBoundaries auto-recover after transient render errors
  // (e.g., during zoom transitions or detail pane open/close).
  // Includes rootId (zoom), viewMode, detailPane, colIndex (h/l nav),
  // and column count (structural changes) to maximize recovery opportunities.
  const errorBoundaryResetKey = `${rootId ?? "null"}-${ui.viewMode}-${ui.showDetailPane}-${colIndex}-${columns.length}`

  // Silent error handler — ErrorBoundary resetKey auto-recovers on next state change (km-tui.error-loading-cards)
  const handleRenderError = useCallback((_error: Error, _errorInfo: React.ErrorInfo) => {
    // Intentionally silent: logging here triggers console output which fails tests.
    // The resetKey mechanism auto-recovers, and DEBUG_LOG captures errors via React's own logging.
  }, [])

  // Local find: query change callback — delegates to shared matching logic
  const handleFindQueryChange = useCallback(
    (query: string) => {
      const matchNodeIds = findMatchingNodeIds(columns, query)
      // Navigate cursor to first match
      if (matchNodeIds.length > 0 && matchNodeIds[0] && dispatchBoard) {
        dispatchBoard({ type: "SELECT", nodeId: matchNodeIds[0] })
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
    },
    [columns, setUI, dispatchBoard],
  )

  // Search & replace: search query change callback — delegates to shared matching logic
  const searchReplaceRef = useRef(ui.searchReplace)
  searchReplaceRef.current = ui.searchReplace
  const handleSearchReplaceSearchChange = useCallback(
    (searchQuery: string) => {
      const sr = searchReplaceRef.current
      if (!sr) return

      const matchNodeIds = searchReplaceMatchingNodeIds(columns, repo, searchQuery, sr.useRegex)
      // Navigate cursor to first match
      if (matchNodeIds.length > 0 && matchNodeIds[0] && dispatchBoard) {
        dispatchBoard({ type: "SELECT", nodeId: matchNodeIds[0] })
      }
      setUI({
        searchReplace: {
          ...sr,
          searchQuery,
          matchIndex: 0,
          matchCount: matchNodeIds.length,
          matchNodeIds,
        },
      })
    },
    [columns, setUI, dispatchBoard, repo],
  )

  // Search & replace: replace query change callback (just stores the value)
  const handleSearchReplaceReplaceChange = useCallback(
    (replaceQuery: string) => {
      const sr = searchReplaceRef.current
      if (!sr) return
      setUI({
        searchReplace: { ...sr, replaceQuery },
      })
    },
    [setUI],
  )

  // Column width calculation — uniform expanded width with space reserved for separators
  const COLLAPSED_WIDTH = COLLAPSED_COL_WIDTH
  const { expandedWidth } = computeColumnWidths(boardWidth, columns, collapsedNodes)

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
        />
        <Box height={1} flexShrink={0} />
        <Box flexGrow={1} flexDirection="row" minHeight={1} maxHeight={contentHeight} overflow="hidden">
          {/* Board area — focusable container for all card/column/list views */}
          <Box focusable autoFocus testID="board-area" flexGrow={1} flexDirection="column">
            {/* Cards, Columns, or List view */}
            {ui.viewMode === "cards" ? (
              <ErrorBoundary
                fallback={<Text color="red">Error loading cards view</Text>}
                resetKey={errorBoundaryResetKey}
                onError={handleRenderError}
              >
                {columns.length === 0 ? (
                  <Box flexDirection="column" padding={1} width={boardWidth} height={contentHeight}>
                    <Text dimColor>Empty board</Text>
                  </Box>
                ) : (
                  <HorizontalVirtualList
                    items={columns}
                    width={boardWidth}
                    height={contentHeight}
                    itemWidth={(col) => (collapsedNodes.has(col.node.id) ? COLLAPSED_WIDTH : expandedWidth)}
                    gap={1}
                    scrollTo={isBoardSelected ? undefined : colIndex}
                    renderItem={(col, index) => {
                      const colWidth = collapsedNodes.has(col.node.id) ? COLLAPSED_WIDTH : expandedWidth
                      if (index >= revealedCount) {
                        return (
                          <ColumnSkeleton
                            name={col.node.title || col.node.name || ""}
                            width={colWidth}
                            height={contentHeight}
                            colIndex={index}
                          />
                        )
                      }
                      return (
                        <Column
                          column={col}
                          colIndex={index}
                          isCollapsed={collapsedNodes.has(col.node.id)}
                          width={colWidth}
                          height={contentHeight}
                        />
                      )
                    }}
                    renderOverflowIndicator={(dir) => (
                      <VerticalScrollIndicator direction={dir === "before" ? "left" : "right"} />
                    )}
                    overflowIndicatorWidth={1}
                    renderSeparator={() => <ColumnSeparator />}
                    keyExtractor={(col) => `${col.node.id}${collapsedNodes.has(col.node.id) ? "-c" : ""}`}
                  />
                )}
              </ErrorBoundary>
            ) : ui.viewMode === "columns" ? (
              <ErrorBoundary
                fallback={<Text color="red">Error loading columns view</Text>}
                resetKey={errorBoundaryResetKey}
                onError={handleRenderError}
              >
                <ColumnsView columns={columns} width={boardWidth} height={contentHeight} />
              </ErrorBoundary>
            ) : ui.viewMode === "list" ? (
              <ErrorBoundary
                fallback={<Text color="red">Error loading list view</Text>}
                resetKey={errorBoundaryResetKey}
                onError={handleRenderError}
              >
                <ListView columns={columns} width={boardWidth} height={contentHeight} />
              </ErrorBoundary>
            ) : (
              <ErrorBoundary
                fallback={<Text color="red">Error loading tabs view</Text>}
                resetKey={errorBoundaryResetKey}
                onError={handleRenderError}
              >
                <TabsView columns={columns} width={boardWidth} height={contentHeight} />
              </ErrorBoundary>
            )}
          </Box>
          {/* Detail pane — subscribes to cursor position independently */}
          {ui.showDetailPane && (
            <Box focusable testID="detail-pane">
              <CursorAwareDetailPane width={detailPaneWidth} height={contentHeight} />
            </Box>
          )}
          {/* Project picker modal */}
          {ui.showProjectPicker && (
            <DialogBox
              termWidth={termWidth}
              contentHeight={contentHeight}
              maxWidth={80}
              topFraction={1 / 2}
              data-dialog="project-picker"
            >
              <ProjectPicker
                onSelect={dialogHandlers.handleProjectSelect}
                onCancel={dialogHandlers.handleProjectCancel}
                width={Math.min(80, Math.floor(termWidth / 2))}
                height={Math.floor(contentHeight / 2)}
                recentProjectIds={ui.recentProjectIds}
              />
            </DialogBox>
          )}
          {/* New item dialog modal */}
          {ui.showNewItemDialog && (
            <DialogBox
              termWidth={termWidth}
              contentHeight={contentHeight}
              maxWidth={70}
              topFraction={1 / 3}
              data-dialog="new-item"
            >
              <CursorAwareNewItemDialog
                onCreate={dialogHandlers.handleNewItemCreate}
                onCancel={dialogHandlers.handleNewItemCancel}
                width={Math.min(70, Math.floor(termWidth / 2))}
                height={10}
              />
            </DialogBox>
          )}
          {/* Search dialog modal */}
          {ui.showSearchDialog && (
            <DialogBox
              termWidth={termWidth}
              contentHeight={contentHeight}
              maxWidth={90}
              widthFraction={2 / 3}
              topFraction={1 / 6}
              data-dialog="search"
            >
              <SearchDialog
                onSelect={dialogHandlers.handleSearchSelect}
                onCancel={dialogHandlers.handleSearchCancel}
                width={Math.min(90, Math.floor((termWidth * 2) / 3))}
                maxHeight={Math.floor((contentHeight * 2) / 3)}
                initialInput={ui.searchDialogInitialInput}
                onConsumeInitialInput={() => setUI({ searchDialogInitialInput: "" })}
                scope={ui.searchScope}
                scopeNodeIds={ui.searchScopeNodeIds}
              />
            </DialogBox>
          )}
          {/* Filter panel — top-right corner */}
          {ui.showFilterDialog && (
            <Box
              position="absolute"
              marginLeft={Math.max(0, termWidth - FILTER_PANEL_WIDTH)}
              marginTop={0}
              data-dialog="filter"
            >
              <FilterDialog
                filterProperties={ui.filterProperties}
                filterText={ui.filterText}
                cursorRow={ui.filterCursorRow}
                cursorVal={ui.filterCursorVal}
                width={FILTER_PANEL_WIDTH}
              />
            </Box>
          )}
          {/* Delete confirmation dialog */}
          {ui.deleteConfirm && (
            <DeleteConfirmDialogBox
              termWidth={termWidth}
              contentHeight={contentHeight}
              deleteConfirm={ui.deleteConfirm}
            />
          )}
          {/* Date prompt dialog */}
          {ui.datePrompt && (
            <DialogBox
              termWidth={termWidth}
              contentHeight={contentHeight}
              maxWidth={60}
              topFraction={1 / 3}
              data-dialog="date-prompt"
            >
              <DatePromptDialog
                field={ui.datePrompt.field}
                currentValue={ui.datePrompt.currentValue}
                onConfirm={dialogHandlers.handleDatePromptConfirm}
                onCancel={dialogHandlers.handleDatePromptCancel}
                width={Math.min(60, Math.floor(termWidth / 2))}
                height={14}
              />
            </DialogBox>
          )}
          {/* Omnibox / command palette */}
          {ui.showOmnibox && (
            <DialogBox
              termWidth={termWidth}
              contentHeight={contentHeight}
              maxWidth={80}
              widthFraction={2 / 3}
              topFraction={1 / 6}
              data-dialog="omnibox"
            >
              <Omnibox
                onSelect={dialogHandlers.handleOmniboxSelect}
                onCancel={dialogHandlers.handleOmniboxCancel}
                width={Math.min(80, Math.floor((termWidth * 2) / 3))}
                maxHeight={Math.floor((contentHeight * 2) / 3)}
              />
            </DialogBox>
          )}
          {/* Search & replace dialog */}
          {ui.searchReplace && (
            <DialogBox
              termWidth={termWidth}
              contentHeight={contentHeight}
              maxWidth={70}
              widthFraction={0.6}
              topFraction={1 / 6}
              data-dialog="search-replace"
            >
              <SearchReplaceDialog
                state={ui.searchReplace}
                width={Math.min(70, Math.floor(termWidth * 0.6))}
                onSearchChange={handleSearchReplaceSearchChange}
                onReplaceChange={handleSearchReplaceReplaceChange}
              />
            </DialogBox>
          )}
          {/* Help overlay */}
          {ui.showHelp && <HelpOverlay width={termWidth} height={contentHeight} scrollOffset={ui.helpScrollOffset} />}
          {/* Console now uses screen switching (pause/resume) instead of overlay */}
        </Box>
        {/* Toast stack - bottom-right corner */}
        <ToastStack toasts={toastQueue?.getAll() ?? []} termWidth={termWidth} termHeight={termHeight} />
        {/* Sync activity pane (above bottom bar) */}
        {ui.showSyncPane && <SyncPane events={ui.syncEvents} watcherStatus={ui.watcherStatus} width={termWidth} />}
        {/* Which-key popup (shows chord suffixes when prefix is pending) */}
        {ui.pendingChord && <WhichKeyPopup prefix={ui.pendingChord} termWidth={termWidth} />}
        {/* Find bar (inline search — only when active) */}
        {ui.localSearch && (
          <FindBar localSearch={ui.localSearch} width={termWidth} onQueryChange={handleFindQueryChange} />
        )}
        {/* Command box — mode pill + status + counters */}
        <CommandBox
          ui={ui}
          columns={columns}
          termWidth={termWidth}
          storageMode={repo.mode}
          nodeCount={repo.stats.nodeCount}
          moveMode={moveMode}
          consoleStats={consoleStats}
          toastQueue={toastQueue}
        />
        {/* Bell indicator - hidden element for test detection */}
        {ui.bellState && <Text data-bell={ui.bellState}>{/* Bell triggered */}</Text>}
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
 * Reads ui and board nav fields from Zustand store via useApp() selectors,
 * computes derived layout (useColumns, useCursorPosition),
 * pushes layout back to store, renders BoardCore.
 *
 * Keys are handled by the term:key handler in board-app.ts — not here.
 */
// oxlint-disable-next-line complexity/complexity -- React connector — hooks + effects inflate score
export function Board({ patchedConsole }: BoardProps) {
  // Read pause/resume directly from AppContext (via mutable ref).
  // BoardApp doesn't re-render after initial mount, so passing these as props
  // would capture the initial undefined values permanently.
  const { pause: onPauseRender, resume: onResumeRender } = useApp()
  const repo = useRepo()
  const paneId = usePaneId()

  // Read state from pane-specific state in workspace.
  // The focused pane's PaneState is kept in sync with flat fields (see syncFlatToPane).
  // Non-focused panes read from their saved PaneState snapshot.
  const ui = useAppStore<BoardAppStore, UIState>((s) => s.ui)
  const rootId = useAppStore<BoardAppStore, string | null>((s) => s.workspace.panes.get(paneId)?.rootId ?? s.rootId)
  const rootPath = useAppStore<BoardAppStore, string | null>(
    (s) => s.workspace.panes.get(paneId)?.rootPath ?? s.rootPath,
  )
  // CursorStore provides cursor state without triggering Board re-render on SELECT
  const cursorStore = useAppStore<BoardAppStore, CursorStore>(
    (s) => s.workspace.panes.get(paneId)?.cursorStore ?? s.cursorStore,
  )
  const foldDepths = useAppStore<BoardAppStore, Map<string, number>>(
    (s) => s.workspace.panes.get(paneId)?.foldDepths ?? s.foldDepths,
  )
  const collapsedNodes = useAppStore<BoardAppStore, Set<string>>(
    (s) => s.workspace.panes.get(paneId)?.collapsedNodes ?? s.collapsedNodes,
  )
  const moveMode = useAppStore<BoardAppStore, boolean>((s) => s.workspace.panes.get(paneId)?.moveMode ?? s.moveMode)
  const toastQueue = useAppStore<BoardAppStore, ToastQueue>((s) => s.toastQueue)
  const setUI = useAppStore<BoardAppStore, BoardAppStore["setUI"]>((s) => s.setUI)
  const dispatchBoard = useAppStore<BoardAppStore, BoardAppStore["dispatchBoard"]>((s) => s.dispatchBoard)
  // Layout is derived on demand — no store sync needed

  // Console stats via direct subscription
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

  // Screen switching for console
  useEffect(() => {
    if (!ui.showConsole || !onPauseRender || !onResumeRender) return
    onPauseRender()
    process.stdout.write("\x1b[?25h\x1b[?1049l")
    if (patchedConsole) {
      const entries = patchedConsole.getSnapshot()
      for (const entry of entries) {
        const stream = entry.stream === "stderr" ? process.stderr : process.stdout
        const args = entry.args.map((a: unknown) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")
        stream.write(args + "\n")
      }
    }
    return () => {
      process.stdout.write("\x1b[?1049h\x1b[2J\x1b[H\x1b[?25l")
      onResumeRender()
    }
  }, [ui.showConsole, onPauseRender, onResumeRender, patchedConsole])

  // Derive columns from repo (reactive to repo mutations via useSyncExternalStore).
  // Column derivation is <1ms with per-column memoization. Progressive reveal
  // (useColumnReveal in BoardCore) handles zoom transitions by showing column headers
  // with skeleton placeholders, then revealing one column per frame.
  const columns = useColumns(repo, rootId, foldDepths)
  // Lazy nodeIndex: only indexes column headers + cards (no descendant queries).
  // deriveCursorIndices walks up parent chain on miss via getNode.
  const nodeIndex = useMemo(() => buildNodeIndex(columns), [columns])
  const getNode = useCallback((id: string) => repo.getNode(id), [repo])

  // Subscribe to cursorNodeId from CursorStore.
  // Board re-renders on every cursor change — the cursor-context hooks
  // handle fine-grained subscriptions for individual components.
  const cursorNodeIdRef = useRef<string | null>(null)
  const cursorNodeId = useSyncExternalStore(cursorStore.subscribe, () => {
    const id = cursorStore.getState().cursorNodeId
    if (id === cursorNodeIdRef.current) return cursorNodeIdRef.current
    cursorNodeIdRef.current = id
    return id
  })

  // Derive cursor position from cursorNodeId + columns
  // getNode enables parent-walk fallback for descendant nodes not in the lazy index
  const cursorPosition = useMemo(
    () => deriveCursorIndices(columns, cursorNodeId, nodeIndex, getNode),
    [columns, cursorNodeId, nodeIndex, getNode],
  )

  const columnsLayout = useMemo(
    () => ({
      columns,
      colIndex: cursorPosition.colIndex,
      cardIndex: cursorPosition.cardIndex,
      isAtCardLevel: cursorPosition.isAtCardLevel,
      nodeIndex,
    }),
    [columns, cursorPosition, nodeIndex],
  )

  const derivedSelectionLevel: "board" | "column" | "card" =
    cursorPosition.colIndex < 0 ? "board" : cursorPosition.isAtCardLevel ? "card" : "column"

  // Read ignored paths for filtering (re-read only when ignore list actually changes)
  const ignoredPaths = useMemo(() => readBoardIgnored(repo.path), [repo.path, ui.ignoreVersion])

  // Filter ignored columns for rendering (keep all columns in layout for cursor positioning)
  const visibleColumns = useMemo(() => {
    if (ignoredPaths.size === 0 || ui.showIgnored) return columnsLayout.columns
    return columnsLayout.columns.filter((col) => !isIgnored(ignoredPaths, col.node, repo))
  }, [columnsLayout.columns, ignoredPaths, ui.showIgnored, repo])

  // When ignored filtering removes columns, remap the cursor's colIndex from the
  // full columns array to the visible columns array. Without this, colIndex can
  // be out-of-bounds, causing blank board after ignore.
  const visibleColIndex = useMemo(() => {
    if (visibleColumns === columnsLayout.columns) return columnsLayout.colIndex
    // Find the cursor's column in the visible list by node ID
    const cursorCol = columnsLayout.columns[columnsLayout.colIndex]
    if (!cursorCol) return Math.min(columnsLayout.colIndex, Math.max(0, visibleColumns.length - 1))
    const idx = visibleColumns.findIndex((c) => c.node.id === cursorCol.node.id)
    if (idx >= 0) return idx
    // Cursor's column was filtered — clamp to valid range
    return Math.min(columnsLayout.colIndex, Math.max(0, visibleColumns.length - 1))
  }, [visibleColumns, columnsLayout])

  // Apply text + property filters to cards within columns
  const filteredColumns = useMemo(() => {
    const hasTextFilter = !!ui.filterText
    const hasPropertyFilter = hasActivePropertyFilters(ui.filterProperties)
    if (!hasTextFilter && !hasPropertyFilter) return visibleColumns
    const lowerFilter = hasTextFilter ? ui.filterText.toLowerCase() : ""
    return visibleColumns.map((col) => ({
      ...col,
      totalCardCount: col.cardNodes.length,
      cardNodes: col.cardNodes.filter((card) => {
        // For embeds, resolve to source node for filtering
        const embedSource = card.embed_source
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
      }),
    }))
  }, [visibleColumns, ui.filterText, ui.filterProperties, repo])

  // Dialog handlers — read cursorNodeId from Zustand (silently mutated by SELECT)
  const dialogCursorNodeId = useAppStore<BoardAppStore, string | null>((s) => s.cursorNodeId)
  const undoHandle = useAppStore<BoardAppStore, import("../undo/undoable-repo.ts").UndoableRepoHandle>(
    (s) => s.undoHandle,
  )
  const openDetailPane = useAppStore<BoardAppStore, BoardAppStore["openDetailPane"]>((s) => s.openDetailPane)
  const baseDialogHandlers = useBoardDialogs({
    repo,
    setUI,
    dispatchBoard,
    openDetailPane,
    cursorNodeId: dialogCursorNodeId,
    rootId,
    undoHandle,
  })

  // Omnibox handlers — need store access for dispatchCommandById
  const storeRef = React.useContext(StoreContext)
  const handleOmniboxSelect = useCallback(
    (result: import("./Omnibox.tsx").OmniboxResult) => {
      popDialogMode()
      setUI({ showOmnibox: false })
      if (result.type === "search" && result.nodeId) {
        // Navigate to search result — reuse the search handler
        const node = repo.getNode(result.nodeId)
        if (node) baseDialogHandlers.handleSearchSelect(node)
      } else if (result.commandId && storeRef) {
        // Dispatch command (goto or command types)
        const store = storeRef as import("zustand").StoreApi<BoardAppStore>
        dispatchCommandById(result.commandId, store.getState.bind(store))
      }
    },
    [setUI, storeRef, repo, baseDialogHandlers],
  )
  const handleOmniboxCancel = useCallback(() => {
    popDialogMode()
    setUI({ showOmnibox: false })
  }, [setUI])

  const dialogHandlers = useMemo(
    () => ({
      ...baseDialogHandlers,
      handleOmniboxSelect,
      handleOmniboxCancel,
    }),
    [baseDialogHandlers, handleOmniboxSelect, handleOmniboxCancel],
  )

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
    const detailPaneWidth = ui.showDetailPane ? Math.floor(termWidth * 0.4) : 0
    const boardWidth = termWidth - detailPaneWidth
    const { expandedWidth } = computeColumnWidths(boardWidth, filteredColumns, collapsedNodes)
    return expandedWidth - 2 // minus border left + right
  }, [paneRect.width, ui.dimensions.columns, ui.showDetailPane, filteredColumns, collapsedNodes])

  // Memoize treeConfig — stable across cursor moves (only changes on view mode / outline changes)
  const treeConfig: TreeConfig = useMemo(
    () => deriveTreeConfig(ui, cardInnerWidth),
    [ui.viewMode, ui.maxContentLines, ui.iconStyle, ui.borderMode, cardInnerWidth],
  )

  // Derive search highlight state for TreeNode rendering
  const searchMatchNodeIds = useMemo(
    () => (ui.localSearch ? new Set(ui.localSearch.matchNodeIds) : undefined),
    [ui.localSearch?.matchNodeIds],
  )
  const currentMatchNodeId = ui.localSearch?.matchNodeIds[ui.localSearch.matchIndex] ?? null

  return (
    <CursorStoreProvider store={cursorStore}>
      <TreeRenderProvider
        treeConfig={treeConfig}
        setUI={setUI}
        rootBoardId={ui.rootBoardId}
        searchMatchNodeIds={searchMatchNodeIds}
        currentMatchNodeId={currentMatchNodeId}
      >
        <BoardCore
          rootId={rootId}
          rootPath={rootPath}
          columns={filteredColumns}
          colIndex={visibleColIndex}
          cardIndex={columnsLayout.cardIndex}
          ui={ui}
          derivedSelectionLevel={derivedSelectionLevel}
          dimensions={ui.dimensions}
          setUI={setUI}
          dialogHandlers={dialogHandlers}
          collapsedNodes={collapsedNodes}
          moveMode={moveMode}
          consoleStats={consoleStats}
          toastQueue={toastQueue}
          dispatchBoard={dispatchBoard}
          foldDepths={foldDepths}
        />
      </TreeRenderProvider>
    </CursorStoreProvider>
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
  const storeDimensions = useAppStore<BoardAppStore, { columns: number; rows: number }>((s) => s.ui.dimensions)
  const workspace = useAppStore<BoardAppStore, BoardAppStore["workspace"]>((s) => s.workspace)
  const focusPaneById = useAppStore<BoardAppStore, (id: string) => void>((s) => s.focusPaneById)

  // Resize is handled via "term:resize" event in board-app.ts → store.setDimensions().
  // createApp provides a mock stdout to StdoutContext, so stdout.on("resize") is a no-op.

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

  // Single pane (common case) — render Board directly, no wrapper overhead
  if (workspace.panes.size <= 1) {
    return (
      <Box flexDirection="column" height={storeDimensions.rows}>
        {renderPane("main")}
      </Box>
    )
  }

  // Multiple panes — use WorkspaceView for split layout
  return (
    <Box flexDirection="column" height={storeDimensions.rows}>
      <WorkspaceView
        layout={workspace.layout}
        panes={workspace.panes}
        focusedPaneId={workspace.focusedPaneId}
        width={storeDimensions.columns}
        height={storeDimensions.rows}
        renderPane={renderPane}
        onPaneClick={focusPaneById}
      />
    </Box>
  )
}

// =============================================================================
// Property Filter Matching
// =============================================================================

/** Check if a node matches all active property filters (AND logic between categories) */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: multi-category filter matching
// oxlint-disable-next-line complexity/complexity -- multi-category filter matching with early returns
function matchesPropertyFilters(node: KNode, filters: FilterProperties): boolean {
  // Task status filter — only applies to task nodes; non-task nodes (headings, paragraphs) pass through
  if (filters.taskStatus.size > 0) {
    const status = node.task_status ?? getStatusForMarker(node.task_marker)
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
// Dialog Layout Helpers
// =============================================================================

function DialogBox({
  termWidth,
  contentHeight,
  maxWidth,
  widthFraction = 1 / 2,
  topFraction,
  children,
  ...rest
}: {
  termWidth: number
  contentHeight: number
  maxWidth: number
  widthFraction?: number
  topFraction: number
  children: React.ReactNode
  "data-dialog": string
}): React.ReactElement {
  const w = Math.min(maxWidth, Math.floor(termWidth * widthFraction))
  return (
    <Box
      position="absolute"
      marginLeft={Math.floor((termWidth - w) / 2)}
      marginTop={Math.floor(contentHeight * topFraction)}
      {...rest}
    >
      {children}
    </Box>
  )
}

function DeleteConfirmDialogBox({
  termWidth,
  contentHeight,
  deleteConfirm: dc,
}: {
  termWidth: number
  contentHeight: number
  deleteConfirm: { nodeIds: string[]; title: string; childCount: number; backlinkCount: number; hasMetadata?: boolean }
}): React.ReactElement {
  const dialogWidth = Math.min(50, Math.floor(termWidth / 2))
  const warnings: string[] = []
  if (dc.childCount > 0) warnings.push(`${dc.childCount} child${dc.childCount !== 1 ? "ren" : ""} will be deleted`)
  if (dc.backlinkCount > 0) warnings.push(`${dc.backlinkCount} backlink${dc.backlinkCount !== 1 ? "s" : ""} will break`)
  if (dc.hasMetadata) warnings.push("Has metadata (frontmatter)")
  return (
    <Box
      position="absolute"
      marginLeft={Math.floor((termWidth - dialogWidth) / 2)}
      marginTop={Math.floor(contentHeight / 3)}
      data-dialog="delete-confirm"
    >
      <ConfirmDialog title={`Delete "${dc.title}"?`} warnings={warnings} width={dialogWidth} />
    </Box>
  )
}
