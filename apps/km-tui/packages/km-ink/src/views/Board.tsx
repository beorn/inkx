/**
 * Ink-based Board TUI Component
 * Full-screen board view with columns and cards
 */
import React, { useState, useEffect, useReducer } from "react";
import { Box, Text, useInput, useApp, useStdout } from "ink";
import { withFullScreen } from "fullscreen-ink";
import chalk, { type ChalkInstance } from "chalk";
import { hyperlink } from "@beorn/chalkx";
import type { BoardState, ViewMode } from "../types.ts";
import { buildBoardState } from "../state.ts";
import type { KNode } from "@km/core";
import { getChildren, getNode, getStore } from "@km/storage";
import {
  handleKeyboardInput as handleKeyboardWrapper,
  handleDetailPaneInput as handleDetailPaneWrapper,
  type KeyboardContext,
} from "../keyboard-handler.ts";
import { getNodeDisplayName } from "../state.ts";
import { DetailPane } from "./DetailPane.tsx";
import { ProjectPicker } from "./ProjectPicker.tsx";
import { HelpOverlay } from "./HelpOverlay.tsx";
import { NewItemDialog } from "./NewItemDialog.tsx";
import { ListView } from "./ListView.tsx";
import { ColumnsView } from "./ColumnsView.tsx";
import { TabsView } from "./TabsView.tsx";
import {
  createPasteHandler,
  getFileInfo,
  supportsFileDrop,
} from "../paste-handler.ts";
import {
  createMouseHandler,
  supportsMouseMode,
  SelectionManager,
  type MouseEvent as TermMouseEvent,
} from "../mouse-handler.ts";
import { renderPlain, getNodeIcon, getChalkColor } from "../text/index.ts";
import { getInheritedColor, getOwnColor } from "../board-pills.ts";
import { renderPath } from "../layout/index.ts";
import { Column } from "./CardColumn.tsx";
import { tuiEvents } from "../tui.ts";
import { UIProvider } from "../ui-context.tsx";
import { uiReducer, createInitialUIState, actions } from "../ui-reducer.ts";
import { useBoardDialogs } from "./use-board-dialogs.ts";

export { makeSelectionKey } from "./TreeNode.tsx";

// =============================================================================
// Main Board Component
// =============================================================================

interface BoardProps {
  initialState: BoardState;
  initialViewMode?: ViewMode;
}

