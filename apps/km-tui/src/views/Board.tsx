/**
 * Ink-based Board TUI Component
 *
 * 3-Layer Architecture:
 * 1. BoardCore - Pure rendering, no hooks (testable)
 * 2. Board - State management (useReducer, useInput)
 * 3. BoardApp - Production entry (useRepo, useStdout, external integrations)
 */
import React, { useEffect, useReducer, useMemo, useRef } from "react";
import {
  Box,
  Text,
  useInput,
  useApp,
  useStdout,
  useConsole,
  type PatchedConsole,
} from "inkx";
import createDebug from "debug";

const debug = createDebug("km:board");
import type { TUIBoardState, ViewMode } from "../types.ts";
import type { KNode } from "@km/core";
import { useRepo, RepoProvider } from "../repo-context.tsx";
import type { Repo } from "@km/storage";
import { DetailPane } from "./DetailPane.tsx";
import { ProjectPicker } from "./ProjectPicker.tsx";
import { HelpOverlay } from "./HelpOverlay.tsx";
import { ConsoleModal } from "./ConsoleModal.tsx";
import { NewItemDialog } from "./NewItemDialog.tsx";
import { SearchDialog } from "./SearchDialog.tsx";
import { Column } from "./CardColumn.tsx";
import {
  VerticalScrollIndicator,
  ColumnSeparator,
} from "./VerticalScrollIndicator.tsx";
import { ColumnsView } from "./ColumnsView.tsx";
import { ListView } from "./ListView.tsx";
import { TabsView } from "./TabsView.tsx";
import { renderPath } from "../layout/index.ts";
import { UIProvider } from "../ui-context.tsx";
import { LayoutProvider } from "../layout-context.tsx";
import {
  createLayoutRegistry,
  type LayoutRegistry,
} from "../card-positions.ts";
import {
  uiReducer,
  createInitialUIState,
  actions,
  type UIState,
  type UIAction,
} from "../ui-reducer.ts";
import { useBoardDialogs } from "./use-board-dialogs.ts";
import { ConstraintRoot } from "../layout/index.ts";
import { ensureCommandSystemInitialized } from "../command-bridge.ts";
import { buildTUIContext, type TUIContext } from "../tui-context.ts";
import { boardReducer, createBoardState } from "@km/board";
import { useColumns } from "../hooks/use-columns.ts";
import { useCursorPosition } from "../hooks/use-cursor-position.ts";
import type { ColumnsLayout } from "../types.ts";

// Extracted modules
import {
  TOP_BAR_HEIGHT,
  BOTTOM_BAR_HEIGHT,
  calcEdgeBasedColumnScrollOffset,
} from "./board-layout.ts";
import { getPathSegments, renderTopBarContent } from "./board-top-bar.ts";
import { BottomBar } from "./board-bottom-bar.tsx";
import { ToastStack } from "./ToastStack.tsx";
import {
  createSyncTerminalDimensions,
  createFileDropHandler,
  createRefreshHandler,
  createWatcherStatusHandler,
  createErrorWarningHandler,
} from "./board-effects.ts";
import {
  handleBoardKeyInput,
  handleDetailPaneKeyInput,
} from "./board-input.ts";
import { toastQueue } from "@km/core";

export { makeSelectionKey } from "../types.ts";

// =============================================================================
// BoardCore - Pure Rendering (No Hooks)
// =============================================================================

