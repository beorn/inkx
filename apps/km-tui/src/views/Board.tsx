/**
 * Ink-based Board TUI Component
 *
 * 3-Layer Architecture:
 * 1. BoardCore - Pure rendering, no hooks (testable)
 * 2. Board - State management (useReducer, useInput)
 * 3. BoardApp - Production entry (useVault, useStdout, external integrations)
 */
import React, { useEffect, useReducer, useMemo, useRef } from "react";
import { writeSync } from "fs";
import {
  Box,
  Text,
  useInput,
  useApp,
  useStdout,
  render as inkxRender,
} from "inkx";
import createDebug from "debug";

const debug = createDebug("km:board");
import type { TUIBoardState, ViewMode } from "../types.ts";
import type { KNode } from "@km/core";
import { useVault, VaultProvider } from "../vault-context.tsx";
import type { Vault } from "@km/storage";
import { DetailPane } from "./DetailPane.tsx";
import { ProjectPicker } from "./ProjectPicker.tsx";
import { HelpOverlay } from "./HelpOverlay.tsx";
import { NewItemDialog } from "./NewItemDialog.tsx";
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
  type UIState,
  type UIAction,
} from "../ui-reducer.ts";
import { useBoardDialogs } from "./use-board-dialogs.ts";
import { ConstraintRoot } from "../layout/index.ts";
import { ensureCommandSystemInitialized } from "../command-bridge.ts";
import { buildTUIContext, type TUIContext } from "../tui-context.ts";
import {
  simplifiedBoardReducer,
  createSimplifiedBoardState,
  type TransitionalBoardAction,
} from "@km/board";
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
import {
  createSyncTerminalDimensions,
  createFileDropHandler,
  createRefreshHandler,
  createWatcherStatusHandler,
} from "./board-effects.ts";
import {
  handleBoardKeyInput,
  handleDetailPaneKeyInput,
} from "./board-input.ts";

export { makeSelectionKey } from "../types.ts";

// =============================================================================
// BoardCore - Pure Rendering (No Hooks)
// =============================================================================

export interface BoardCoreProps {
  /** Legacy column-based state for rendering */
  state: TUIBoardState;
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
  /** Dialog handlers (types match ProjectPicker and NewItemDialog props) */
  dialogHandlers: {
    handleProjectSelect: (targetNode: KNode) => void;
    handleProjectCancel: () => void;
    handleNewItemCreate: (newNodeId: string) => void;
    handleNewItemCancel: () => void;
  };
}

/**
 * Pure rendering component - NO hooks, just JSX.
 * Receives all state as props, making it fully testable.
 */