function Board({ initialState, initialViewMode = "cards" }: BoardProps) {
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

  // Board state (navigation) - still useState for now, could migrate to boardReducer
  const [state, setState] = useState(initialState);

  // Dialog handlers (extracted to separate hook for maintainability)
  const {
    handleProjectSelect,
    handleProjectCancel,
    handleNewItemCreate,
    handleNewItemCancel,
  } = useBoardDialogs({ state, dispatch, setState });

  // WORKAROUND: fullscreen-ink alternate buffer race condition (issue km-rqt6)
  //
  // Problem: On TUI startup, the top status bar line was missing until a key was pressed.
  // This caused either a missing line or a visible flash/scroll when content appeared.
  //
  // Root cause: fullscreen-ink switches to the terminal's alternate screen buffer using
  // escape sequences, then calls Ink's rerender(). However:
  // 1. Ink's useStdout() returns stdout with undefined columns/rows on first render
  // 2. The first render frame may be discarded during the alternate buffer switch
  // 3. This causes the initial render to be incomplete or positioned incorrectly
  //
  // Solution: Delay rendering the actual UI until the terminal is fully ready:
  // 1. Poll for valid stdout ui.dimensions (columns/rows defined)
  // 2. Wait an additional 50ms for alternate buffer to stabilize
  // 3. Render an empty Box until ready, then render the full UI
  //
  // The 50ms delay is a balance between avoiding the race condition and minimizing
  // perceived startup latency. Shorter delays may reintroduce the bug.

  // Sync terminal ui.dimensions and handle the initial render delay
  useEffect(syncTerminalDimensions, [stdout]);

  // Sync rootBoardId in UI state when board navigation changes
  useEffect(
    () => dispatch(actions.setRootBoardId(state.rootId)),
    [state.rootId],
  );

  // Handle file drops via bracketed paste
  useEffect(setupFileDropHandler, []);

  // Handle mouse drag-select
  useEffect(setupMouseHandler, [ui.mouseSelection]);

  // Subscribe to external refresh events (filesystem changes)
  useEffect(setupRefreshHandler, []);

  const termWidth = ui.dimensions.columns;
  const termHeight = ui.dimensions.rows;

  const maxCols = Math.min(
    state.columns.length,
    Math.max(2, Math.floor(termWidth / 35)),
  );

  // Horizontal scrolling for columns
  const colScrollOffset = calcScrollOffset(
    state.colIndex,
    maxCols,
    state.columns.length,
  );
  const visibleColumns = state.columns.slice(
    colScrollOffset,
    colScrollOffset + maxCols,
  );

  // Create keyboard context for the extracted handlers
  const keyboardContext: KeyboardContext = {
    state,
    ui,
    setState,
    dispatch,
    exit,
    countVisibleDescendants,
  };

  // Main keyboard input handler (uses extracted logic)
  useInput((input, key) => handleKeyboardWrapper(keyboardContext, input, key));

  // Handle detail pane navigation (j/k to move cards while pane is open)
  useInput(
    (input, key) => handleDetailPaneWrapper(keyboardContext, input, key),
    {
      isActive: ui.showDetailPane,
    },
  );

  // Handlers defined after return (hoisted)

  // Build selected item path segments for colorized top bar
  // Shows full path from filesystem root to selected item based on selection level
  const selectedCol = state.columns[state.colIndex];
  const selectedCard = selectedCol?.cards[state.cardIndex];

  // Determine which node to show path to based on selection level
  // Card level shows card path (or column if no card), column shows column, board shows root
  const pathNodeId =
    ui.selectionLevel === "board" || !selectedCol
      ? state.rootId
      : ui.selectionLevel === "column" || !selectedCard
        ? selectedCol.node.id
        : selectedCard.node.id;
  const selectedPathSegments = renderPath(
    getPathSegments(pathNodeId, state.rootId),
    termWidth - 4,
  );

  // Calculate widths for split view
  const detailPaneWidth = ui.showDetailPane ? Math.floor(termWidth * 0.4) : 0;
  const boardWidth = termWidth - detailPaneWidth;

  // Recalculate columns when detail pane is shown (narrower view)
  const effectiveMaxCols = ui.showDetailPane
    ? Math.min(state.columns.length, Math.max(1, Math.floor(boardWidth / 35)))
    : maxCols;
  const effectiveScrollOffset = calcScrollOffset(
    state.colIndex,
    effectiveMaxCols,
    state.columns.length,
  );
  const effectiveVisibleColumns = ui.showDetailPane
    ? state.columns.slice(
        effectiveScrollOffset,
        effectiveScrollOffset + effectiveMaxCols,
      )
    : visibleColumns;

  // Build top bar - use board's color as background, or blue if selected/no color
  const isBoardSelected = ui.selectionLevel === "board";

  // Get board's own color for the top bar background (not inherited)
  const boardNode = state.rootId ? getNode(state.rootId) : null;
  const boardColor = boardNode ? getOwnColor(boardNode) : undefined;

  // Determine background color: board's color if available, blue if selected, white otherwise
  const topBarBgChalk = getTopBarBgChalk(boardColor, isBoardSelected);

  // Determine text color based on background (dark bg = white text, light bg = black text)
  const darkBgColors = ["red", "green", "blue", "magenta", "gray", "grey"];
  const useWhiteText = boardColor
    ? darkBgColors.includes(boardColor)
    : isBoardSelected;

  const topBarContent = renderTopBarSegments(
    selectedPathSegments,
    topBarBgChalk,
    useWhiteText,
  );
  // Calculate visible length (without ANSI codes) - no more icon chars
  const visibleLen =
    1 +
    selectedPathSegments.reduce((acc, seg) => {
      return acc + seg.name.length + (seg.sep ? seg.sep.length + 2 : 0);
    }, 0);
  const padding = " ".repeat(Math.max(0, termWidth - visibleLen));

  // Background color for the top bar
  const topBarBg = topBarBgChalk;
  const topBarFg = useWhiteText ? topBarBgChalk.white : topBarBgChalk.black;

  // Render loading indicator until terminal is ready (see ui.isReady comment above)
  // This prevents the flash/scroll caused by fullscreen-ink's alternate buffer race condition
  if (!ui.isReady) {
    return (
      <Box
        height={termHeight}
        width={termWidth}
        justifyContent="center"
        alignItems="center"
      >
        <Text color="gray">Loading...</Text>
      </Box>
    );
  }

  return (
    <UIProvider state={ui} dispatch={dispatch}>
      <Box flexDirection="column" height={termHeight} minHeight={3}>
        {/* Top bar: full path from root to selected item, inverted full width */}
        <Box height={1} width={termWidth}>
          <Text>{topBarFg(" ") + topBarContent + topBarBg(padding)}</Text>
        </Box>
        <Box flexGrow={1} flexDirection="row" height={termHeight - 2}>
          {/* Cards, Columns, or List view */}
          {ui.viewMode === "cards" ? (
            <Box flexDirection="row" width={boardWidth} height={termHeight - 2}>
              {/* Left scroll indicator - full height filled bar */}
              {effectiveScrollOffset > 0 && (
                <Box flexDirection="column" width={1} height={termHeight - 3}>
                  {Array.from({ length: termHeight - 3 }).map((_, i) => (
                    <Text key={i} backgroundColor="gray" color="white">
                      {i === Math.floor((termHeight - 3) / 2) ? "‹" : " "}
                    </Text>
                  ))}
                </Box>
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
                const adjustedColWidth = baseColWidth + (i < remainder ? 1 : 0);
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
                      height={termHeight - 2}
                      selectionLevel={ui.selectionLevel}
                    />
                    {/* Separator line between columns */}
                    {!isLastCol && (
                      <Box
                        flexDirection="column"
                        width={1}
                        height={termHeight - 2}
                      >
                        {/* Blank line to align with column header spacing */}
                        <Text> </Text>
                        {Array.from({ length: termHeight - 3 }).map((_, j) => (
                          <Text key={j} color="gray">
                            │
                          </Text>
                        ))}
                      </Box>
                    )}
                  </React.Fragment>
                );
              })}
              {/* Right scroll indicator - full height filled bar */}
              {effectiveScrollOffset + effectiveMaxCols <
                state.columns.length && (
                <Box flexDirection="column" width={1} height={termHeight - 3}>
                  {Array.from({ length: termHeight - 3 }).map((_, i) => (
                    <Text key={i} backgroundColor="gray" color="white">
                      {i === Math.floor((termHeight - 3) / 2) ? "›" : " "}
                    </Text>
                  ))}
                </Box>
              )}
            </Box>
          ) : ui.viewMode === "columns" ? (
            <ColumnsView
              state={state}
              width={boardWidth}
              height={termHeight - 2}
              colIndex={state.colIndex}
              cardIndex={state.cardIndex}
              subIndex={ui.subIndex}
              effectiveScrollOffset={effectiveScrollOffset}
              effectiveMaxCols={effectiveMaxCols}
              effectiveVisibleColumns={effectiveVisibleColumns}
              selectionLevel={ui.selectionLevel}
            />
          ) : ui.viewMode === "list" ? (
            <ListView
              state={state}
              width={boardWidth}
              height={termHeight - 2}
              colIndex={state.colIndex}
              cardIndex={state.cardIndex}
              subIndex={ui.subIndex}
              selectionLevel={ui.selectionLevel}
            />
          ) : (
            <TabsView
              state={state}
              width={boardWidth}
              height={termHeight - 2}
              colIndex={state.colIndex}
              cardIndex={state.cardIndex}
              subIndex={ui.subIndex}
              selectionLevel={ui.selectionLevel}
            />
          )}
          {/* Detail pane */}
          {ui.showDetailPane && selectedCard && (
            <DetailPane
              node={selectedCard.node}
              width={detailPaneWidth}
              height={termHeight - 2}
            />
          )}
          {/* Project picker modal */}
          {ui.showProjectPicker && (
            <Box
              position="absolute"
              marginLeft={Math.floor(termWidth / 4)}
              marginTop={Math.floor(termHeight / 4)}
            >
              <ProjectPicker
                onSelect={handleProjectSelect}
                onCancel={handleProjectCancel}
                width={Math.floor(termWidth / 2)}
                height={Math.floor(termHeight / 2)}
                recentProjectIds={ui.recentProjectIds}
              />
            </Box>
          )}
          {/* New item dialog modal */}
          {ui.showNewItemDialog && (
            <Box
              position="absolute"
              marginLeft={Math.floor(termWidth / 4)}
              marginTop={Math.floor(termHeight / 3)}
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
            <HelpOverlay width={termWidth} height={termHeight - 2} />
          )}
        </Box>
        {/* Bottom bar: mode indicator left, other indicators right */}
        <Box width={termWidth} justifyContent="space-between" paddingX={1}>
          {/* Left side: store mode indicator and path */}
          <Text>
            {(() => {
              const store = getStore();
              if (store.mode === "memory") {
                return <Text color="yellow">MEM REPO {store.rootPath}</Text>;
              }
              return <Text color="green">DISK REPO {store.rootPath}</Text>;
            })()}
          </Text>
          {/* Right side: status indicators */}
          <Text>
            {ui.showHelp && <Text color="cyan">{`[HELP ?] `}</Text>}
            {ui.showProjectPicker && <Text color="green">{`[PROJECT] `}</Text>}
            {ui.showNewItemDialog && <Text color="green">{`[NEW] `}</Text>}
            {ui.showDropNotification && ui.droppedFiles.length > 0 && (
              <Text color="green">
                {`[Dropped: ${ui.droppedFiles.map((f) => getFileInfo(f).name).join(", ")}] `}
              </Text>
            )}
            {ui.isMouseDragging && ui.mouseSelection && (
              <Text color="blue">{`[Select: ${ui.mouseSelection.startY}-${ui.mouseSelection.endY}] `}</Text>
            )}
            {ui.multiSelected.size > 0 && (
              <Text color="yellow">{`[${ui.multiSelected.size} sel] `}</Text>
            )}
            {ui.inOutlineMode && <Text color="cyan">{`OUTLINE `}</Text>}
            {ui.selectionLevel !== "card" && (
              <Text color="magenta">{`${ui.selectionLevel.toUpperCase()} `}</Text>
            )}
            <Text inverse>{` ${ui.viewMode.toUpperCase()} VIEW `}</Text>
          </Text>
        </Box>
      </Box>
    </UIProvider>
  );

  // ===========================================================================
  // Effect Handlers (hoisted for readability)
  // ===========================================================================

  function syncTerminalDimensions() {
    if (!stdout) return;

    const handleResize = () => {
      dispatch(
        actions.setDimensions({ columns: stdout.columns, rows: stdout.rows }),
      );
    };

    // Check if stdout has valid ui.dimensions (not undefined)
    const syncDimensions = () => {
      if (stdout.columns !== undefined && stdout.rows !== undefined) {
        dispatch(
          actions.setDimensions({ columns: stdout.columns, rows: stdout.rows }),
        );
        return true;
      }
      return false;
    };

    // Try to sync immediately, otherwise poll until ui.dimensions are available
    if (!syncDimensions()) {
      const interval = setInterval(() => {
        if (syncDimensions()) {
          clearInterval(interval);
          // Delay before marking ready to ensure alternate buffer is stable
          setTimeout(() => dispatch(actions.setReady(true)), 50);
        }
      }, 10);
      stdout.on("resize", handleResize);
      return () => {
        clearInterval(interval);
        stdout.off("resize", handleResize);
      };
    }

    // Dimensions available immediately - still delay to avoid race condition
    const timeout = setTimeout(() => dispatch(actions.setReady(true)), 50);

    stdout.on("resize", handleResize);
    return () => {
      clearTimeout(timeout);
      stdout.off("resize", handleResize);
    };
  }

  function setupFileDropHandler() {
    if (!supportsFileDrop()) return;

    const cleanup = createPasteHandler((files) => {
      dispatch(actions.setDroppedFiles(files));
      dispatch(actions.showDropNotification());
      // Auto-hide notification after 3 seconds
      setTimeout(() => dispatch(actions.hideDropNotification()), 3000);
    });

    return cleanup;
  }

  function setupMouseHandler() {
    if (!supportsMouseMode()) return;

    const selectionManager = new SelectionManager((range) => {
      dispatch(actions.setMouseSelection(range));
      dispatch(actions.setMouseDragging(range !== null));
    });

    const cleanup = createMouseHandler((event: TermMouseEvent) => {
      selectionManager.handleMouseEvent(event);

      // Handle scroll wheel events
      if (event.type === "scroll" && event.scrollDirection) {
        setState((s) => {
          const col = s.columns[s.colIndex];
          if (!col) return s;

          const maxCard = col.cards.length - 1;
          if (event.scrollDirection === "down") {
            // Scroll down = move to next card
            const newCardIndex = Math.min(maxCard, s.cardIndex + 1);
            return { ...s, cardIndex: newCardIndex };
          } else {
            // Scroll up = move to previous card
            const newCardIndex = Math.max(0, s.cardIndex - 1);
            return { ...s, cardIndex: newCardIndex };
          }
        });
        return;
      }

      // Handle double-click to drill in
      if (event.type === "down" && event.button === "left") {
        // TODO: Track double-click timing for drill-in
        // For now, single click just selects
      }

      // Convert screen coordinates to board items
      // This is a simplified version - full implementation would map
      // coordinates to specific cards/items in the board
      if (event.type === "up" && ui.mouseSelection) {
        // Selection complete - could trigger multi-select of items
        // within the selection range
      }
    });

    return cleanup;
  }

  function setupRefreshHandler() {
    const handleRefresh = () => {
      // Rebuild board state from database (which was updated by sync manager)
      setState((s) => (s.rootId ? buildBoardState(s.rootId) : s));
    };

    tuiEvents.on("refresh", handleRefresh);
    return () => {
      tuiEvents.off("refresh", handleRefresh);
    };
  }
}

