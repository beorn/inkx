/**
 * Ink-based Board TUI Component
 * Full-screen board view with columns and cards
 */
import React, { useEffect, useReducer, useMemo, useRef } from "react";
import { Box, Text, useInput, useApp, useStdout } from "inkx";
import chalk from "chalk";
import { hyperlink } from "@beorn/chalkx";
import { Spinner } from "@beorn/progressx/cli";
import createDebug from "debug";

const debug = createDebug("km:board");
import type { BoardState, ViewMode, TuiEngine } from "../types.ts";
import { getNodeDisplayName } from "../state.ts";
import type { KNode } from "@km/core";
import { getChildren, getNode, getNodeCount, getStore } from "@km/storage";
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

// Layout constants - centralized to avoid magic numbers scattered through rendering code
const TOP_BAR_HEIGHT = 1;
const BOTTOM_BAR_HEIGHT = 1;
import { createPasteHandler, supportsFileDrop } from "../paste-handler.ts";
import {
  createMouseHandler,
  supportsMouseMode,
  SelectionManager,
  type MouseEvent as TermMouseEvent,
} from "../mouse-handler.ts";
import { renderPlain, getNodeIcon, getChalkColor } from "../text/index.ts";
import { getInheritedColor } from "../board-pills.ts";
import { renderPath } from "../layout/index.ts";
import { tuiEvents } from "../tui.ts";
import { UIProvider } from "../ui-context.tsx";
import { uiReducer, createInitialUIState, actions } from "../ui-reducer.ts";
import { useBoardDialogs } from "./use-board-dialogs.ts";
import { ConstraintRoot } from "../layout/index.ts";
import {
  processKeyWithContext,
  ensureCommandSystemInitialized,
} from "../command-bridge.ts";
import {
  buildTUIContext,
  toKeyboardContext,
  type TUIContext,
} from "../tui-context.ts";
import { handleCommandAction } from "../board-actions.ts";
import { boardReducer, createNodeMap } from "@km/board";
import {
  tuiStateToTreeState,
  deriveColumns,
  deriveCursorIndices,
  buildTreeNodes,
} from "../board-adapter.ts";

