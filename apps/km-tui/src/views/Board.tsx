/**
 * Ink-based Board TUI Component
 *
 * 3-Layer Architecture:
 * 1. BoardCore - Pure rendering, no hooks (testable)
 * 2. Board - State management (useReducer, useInput)
 * 3. BoardApp - Production entry (useRepo, useStdout, external integrations)
 */
import React, { useEffect, useReducer, useMemo, useRef, useState } from "react"
import {
  Box,
  Text,
  useInput,
  useApp,
  useStdout,
  ErrorBoundary,
  type PatchedConsole,
} from "inkx"
import { createConditionalLogger } from "@beorn/logger"

const _log = createConditionalLogger("km:board")
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
import { UIProvider } from "../ui-context.tsx"
import { LayoutProvider } from "../layout-context.tsx"
import { createLayoutRegistry, type LayoutRegistry } from "../card-positions.ts"
import {
  uiReducer,
  createInitialUIState,
  actions,
  type UIState,
  type UIAction,
} from "../ui-reducer.ts"
import { getBoardStore } from "../board-store.ts"
import { useBoardDialogs } from "./use-board-dialogs.ts"
import { ConstraintRoot } from "../layout/index.ts"
import { ensureCommandSystemInitialized } from "../command-bridge.ts"
import { buildTUIContext, type TUIContext } from "../tui-context.ts"
import { textEditTargetRef } from "../text-edit-target.ts"
import { boardReducer, createBoardState } from "@km/board"
import { useColumns } from "../hooks/use-columns.ts"
import { useCursorPosition } from "../hooks/use-cursor-position.ts"
import type { ColumnsLayout } from "../types.ts"

// =============================================================================
// Driver/Testing State Capture
// =============================================================================

/**
 * Captured internal state exposed via onStateCapture callback.
 * Enables driver/testing to access rich state without DOM introspection.
 *
 * @deprecated TEMPORARY WORKAROUND - Replace with createApp() Zustand store.
 * See bead km-tui.4 for migration plan. When Board uses createApp(),
 * driver will access state via app.store.getState() directly.
 */
export interface BoardCapturedState_REPLACE_WITH_CREATEAPP_STORE {
  /** TUI board state (columns, rootId, etc.) */
  state: TUIBoardState
  /** Derived columns layout (colIndex, cardIndex from cursorNodeId) */
  layout: ColumnsLayout
  /** UI state (dialogs, viewMode, etc.) */
  ui: UIState
  /** Board navigation state (moveMode, foldedNodes, etc.) */
  boardState: BoardState
  /** Currently selected node (from cursor position) */
  selectedNode: KNode | null
  /** Derived selection level */
  selectionLevel: "board" | "column" | "card"
}

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
import { handleBoardKeyInput } from "./board-input.ts"
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
  /** Dispatch to UI reducer */
  dispatch: React.Dispatch<UIAction>
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
  dispatch,
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
      <LayoutProvider registry={layoutRegistry}>
        <UIProvider state={ui} dispatch={dispatch}>
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
            {/* Top bar: full path from root to selected item, spans full width */}
            <Box
              flexShrink={0}
              width={termWidth}
              backgroundColor={isBoardSelected ? "yellow" : "white"}
            >
              <Text color={isBoardSelected ? "black" : "gray"} wrap="truncate">
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
                  const dialogWidth = Math.min(
                    90,
                    Math.floor((termWidth * 2) / 3),
                  )
                  const dialogHeight = Math.floor((contentHeight * 2) / 3)
                  return (
                    <Box
                      position="absolute"
                      marginLeft={Math.floor((termWidth - dialogWidth) / 2)}
                      marginTop={Math.floor(contentHeight / 6)}
                      data-dialog="search"
                    >
                      <SearchDialog
                        onSelect={dialogHandlers.handleSearchSelect}
                        onCancel={dialogHandlers.handleSearchCancel}
                        width={dialogWidth}
                        height={dialogHeight}
                        initialInput={ui.searchDialogInitialInput}
                        onConsumeInitialInput={() =>
                          dispatch(actions.clearSearchDialogInput())
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
        </UIProvider>
      </LayoutProvider>
    </ConstraintRoot>
  )
}

