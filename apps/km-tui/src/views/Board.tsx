/**
 * Ink-based Board TUI Component
 *
 * Architecture (L3 — createApp + Zustand):
 * 1. BoardCore - Pure rendering, no hooks (testable)
 * 2. Board - Connector: reads store via useApp(), computes derived layout, manages effects
 * 3. BoardApp - Production entry wrapper (gets dimensions/exit from context)
 *
 * State lives in the BoardAppStore (Zustand). Keys flow through term:key handler
 * in board-app.ts. Board is a pure view that reads state and pushes derived layout.
 */
import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { Box, Text, useApp, ErrorBoundary, type PatchedConsole } from "inkx"
import { useApp as useAppStore } from "inkx/runtime"
import { createLogger } from "@beorn/logger"

const _log = createLogger("km:board")
import type { TUIBoardState, ViewMode } from "../types.ts"
import type { KNode } from "@km/core"
import { useRepo } from "../repo-context.tsx"
import type { Repo } from "@km/storage"
import { DetailPane } from "./DetailPane.tsx"
import { ProjectPicker } from "./ProjectPicker.tsx"
import { HelpOverlay } from "./HelpOverlay.tsx"
import { NewItemDialog } from "./NewItemDialog.tsx"
import { DatePromptDialog } from "./DatePromptDialog.tsx"
import { SearchDialog } from "./SearchDialog.tsx"
import { Column } from "./CardColumn.tsx"
import { VerticalScrollIndicator, ColumnSeparator } from "./VerticalScrollIndicator.tsx"
import { ColumnsView } from "./ColumnsView.tsx"
import { ConfirmDialog } from "./shared-components.tsx"
import { ListView } from "./ListView.tsx"
import { TabsView } from "./TabsView.tsx"
import { renderPath } from "../layout/index.ts"
import { type LayoutRegistry } from "../card-positions.ts"
import type { UIState } from "../ui-reducer.ts"
import { useBoardDialogs } from "./use-board-dialogs.ts"
import { ConstraintRoot } from "../layout/index.ts"
import { ensureCommandSystemInitialized } from "../command-bridge.ts"
import { useColumns, buildNodeIndex } from "../hooks/use-columns.ts"
import { deriveCursorPosition } from "../hooks/use-cursor-position.ts"
import {
  CursorStoreProvider,
  useCursorPosition,
  useCursorColIndex,
  useCursorSelectionLevel,
} from "../cursor-context.tsx"
import type { CursorStore } from "../cursor-store.ts"
import type { ColumnsLayout } from "../types.ts"
import type { BoardAppStore } from "../board-app-store.ts"

// Extracted modules
import {
  TOP_BAR_HEIGHT,
  BOTTOM_BAR_HEIGHT,
  calcEdgeBasedColumnScrollOffset,
  calcColumnWidths,
  getColumnWidth,
} from "./board-layout.ts"
import { TreeRenderProvider, deriveTreeConfig, type TreeConfig } from "../ui-context.tsx"
import { getPathSegments, renderTopBarContent } from "./board-top-bar.ts"
import { BottomBar } from "./board-bottom-bar.tsx"
import { ToastStack } from "./ToastStack.tsx"
import { createFileDropHandler, createWatcherStatusHandler, createErrorWarningHandler } from "./board-effects.ts"
import type { ToastQueue } from "@km/core"
import { createToastQueue } from "@km/core"
import { getOwnColor } from "../board-pills.ts"
import { getBoardColorByName, normalizeBoardName } from "../text/index.ts"
import { getNodeDisplayName } from "../state.ts"
import { readBoardIgnored, isIgnored } from "../ignored.ts"

export { makeSelectionKey } from "../types.ts"

// =============================================================================
// BoardCore - Pure Rendering (No Hooks)
// =============================================================================