export { makeSelectionKey } from "../types.ts";

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

  // Subscribe to watcher status updates (for bottom bar display)
  useEffect(setupWatcherStatusHandler, []);

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
    // Dialog modes have their own input handling via dialog components
    if (ui.showNewItemDialog || ui.showProjectPicker) {
      return;
    }

    // Help overlay blocks most keys - only allow dismiss keys
    if (ui.showHelp) {
      if (input === "?" || key.escape) {
        dispatch(actions.hideHelp());
      } else if (input === "q") {
        exit();
      }
      // All other keys are blocked while help is showing
      return;
    }

    // Route ALL keys through the command system
    const result = processKeyWithContext(input, key, tuiContext);

    if (result.handled && result.actions) {
      const actionList = Array.isArray(result.actions)
        ? result.actions
        : [result.actions];
      for (const action of actionList) {
        handleCommandAction(tuiContext, action);
      }
    }
    // Unhandled keys are silently ignored (no fallback)
  });

  // Handle detail pane navigation (j/k to move cards while pane is open)
  useInput(
    (input, key) => {
      // Detail pane has limited navigation: j/k/arrows for cards, h/Esc to close, q to quit
      if (input === "h" || key.escape) {
        dispatch(actions.setDetailPane(false));
        return;
      }
      if (input === "q") {
        exit();
        return;
      }
      const col = state.columns[state.colIndex];
      if (input === "j" || key.downArrow) {
        if (col && state.cardIndex < col.cards.length - 1) {
          // Dispatch directly to boardReducer
          dispatchBoard({ type: "CURSOR_MOVE", dir: "next" });
        }
        return;
      }
      if (input === "k" || key.upArrow) {
        if (state.cardIndex > 0) {
          // Dispatch directly to boardReducer
          dispatchBoard({ type: "CURSOR_MOVE", dir: "prev" });
        }
        return;
      }
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

  // Render loading indicator until terminal is ready (see ui.isReady comment above)
  // This prevents the flash/scroll caused by fullscreen-ink's alternate buffer race condition
  // Note: Don't use centered layout here - it causes scroll issues when transitioning to the board
  // INKX FIX: Don't render Loading indicator - it causes artifacts that don't get cleared.
  // Instead, just render an empty screen briefly until dimensions sync.
  if (!ui.isReady) {
    return <Box height={termHeight} width={termWidth} />;
  }

  return (
    <ConstraintRoot>
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
          {/* Bottom bar: left (truncatable) + right (fixed) */}
          {(() => {
            const store = getStore();
            const homeDir = process.env.HOME || "";

            // Shorten path: replace home directory with ~/
            let displayPath = store.rootPath || "";
            if (homeDir && displayPath.startsWith(homeDir)) {
              displayPath = "~" + displayPath.slice(homeDir.length);
            }

            // Build status parts (middle)
            const statusParts: string[] = [];
            if (ui.showHelp) statusParts.push("[?]");
            if (ui.showProjectPicker) statusParts.push("[PROJ]");
            if (ui.showNewItemDialog) statusParts.push("[NEW]");
            if (ui.showDropNotification && ui.droppedFiles.length > 0) {
              statusParts.push(`[Drop:${ui.droppedFiles.length}]`);
            }
            if (ui.isMouseDragging && ui.mouseSelection) {
              statusParts.push("[Sel]");
            }
            if (ui.multiSelected.size > 0) {
              statusParts.push(`[${ui.multiSelected.size}]`);
            }
            if (ui.inOutlineMode) statusParts.push("OUT");

            // Right side info (always visible)
            // DB/files/watcher status as one group (single space), other items with double space
            const dbCount = getNodeCount();
            const watcherInfo = ui.watcherStatus
              ? ` ${renderWatcherStatus(ui.watcherStatus)}`
              : "";
            // 📋 = clipboard for records/nodes, 📄 = file for watched files
            const dbFilesGroup = `📋${dbCount}${watcherInfo}`;

            const rightParts: string[] = [dbFilesGroup];
            // Show column position (only meaningful in columns view)
            if (ui.viewMode === "columns" && state.columns.length > 1) {
              rightParts.push(
                `col ${state.colIndex + 1}/${state.columns.length}`,
              );
            }
            // Always show view mode with VIEW suffix
            const viewModeStr =
              (ui.viewMode?.toUpperCase() ?? "CARDS") + " VIEW";
            rightParts.push(viewModeStr);

            // Left side: storage mode + folder icon + path
            // 📁 = folder icon for vault/repo path
            const modeLabel = store.mode === "memory" ? "MEM" : "DISK";
            const left = `${modeLabel} 📁${displayPath}`;
            const middle = statusParts.join("  "); // Double space between status parts
            const right = ` ${rightParts.join("   ")} `; // Triple space between groups

            // Calculate widths: right side is fixed, left gets remaining space
            const rightWidth = right.length;
            const leftWidth = Math.max(1, termWidth - rightWidth);

            return (
              <Box flexDirection="row" flexShrink={0} width={termWidth}>
                <Box width={leftWidth} flexShrink={0}>
                  <Text dimColor wrap="truncate-end">
                    {middle ? ` ${left}   ${middle}` : ` ${left}`}
                  </Text>
                </Box>
                <Box width={rightWidth} flexShrink={0}>
                  <Text dimColor>{right}</Text>
                </Box>
              </Box>
            );
          })()}
        </Box>
      </UIProvider>
    </ConstraintRoot>
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
    // TODO: Fix mouse integration - not working properly yet
    // Disable for now until scroll wheel and click-to-select work correctly
    return;

    if (!supportsMouseMode()) return;

    const selectionManager = new SelectionManager((range) => {
      dispatch(actions.setMouseSelection(range));
      dispatch(actions.setMouseDragging(range !== null));
    });

    const cleanup = createMouseHandler((event: TermMouseEvent) => {
      selectionManager.handleMouseEvent(event);

      // Handle scroll wheel events
      if (event.type === "scroll" && event.scrollDirection) {
        // Use boardReducer for cursor movement
        if (event.scrollDirection === "down") {
          dispatchBoard({ type: "CURSOR_MOVE", dir: "next" });
        } else {
          dispatchBoard({ type: "CURSOR_MOVE", dir: "prev" });
        }
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
      // Rebuild tree nodes from database (which was updated by sync manager)
      // Must use deep loading (true) to include children - shallow loading loses them!
      // Uses rootIdRef to get current rootId (avoids stale closure from useEffect deps)
      // Note: rootIdRef.current can be null for root-level view, which is valid
      const nodes = buildTreeNodes(rootIdRef.current, true);
      dispatchBoard({ type: "REFRESH", nodes });
    };

    tuiEvents.on("refresh", handleRefresh);
    return () => {
      tuiEvents.off("refresh", handleRefresh);
    };
  }

  function setupWatcherStatusHandler() {
    const handleWatcherStatus = (
      status: import("@km/storage").WatcherStatus,
    ) => {
      dispatch(actions.setWatcherStatus(status));
    };

    tuiEvents.on("watcher-status", handleWatcherStatus);
    return () => {
      tuiEvents.off("watcher-status", handleWatcherStatus);
    };
  }
}

/**
 * Render watcher status indicator for bottom bar
 * Uses 📄 icon for files, always shows file count, plus current state if not idle
 */
function renderWatcherStatus(
  status: import("@km/storage").WatcherStatus,
): string {
  const { state, pendingPaths, watchedPaths } = status;
  // 📄 = file icon for watched files
  const fileCount = watchedPaths ? `📄${watchedPaths}` : "📄0";

  switch (state) {
    case "starting":
      return `${fileCount} starting`;
    case "syncing":
      return pendingPaths > 0
        ? `${fileCount} sync:${pendingPaths}`
        : `${fileCount} syncing`;
    case "ready":
    case "idle":
      return fileCount;
    case "error":
      return `${fileCount} err`;
    case "stopped":
      return `${fileCount} off`;
    default:
      return fileCount;
  }
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

/**
 * Render the board TUI with deferred loading.
 * Loads state synchronously, then renders the board.
 * Shows a loading indicator during the synchronous load.
 *
 * Note: Originally used useEffect for loading with a spinner, but inkx's
 * React reconciler doesn't flush passive effects reliably in all environments.
 * We now use direct stdout writes for the loading indicator.
 */
export async function renderDeferredBoard(
  loadState: () => BoardState | null,
  initialViewMode?: ViewMode,
  engine: TuiEngine = "inkx",
): Promise<void> {
  debug("renderDeferredBoard start, engine=%s", engine);

  const stdout = process.stdout;

  // Clear screen and show spinner while loading
  stdout.write("\x1b[2J\x1b[H"); // Clear screen, move to top-left
  const spinner = new Spinner({ text: "Loading vault...", style: "dots" });
  spinner.start();

  // Load state synchronously before rendering
  const startTime = Date.now();
  const state = loadState();
  const loadTime = Date.now() - startTime;
  debug("Board state loaded in %dms", loadTime);

  // Stop spinner and clear screen before rendering board
  spinner.stop();
  stdout.write("\x1b[2J\x1b[H");

  if (!state) {
    console.error("No board found. Create a board node or specify a root ID.");
    process.exit(1);
  }

  const app = <Board initialState={state} initialViewMode={initialViewMode} />;

  const engineApi = getEngine(engine);
  debug("Got engine API");

  const { waitUntilExit } = await engineApi.render(app, {
    exitOnCtrlC: true,
    patchConsole: true,
  });
  debug("Render complete, awaiting exit");

  await waitUntilExit();
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

// =============================================================================
// Module-Level Helper Functions
// =============================================================================

// Build path segments for colorized display
// Returns segments with: { id, name, sep, isWithinBoard }
// isWithinBoard distinguishes the board root path from path within the board
// Always includes a repo root segment (🏠) at the start
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
  // Repo root segment - always present (folder icon)
  const repoRootSegment = {
    id: null,
    name: "\uD83D\uDCC1", // folder 📁
    sep: "",
    isWithinBoard: false,
    node: null,
  };

  if (!nodeId) {
    return [repoRootSegment];
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

  // Update first segment to have "/" separator (since it follows repo root)
  if (segments.length > 0) {
    const first = segments[0];
    if (first && first.sep === "") {
      segments[0] = {
        id: first.id,
        name: first.name,
        sep: "/",
        isWithinBoard: first.isWithinBoard,
        node: first.node,
      };
    }
  }

  // Always prepend repo root segment (folder icon)
  return [repoRootSegment, ...segments];
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

// Render top bar content as plain string (no chalk styling)
// Color is controlled by the parent Text component's color prop
// Board root segment gets special formatting via chalk.bold
function renderTopBarContent(
  segments: Array<{ name: string; sep: string; isWithinBoard?: boolean }>,
  isBoardSelected: boolean,
): string {
  // Find the board root index:
  // - If there are isWithinBoard segments, board root is the last one before them
  // - If no isWithinBoard segments, the last segment is the board root
  const firstWithinBoardIdx = segments.findIndex((s) => s.isWithinBoard);
  const boardRootIdx =
    firstWithinBoardIdx > 0
      ? firstWithinBoardIdx - 1
      : firstWithinBoardIdx === -1
        ? segments.length - 1
        : 0;

  // Build content: " ● " prefix + segments
  // Use chalk only for bold (board root) and dim (other segments)
  // Base color is inherited from parent Text component
  const boldChalk = isBoardSelected ? chalk.black.bold : chalk.gray.bold;
  const dimChalk = isBoardSelected ? chalk.black.dim : chalk.gray.dim;

  let content = " ● ";

  segments.forEach((seg, idx) => {
    const sepPart = seg.sep ? ` ${seg.sep} ` : "";
    const isBoardRoot = idx === boardRootIdx;

    if (isBoardRoot) {
      // Board root: bold, prominent (sep is dimmed)
      content += dimChalk(sepPart) + boldChalk(seg.name);
    } else {
      // Path segments before/after board root: dimmed
      content += dimChalk(sepPart + seg.name);
    }
  });

  return content;
}

// Padding from edge before scrolling (in columns)
const COLUMN_SCROLL_PADDING = 1;

/**
 * Calculate edge-based scroll offset for horizontal column scrolling.
 * Only scrolls when cursor approaches the edge of the visible area.
 *
 * @param selectedIndex - Currently selected column index
 * @param currentOffset - Current scroll offset (leftmost visible column)
 * @param maxVisible - Number of columns visible in viewport
 * @param totalCount - Total number of columns
 * @returns New scroll offset
 */
function calcEdgeBasedColumnScrollOffset(
  selectedIndex: number,
  currentOffset: number,
  maxVisible: number,
  totalCount: number,
): number {
  // If everything fits, no scrolling needed
  if (totalCount <= maxVisible) return 0;

  // Calculate visible range
  const visibleStart = currentOffset;
  const visibleEnd = currentOffset + maxVisible - 1;

  // Check if selected is outside visible range (with padding)
  const paddedStart = visibleStart + COLUMN_SCROLL_PADDING;
  const paddedEnd = visibleEnd - COLUMN_SCROLL_PADDING;

  let newOffset = currentOffset;

  if (selectedIndex < paddedStart) {
    // Cursor is near/left of left edge - scroll left
    newOffset = Math.max(0, selectedIndex - COLUMN_SCROLL_PADDING);
  } else if (selectedIndex > paddedEnd) {
    // Cursor is near/right of right edge - scroll right
    newOffset = Math.min(
      totalCount - maxVisible,
      selectedIndex - maxVisible + COLUMN_SCROLL_PADDING + 1,
    );
  }

  // Clamp to valid range
  return Math.max(0, Math.min(newOffset, totalCount - maxVisible));
}

// NOTE: renderTopBarSegments removed - top bar now uses pure inkx styling
// See bead for chalk+inkx styling consolidation