// =============================================================================
// Board - Stateful Component (useReducer, useInput)
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
  /** Optional custom reducer for testing */
  reducer?: typeof uiReducer
  /** Patched console for debug output modal */
  patchedConsole?: PatchedConsole | null
  /** Pause inkx rendering (for screen switching) */
  onPauseRender?: () => void
  /** Resume inkx rendering (for screen switching) */
  onResumeRender?: () => void
  /** Callback to capture internal state (for driver/testing) */
  /**
   * @deprecated TEMPORARY WORKAROUND - see km-tui.4
   * When driver uses createApp(), this callback becomes unnecessary.
   * Refactor driver.ts to use app.store.getState(), not this callback.
   */
  onStateCaptureREPLACE_WITH_CREATEAPP_STORE?: (
    state: BoardCapturedState_REPLACE_WITH_CREATEAPP_STORE,
  ) => void
}

/**
 * Stateful Board component with reducers and input handling.
 * Renders BoardCore with computed state.
 *
 * NEW ARCHITECTURE:
 * - Uses SimplifiedBoardState (cursorNodeId only, no nodes array)
 * - Derives columns from Repo at render time via useColumns
 * - Derives cursor position from cursorNodeId via useCursorPosition
 */
export function Board({
  initialState,
  initialViewMode = "cards",
  dimensions,
  onExit,
  toastQueue: injectedToastQueue,
  layoutRegistry: injectedRegistry,
  reducer = uiReducer,
  patchedConsole,
  onPauseRender,
  onResumeRender,
  // WORKAROUND: see km-tui.4 - refactor driver.ts to use createApp() store instead
  onStateCaptureREPLACE_WITH_CREATEAPP_STORE,
}: BoardProps) {
  const repo = useRepo()

  // Toast queue — injected from parent, or create a local one for tests
  const toastQueue = useMemo(
    () => injectedToastQueue ?? createToastQueue(),
    [injectedToastQueue],
  )

  // UI state managed by reducer (enables extracting input handlers)
  const [ui, dispatch] = useReducer(
    reducer,
    {
      initialViewMode,
      collapsedColumns: [...(initialState.collapsedColumns ?? [])],
      dimensions,
      rootBoardId: initialState.rootId,
    },
    (init) =>
      createInitialUIState(
        init.initialViewMode,
        init.collapsedColumns,
        init.dimensions,
        init.rootBoardId,
      ),
  )

  // Derive initial cursorNodeId from initialState
  // Select the first card in the first column as the initial cursor position
  const initialCursorNodeId = useMemo(() => {
    if (initialState.columns.length > 0) {
      const firstCol = initialState.columns[0]
      if (firstCol && firstCol.cards.length > 0) {
        const firstCard = firstCol.cards[0]
        return firstCard?.node.id ?? firstCol.node.id
      }
      return firstCol?.node.id ?? null
    }
    return null
  }, [initialState])

  // Board navigation state managed by boardReducer
  // No nodes array - just IDs and Sets
  const [boardState, dispatchBoard] = useReducer(
    boardReducer,
    null, // unused
    () =>
      createBoardState(
        initialState.rootId,
        initialState.rootPath,
        initialCursorNodeId,
      ),
  )

  // Console stats via direct subscription using getStats().
  // IMPORTANT: We do NOT use useConsole() here — that triggers re-renders
  // on every console entry (including debug), which creates an infinite
  // render loop when -vv pipeline debug logging is enabled.
  // Instead, subscribe directly and only update state when stats change.
  const [consoleStats, setConsoleStats] = useState<
    { total: number; errors: number; warnings: number } | undefined
  >()
  useEffect(() => {
    if (!patchedConsole) return

    // Seed initial stats (entries may have arrived before subscription)
    const initial = patchedConsole.getStats()
    let prevTotal = initial.total
    if (initial.total > 0) setConsoleStats(initial)

    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const unsub = patchedConsole.subscribe(() => {
      // Debounce stats updates: coalesce rapid-fire entries into a single
      // state update after 200ms of quiet.
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

  // Screen switching: pause inkx rendering and leave alt screen when console is shown.
  // When console is dismissed, re-enter alt screen and resume rendering.
  // In tests: onPauseRender/onResumeRender are undefined → effect returns early.
  useEffect(() => {
    if (!ui.showConsole || !onPauseRender || !onResumeRender) return
    onPauseRender()
    process.stdout.write("\x1b[?25h\x1b[?1049l") // show cursor, leave alt screen

    // Replay captured console entries so they're visible on the normal screen.
    // During TUI, console output goes to the alt buffer which isn't visible here.
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
      process.stdout.write("\x1b[?1049h\x1b[2J\x1b[H\x1b[?25l") // enter alt, clear, hide cursor
      onResumeRender()
    }
  }, [ui.showConsole, onPauseRender, onResumeRender, patchedConsole])

  // Ref to track current rootId for event handlers (avoids stale closure)
  const rootIdRef = useRef(boardState.rootId)
  useEffect(() => {
    rootIdRef.current = boardState.rootId
  }, [boardState.rootId])

  // Ref for edge-based horizontal scroll tracking
  const colScrollOffsetRef = useRef(0)

  // Layout registry for card position tracking (used by h/l navigation)
  const layoutRegistryRef = useRef<LayoutRegistry | null>(null)
  if (!layoutRegistryRef.current) {
    layoutRegistryRef.current = injectedRegistry ?? createLayoutRegistry()
  }
  const layoutRegistry = layoutRegistryRef.current

  const columns = useColumns(repo, boardState.rootId, boardState.foldedNodes)

  // Derive cursor position from cursorNodeId
  const cursorPosition = useCursorPosition(columns, boardState.cursorNodeId)

  const columnsLayout: ColumnsLayout = useMemo(
    () => ({
      columns,
      colIndex: cursorPosition.colIndex,
      cardIndex: cursorPosition.cardIndex,
      subPath: [], // TODO: outline mode subpath
      isAtCardLevel: cursorPosition.isAtCardLevel,
      isInOutlineMode: false, // TODO: outline mode
    }),
    [columns, cursorPosition],
  )

  // Derive selection level from cursor position
  const derivedSelectionLevel = cursorPosition.selectionLevel

  // Assemble TUIBoardState for rendering from board state + derived layout
  const state: TUIBoardState = useMemo(
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

  // Get selected node from cursor position
  const selectedCol = state.columns[columnsLayout.colIndex]
  const selectedCard = selectedCol?.cards[columnsLayout.cardIndex]
  const selectedNode = selectedCard?.node ?? selectedCol?.node ?? null

  // ==========================================================================
  // State capture for driver access
  // ==========================================================================
  // Updates the global board store so driver can access state via
  // getBoardStore().getState() without needing the callback.
  //
  // The callback (onStateCaptureREPLACE_WITH_CREATEAPP_STORE) is kept for
  // backward compatibility but will be removed once all consumers migrate
  // to the store.
  // ==========================================================================
  useEffect(() => {
    const capturedState = {
      boardState,
      ui,
      layout: columnsLayout,
      selectedNode,
      selectionLevel: derivedSelectionLevel,
    }

    // Update global store for driver access
    getBoardStore().getState().captureState(capturedState)

    // Legacy callback for backward compatibility
    onStateCaptureREPLACE_WITH_CREATEAPP_STORE?.({
      state,
      layout: columnsLayout,
      ui,
      boardState,
      selectedNode,
      selectionLevel: derivedSelectionLevel,
    })
  }, [
    state,
    columnsLayout,
    ui,
    boardState,
    selectedNode,
    derivedSelectionLevel,
    onStateCaptureREPLACE_WITH_CREATEAPP_STORE,
  ])

  // Dialog handlers
  const dialogHandlers = useBoardDialogs({
    repo,
    state,
    dispatch,
    dispatchBoard,
    cursorNodeId: boardState.cursorNodeId,
    rootId: boardState.rootId,
  })

  // Calculate visible columns for scroll offset tracking
  const termWidth = ui.dimensions.columns
  const maxCols = Math.min(
    state.columns.length,
    Math.max(2, Math.floor(termWidth / 35)),
  )

  // Update scroll offset ref
  const colScrollOffset = calcEdgeBasedColumnScrollOffset(
    columnsLayout.colIndex,
    colScrollOffsetRef.current,
    maxCols,
    state.columns.length,
  )
  colScrollOffsetRef.current = colScrollOffset

  // Build unified TUI context once - passed to all handlers
  const tuiContext: TUIContext = buildTUIContext({
    repo,
    state,
    boardState,
    ui,
    layout: columnsLayout,
    positionRegistry: layoutRegistry,
    toastQueue,
    textEditTarget: textEditTargetRef.current,
    dispatch,
    dispatchBoard,
    exit: onExit,
    countVisibleDescendants: (node, depth, maxDepth, foldedNodes) =>
      countVisibleDescendants(repo, node, depth, maxDepth, foldedNodes),
  })

  // Ref to track current tuiContext for event handlers (avoids stale closure)
  const tuiContextRef = useRef(tuiContext)
  tuiContextRef.current = tuiContext

  // Initialize command system on first render
  useEffect(() => {
    ensureCommandSystemInitialized()
  }, [])

  // Auto-dismiss bell and status after timeout
  useEffect(() => {
    if (!ui.bellState && !ui.status) return
    const timer = setTimeout(() => {
      dispatch(actions.clearBell())
      dispatch(actions.clearStatus())
    }, 3000)
    return () => clearTimeout(timer)
  }, [ui.bellState, ui.status])

  // Handle file drops via bracketed paste
  useEffect(() => createFileDropHandler(dispatch), [])

  // Subscribe to watcher status updates
  useEffect(
    () => createWatcherStatusHandler(dispatch, toastQueue),
    [toastQueue],
  )

  // Subscribe to error/warning events
  useEffect(() => createErrorWarningHandler(toastQueue), [toastQueue])

  // Subscribe to external refresh events (filesystem changes)
  useEffect(() => createRefreshHandler(), [])

  // Main keyboard input handler - ALL keys go through @km/commands
  // Use tuiContextRef.current to get fresh context (avoids stale closure)
  useInput((input, key) => {
    handleBoardKeyInput(
      input,
      key,
      tuiContextRef.current,
      {
        showNewItemDialog: tuiContextRef.current.ui.showNewItemDialog,
        showProjectPicker: tuiContextRef.current.ui.showProjectPicker,
        showSearchDialog: tuiContextRef.current.ui.showSearchDialog,
        showHelp: tuiContextRef.current.ui.showHelp,
        showConsole: tuiContextRef.current.ui.showConsole,
      },
      dispatch,
      onExit,
    )
  })

  // Detail pane navigation (h/Esc to close) is now handled by
  // when: isInDetailPane predicates in the command system keybindings.
  // j/k navigation works through normal cursor_down/cursor_up commands.

  return (
    <BoardCore
      state={state}
      layout={columnsLayout}
      ui={ui}
      derivedSelectionLevel={derivedSelectionLevel}
      dimensions={ui.dimensions}
      layoutRegistry={layoutRegistry}
      dispatch={dispatch}
      dialogHandlers={dialogHandlers}
      moveMode={boardState.moveMode}
      consoleStats={consoleStats}
      colScrollOffset={colScrollOffset}
      toastQueue={toastQueue}
    />
  )
}

// =============================================================================
// BoardApp - Production Entry (useRepo, useStdout, external integrations)
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
 * Handles terminal dimension sync only - other effects moved to Board.
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

  // Track terminal dimensions with resize handling
  const [dimensionState, setDimensions] = React.useState({
    columns: stdout?.columns ?? 80,
    rows: stdout?.rows ?? 24,
  })

  // Listen for resize events
  useEffect(() => {
    if (!stdout) return

    const handleResize = () => {
      if (stdout.columns !== undefined && stdout.rows !== undefined) {
        setDimensions({ columns: stdout.columns, rows: stdout.rows })
      }
    }

    // Sync initial dimensions
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

// NOTE: InkBoardTestable removed - use BoardCore directly for testing
// See testing.ts for the new test harness pattern