export interface BoardCoreProps {
  /** Legacy column-based state for rendering */
  state: TUIBoardState
  /** Derived columns layout (includes colIndex/cardIndex derived from cursorNodeId) */
  layout: ColumnsLayout
  /** UI state (dialogs, view mode, etc.) */
  ui: UIState
  /** Derived selection level from cursor depth */
  derivedSelectionLevel: "board" | "column" | "card"
  /** Terminal dimensions */
  dimensions: { columns: number; rows: number }
  /** Layout registry for card position tracking */
  layoutRegistry: LayoutRegistry
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
  }
  /** Collapsed nodes (node IDs) */
  collapsedNodes: Set<string>
  /** Move mode active (from board state) */
  moveMode: boolean
  /** Console stats for bottom bar indicator */
  consoleStats?: { total: number; errors: number; warnings: number }
  /** Column scroll offset (edge-based, from parent) */
  colScrollOffset: number
  /** Toast queue instance (injected, not global). Optional for static render tests. */
  toastQueue?: ToastQueue
}

/**
 * TopBar - subscribes to cursor position for path display.
 * Extracted from BoardCore so BoardCore doesn't re-render on j/k.
 */
function BoardTopBar({ state, termWidth }: { state: TUIBoardState; termWidth: number }): React.ReactElement {
  const repo = useRepo()
  const cursorPos = useCursorPosition()
  const isBoardSelected = cursorPos.selectionLevel === "board"

  const selectedCol = state.columns[cursorPos.colIndex]
  const selectedCard = selectedCol?.cards[cursorPos.cardIndex]

  const pathNodeId =
    isBoardSelected || !selectedCol
      ? state.rootId
      : cursorPos.selectionLevel === "column" || !selectedCard
        ? selectedCol.node.id
        : selectedCard.node.id
  // Let inkx's wrap="truncate" handle display width; only use renderPath for smart segment elision on very long paths
  const selectedPathSegments = renderPath(getPathSegments(repo, pathNodeId, state.rootId), termWidth - 4)

  const rootNode = state.rootId ? repo.getNode(state.rootId) : null
  const boardColor = rootNode
    ? (getOwnColor(rootNode) ?? getBoardColorByName(normalizeBoardName(getNodeDisplayName(repo, rootNode))))
    : undefined

  return (
    <Box id="top-bar" flexShrink={0} width={termWidth} backgroundColor={isBoardSelected ? "yellow" : "white"}>
      <Text color={isBoardSelected ? "black" : "gray"} wrap="truncate">
        {renderTopBarContent(selectedPathSegments, isBoardSelected, boardColor)}
      </Text>
    </Box>
  )
}

/**
 * CursorAwareDetailPane - only subscribes to cursor position when visible.
 * Prevents BoardCore from subscribing just for detail pane cursor tracking.
 */
function CursorAwareDetailPane({
  state,
  width,
  height,
}: {
  state: TUIBoardState
  width: number
  height: number
}): React.ReactElement | null {
  const cursorPos = useCursorPosition()
  const selectedCol = state.columns[cursorPos.colIndex]
  const selectedCard = selectedCol?.cards[cursorPos.cardIndex]
  if (!selectedCard) return null
  return <DetailPane node={selectedCard.node} width={width} height={height} />
}

/**
 * CursorAwareNewItemDialog - subscribes to cursor position for cursorNode.
 */
function CursorAwareNewItemDialog({
  state,
  onCreate,
  onCancel,
  width,
  height,
}: {
  state: TUIBoardState
  onCreate: (newNodeId: string) => void
  onCancel: () => void
  width: number
  height: number
}): React.ReactElement {
  const cursorPos = useCursorPosition()
  const selectedCol = state.columns[cursorPos.colIndex]
  const selectedCard = selectedCol?.cards[cursorPos.cardIndex]
  return (
    <NewItemDialog
      cursorNode={selectedCard?.node ?? null}
      onCreate={onCreate}
      onCancel={onCancel}
      width={width}
      height={height}
    />
  )
}

/**
 * Pure rendering component - NO cursor subscription.
 * Uses derivedSelectionLevel prop (stable on j/k).
 * TopBar, DetailPane, and NewItemDialog subscribe independently.
 */