export interface BoardCoreProps {
  /** Legacy column-based state for rendering */
  state: TUIBoardState;
  /** Derived columns layout (includes colIndex/cardIndex derived from cursorNodeId) */
  layout: ColumnsLayout;
  /** UI state (dialogs, view mode, etc.) */
  ui: UIState;
  /** Derived selection level from cursor depth */
  derivedSelectionLevel: "board" | "column" | "card";
  /** Terminal dimensions */
  dimensions: { columns: number; rows: number };
  /** Layout registry for card position tracking */
  layoutRegistry: LayoutRegistry;
  /** Dispatch to UI reducer */
  dispatch: React.Dispatch<UIAction>;
  /** Dialog handlers (types match ProjectPicker, NewItemDialog, and SearchDialog props) */
  dialogHandlers: {
    handleProjectSelect: (targetNode: KNode) => void;
    handleProjectCancel: () => void;
    handleNewItemCreate: (newNodeId: string) => void;
    handleNewItemCancel: () => void;
    handleSearchSelect: (targetNode: KNode) => void;
    handleSearchCancel: () => void;
  };
  /** Move mode active (from board state) */
  moveMode: boolean;
  /** Patched console for debug output modal */
  patchedConsole?: PatchedConsole | null;
}

/**
 * Pure rendering component - NO hooks, just JSX.
 * Receives all state as props, making it fully testable.
 */
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
  patchedConsole,
}: BoardCoreProps): React.ReactElement {
  const repo = useRepo();
  const termWidth = dimensions.columns;
  const termHeight = dimensions.rows;

  const maxCols = Math.min(
    state.columns.length,
    Math.max(2, Math.floor(termWidth / 35)),
  );

  // Calculate scroll offset (pure calculation, no refs needed)
  const colScrollOffset = Math.max(
    0,
    Math.min(
      layout.colIndex - Math.floor(maxCols / 2),
      Math.max(0, state.columns.length - maxCols),
    ),
  );

  // Build selected item path segments for colorized top bar
  const selectedCol = state.columns[layout.colIndex];
  const selectedCard = selectedCol?.cards[layout.cardIndex];

  // Determine which node to show path to based on selection level
  const pathNodeId =
    derivedSelectionLevel === "board" || !selectedCol
      ? state.rootId
      : derivedSelectionLevel === "column" || !selectedCard
        ? selectedCol.node.id
        : selectedCard.node.id;
  const selectedPathSegments = renderPath(
    getPathSegments(repo, pathNodeId, state.rootId),
    termWidth - 4,
  );

  // Calculate widths for split view
  const detailPaneWidth = ui.showDetailPane ? Math.floor(termWidth * 0.4) : 0;
  const boardWidth = termWidth - detailPaneWidth;

  // Calculate content area height - space between top and bottom bars
  const contentHeight = termHeight - TOP_BAR_HEIGHT - BOTTOM_BAR_HEIGHT;

  // Recalculate columns when detail pane is shown (narrower view)
  const effectiveMaxCols = ui.showDetailPane
    ? Math.min(state.columns.length, Math.max(1, Math.floor(boardWidth / 35)))
    : maxCols;
  const effectiveScrollOffset = ui.showDetailPane
    ? calcEdgeBasedColumnScrollOffset(
        layout.colIndex,
        colScrollOffset,
        effectiveMaxCols,
        state.columns.length,
      )
    : colScrollOffset;
  const effectiveVisibleColumns = state.columns.slice(
    effectiveScrollOffset,
    effectiveScrollOffset + effectiveMaxCols,
  );

  // Build top bar - use board's color as background, or blue if selected/no color
  const isBoardSelected = derivedSelectionLevel === "board";

  // Render loading indicator until terminal is ready
  if (!ui.isReady) {
    return (
      <Box height={termHeight} width={termWidth}>
        <Text>Loading...</Text>
      </Box>
    );
  }

  return (
    <ConstraintRoot>
      <LayoutProvider registry={layoutRegistry}>
        <UIProvider state={ui} dispatch={dispatch}>
          <Box
            id={state.rootId ?? undefined}
            data-view="board"
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
                {renderTopBarContent(selectedPathSegments, isBoardSelected)}
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
                      {/* Left scroll indicator - full height filled bar */}
                      {effectiveScrollOffset > 0 && (
                        <VerticalScrollIndicator direction="left" />
                      )}
                      {effectiveVisibleColumns.map((col, i) => {
                        const actualColIndex = effectiveScrollOffset + i;
                        const isLastCol =
                          i === effectiveVisibleColumns.length - 1;
                        // Reduce column width if scroll indicators are shown
                        const hasLeftIndicator = effectiveScrollOffset > 0;
                        const hasRightIndicator =
                          effectiveScrollOffset + effectiveMaxCols <
                          state.columns.length;
                        const indicatorWidth =
                          (hasLeftIndicator ? 1 : 0) +
                          (hasRightIndicator ? 1 : 0);
                        // Account for separator lines between columns (1 char each, n-1 separators)
                        const separatorCount =
                          effectiveVisibleColumns.length - 1;
                        const availableWidth =
                          boardWidth - indicatorWidth - separatorCount;
                        const baseColWidth = Math.floor(
                          availableWidth / effectiveMaxCols,
                        );
                        const remainder = availableWidth % effectiveMaxCols;
                        // Distribute extra pixels to the first 'remainder' columns
                        const adjustedColWidth =
                          baseColWidth + (i < remainder ? 1 : 0);
                        return (
                          <React.Fragment key={col.node.id}>
                            <Column
                              column={col}
                              colIndex={actualColIndex}
                              isSelected={actualColIndex === layout.colIndex}
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
                        );
                      })}
                      {/* Right scroll indicator - full height filled bar */}
                      {effectiveScrollOffset + effectiveMaxCols <
                        state.columns.length && (
                        <VerticalScrollIndicator direction="right" />
                      )}
                    </>
                  )}
                </Box>
              ) : ui.viewMode === "columns" ? (
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
              ) : ui.viewMode === "list" ? (
                <ListView
                  state={state}
                  width={boardWidth}
                  height={contentHeight}
                  colIndex={layout.colIndex}
                  cardIndex={layout.cardIndex}
                  subIndex={ui.subIndex}
                  selectionLevel={derivedSelectionLevel}
                />
              ) : (
                <TabsView
                  state={state}
                  width={boardWidth}
                  height={contentHeight}
                  colIndex={layout.colIndex}
                  cardIndex={layout.cardIndex}
                  subIndex={ui.subIndex}
                  selectionLevel={derivedSelectionLevel}
                />
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
              {ui.showProjectPicker && (
                <Box
                  position="absolute"
                  marginLeft={Math.floor(termWidth / 4)}
                  marginTop={Math.floor(contentHeight / 2)}
                >
                  <ProjectPicker
                    onSelect={dialogHandlers.handleProjectSelect}
                    onCancel={dialogHandlers.handleProjectCancel}
                    width={Math.floor(termWidth / 2)}
                    height={Math.floor(contentHeight / 2)}
                    recentProjectIds={ui.recentProjectIds}
                  />
                </Box>
              )}
              {/* New item dialog modal */}
              {ui.showNewItemDialog && (
                <Box
                  position="absolute"
                  marginLeft={Math.floor(termWidth / 4)}
                  marginTop={Math.floor(contentHeight / 3)}
                >
                  <NewItemDialog
                    cursorNode={selectedCard?.node ?? null}
                    onCreate={dialogHandlers.handleNewItemCreate}
                    onCancel={dialogHandlers.handleNewItemCancel}
                    width={Math.floor(termWidth / 2)}
                    height={10}
                  />
                </Box>
              )}
              {/* Search dialog modal */}
              {ui.showSearchDialog && (
                <Box
                  position="absolute"
                  marginLeft={Math.floor(termWidth / 4)}
                  marginTop={Math.floor(contentHeight / 4)}
                >
                  <SearchDialog
                    onSelect={dialogHandlers.handleSearchSelect}
                    onCancel={dialogHandlers.handleSearchCancel}
                    width={Math.floor(termWidth / 2)}
                    height={Math.floor(contentHeight / 2)}
                  />
                </Box>
              )}
              {/* Help overlay */}
              {ui.showHelp && (
                <HelpOverlay width={termWidth} height={contentHeight} />
              )}
              {/* Console modal */}
              {ui.showConsole && patchedConsole && (
                <ConsoleModal
                  width={termWidth}
                  height={contentHeight}
                  patchedConsole={patchedConsole}
                />
              )}
            </Box>
            {/* Toast stack - bottom-right corner */}
            <ToastStack
              toasts={toastQueue.getAll()}
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
            />
            {/* Bell indicator - hidden element for test detection */}
            {ui.bellState && (
              <Text data-bell={ui.bellState}>{/* Bell triggered */}</Text>
            )}
          </Box>
        </UIProvider>
      </LayoutProvider>
    </ConstraintRoot>
  );
}