export function renderInkBoard(
  state: BoardState,
  initialViewMode?: ViewMode,
): void {
  void withFullScreen(
    <Board initialState={state} initialViewMode={initialViewMode} />,
    {
      exitOnCtrlC: true,
      patchConsole: true,
    },
  ).start();
}

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
        <Box flexGrow={1}>
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
                height={termHeight - 2}
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

// =============================================================================
// Module-Level Helper Functions
// =============================================================================

// Build path segments for colorized display
// Returns segments with: { id, name, sep, isWithinBoard }
// isWithinBoard distinguishes the board root path from path within the board
function getPathSegments(
  nodeId: string | null,
  boardRootId: string | null,
): Array<{
  id: string | null;
  name: string;
  sep: string;
  isWithinBoard: boolean;
  node: KNode | null;
}> {
  if (!nodeId) {
    return [{ id: null, name: "/", sep: "", isWithinBoard: false, node: null }];
  }

  // Collect all nodes from root to target
  const nodes: KNode[] = [];
  let currentId: string | null = nodeId;
  while (currentId) {
    const node = getNode(currentId);
    if (!node) break;
    nodes.unshift(node);
    currentId = node.parent_id;
  }

  if (nodes.length === 0) {
    return [{ id: null, name: "/", sep: "", isWithinBoard: false, node: null }];
  }

  // Find index where we enter the board (nodes after boardRootId)
  let boardRootIndex = -1;
  if (boardRootId) {
    boardRootIndex = nodes.findIndex((n) => n.id === boardRootId);
  }

  // Build segments with separators
  const segments: Array<{
    id: string | null;
    name: string;
    sep: string;
    isWithinBoard: boolean;
    node: KNode | null;
  }> = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node) continue;
    // Strip wiki link brackets and show alias for display
    const rawName = getNodeDisplayName(node);
    const name = renderPlain(rawName);
    const isWithinBoard = boardRootIndex >= 0 && i > boardRootIndex;

    if (node.type === "folder" || node.type === "file") {
      segments.push({
        id: node.id,
        name,
        sep: segments.length > 0 ? "/" : "",
        isWithinBoard,
        node,
      });
    } else if (node.type === "section") {
      segments.push({ id: node.id, name, sep: "#", isWithinBoard, node });
    } else if (node.type === "board") {
      if (segments.length === 0) {
        segments.push({
          id: node.id,
          name,
          sep: "",
          isWithinBoard: false,
          node,
        });
      }
    } else {
      // Other types (paragraph, task, etc.)
      segments.push({
        id: node.id,
        name,
        sep: segments.length > 0 ? "/" : "",
        isWithinBoard,
        node,
      });
    }
  }

  return segments.length > 0
    ? segments
    : [{ id: null, name: "/", sep: "", isWithinBoard: false, node: null }];
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

