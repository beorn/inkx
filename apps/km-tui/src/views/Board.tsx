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
import React, { useEffect, useMemo, useRef, useState } from "react"
import {
  Box,
  Text,
  useApp,
  useStdout,
  ErrorBoundary,
  type PatchedConsole,
} from "inkx"
import { useApp as useAppStore } from "inkx/runtime"
import { createLogger } from "@beorn/logger"

const _log = createLogger("km:board")
import type { TUIBoardState, ViewMode } from "../types.ts"
import type { KNode } from "@km/core"
import type { BoardState } from "@km/board"
import { useRepo } from "../repo-context.tsx"
import type { Repo } from "@km/storage"
import { DetailPane } from "./DetailPane.tsx"
import { ProjectPicker } from "./ProjectPicker.tsx"
import { HelpOverlay } from "./HelpOverlay.tsx"
import { NewItemDialog } from "./NewItemDialog.tsx"
import { SearchDialog } from "./SearchDialog.tsx"
import { Column } from "./CardColumn.tsx"
import {
  VerticalScrollIndicator,
  ColumnSeparator,
} from "./VerticalScrollIndicator.tsx"
import { ColumnsView } from "./ColumnsView.tsx"
import { ListView } from "./ListView.tsx"
import { TabsView } from "./TabsView.tsx"
import { renderPath } from "../layout/index.ts"
import { type LayoutRegistry } from "../card-positions.ts"
import type { UIState } from "../ui-reducer.ts"
import { useBoardDialogs } from "./use-board-dialogs.ts"
import { ConstraintRoot } from "../layout/index.ts"
import { ensureCommandSystemInitialized } from "../command-bridge.ts"
import { useColumns } from "../hooks/use-columns.ts"
import { useCursorPosition } from "../hooks/use-cursor-position.ts"
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
import { getPathSegments, renderTopBarContent } from "./board-top-bar.ts"
import { BottomBar } from "./board-bottom-bar.tsx"
import { ToastStack } from "./ToastStack.tsx"
import {
  createFileDropHandler,
  createRefreshHandler,
  createWatcherStatusHandler,
  createErrorWarningHandler,
} from "./board-effects.ts"
import type { ToastQueue } from "@km/core"
import { createToastQueue } from "@km/core"
import { getOwnColor } from "../board-pills.ts"
import { getBoardColorByName, normalizeBoardName } from "../text/index.ts"
import { getNodeDisplayName } from "../state.ts"

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
  }
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
 * Pure rendering component - NO hooks, just JSX.
 * Receives all state as props, making it fully testable.
 */