// =============================================================================
// Board - Stateful Component (useReducer, useInput)
// =============================================================================

export interface BoardProps {
  /** Initial board state */
  initialState: TUIBoardState;
  /** Initial view mode (default: "cards") */
  initialViewMode?: ViewMode;
  /** Terminal dimensions */
  dimensions: { columns: number; rows: number };
  /** Exit callback */
  onExit: () => void;
  /** Optional layout registry for card position tracking (for testing) */
  layoutRegistry?: LayoutRegistry;
  /** Optional custom reducer for testing */
  reducer?: typeof uiReducer;
  /** Patched console for debug output modal */
  patchedConsole?: PatchedConsole | null;
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
  layoutRegistry: injectedRegistry,
  reducer = uiReducer,
  patchedConsole,
}: BoardProps) {
  const repo = useRepo();

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
  );

  // Derive initial cursorNodeId from initialState
  // Select the first card in the first column as the initial cursor position
  const initialCursorNodeId = useMemo(() => {
    if (initialState.columns.length > 0) {
      const firstCol = initialState.columns[0];
      if (firstCol && firstCol.cards.length > 0) {
        const firstCard = firstCol.cards[0];
        return firstCard?.node.id ?? firstCol.node.id;
      }
      return firstCol?.node.id ?? null;
    }
    return null;
  }, [initialState]);

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
  );

  // Console auto-open on first output
  const consoleEntries = patchedConsole ? useConsole(patchedConsole) : [];
  useEffect(() => {
    if (consoleEntries.length > 0 && !ui.consoleAutoOpened) {
      dispatch(actions.autoOpenConsole());
    }
  }, [consoleEntries.length, ui.consoleAutoOpened]);

  // Ref to track current rootId for event handlers (avoids stale closure)
  const rootIdRef = useRef(boardState.rootId);
  useEffect(() => {
    rootIdRef.current = boardState.rootId;
  }, [boardState.rootId]);

  // Ref for edge-based horizontal scroll tracking
  const colScrollOffsetRef = useRef(0);

  // Layout registry for card position tracking (used by h/l navigation)
  const layoutRegistryRef = useRef<LayoutRegistry | null>(null);
  if (!layoutRegistryRef.current) {
    layoutRegistryRef.current = injectedRegistry ?? createLayoutRegistry();
  }
  const layoutRegistry = layoutRegistryRef.current;

  // NEW: Derive columns from Repo (not from state.nodes)
  const columns = useColumns(repo, boardState.rootId, boardState.foldedNodes);

  // NEW: Derive cursor position from cursorNodeId (not from state.cursor path)
  const cursorPosition = useCursorPosition(columns, boardState.cursorNodeId);

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
  );

  // Derive selection level from cursor position
  const derivedSelectionLevel = cursorPosition.selectionLevel;

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
  );

  // Dialog handlers (no longer need boardState/dispatchBoard - columns derived from repo)
  const dialogHandlers = useBoardDialogs({
    repo,
    state,
    dispatch,
    cursorNodeId: boardState.cursorNodeId,
  });

  // Calculate visible columns for scroll offset tracking
  const termWidth = ui.dimensions.columns;
  const maxCols = Math.min(
    state.columns.length,
    Math.max(2, Math.floor(termWidth / 35)),
  );

  // Update scroll offset ref
  const colScrollOffset = calcEdgeBasedColumnScrollOffset(
    columnsLayout.colIndex,
    colScrollOffsetRef.current,
    maxCols,
    state.columns.length,
  );
  colScrollOffsetRef.current = colScrollOffset;

  // Build unified TUI context once - passed to all handlers
  const tuiContext: TUIContext = buildTUIContext({
    repo,
    state,
    boardState,
    ui,
    layout: columnsLayout,
    positionRegistry: layoutRegistry,
    dispatch,
    dispatchBoard,
    exit: onExit,
    countVisibleDescendants: (node, depth, maxDepth, foldedNodes) =>
      countVisibleDescendants(repo, node, depth, maxDepth, foldedNodes),
  });

  // Ref to track current tuiContext for event handlers (avoids stale closure)
  const tuiContextRef = useRef(tuiContext);
  tuiContextRef.current = tuiContext;

  // Initialize command system on first render
  useEffect(() => {
    ensureCommandSystemInitialized();
  }, []);

  // Handle file drops via bracketed paste
  useEffect(() => createFileDropHandler(dispatch), []);

  // Subscribe to watcher status updates
  useEffect(() => createWatcherStatusHandler(dispatch), []);

  // Subscribe to error/warning events
  useEffect(() => createErrorWarningHandler(), []);

  // Subscribe to external refresh events (filesystem changes)
  useEffect(() => createRefreshHandler(), []);

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
    );
  });

  // Handle detail pane navigation (j/k to move cards while pane is open)
  useInput(
    (input, key) => {
      handleDetailPaneKeyInput(
        input,
        key,
        repo,
        boardState,
        dispatch,
        dispatchBoard,
        onExit,
      );
    },
    {
      isActive: ui.showDetailPane,
    },
  );

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
      patchedConsole={patchedConsole}
    />
  );
}