// oxlint-disable-next-line complexity/complexity -- React component — JSX conditionals inflate score
export function BoardCore({
  state,
  layout,
  ui,
  derivedSelectionLevel,
  dimensions,
  layoutRegistry,
  setUI,
  dialogHandlers,
  collapsedNodes,
  moveMode,
  consoleStats,
  colScrollOffset,
  toastQueue,
}: BoardCoreProps): React.ReactElement {
  const repo = useRepo()
  const termWidth = dimensions.columns
  const termHeight = dimensions.rows

  const maxCols = Math.min(state.columns.length, Math.max(2, Math.floor(termWidth / 35)))

  const isBoardSelected = derivedSelectionLevel === "board"

  // Calculate widths for split view
  const detailPaneWidth = ui.showDetailPane ? Math.floor(termWidth * 0.4) : 0
  const boardWidth = termWidth - detailPaneWidth

  // Calculate content area height - space between top and bottom bars
  const contentHeight = termHeight - TOP_BAR_HEIGHT - BOTTOM_BAR_HEIGHT

  // Recalculate columns when detail pane is shown (narrower view)
  const effectiveMaxCols = ui.showDetailPane
    ? Math.min(state.columns.length, Math.max(1, Math.floor(boardWidth / 35)))
    : maxCols
  const effectiveScrollOffset = ui.showDetailPane
    ? calcEdgeBasedColumnScrollOffset(layout.colIndex, colScrollOffset, effectiveMaxCols, state.columns.length)
    : colScrollOffset
  const effectiveVisibleColumns = state.columns.slice(effectiveScrollOffset, effectiveScrollOffset + effectiveMaxCols)

  // Render loading skeleton until terminal is ready
  if (!ui.isReady) {
    return (
      <Box height={termHeight} width={termWidth} flexDirection="column">
        <Text dimColor>{"░".repeat(Math.min(20, termWidth - 2))}</Text>
        <Text dimColor>{"░".repeat(Math.min(12, termWidth - 2))}</Text>
      </Box>
    )
  }

  return (
    <ConstraintRoot>
      <Box
        id={state.rootId ?? undefined}
        data-view="board"
        data-board={true}
        data-scroll-offset={colScrollOffset}
        data-col-index={layout.colIndex}
        data-card-index={layout.cardIndex}
        {...(isBoardSelected && { "data-cursor": true })}
        flexDirection="column"
        width={termWidth}
        height={termHeight}
        minHeight={3}
        overflow="hidden"
        {...(ui.bellState && { "data-bell-flash": true })}
      >
        {/* Top bar — subscribes to cursor position independently */}
        <BoardTopBar state={state} termWidth={termWidth} />
        <Box flexGrow={1} flexDirection="row" minHeight={1} maxHeight={contentHeight} overflow="hidden">
          {/* Cards, Columns, or List view */}
          {ui.viewMode === "cards" ? (
            <ErrorBoundary fallback={<Text color="red">Error loading cards view</Text>}>
              <Box flexDirection="row" width={boardWidth} height={contentHeight}>
                {state.columns.length === 0 ? (
                  <Box flexDirection="column" padding={1}>
                    <Text dimColor>Empty board</Text>
                  </Box>
                ) : (
                  <>
                    {/* Calculate column widths — collapsed columns get thin strip */}
                    {(() => {
                      const COLLAPSED_WIDTH = 3
                      // Count collapsed among visible columns
                      const collapsedCount = effectiveVisibleColumns.filter(
                        (col) => col.rules?.collapse || collapsedNodes.has(col.node.id),
                      ).length
                      const expandedCount = effectiveVisibleColumns.length - collapsedCount

                      const widths = calcColumnWidths({
                        boardWidth: boardWidth - collapsedCount * COLLAPSED_WIDTH,
                        visibleColumnCount: expandedCount,
                        maxCols: Math.max(1, effectiveMaxCols - collapsedCount),
                        scrollOffset: effectiveScrollOffset,
                        totalColumns: state.columns.length,
                      })
                      let expandedIdx = 0
                      return (
                        <>
                          {/* Left scroll indicator - full height filled bar */}
                          {widths.hasLeftIndicator && <VerticalScrollIndicator direction="left" />}
                          {effectiveVisibleColumns.map((col, i) => {
                            const actualColIndex = effectiveScrollOffset + i
                            const isLastCol = i === effectiveVisibleColumns.length - 1
                            const isColCollapsed = col.rules?.collapse ? true : collapsedNodes.has(col.node.id)
                            const adjustedColWidth = isColCollapsed
                              ? COLLAPSED_WIDTH
                              : getColumnWidth(expandedIdx++, widths.baseColWidth, widths.remainder)
                            return (
                              <React.Fragment key={col.node.id}>
                                <Column
                                  column={col}
                                  colIndex={actualColIndex}
                                  isCollapsed={isColCollapsed}
                                  selectedSubIndex={ui.inOutlineMode ? ui.subIndex : -1}
                                  width={adjustedColWidth}
                                  height={contentHeight}
                                />
                                {/* Separator line between columns */}
                                {!isLastCol && <ColumnSeparator />}
                              </React.Fragment>
                            )
                          })}
                          {/* Right scroll indicator - full height filled bar */}
                          {widths.hasRightIndicator && <VerticalScrollIndicator direction="right" />}
                        </>
                      )
                    })()}
                  </>
                )}
              </Box>
            </ErrorBoundary>
          ) : ui.viewMode === "columns" ? (
            <ErrorBoundary fallback={<Text color="red">Error loading columns view</Text>}>
              <ColumnsView
                state={state}
                width={boardWidth}
                height={contentHeight}
                colIndex={layout.colIndex}
                cardIndex={layout.cardIndex}
                subIndex={ui.subIndex}
                effectiveScrollOffset={effectiveScrollOffset}
                effectiveMaxCols={effectiveMaxCols}
                effectiveVisibleColumns={effectiveVisibleColumns}
                selectionLevel={derivedSelectionLevel}
              />
            </ErrorBoundary>
          ) : ui.viewMode === "list" ? (
            <ErrorBoundary fallback={<Text color="red">Error loading list view</Text>}>
              <ListView
                state={state}
                width={boardWidth}
                height={contentHeight}
                colIndex={layout.colIndex}
                cardIndex={layout.cardIndex}
                subIndex={ui.subIndex}
                selectionLevel={derivedSelectionLevel}
              />
            </ErrorBoundary>
          ) : (
            <ErrorBoundary fallback={<Text color="red">Error loading tabs view</Text>}>
              <TabsView
                state={state}
                width={boardWidth}
                height={contentHeight}
                colIndex={layout.colIndex}
                cardIndex={layout.cardIndex}
                subIndex={ui.subIndex}
                selectionLevel={derivedSelectionLevel}
              />
            </ErrorBoundary>
          )}
          {/* Detail pane — subscribes to cursor position independently */}
          {ui.showDetailPane && <CursorAwareDetailPane state={state} width={detailPaneWidth} height={contentHeight} />}
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
                state={state}
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
              />
            </DialogBox>
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
                height={10}
              />
            </DialogBox>
          )}
          {/* Help overlay */}
          {ui.showHelp && <HelpOverlay width={termWidth} height={contentHeight} />}
          {/* Console now uses screen switching (pause/resume) instead of overlay */}
        </Box>
        {/* Toast stack - bottom-right corner */}
        <ToastStack toasts={toastQueue?.getAll() ?? []} termWidth={termWidth} termHeight={termHeight} />
        {/* Bottom bar (includes status messages) */}
        <BottomBar
          ui={ui}
          state={state}
          layout={layout}
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
  /** Initial board state */
  initialState: TUIBoardState
  /** Initial view mode (default: "cards") */
  initialViewMode?: ViewMode
  /** Terminal dimensions */
  dimensions: { columns: number; rows: number }
  /** Exit callback */
  onExit: () => void
  /** Toast queue instance (injected, not global) */
  toastQueue?: ToastQueue
  /** Optional layout registry for card position tracking (for testing) */
  layoutRegistry?: LayoutRegistry
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
export function Board({ patchedConsole }: BoardProps) {
  // Read pause/resume directly from AppContext (via mutable ref).
  // BoardApp doesn't re-render after initial mount, so passing these as props
  // would capture the initial undefined values permanently.
  const { pause: onPauseRender, resume: onResumeRender } = useApp()
  const repo = useRepo()

  // Read state from store
  const ui = useAppStore<BoardAppStore, UIState>((s) => s.ui)
  const rootId = useAppStore<BoardAppStore, string | null>((s) => s.rootId)
  const rootPath = useAppStore<BoardAppStore, string | null>((s) => s.rootPath)
  // CursorStore provides cursor state without triggering Board re-render on SELECT
  const cursorStore = useAppStore<BoardAppStore, CursorStore>((s) => s.cursorStore)
  const foldedNodes = useAppStore<BoardAppStore, Set<string>>((s) => s.foldedNodes)
  const collapsedNodes = useAppStore<BoardAppStore, Set<string>>((s) => s.collapsedNodes)
  const moveMode = useAppStore<BoardAppStore, boolean>((s) => s.moveMode)
  const toastQueue = useAppStore<BoardAppStore, ToastQueue>((s) => s.toastQueue)
  const layoutRegistry = useAppStore<BoardAppStore, LayoutRegistry>((s) => s.layoutRegistry)
  const setUI = useAppStore<BoardAppStore, BoardAppStore["setUI"]>((s) => s.setUI)
  const dispatchBoard = useAppStore<BoardAppStore, BoardAppStore["dispatchBoard"]>((s) => s.dispatchBoard)
  const updateLayout = useAppStore<BoardAppStore, BoardAppStore["updateLayout"]>((s) => s.updateLayout)

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

  // Ref for edge-based horizontal scroll tracking
  const colScrollOffsetRef = useRef(0)

  // Derive columns from repo (reactive to repo mutations via useSyncExternalStore)
  const columns = useColumns(repo, rootId, foldedNodes)
  const nodeIndex = useMemo(() => buildNodeIndex(columns), [columns])

  // Subscribe to cursor colIndex + selectionLevel from CursorStore.
  // Board re-renders on column change (h/l) or level change (K/J),
  // but NOT on j/k within the same column at the same level.
  const cursorColIndexRef = useRef(0)
  const cursorColIndex = useSyncExternalStore(cursorStore.subscribe, () => {
    const colIndex = cursorStore.getState().colIndex
    if (colIndex === cursorColIndexRef.current) return cursorColIndexRef.current
    cursorColIndexRef.current = colIndex
    return colIndex
  })
  const cursorSelectionLevelRef = useRef<"board" | "column" | "card">("board")
  const cursorSelectionLevel = useSyncExternalStore(cursorStore.subscribe, () => {
    const level = cursorStore.getState().selectionLevel
    if (level === cursorSelectionLevelRef.current) {
      return cursorSelectionLevelRef.current
    }
    cursorSelectionLevelRef.current = level
    return level
  })

  // Compute cursor position only when columns change, column index changes,
  // or selection level changes (NOT on j/k within the same column).
  const cursorPosition = useMemo(() => {
    const cs = cursorStore.getState()
    return deriveCursorPosition(columns, cs.cursorNodeId, nodeIndex)
  }, [columns, cursorStore, nodeIndex, cursorColIndex, cursorSelectionLevel])

  const columnsLayout: ColumnsLayout = useMemo(
    () => ({
      columns,
      colIndex: cursorPosition.colIndex,
      cardIndex: cursorPosition.cardIndex,
      isAtCardLevel: cursorPosition.isAtCardLevel,
      nodeIndex,
    }),
    [columns, cursorPosition, nodeIndex],
  )

  const derivedSelectionLevel = cursorPosition.selectionLevel

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

  // Assemble TUIBoardState for rendering.
  // Uses individual fields as deps for stable memoization.
  const emptyStringSet = useMemo(() => new Set<string>(), [])
  const emptyNumberSet = useMemo(() => new Set<number>(), [])
  const tuiBoardState: TUIBoardState = useMemo(
    () => ({
      rootId,
      rootPath,
      columns: visibleColumns,
      selectedNodes: emptyStringSet,
      visualMode: false,
      foldedNodes,
      collapsedColumns: emptyNumberSet,
      collapsedNodeIds: collapsedNodes,
      searchQuery: "",
      searchMode: false,
      helpMode: false,
    }),
    [rootId, rootPath, visibleColumns, foldedNodes, emptyStringSet, emptyNumberSet, collapsedNodes],
  )

  // Get selected node — use columnsLayout indices (for store consistency)
  // Note: when ignored filtering is active, this may be null (cursor on ignored column),
  // but the store and key handler use the full columns layout.
  const selectedCol = columnsLayout.columns[columnsLayout.colIndex]
  const selectedCard = selectedCol?.cards[columnsLayout.cardIndex]
  const selectedNode = selectedCard?.node ?? selectedCol?.node ?? null

  // Push derived layout back to store so term:key handler has fresh data.
  // IMPORTANT: Store gets the full (unfiltered) columnsLayout so key handler
  // navigates across all columns. Visible layout is only for rendering.
  // Gated: only call updateLayout when something actually changed (by using
  // a ref to track what was last pushed). This avoids the re-render feedback loop
  // where updateLayout → set() → subscription → re-render → updateLayout → ...
  const lastLayoutRef = useRef<{
    columnsLayout: ColumnsLayout
    selectedNode: KNode | null
    selectionLevel: string
  } | null>(null)
  useEffect(() => {
    const last = lastLayoutRef.current
    if (
      last &&
      last.columnsLayout === columnsLayout &&
      last.selectedNode === selectedNode &&
      last.selectionLevel === derivedSelectionLevel
    ) {
      return // Nothing changed, skip the store update
    }
    lastLayoutRef.current = {
      columnsLayout,
      selectedNode,
      selectionLevel: derivedSelectionLevel,
    }
    updateLayout(columnsLayout, selectedNode, derivedSelectionLevel, tuiBoardState)
    // Sync cursor position to CursorStore so Card/Column self-subscriptions
    // pick up the correct position after column changes (e.g., card shift)
    const cs = cursorStore.getState()
    if (
      cs.colIndex !== columnsLayout.colIndex ||
      cs.cardIndex !== columnsLayout.cardIndex ||
      cs.selectionLevel !== derivedSelectionLevel
    ) {
      cursorStore.setState({
        cursorNodeId: cs.cursorNodeId,
        colIndex: columnsLayout.colIndex,
        cardIndex: columnsLayout.cardIndex,
        selectionLevel: derivedSelectionLevel,
      })
    }
  }, [columnsLayout, selectedNode, derivedSelectionLevel, tuiBoardState, updateLayout, cursorStore])

  // Dialog handlers — read cursorNodeId from Zustand (silently mutated by SELECT)
  const dialogCursorNodeId = useAppStore<BoardAppStore, string | null>((s) => s.cursorNodeId)
  const dialogHandlers = useBoardDialogs({
    repo,
    state: tuiBoardState,
    setUI,
    dispatchBoard,
    cursorNodeId: dialogCursorNodeId,
    rootId,
  })

  // Scroll offset — use visibleColIndex for rendering (scrolls through visible columns only)
  const termWidth = ui.dimensions.columns
  const maxCols = Math.min(tuiBoardState.columns.length, Math.max(2, Math.floor(termWidth / 35)))
  const colScrollOffset = calcEdgeBasedColumnScrollOffset(
    visibleColIndex,
    colScrollOffsetRef.current,
    maxCols,
    tuiBoardState.columns.length,
  )
  colScrollOffsetRef.current = colScrollOffset

  // Initialize command system
  useEffect(() => {
    ensureCommandSystemInitialized()
  }, [])

  // Auto-dismiss bell (150ms flash) and status (3s).
  // Bell is also cleared at the start of the next keypress (board-app.ts line 104).
  useEffect(() => {
    if (!ui.bellState && !ui.status) return
    const delay = ui.bellState ? 150 : 3000
    const timer = setTimeout(() => {
      if (ui.bellState) setUI({ bellState: null })
      if (ui.status) setUI({ status: null })
    }, delay)
    return () => clearTimeout(timer)
  }, [ui.bellState, ui.status, setUI])

  // Subscribe to external events
  useEffect(() => createFileDropHandler(setUI), [setUI])
  useEffect(() => createWatcherStatusHandler(setUI, toastQueue), [setUI, toastQueue])
  useEffect(() => createErrorWarningHandler(toastQueue), [toastQueue])

  // NO useInput — keys handled by term:key in board-app.ts

  // Memoize treeConfig — stable across cursor moves (only changes on view mode / outline changes)
  const treeConfig: TreeConfig = useMemo(
    () => deriveTreeConfig(ui),
    [ui.viewMode, ui.maxOutlineDepth, ui.maxContentLines, ui.inOutlineMode, ui.subIndex, ui.iconStyle],
  )

  return (
    <CursorStoreProvider store={cursorStore}>
      <TreeRenderProvider treeConfig={treeConfig} setUI={setUI} rootBoardId={ui.rootBoardId}>
        <BoardCore
          state={tuiBoardState}
          layout={visibleColIndex === columnsLayout.colIndex ? columnsLayout : { ...columnsLayout, columns: visibleColumns, colIndex: visibleColIndex }}
          ui={ui}
          derivedSelectionLevel={derivedSelectionLevel}
          dimensions={ui.dimensions}
          layoutRegistry={layoutRegistry}
          setUI={setUI}
          dialogHandlers={dialogHandlers}
          collapsedNodes={collapsedNodes}
          moveMode={moveMode}
          consoleStats={consoleStats}
          colScrollOffset={colScrollOffset}
          toastQueue={toastQueue}
        />
      </TreeRenderProvider>
    </CursorStoreProvider>
  )
}