// oxlint-disable-next-line complexity/max-cognitive -- React component — JSX conditionals inflate score
export function BoardCore({
  state,
  layout,
  ui,
  derivedSelectionLevel,
  dimensions,
  layoutRegistry,
  setUI,
  dialogHandlers,
  moveMode,
  consoleStats,
  colScrollOffset,
  toastQueue,
}: BoardCoreProps): React.ReactElement {
  const repo = useRepo()
  const termWidth = dimensions.columns
  const termHeight = dimensions.rows

  const maxCols = Math.min(
    state.columns.length,
    Math.max(2, Math.floor(termWidth / 35)),
  )

  // colScrollOffset is passed from parent (edge-based calculation)

  // Build selected item path segments for colorized top bar
  const selectedCol = state.columns[layout.colIndex]
  const selectedCard = selectedCol?.cards[layout.cardIndex]

  // Determine which node to show path to based on selection level
  const pathNodeId =
    derivedSelectionLevel === "board" || !selectedCol
      ? state.rootId
      : derivedSelectionLevel === "column" || !selectedCard
        ? selectedCol.node.id
        : selectedCard.node.id
  const selectedPathSegments = renderPath(
    getPathSegments(repo, pathNodeId, state.rootId),
    termWidth - 4,
  )

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
    ? calcEdgeBasedColumnScrollOffset(
        layout.colIndex,
        colScrollOffset,
        effectiveMaxCols,
        state.columns.length,
      )
    : colScrollOffset
  const effectiveVisibleColumns = state.columns.slice(
    effectiveScrollOffset,
    effectiveScrollOffset + effectiveMaxCols,
  )

  // Build top bar - use board's color as background, or blue if selected/no color
  const isBoardSelected = derivedSelectionLevel === "board"

  // Compute board root color for the disc indicator
  const rootNode = state.rootId ? repo.getNode(state.rootId) : null
  const boardColor = rootNode
    ? (getOwnColor(rootNode) ??
      getBoardColorByName(
        normalizeBoardName(getNodeDisplayName(repo, rootNode)),
      ))
    : undefined

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
      >
        {/* Top bar — visual bell flashes red when bellState is set */}
        <Box
          id="top-bar"
          flexShrink={0}
          width={termWidth}
          backgroundColor={
            ui.bellState ? "red" : isBoardSelected ? "yellow" : "white"
          }
        >
          <Text
            color={ui.bellState ? "white" : isBoardSelected ? "black" : "gray"}
            wrap="truncate"
          >
            {renderTopBarContent(
              selectedPathSegments,
              isBoardSelected,
              boardColor,
            )}
          </Text>
        </Box>
        <Box
          flexGrow={1}
          flexDirection="row"
          minHeight={1}
          maxHeight={contentHeight}
          overflow="hidden"
        >
          {/* Cards, Columns, or List view */}
          {ui.viewMode === "cards" ? (
            <ErrorBoundary
              fallback={<Text color="red">Error loading cards view</Text>}
            >
              <Box
                flexDirection="row"
                width={boardWidth}
                height={contentHeight}
              >
                {state.columns.length === 0 ? (
                  <Box flexDirection="column" padding={1}>
                    <Text dimColor>Empty board</Text>
                  </Box>
                ) : (
                  <>
                    {/* Calculate column widths using shared utility */}
                    {(() => {
                      const widths = calcColumnWidths({
                        boardWidth,
                        visibleColumnCount: effectiveVisibleColumns.length,
                        maxCols: effectiveMaxCols,
                        scrollOffset: effectiveScrollOffset,
                        totalColumns: state.columns.length,
                      })
                      return (
                        <>
                          {/* Left scroll indicator - full height filled bar */}
                          {widths.hasLeftIndicator && (
                            <VerticalScrollIndicator direction="left" />
                          )}
                          {effectiveVisibleColumns.map((col, i) => {
                            const actualColIndex = effectiveScrollOffset + i
                            const isLastCol =
                              i === effectiveVisibleColumns.length - 1
                            const adjustedColWidth = getColumnWidth(
                              i,
                              widths.baseColWidth,
                              widths.remainder,
                            )
                            return (
                              <React.Fragment key={col.node.id}>
                                <Column
                                  column={col}
                                  colIndex={actualColIndex}
                                  isSelected={
                                    actualColIndex === layout.colIndex
                                  }
                                  isCollapsed={ui.collapsedColumns.has(
                                    actualColIndex,
                                  )}
                                  selectedCardIndex={layout.cardIndex}
                                  selectedSubIndex={
                                    ui.inOutlineMode ? ui.subIndex : -1
                                  }
                                  width={adjustedColWidth}
                                  height={contentHeight}
                                  selectionLevel={derivedSelectionLevel}
                                />
                                {/* Separator line between columns */}
                                {!isLastCol && <ColumnSeparator />}
                              </React.Fragment>
                            )
                          })}
                          {/* Right scroll indicator - full height filled bar */}
                          {widths.hasRightIndicator && (
                            <VerticalScrollIndicator direction="right" />
                          )}
                        </>
                      )
                    })()}
                  </>
                )}
              </Box>
            </ErrorBoundary>
          ) : ui.viewMode === "columns" ? (
            <ErrorBoundary
              fallback={<Text color="red">Error loading columns view</Text>}
            >
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
            <ErrorBoundary
              fallback={<Text color="red">Error loading list view</Text>}
            >
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
            <ErrorBoundary
              fallback={<Text color="red">Error loading tabs view</Text>}
            >
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
          {/* Detail pane */}
          {ui.showDetailPane && selectedCard && (
            <DetailPane
              node={selectedCard.node}
              width={detailPaneWidth}
              height={contentHeight}
            />
          )}
          {/* Project picker modal */}
          {ui.showProjectPicker &&
            (() => {
              const pickerWidth = Math.min(80, Math.floor(termWidth / 2))
              return (
                <Box
                  position="absolute"
                  marginLeft={Math.floor((termWidth - pickerWidth) / 2)}
                  marginTop={Math.floor(contentHeight / 2)}
                  data-dialog="project-picker"
                >
                  <ProjectPicker
                    onSelect={dialogHandlers.handleProjectSelect}
                    onCancel={dialogHandlers.handleProjectCancel}
                    width={pickerWidth}
                    height={Math.floor(contentHeight / 2)}
                    recentProjectIds={ui.recentProjectIds}
                  />
                </Box>
              )
            })()}
          {/* New item dialog modal */}
          {ui.showNewItemDialog &&
            (() => {
              const newItemWidth = Math.min(70, Math.floor(termWidth / 2))
              return (
                <Box
                  position="absolute"
                  marginLeft={Math.floor((termWidth - newItemWidth) / 2)}
                  marginTop={Math.floor(contentHeight / 3)}
                  data-dialog="new-item"
                >
                  <NewItemDialog
                    cursorNode={selectedCard?.node ?? null}
                    onCreate={dialogHandlers.handleNewItemCreate}
                    onCancel={dialogHandlers.handleNewItemCancel}
                    width={newItemWidth}
                    height={10}
                  />
                </Box>
              )
            })()}
          {/* Search dialog modal */}
          {ui.showSearchDialog &&
            (() => {
              const dialogWidth = Math.min(90, Math.floor((termWidth * 2) / 3))
              const dialogMaxHeight = Math.floor((contentHeight * 2) / 3)
              const dialogTop = Math.floor(contentHeight / 6)
              return (
                <Box
                  position="absolute"
                  marginLeft={Math.floor((termWidth - dialogWidth) / 2)}
                  marginTop={dialogTop}
                  data-dialog="search"
                >
                  <SearchDialog
                    onSelect={dialogHandlers.handleSearchSelect}
                    onCancel={dialogHandlers.handleSearchCancel}
                    width={dialogWidth}
                    maxHeight={dialogMaxHeight}
                    initialInput={ui.searchDialogInitialInput}
                    onConsumeInitialInput={() =>
                      setUI({ searchDialogInitialInput: "" })
                    }
                  />
                </Box>
              )
            })()}
          {/* Help overlay */}
          {ui.showHelp && (
            <HelpOverlay width={termWidth} height={contentHeight} />
          )}
          {/* Console now uses screen switching (pause/resume) instead of overlay */}
        </Box>
        {/* Toast stack - bottom-right corner */}
        <ToastStack
          toasts={toastQueue?.getAll() ?? []}
          termWidth={termWidth}
          termHeight={termHeight}
        />
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
        {ui.bellState && (
          <Text data-bell={ui.bellState}>{/* Bell triggered */}</Text>
        )}
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
  /** Pause inkx rendering (for screen switching) */
  onPauseRender?: () => void
  /** Resume inkx rendering (for screen switching) */
  onResumeRender?: () => void
}

/**
 * Board connector component.
 *
 * Reads ui/boardState from Zustand store via useApp() selectors,
 * computes derived layout (useColumns, useCursorPosition),
 * pushes layout back to store, renders BoardCore.
 *
 * Keys are handled by the term:key handler in board-app.ts — not here.
 */
export function Board({
  patchedConsole,
  onPauseRender,
  onResumeRender,
}: BoardProps) {
  const repo = useRepo()

  // Read state from store
  const ui = useAppStore<BoardAppStore, UIState>((s) => s.ui)
  const boardState = useAppStore<BoardAppStore, BoardState>((s) => s.boardState)
  const toastQueue = useAppStore<BoardAppStore, ToastQueue>((s) => s.toastQueue)
  const layoutRegistry = useAppStore<BoardAppStore, LayoutRegistry>(
    (s) => s.layoutRegistry,
  )
  const setUI = useAppStore<BoardAppStore, BoardAppStore["setUI"]>(
    (s) => s.setUI,
  )
  const dispatchBoard = useAppStore<
    BoardAppStore,
    BoardAppStore["dispatchBoard"]
  >((s) => s.dispatchBoard)
  const updateLayout = useAppStore<
    BoardAppStore,
    BoardAppStore["updateLayout"]
  >((s) => s.updateLayout)

  // Console stats via direct subscription
  const [consoleStats, setConsoleStats] = useState<
    { total: number; errors: number; warnings: number } | undefined
  >()
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
        const stream =
          entry.stream === "stderr" ? process.stderr : process.stdout
        const args = entry.args
          .map((a: unknown) => (typeof a === "string" ? a : JSON.stringify(a)))
          .join(" ")
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
  const columns = useColumns(repo, boardState.rootId, boardState.foldedNodes)
  const cursorPosition = useCursorPosition(columns, boardState.cursorNodeId)

  const columnsLayout: ColumnsLayout = useMemo(
    () => ({
      columns,
      colIndex: cursorPosition.colIndex,
      cardIndex: cursorPosition.cardIndex,
      subPath: [],
      isAtCardLevel: cursorPosition.isAtCardLevel,
      isInOutlineMode: false,
    }),
    [columns, cursorPosition],
  )

  const derivedSelectionLevel = cursorPosition.selectionLevel

  // Assemble TUIBoardState for rendering
  const tuiBoardState: TUIBoardState = useMemo(
    () => ({
      rootId: boardState.rootId,
      rootPath: boardState.rootPath,
      columns: columnsLayout.columns,
      selectedCards: new Set<string>(),
      visualMode: false,
      foldedCards: boardState.foldedNodes,
      collapsedColumns: new Set<number>(),
      searchQuery: "",
      searchMode: false,
      helpMode: false,
    }),
    [boardState, columnsLayout],
  )

  // Get selected node
  const selectedCol = tuiBoardState.columns[columnsLayout.colIndex]
  const selectedCard = selectedCol?.cards[columnsLayout.cardIndex]
  const selectedNode = selectedCard?.node ?? selectedCol?.node ?? null

  // Push derived layout back to store so term:key handler has fresh data
  useEffect(() => {
    updateLayout(
      columnsLayout,
      selectedNode,
      derivedSelectionLevel,
      tuiBoardState,
    )
  }, [
    columnsLayout,
    selectedNode,
    derivedSelectionLevel,
    tuiBoardState,
    updateLayout,
  ])

  // Dialog handlers
  const dialogHandlers = useBoardDialogs({
    repo,
    state: tuiBoardState,
    setUI,
    dispatchBoard,
    cursorNodeId: boardState.cursorNodeId,
    rootId: boardState.rootId,
  })

  // Scroll offset
  const termWidth = ui.dimensions.columns
  const maxCols = Math.min(
    tuiBoardState.columns.length,
    Math.max(2, Math.floor(termWidth / 35)),
  )
  const colScrollOffset = calcEdgeBasedColumnScrollOffset(
    columnsLayout.colIndex,
    colScrollOffsetRef.current,
    maxCols,
    tuiBoardState.columns.length,
  )
  colScrollOffsetRef.current = colScrollOffset

  // Initialize command system
  useEffect(() => {
    ensureCommandSystemInitialized()
  }, [])

  // Auto-dismiss bell and status
  useEffect(() => {
    if (!ui.bellState && !ui.status) return
    const timer = setTimeout(() => {
      setUI({ bellState: null, status: null })
    }, 3000)
    return () => clearTimeout(timer)
  }, [ui.bellState, ui.status, setUI])

  // Subscribe to external events
  useEffect(() => createFileDropHandler(setUI), [setUI])
  useEffect(
    () => createWatcherStatusHandler(setUI, toastQueue),
    [setUI, toastQueue],
  )
  useEffect(() => createErrorWarningHandler(toastQueue), [toastQueue])
  useEffect(() => createRefreshHandler(), [])

  // NO useInput — keys handled by term:key in board-app.ts

  return (
    <BoardCore
      state={tuiBoardState}
      layout={columnsLayout}
      ui={ui}
      derivedSelectionLevel={derivedSelectionLevel}
      dimensions={ui.dimensions}
      layoutRegistry={layoutRegistry}
      setUI={setUI}
      dialogHandlers={dialogHandlers}
      moveMode={boardState.moveMode}
      consoleStats={consoleStats}
      colScrollOffset={colScrollOffset}
      toastQueue={toastQueue}
    />
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
  const { exit, pause, resume } = useApp()
  const { stdout } = useStdout()

  const [dimensionState, setDimensions] = React.useState({
    columns: stdout?.columns ?? 80,
    rows: stdout?.rows ?? 24,
  })

  useEffect(() => {
    if (!stdout) return
    const handleResize = () => {
      if (stdout.columns !== undefined && stdout.rows !== undefined) {
        setDimensions({ columns: stdout.columns, rows: stdout.rows })
      }
    }
    handleResize()
    stdout.on("resize", handleResize)
    return () => {
      stdout.off("resize", handleResize)
    }
  }, [stdout])

  return (
    <Box flexDirection="column" height={dimensionState.rows}>
      <Board
        initialState={initialState}
        initialViewMode={initialViewMode}
        dimensions={dimensionState}
        onExit={exit}
        toastQueue={toastQueue}
        layoutRegistry={layoutRegistry}
        patchedConsole={patchedConsole}
        onPauseRender={pause}
        onResumeRender={resume}
      />
    </Box>
  )
}

// =============================================================================
// Helper Functions
// =============================================================================

function countVisibleDescendants(
  repo: Repo,
  node: KNode,
  depth: number,
  maxDepth: number,
  foldedNodes: Set<string>,
): number {
  if (depth > maxDepth || foldedNodes.has(node.id)) {
    return 0
  }
  const children = repo.getChildren(node.id).slice(0, 10)
  let count = children.length
  for (const child of children) {
    count += countVisibleDescendants(
      repo,
      child,
      depth + 1,
      maxDepth,
      foldedNodes,
    )
  }
  return count
}
