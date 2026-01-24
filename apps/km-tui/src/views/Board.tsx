/**
 * Ink-based Board TUI Component
 * Full-screen board view with columns and cards
 */
import React, { useEffect, useReducer, useMemo, useRef } from "react";
import { Box, Text, useInput, useApp, useStdout } from "inkx";
import chalk from "chalk";
import { hyperlink } from "@beorn/chalkx";
import createDebug from "debug";

const debug = createDebug("km:board");
import type { BoardState, ViewMode, TuiEngine } from "../types.ts";
import { getNodeDisplayName } from "../state.ts";
import type { KNode } from "@km/core";
import { getChildren, getNode, getStore, getNodeCount } from "@km/storage";
import type { KeyboardContext } from "../keyboard-types.ts";
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
import { getEngine } from "../engines/index.ts";
import { renderPlain, getNodeIcon, getChalkColor } from "../text/index.ts";
import { getInheritedColor } from "../board-pills.ts";
import { renderPath } from "../layout/index.ts";
import { tuiEvents } from "../tui.ts";
import { UIProvider } from "../ui-context.tsx";
import { LayoutProvider } from "../layout-context.tsx";
import { createLayoutRegistry } from "../card-positions.ts";
import { uiReducer, createInitialUIState, actions } from "../ui-reducer.ts";
import { useBoardDialogs } from "./use-board-dialogs.ts";
import { ConstraintRoot } from "../layout/index.ts";
import { ensureCommandSystemInitialized } from "../command-bridge.ts";
import {
  buildTUIContext,
  toKeyboardContext,
  type TUIContext,
} from "../tui-context.ts";
import { boardReducer, createNodeMap } from "@km/board";
import {
  tuiStateToTreeState,
  deriveColumns,
  deriveCursorIndices,
  buildTreeNodes,
} from "../board-adapter.ts";

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
  createMouseHandler_,
  createRefreshHandler,
  createWatcherStatusHandler,
} from "./board-effects.ts";
import {
  handleBoardKeyInput,
  handleDetailPaneKeyInput,
} from "./board-input.ts";

export { makeSelectionKey } from "../types.ts";

// =============================================================================
// Main Board Component
// =============================================================================

export interface BoardProps {
  initialState: BoardState;
  initialViewMode?: ViewMode;
}