// =============================================================================
// BoardApp - Production Entry (useRepo, useStdout, external integrations)
// =============================================================================

export interface BoardAppProps {
  /** Initial board state */
  initialState: TUIBoardState;
  /** Initial view mode (default: "cards") */
  initialViewMode?: ViewMode;
  /** Optional layout registry for card position tracking (for testing) */
  layoutRegistry?: LayoutRegistry;
  /** Patched console for capturing console output (optional) */
  patchedConsole?: PatchedConsole | null;
}

/**
 * Production entry component with external integrations.
 * Gets repo, dimensions, exit from context/hooks.
 * Handles terminal dimension sync only - other effects moved to Board.
 */
export function BoardApp({
  initialState,
  initialViewMode = "cards",
  layoutRegistry,
  patchedConsole,
}: BoardAppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();

  // Create dispatch for dimension sync
  const [dimensionState, dimensionDispatch] = useReducer(
    (
      s: { columns: number; rows: number },
      action: { columns: number; rows: number },
    ) => action,
    { columns: stdout?.columns ?? 80, rows: stdout?.rows ?? 24 },
  );

  // WORKAROUND: fullscreen-ink alternate buffer race condition
  useEffect(
    () =>
      createSyncTerminalDimensions(
        stdout,
        dimensionDispatch as unknown as React.Dispatch<UIAction>,
      ),
    [stdout],
  );

  return (
    <Box flexDirection="column" height={dimensionState.rows}>
      <Board
        initialState={initialState}
        initialViewMode={initialViewMode}
        dimensions={dimensionState}
        onExit={exit}
        layoutRegistry={layoutRegistry}
        patchedConsole={patchedConsole}
      />
    </Box>
  );
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
    return 0;
  }
  const children = repo.getChildren(node.id).slice(0, 10);
  let count = children.length;
  for (const child of children) {
    count += countVisibleDescendants(
      repo,
      child,
      depth + 1,
      maxDepth,
      foldedNodes,
    );
  }
  return count;
}

// NOTE: InkBoardTestable removed - use BoardCore directly for testing
// See testing.ts for the new test harness pattern