// Get chalk function for top bar background based on board color
function getTopBarBgChalk(
  boardColor: string | undefined,
  isBoardSelected: boolean,
) {
  if (boardColor) {
    switch (boardColor) {
      case "red":
        return chalk.bgRed;
      case "green":
        return chalk.bgGreen;
      case "yellow":
        return chalk.bgYellow;
      case "blue":
        return chalk.bgBlue;
      case "magenta":
        return chalk.bgMagenta;
      case "cyan":
        return chalk.bgCyan;
      case "white":
        return chalk.bgWhite;
      case "gray":
      case "grey":
        return chalk.bgGray;
      default:
        return isBoardSelected ? chalk.bgBlue : chalk.bgWhite;
    }
  }
  return isBoardSelected ? chalk.bgBlue : chalk.bgWhite;
}

// Calculate scroll offset to center selected column
function calcScrollOffset(
  selectedIndex: number,
  maxVisible: number,
  totalCount: number,
): number {
  return Math.max(
    0,
    Math.min(
      selectedIndex - Math.floor(maxVisible / 2),
      Math.max(0, totalCount - maxVisible),
    ),
  );
}

// Render top bar path segments with appropriate colors
function renderTopBarSegments(
  segments: ReturnType<typeof renderPath>,
  bgChalk: ChalkInstance,
  useWhiteText: boolean,
): string {
  return segments
    .map((seg, i) => {
      const prevSeg = i > 0 ? segments[i - 1] : null;
      const isBoardBoundary =
        prevSeg && !prevSeg.isWithinBoard && seg.isWithinBoard;

      if (useWhiteText) {
        // Dark background: white text
        const sepPart = seg.sep ? bgChalk.white(` ${seg.sep} `) : "";
        return sepPart + bgChalk.white.bold(seg.name);
      } else {
        // Light background: black text, blue separator at board boundary
        const sepPart = seg.sep
          ? isBoardBoundary
            ? bgChalk.blue.bold(` ${seg.sep} `)
            : bgChalk.gray(` ${seg.sep} `)
          : "";
        return sepPart + bgChalk.black.bold(seg.name);
      }
    })
    .join("");
}