export function BoardCore({
  state,
  ui,
  derivedSelectionLevel,
  dimensions,
  layoutRegistry,
  dispatch,
  dialogHandlers,
}: BoardCoreProps): React.ReactElement {
  const vault = useVault();
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
      state.colIndex - Math.floor(maxCols / 2),
      Math.max(0, state.columns.length - maxCols),
    ),
  );

  // Build selected item path segments for colorized top bar
  const selectedCol = state.columns[state.colIndex];
  const selectedCard = selectedCol?.cards[state.cardIndex];

  // Determine which node to show path to based on selection level
  const pathNodeId =
    derivedSelectionLevel === "board" || !selectedCol
      ? state.rootId
      : derivedSelectionLevel === "column" || !selectedCard
        ? selectedCol.node.id
        : selectedCard.node.id;
  const selectedPathSegments = renderPath(
    getPathSegments(vault, pathNodeId, state.rootId),
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
        state.colIndex,
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
                  {/* Left scroll indicator - full height filled bar */}
                  {effectiveScrollOffset > 0 && (
                    <VerticalScrollIndicator direction="left" />
                  )}
                  {effectiveVisibleColumns.map((col, i) => {
                    const actualColIndex = effectiveScrollOffset + i;
                    const isLastCol = i === effectiveVisibleColumns.length - 1;
                    // Reduce column width if scroll indicators are shown
                    const hasLeftIndicator = effectiveScrollOffset > 0;
                    const hasRightIndicator =
                      effectiveScrollOffset + effectiveMaxCols <
                      state.columns.length;
                    const indicatorWidth =
                      (hasLeftIndicator ? 1 : 0) + (hasRightIndicator ? 1 : 0);
                    // Account for separator lines between columns (1 char each, n-1 separators)
                    const separatorCount = effectiveVisibleColumns.length - 1;
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
                          isSelected={actualColIndex === state.colIndex}
                          isCollapsed={ui.collapsedColumns.has(actualColIndex)}
                          selectedCardIndex={state.cardIndex}
                          selectedSubIndex={ui.inOutlineMode ? ui.subIndex : -1}
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
                </Box>
              ) : ui.viewMode === "columns" ? (
                <ColumnsView
                  state={state}
                  width={boardWidth}
                  height={contentHeight}
                  colIndex={state.colIndex}
                  cardIndex={state.cardIndex}
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
                  colIndex={state.colIndex}
                  cardIndex={state.cardIndex}
                  subIndex={ui.subIndex}
                  selectionLevel={derivedSelectionLevel}
                />
              ) : (
                <TabsView
                  state={state}
                  width={boardWidth}
                  height={contentHeight}
                  colIndex={state.colIndex}
                  cardIndex={state.cardIndex}
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
              {/* Help overlay */}
              {ui.showHelp && (
                <HelpOverlay width={termWidth} height={contentHeight} />
              )}
            </Box>
            {/* Bottom bar */}
            <BottomBar
              ui={ui}
              state={state}
              termWidth={termWidth}
              storageMode={vault.mode}
              nodeCount={vault.stats.nodeCount}
            />
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
}

/**
 * Stateful Board component with reducers and input handling.
 * Renders BoardCore with computed state.
 *
 * NEW ARCHITECTURE:
 * - Uses SimplifiedBoardState (cursorNodeId only, no nodes array)
 * - Derives columns from Vault at render time via useColumns
 * - Derives cursor position from cursorNodeId via useCursorPosition
 */
export function Board({
  initialState,
  initialViewMode = "cards",
  dimensions,
  onExit,
  layoutRegistry: injectedRegistry,
  reducer = uiReducer,
}: BoardProps) {
  const vault = useVault();

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
  const initialCursorNodeId = useMemo(() => {
    if (initialState.colIndex >= 0) {
      const col = initialState.columns[initialState.colIndex];
      if (col && initialState.cardIndex >= 0) {
        const card = col.cards[initialState.cardIndex];
        return card?.node.id ?? col.node.id;
      }
      return col?.node.id ?? null;
    }
    return null;
  }, [initialState]);

  // Board navigation state managed by simplifiedBoardReducer
  // No nodes array - just IDs and Sets
  const [boardState, dispatchBoard] = useReducer(
    simplifiedBoardReducer,
    null, // unused
    () =>
      createSimplifiedBoardState(
        initialState.rootId,
        initialState.rootPath,
        initialCursorNodeId,
      ),
  );

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

  // NEW: Derive columns from Vault (not from state.nodes)
  const columns = useColumns(vault, boardState.rootId, boardState.foldedNodes);

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

  // Legacy state accessor for compatibility during migration
  const state: TUIBoardState = useMemo(
    () => ({
      rootId: boardState.rootId,
      rootPath: boardState.rootPath,
      columns: columnsLayout.columns,
      colIndex: columnsLayout.colIndex,
      cardIndex: columnsLayout.cardIndex,
      selectedCards: new Set<string>(),
      visualMode: false,
      foldedCards: boardState.foldedNodes,
      collapsedColumns: new Set<number>(),
      searchQuery: "",
      searchMode: false,
      helpMode: false,
      zoomStack: boardState.zoomStack.map(
        (z: { rootId: string | null }) => z.rootId ?? "",
      ),
    }),
    [boardState, columnsLayout],
  );

  // Dialog handlers (no longer need boardState/dispatchBoard - columns derived from vault)
  const dialogHandlers = useBoardDialogs({
    vault,
    state,
    dispatch,
  });

  // Calculate visible columns for scroll offset tracking
  const termWidth = ui.dimensions.columns;
  const maxCols = Math.min(
    state.columns.length,
    Math.max(2, Math.floor(termWidth / 35)),
  );

  // Update scroll offset ref
  const colScrollOffset = calcEdgeBasedColumnScrollOffset(
    state.colIndex,
    colScrollOffsetRef.current,
    maxCols,
    state.columns.length,
  );
  colScrollOffsetRef.current = colScrollOffset;

  // Cast dispatchBoard to transitional type for legacy action compatibility
  const transitionalDispatch =
    dispatchBoard as React.Dispatch<TransitionalBoardAction>;

  // Build unified TUI context once - passed to all handlers
  const tuiContext: TUIContext = buildTUIContext({
    vault,
    state,
    boardState,
    ui,
    layout: columnsLayout,
    positionRegistry: layoutRegistry,
    dispatch,
    dispatchBoard: transitionalDispatch,
    exit: onExit,
    countVisibleDescendants: (node, depth, maxDepth, foldedNodes) =>
      countVisibleDescendants(vault, node, depth, maxDepth, foldedNodes),
  });

  // Initialize command system on first render
  useEffect(() => {
    ensureCommandSystemInitialized();
  }, []);

  // Handle file drops via bracketed paste
  useEffect(() => createFileDropHandler(dispatch), []);

  // Subscribe to watcher status updates
  useEffect(() => createWatcherStatusHandler(dispatch), []);

  // Subscribe to external refresh events (filesystem changes)
  useEffect(
    () => createRefreshHandler(vault, rootIdRef, transitionalDispatch),
    [vault],
  );

  // Main keyboard input handler - ALL keys go through @km/commands
  useInput((input, key) => {
    handleBoardKeyInput(
      input,
      key,
      tuiContext,
      {
        showNewItemDialog: ui.showNewItemDialog,
        showProjectPicker: ui.showProjectPicker,
        showHelp: ui.showHelp,
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
        vault,
        boardState,
        dispatch,
        transitionalDispatch,
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
      ui={ui}
      derivedSelectionLevel={derivedSelectionLevel}
      dimensions={ui.dimensions}
      layoutRegistry={layoutRegistry}
      dispatch={dispatch}
      dialogHandlers={dialogHandlers}
    />
  );
}

// =============================================================================
// BoardApp - Production Entry (useVault, useStdout, external integrations)
// =============================================================================

export interface BoardAppProps {
  /** Initial board state */
  initialState: TUIBoardState;
  /** Initial view mode (default: "cards") */
  initialViewMode?: ViewMode;
  /** Optional layout registry for card position tracking (for testing) */
  layoutRegistry?: LayoutRegistry;
}

/**
 * Production entry component with external integrations.
 * Gets vault, dimensions, exit from context/hooks.
 * Handles terminal dimension sync only - other effects moved to Board.
 */
export function BoardApp({
  initialState,
  initialViewMode = "cards",
  layoutRegistry,
}: BoardAppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();

  // Create dispatch for dimension sync
  const [dimensionState, dimensionDispatch] = useReducer(
    (
      state: { columns: number; rows: number },
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
    <Board
      initialState={initialState}
      initialViewMode={initialViewMode}
      dimensions={dimensionState}
      onExit={exit}
      layoutRegistry={layoutRegistry}
    />
  );
}

// =============================================================================
// Helper Functions
// =============================================================================

function countVisibleDescendants(
  vault: Vault,
  node: KNode,
  depth: number,
  maxDepth: number,
  foldedNodes: Set<string>,
): number {
  if (depth > maxDepth || foldedNodes.has(node.id)) {
    return 0;
  }
  const children = vault.getChildren(node.id).slice(0, 10);
  let count = children.length;
  for (const child of children) {
    count += countVisibleDescendants(
      vault,
      child,
      depth + 1,
      maxDepth,
      foldedNodes,
    );
  }
  return count;
}

/**
 * Restore terminal to normal state after crash or exit.
 */
function restoreTerminal(): void {
  if (process.stdin.isTTY && process.stdin.isRaw) {
    try {
      process.stdin.setRawMode(false);
    } catch {
      // Ignore errors during cleanup
    }
  }

  const sequences = [
    "\x1b[0m", // Reset text attributes
    "\x1b[?1007l\x1b[?1003l\x1b[?1002l\x1b[?1000l\x1b[?1006l", // Disable mouse
    "\x1b[?1l", // Disable application cursor keys
    "\x1b[?2004l", // Disable bracketed paste
    "\x1b[?25h", // Show cursor
    "\x1b[?1049l", // Exit alternate screen
  ].join("");

  try {
    writeSync(process.stdout.fd, sequences);
  } catch {
    process.stdout.write(sequences);
  }
}

// =============================================================================
// Render Entry Points
// =============================================================================

export async function renderInkxBoard(
  state: TUIBoardState,
  initialViewMode?: ViewMode,
  vault?: Vault,
): Promise<void> {
  debug("renderInkxBoard start");

  if (!vault) {
    throw new Error("renderInkxBoard requires a vault");
  }

  const app = (
    <VaultProvider vault={vault}>
      <BoardApp initialState={state} initialViewMode={initialViewMode} />
    </VaultProvider>
  );

  // Register error handlers to clean up terminal on crash
  const handleError = (error: Error) => {
    restoreTerminal();
    console.error("\n\nTUI crashed with error:", error.message);
    console.error(error.stack);
    process.exit(1);
  };

  const handleSignal = (signal: string) => {
    restoreTerminal();
    process.exit(signal === "SIGINT" ? 130 : 143);
  };

  process.on("uncaughtException", handleError);
  process.on("unhandledRejection", (reason) => {
    handleError(reason instanceof Error ? reason : new Error(String(reason)));
  });
  process.once("SIGINT", () => handleSignal("SIGINT"));
  process.once("SIGTERM", () => handleSignal("SIGTERM"));

  debug("Rendering with inkx");
  const instance = await inkxRender(app, {
    exitOnCtrlC: true,
    patchConsole: false,
    alternateScreen: true,
  });

  debug("Render complete, awaiting exit");
  await instance.waitUntilExit();
}

// NOTE: InkBoardTestable removed - use BoardCore directly for testing
// See testing.ts for the new test harness pattern