// Exported for testing with inkx createTestRenderer
export function Board({ initialState, initialViewMode = "cards" }: BoardProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();

  // UI state managed by reducer (enables extracting input handlers)
  const [ui, dispatch] = useReducer(
    uiReducer,
    {
      initialViewMode,
      collapsedColumns: [...(initialState.collapsedColumns ?? [])],
      stdout,
      rootBoardId: initialState.rootId,
    },
    (init) =>
      createInitialUIState(
        init.initialViewMode,
        init.collapsedColumns,
        {
          columns: init.stdout?.columns ?? 80,
          rows: init.stdout?.rows ?? 24,
        },
        init.rootBoardId,
      ),
  );

  // Convert initial TUI state to tree-based state for boardReducer
  // Uses initialState in deps to ensure it's captured on mount
  const initialTreeState = useMemo(
    () =>
      tuiStateToTreeState(initialState, {
        foldedNodes: new Set<string>(),
        navHistory: [],
        navHistoryIndex: 0,
      }),
    [initialState],
  );

  // Board navigation state managed by @km/board's boardReducer
  const [boardState, dispatchBoard] = useReducer(
    boardReducer,
    initialTreeState,
  );

  // Ref to track current rootId for event handlers (avoids stale closure)
  const rootIdRef = useRef(boardState.rootId);
  useEffect(() => {
    rootIdRef.current = boardState.rootId;
  }, [boardState.rootId]);

  // Ref for edge-based horizontal scroll tracking
  const colScrollOffsetRef = useRef(0);

  // Layout registry for card position tracking (used by h/l navigation)
  // Created once and never changes - stable reference for context
  const layoutRegistryRef = useRef<ReturnType<
    typeof createLayoutRegistry
  > | null>(null);
  if (!layoutRegistryRef.current) {
    layoutRegistryRef.current = createLayoutRegistry();
  }
  const layoutRegistry = layoutRegistryRef.current;

  // PERFORMANCE OPTIMIZATION: Separate columns derivation from cursor derivation
  // This ensures cursor movement (which changes boardState.cursor) does NOT
  // cause all columns to be rebuilt. Columns only rebuild when tree structure changes.

  // Derive columns ONLY when tree structure changes (not on cursor moves)
  const columns = useMemo(
    () => deriveColumns(boardState.nodes),
    [boardState.nodes], // Only depends on nodes, not cursor!
  );

  // Derive cursor indices on every cursor change (cheap operation)
  const cursorIndices = useMemo(
    () => deriveCursorIndices(boardState),
    [boardState.cursor, boardState.cursorNodeId, boardState.nodes],
  );

  // Combined layout for compatibility (uses stable columns reference)
  const columnsLayout = useMemo(
    () => ({
      columns,
      colIndex: cursorIndices.colIndex,
      cardIndex: cursorIndices.cardIndex,
      subPath: cursorIndices.subPath,
      isAtCardLevel: cursorIndices.isAtCardLevel,
      isInOutlineMode: cursorIndices.isInOutlineMode,
    }),
    [columns, cursorIndices],
  );

  // Build nodeMap once when nodes change (O(n) only on tree changes, not every render)
  const nodeMap = useMemo(
    () => createNodeMap(boardState.nodes),
    [boardState.nodes],
  );

  // Derive cursorDepth from cursor path length (replaces stored selectionLevel)
  // depth 0 = board level, depth 1 = column level, depth 2+ = card level
  const cursorDepth = boardState.cursor.length;
  const derivedSelectionLevel: "board" | "column" | "card" =
    cursorDepth === 0 ? "board" : cursorDepth === 1 ? "column" : "card";

  // Legacy state accessor for compatibility during migration
  // Components still expect the old BoardState shape
  const state: BoardState = useMemo(
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
      zoomStack: boardState.zoomStack.map((z) => z.rootId ?? ""),
    }),
    [boardState, columnsLayout],
  );

  // Dialog handlers (extracted to separate hook for maintainability)
  const {
    handleProjectSelect,
    handleProjectCancel,
    handleNewItemCreate,
    handleNewItemCancel,
  } = useBoardDialogs({ state, boardState, dispatch, dispatchBoard });

  // WORKAROUND: fullscreen-ink alternate buffer race condition (issue km-rqt6)
  // See board-effects.ts for detailed explanation
  useEffect(() => createSyncTerminalDimensions(stdout, dispatch), [stdout]);

  // Sync rootBoardId in UI state when board navigation changes
  useEffect(
    () => dispatch(actions.setRootBoardId(state.rootId)),
    [state.rootId],
  );

  // Handle file drops via bracketed paste
  useEffect(() => createFileDropHandler(dispatch), []);

  // Handle mouse drag-select
  useEffect(
    () => createMouseHandler_(dispatch, dispatchBoard, ui.mouseSelection),
    [ui.mouseSelection],
  );

  // Subscribe to external refresh events (filesystem changes)
  useEffect(() => createRefreshHandler(rootIdRef, dispatchBoard), []);

  // Subscribe to watcher status updates (for bottom bar display)
  useEffect(() => createWatcherStatusHandler(dispatch), []);

  const termWidth = ui.dimensions.columns;
  const termHeight = ui.dimensions.rows;

  const maxCols = Math.min(
    state.columns.length,
    Math.max(2, Math.floor(termWidth / 35)),
  );

  // Horizontal scrolling for columns (edge-based)
  const colScrollOffset = calcEdgeBasedColumnScrollOffset(
    state.colIndex,
    colScrollOffsetRef.current,
    maxCols,
    state.columns.length,
  );
  colScrollOffsetRef.current = colScrollOffset;
  const visibleColumns = state.columns.slice(
    colScrollOffset,
    colScrollOffset + maxCols,
  );

  // Build unified TUI context once - passed to all handlers
  const tuiContext: TUIContext = buildTUIContext({
    state,
    boardState,
    ui,
    layout: columnsLayout,
    nodeMap,
    positionRegistry: layoutRegistry,
    dispatch,
    dispatchBoard,
    exit,
    countVisibleDescendants,
  });

  // Legacy keyboard context for backward compatibility during migration
  // TODO(km-mz2g): Remove when command system migration is complete
  const _keyboardContext: KeyboardContext = toKeyboardContext(tuiContext);

  // Initialize command system on first render
  useEffect(() => {
    ensureCommandSystemInitialized();
  }, []);

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
      exit,
    );
  });

  // Handle detail pane navigation (j/k to move cards while pane is open)
  useInput(
    (input, key) => {
      handleDetailPaneKeyInput(
        input,
        key,
        state,
        dispatch,
        dispatchBoard,
        exit,
      );
    },
    {
      isActive: ui.showDetailPane,
    },
  );

  // Build selected item path segments for colorized top bar
  // Shows full path from filesystem root to selected item based on selection level
  const selectedCol = state.columns[state.colIndex];
  const selectedCard = selectedCol?.cards[state.cardIndex];

  // Determine which node to show path to based on selection level
  // Card level shows card path (or column if no card), column shows column, board shows root
  const pathNodeId =
    derivedSelectionLevel === "board" || !selectedCol
      ? state.rootId
      : derivedSelectionLevel === "column" || !selectedCard
        ? selectedCol.node.id
        : selectedCard.node.id;
  const selectedPathSegments = renderPath(
    getPathSegments(pathNodeId, state.rootId),
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
  // Use same edge-based scroll offset (already calculated above with colScrollOffsetRef)
  const effectiveScrollOffset = ui.showDetailPane
    ? calcEdgeBasedColumnScrollOffset(
        state.colIndex,
        colScrollOffsetRef.current,
        effectiveMaxCols,
        state.columns.length,
      )
    : colScrollOffset;
  const effectiveVisibleColumns = ui.showDetailPane
    ? state.columns.slice(
        effectiveScrollOffset,
        effectiveScrollOffset + effectiveMaxCols,
      )
    : visibleColumns;

  // Build top bar - use board's color as background, or blue if selected/no color
  const isBoardSelected = derivedSelectionLevel === "board";

  // Render loading indicator until terminal is ready
  // This prevents blank screen while waiting for alternate buffer to stabilize
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
            {/* Board root is bold, other segments are dimmed */}
            {/* backgroundColor on Box ensures full width fill */}
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
                    onSelect={handleProjectSelect}
                    onCancel={handleProjectCancel}
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
                    onCreate={handleNewItemCreate}
                    onCancel={handleNewItemCancel}
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
              storageMode={getStore().mode}
              nodeCount={getNodeCount()}
            />
          </Box>
        </UIProvider>
      </LayoutProvider>
    </ConstraintRoot>
  );
}