// =============================================================================
// BoardApp - Production Entry (used by tui.tsx)
// =============================================================================

export interface BoardAppProps {
  /** Initial board state */
  initialState: TUIBoardState
  /** Initial view mode (default: "cards") */
  initialViewMode?: ViewMode
  /** Toast queue instance (injected from runBoard) */
  toastQueue?: ToastQueue
  /** Optional layout registry for card position tracking (for testing) */
  layoutRegistry?: LayoutRegistry
  /** Patched console for capturing console output (optional) */
  patchedConsole?: PatchedConsole | null
}

/**
 * Production entry component with external integrations.
 * Gets repo, dimensions, exit from context/hooks.
 */
export function BoardApp({
  initialState,
  initialViewMode = "cards",
  toastQueue,
  layoutRegistry,
  patchedConsole,
}: BoardAppProps) {
  const { exit } = useApp()
  const storeDimensions = useAppStore<BoardAppStore, { columns: number; rows: number }>((s) => s.ui.dimensions)

  // Resize is handled via "term:resize" event in board-app.ts → store.setDimensions().
  // createApp provides a mock stdout to StdoutContext, so stdout.on("resize") is a no-op.

  return (
    <Box flexDirection="column" height={storeDimensions.rows}>
      <Board
        initialState={initialState}
        initialViewMode={initialViewMode}
        dimensions={storeDimensions}
        onExit={exit}
        toastQueue={toastQueue}
        layoutRegistry={layoutRegistry}
        patchedConsole={patchedConsole}
      />
    </Box>
  )
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