// Helper to count visible descendants for flat indexing
function countVisibleDescendants(
  node: KNode,
  depth: number,
  maxDepth: number,
  foldedNodes: Set<string>,
): number {
  if (depth > maxDepth || foldedNodes.has(node.id)) {
    return 0;
  }
  const children = getChildren(node.id).slice(0, 10);
  let count = children.length;
  for (const child of children) {
    count += countVisibleDescendants(child, depth + 1, maxDepth, foldedNodes);
  }
  return count;
}

export async function renderInkxBoard(
  state: BoardState,
  initialViewMode?: ViewMode,
  engine: TuiEngine = "inkx",
): Promise<void> {
  debug("renderInkxBoard start, engine=%s", engine);

  const app = <Board initialState={state} initialViewMode={initialViewMode} />;

  // Use the engine-specific render function
  const engineApi = getEngine(engine);
  debug("Got engine API");

  const { waitUntilExit } = await engineApi.render(app, {
    exitOnCtrlC: true,
    patchConsole: false,
  });
  debug("Render complete, awaiting exit");

  await waitUntilExit();
}

// =============================================================================
// Render Entry Points
// =============================================================================

// Testable version of Board component with fixed ui.dimensions for testing
interface TestBoardProps {
  initialState: BoardState;
  testWidth: number;
  testHeight: number;
}

export function InkBoardTestable({
  initialState,
  testWidth,
  testHeight,
}: TestBoardProps): React.ReactElement {
  // Create a mock UI state for testing
  const mockUIState = createInitialUIState("cards", [], {
    columns: testWidth,
    rows: testHeight,
  });

  // Use fixed test ui.dimensions instead of stdout
  const termWidth = testWidth;
  const termHeight = testHeight;
  const testContentHeight = termHeight - TOP_BAR_HEIGHT - BOTTOM_BAR_HEIGHT;

  const maxCols = Math.min(
    initialState.columns.length,
    Math.max(2, Math.floor(termWidth / 35)),
  );
  const colWidth = Math.floor((termWidth - 2) / maxCols);

  const colScrollOffset = Math.max(
    0,
    Math.min(
      initialState.colIndex - Math.floor(maxCols / 2),
      Math.max(0, initialState.columns.length - maxCols),
    ),
  );
  const visibleColumns = initialState.columns.slice(
    colScrollOffset,
    colScrollOffset + maxCols,
  );

  const selectedCol = initialState.columns[initialState.colIndex];
  const selectedCard = selectedCol?.cards[initialState.cardIndex];
  const selectedPathSegments = selectedCard
    ? renderPath(
        getPathSegments(selectedCard.node.id, initialState.rootId),
        termWidth - 4,
      )
    : getPathSegments(initialState.rootId, initialState.rootId);

  // Build top bar with consistent white background, varying foreground colors
  // Path segments are clickable hyperlinks for navigation (km://root/<id>)
  const testTopBarContent = selectedPathSegments
    .map((seg) => {
      const sepPart = seg.sep ? chalk.bgWhite.gray(` ${seg.sep} `) : "";
      // Get color icon for this segment if it has one
      const segColor = seg.node ? getInheritedColor(seg.node) : undefined;
      const segIcon = segColor ? getNodeIcon(null, segColor) : null;
      const iconPart = segIcon
        ? chalk.bgWhite(getChalkColor(segIcon.color)(segIcon.char)) + " "
        : "";
      // Make segment name a clickable hyperlink to navigate to that node
      const url = seg.id ? `km://root/${seg.id}` : "";
      const linkedName = seg.id ? hyperlink(seg.name, url) : seg.name;
      const namePart = seg.isWithinBoard
        ? chalk.bgWhite.blue(linkedName)
        : chalk.bgWhite.black(linkedName);
      return sepPart + iconPart + namePart;
    })
    .join("");
  const testVisibleLen =
    1 +
    selectedPathSegments.reduce((acc, seg) => {
      const segColor = seg.node ? getInheritedColor(seg.node) : undefined;
      const iconLen = segColor ? 2 : 0; // icon char + space
      return (
        acc + seg.name.length + iconLen + (seg.sep ? seg.sep.length + 2 : 0)
      );
    }, 0);
  const testPadding = " ".repeat(Math.max(0, termWidth - testVisibleLen));

  // No-op dispatch for static test render
  const noopDispatch = () => {};

  return (
    <UIProvider state={mockUIState} dispatch={noopDispatch}>
      <Box flexDirection="column" height={termHeight} minHeight={3}>
        {/* Top bar: full path */}
        <Box height={1} width={termWidth}>
          <Text>
            {chalk.bgWhite.black(" ") +
              testTopBarContent +
              chalk.bgWhite(testPadding)}
          </Text>
        </Box>
        <Box flexDirection="row" flexGrow={1}>
          {visibleColumns.map((col, i) => {
            const actualColIndex = colScrollOffset + i;
            return (
              <Column
                key={col.node.id}
                column={col}
                colIndex={actualColIndex}
                isSelected={actualColIndex === initialState.colIndex}
                isCollapsed={initialState.collapsedColumns.has(actualColIndex)}
                selectedCardIndex={initialState.cardIndex}
                selectedSubIndex={-1}
                width={colWidth}
                height={testContentHeight}
                selectionLevel="card"
              />
            );
          })}
        </Box>
        {/* Bottom bar: indicators right-aligned */}
        <Box width={termWidth} justifyContent="flex-end" paddingX={1}>
          <Text>
            {initialState.columns.length > maxCols && (
              <Text dimColor>
                {`[cols ${colScrollOffset + 1}-${colScrollOffset + maxCols}/${initialState.columns.length}] `}
              </Text>
            )}
            <Text inverse>{" BOARD "}</Text>
          </Text>
        </Box>
      </Box>
    </UIProvider>
  );
}

// NOTE: renderTopBarSegments removed - top bar now uses pure inkx styling
// See bead for chalk+inkx styling consolidation
