/**
 * Ink-based Board TUI Component
 * Full-screen board view with columns and cards
 */
import React, { useState, useEffect, useReducer } from "react";
import { Box, Text, useInput, useApp, useStdout } from "ink";
import { withFullScreen } from "fullscreen-ink";
import chalk, { type ChalkInstance } from "chalk";
import { hyperlink } from "@beorn/chalkx";
import type {
  BoardState,
  CardState,
  ViewMode,
  SelectionKey,
} from "../types.ts";
import { buildBoardState, initBoardState } from "../state.ts";
import type { KNode, TaskStatus } from "@km/core";
import {
  getChildren,
  getNode,
  getStore,
  resolveNode,
  moveNode,
  updateNode,
  deleteNode,
} from "@km/storage";
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
import { makeSelectionKey } from "./TreeNode.tsx";
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

  // Helper functions are hoisted below the return statement for readability

  // Card/node manipulation functions are hoisted below the return statement

  useInput(handleKeyboardInput);

  // Handle detail pane navigation (j/k to move cards while pane is open)
  useInput(handleDetailPaneInput, { isActive: ui.showDetailPane });

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
  // Input Handlers (hoisted for readability)
  // ===========================================================================

  function handleKeyboardInput(
    input: string,
    key: {
      escape?: boolean;
      return?: boolean;
      ctrl?: boolean;
      upArrow?: boolean;
      downArrow?: boolean;
      leftArrow?: boolean;
      rightArrow?: boolean;
      tab?: boolean;
      backspace?: boolean;
      delete?: boolean;
      shift?: boolean;
      meta?: boolean;
    },
  ) {
    const col = state.columns[state.colIndex];
    const card = col?.cards[state.cardIndex];

    // Toggle help with '?'
    if (input === "?") {
      dispatch(actions.toggleHelp());
      return;
    }

    // Close help with Escape
    if (ui.showHelp && key.escape) {
      dispatch(actions.hideHelp());
      return;
    }

    // Ignore other keys when help is shown
    if (ui.showHelp) {
      return;
    }

    // Cycle view mode with 'v': cards -> columns -> list -> tabs -> cards
    if (input === "v") {
      dispatch(actions.cycleViewMode());
      return;
    }

    // Open new item dialog with 'n' key
    if (input === "n") {
      dispatch(actions.showNewItemDialog());
      dispatch(actions.exitOutlineMode());
      dispatch(actions.setSubIndex(0));
      clearSelection();
      dispatch(actions.setDetailPane(false));
      return;
    }

    // Shift+A: progressive select all
    if (input === "A") {
      progressiveSelectAll();
      return;
    }

    // Shift+1-9: jump cursor to column (0-indexed, so Shift+1 = column 0)
    // Terminal sends !@#$%^&*( for Shift+1-9
    const shiftNumberMap: Record<string, number> = {
      "!": 0,
      "@": 1,
      "#": 2,
      $: 3,
      "%": 4,
      "^": 5,
      "&": 6,
      "*": 7,
      "(": 8,
    };
    const shiftColIndex = shiftNumberMap[input];
    if (
      shiftColIndex !== undefined &&
      !ui.showDetailPane &&
      !ui.inOutlineMode &&
      shiftColIndex < state.columns.length
    ) {
      setState((s) => ({
        ...s,
        colIndex: shiftColIndex,
        cardIndex: Math.min(
          s.cardIndex,
          Math.max(0, (s.columns[shiftColIndex]?.cards.length ?? 1) - 1),
        ),
      }));
      clearSelection();
      dispatch(actions.setSelectAllLevel(0)); // Reset select all level when moving
      return;
    }

    // Plain 1-9: jump to favorite boards
    // Note: Alt+1-9 for moving is handled below with key.meta check
    if (
      /^[1-9]$/.test(input) &&
      !ui.showDetailPane &&
      !ui.inOutlineMode &&
      !key.meta // Not Alt+number (move)
    ) {
      const favoriteRef = DEFAULT_FAVORITES[input];
      if (favoriteRef) {
        const resolved = resolveNode(favoriteRef);
        if (resolved) {
          const zoomed = buildBoardState(resolved.id);
          zoomed.zoomStack = [...state.zoomStack, state.rootId || ""];
          // Push current location to navigation history before navigating
          pushNavHistoryEntry(
            state.rootId,
            state.colIndex,
            state.cardIndex,
            ui.subIndex,
            ui.multiSelected,
            ui.inOutlineMode,
          );
          dispatch(actions.exitOutlineMode());
          dispatch(actions.setSubIndex(0));
          clearSelection();
          dispatch(actions.setDetailPane(false));
          setState(zoomed);
        } else {
          // Favorite not found - beep
          process.stdout.write("\x07");
        }
      }
      return;
    }

    // Quit
    if (input === "q") {
      exit();
      return;
    }

    // Alt/Opt + key for moving items (standardized modifier)
    if (key.meta && card) {
      // Alt+Arrow: move card
      if (key.upArrow) {
        moveCardInColumn(card, "up");
        return;
      }
      if (key.downArrow) {
        moveCardInColumn(card, "down");
        return;
      }
      if (key.leftArrow) {
        moveCardToColumn(card, "left");
        return;
      }
      if (key.rightArrow) {
        moveCardToColumn(card, "right");
        return;
      }
      // Alt+hjkl: move card (vim style)
      if (input === "k") {
        moveCardInColumn(card, "up");
        return;
      }
      if (input === "j") {
        moveCardInColumn(card, "down");
        return;
      }
      if (input === "h") {
        moveCardToColumn(card, "left");
        return;
      }
      if (input === "l") {
        moveCardToColumn(card, "right");
        return;
      }
      // Alt+1-9: move card to column (at top)
      if (/^[1-9]$/.test(input) && !ui.showDetailPane) {
        const targetCol = parseInt(input, 10) - 1;
        if (targetCol < state.columns.length) {
          moveCardToColumnByIndex(card, targetCol);
        }
        return;
      }
    }

    // Escape: close UI elements progressively, then quit
    if (key.escape) {
      // If detail pane is open, close it
      if (ui.showDetailPane) {
        dispatch(actions.setDetailPane(false));
        return;
      }
      // If in outline mode, exit outline mode
      if (ui.inOutlineMode) {
        dispatch(actions.exitOutlineMode());
        dispatch(actions.setSubIndex(0));
        clearSelection();
        return;
      }
      // Otherwise quit
      exit();
      return;
    }

    // 'u': Go up the physical path (parent of current root)
    if (input === "u") {
      if (ui.showDetailPane) {
        dispatch(actions.setDetailPane(false));
        return;
      }
      if (ui.inOutlineMode) {
        dispatch(actions.exitOutlineMode());
        dispatch(actions.setSubIndex(0));
        clearSelection();
        return;
      }

      // Go up to parent of current root
      if (state.rootId) {
        const currentRoot = getNode(state.rootId);
        if (currentRoot?.parent_id) {
          // Has a parent - navigate to it
          const parentNode = getNode(currentRoot.parent_id);
          if (parentNode) {
            const zoomed = buildBoardState(parentNode.id);
            // Push current location to history before navigating
            pushNavHistoryEntry(
              state.rootId,
              state.colIndex,
              state.cardIndex,
              ui.subIndex,
              ui.multiSelected,
              ui.inOutlineMode,
            );
            setState(zoomed);
            clearSelection();
            return;
          }
        } else {
          // No parent_id means this is a root-level node - go to root view
          const rootView = initBoardState();
          if (rootView) {
            pushNavHistoryEntry(
              state.rootId,
              state.colIndex,
              state.cardIndex,
              ui.subIndex,
              ui.multiSelected,
              ui.inOutlineMode,
            );
            setState(rootView);
            clearSelection();
            return;
          }
        }
      }
      // No parent - beep
      process.stdout.write("\x07");
      return;
    }

    // '[': Navigate back in history
    if (input === "[") {
      if (ui.navHistoryIndex > 0) {
        const prevEntry = ui.navHistory[ui.navHistoryIndex - 1];
        if (prevEntry) {
          const newState = prevEntry.rootId
            ? buildBoardState(prevEntry.rootId)
            : initBoardState();
          if (newState) {
            newState.colIndex = prevEntry.colIndex;
            newState.cardIndex = prevEntry.cardIndex;
            setState(newState);
            dispatch(actions.setNavHistoryIndex(ui.navHistoryIndex - 1));
            // Restore selection state from history entry
            dispatch(actions.setSubIndex(prevEntry.subIndex));
            dispatch(
              actions.setMultiSelected(new Set(prevEntry.multiSelected)),
            );
            dispatch(actions.setSelectionAnchor(null));
            dispatch(actions.setSelectAllLevel(0));
            dispatch(actions.setInOutlineMode(prevEntry.inOutlineMode));
          }
        }
      } else {
        // No history to go back to - beep
        process.stdout.write("\x07");
      }
      return;
    }

    // ']': Navigate forward in history
    if (input === "]") {
      if (ui.navHistoryIndex < ui.navHistory.length - 1) {
        const nextEntry = ui.navHistory[ui.navHistoryIndex + 1];
        if (nextEntry) {
          const newState = nextEntry.rootId
            ? buildBoardState(nextEntry.rootId)
            : initBoardState();
          if (newState) {
            newState.colIndex = nextEntry.colIndex;
            newState.cardIndex = nextEntry.cardIndex;
            setState(newState);
            dispatch(actions.setNavHistoryIndex(ui.navHistoryIndex + 1));
            // Restore selection state from history entry
            dispatch(actions.setSubIndex(nextEntry.subIndex));
            dispatch(
              actions.setMultiSelected(new Set(nextEntry.multiSelected)),
            );
            dispatch(actions.setSelectionAnchor(null));
            dispatch(actions.setSelectAllLevel(0));
            dispatch(actions.setInOutlineMode(nextEntry.inOutlineMode));
          }
        }
      } else {
        // No forward history - beep
        process.stdout.write("\x07");
      }
      return;
    }

    // Tab/Shift-Tab: indent/outdent items structurally
    if (key.tab && card) {
      if (key.shift) {
        // Shift-Tab: outdent - make item a sibling of its parent
        outdentNode(card);
      } else {
        // Tab: indent - make item a child of the item above
        indentNode(card);
      }
      return;
    }

    // Adjust content lines with +/- (how many lines of wrapped text to show per item)
    if (input === "+" || input === "=") {
      dispatch(actions.increaseContentLines());
      return;
    }
    if (input === "-" || input === "_") {
      dispatch(actions.decreaseContentLines());
      return;
    }

    // Adjust outline depth with < and > (how many levels of children to show)
    if (input === ">") {
      dispatch(actions.increaseOutlineDepth());
      return;
    }
    if (input === "<") {
      dispatch(actions.decreaseOutlineDepth());
      return;
    }

    // Fold all / unfold all
    if (input === "z") {
      if (col) {
        dispatch(actions.foldAll(col.cards.map((c) => c.node.id)));
      }
      return;
    }
    if (input === "Z") {
      if (col) {
        dispatch(actions.unfoldAll(col.cards.map((c) => c.node.id)));
      }
      return;
    }

    // Toggle column collapse (c key)
    if (input === "c") {
      dispatch(actions.toggleColumnCollapse(state.colIndex));
      return;
    }

    // Status cycling with Space key (works on selected card/item)
    // For linked nodes (transclusions), apply status change to the TARGET node
    if (input === " " && card) {
      // Resolve link target: if this is a link, operate on the target
      const targetId = card.node.link_to || card.node.id;
      const targetNode = card.node.link_to
        ? getNode(card.node.link_to)
        : card.node;
      const currentStatus = targetNode?.task_status || "todo";
      const statusCycle: TaskStatus[] = [
        "todo",
        "wip",
        "blocked",
        "done",
        "dropped",
      ];
      const currentIndex = statusCycle.indexOf(currentStatus);
      const nextIndex = (currentIndex + 1) % statusCycle.length;
      const nextStatus = statusCycle[nextIndex] as TaskStatus;
      const markMap: Record<TaskStatus, string> = {
        todo: " ",
        wip: "/",
        blocked: "!",
        done: "x",
        dropped: "-",
      };
      const nextMark = markMap[nextStatus];

      // Update database via store layer (handles memory/disk mode)
      updateNode(targetId, { task_status: nextStatus, task_mark: nextMark });

      // Refresh board state
      setTimeout(() => {
        const newState = state.rootId
          ? buildBoardState(state.rootId)
          : initBoardState();
        if (newState) {
          newState.zoomStack = state.zoomStack;
          newState.rootPath = state.rootPath;
          newState.colIndex = state.colIndex;
          newState.cardIndex = state.cardIndex;
          setState(newState);
        }
      }, 50);
      return;
    }

    // Delete with 'D' key
    // For linked nodes (transclusions): delete the SYMLINK, not the target
    // For regular nodes: delete the node itself
    if (input === "D" && card) {
      // For links, we delete the link node (the card), not the target
      // This allows removing a task from a board without deleting the original task
      const nodeToDelete = card.node.id; // Always delete the card node itself

      // Delete via store layer (handles memory/disk mode)
      deleteNode(nodeToDelete);

      // Refresh board state
      setTimeout(() => {
        const newState = state.rootId
          ? buildBoardState(state.rootId)
          : initBoardState();
        if (newState) {
          newState.zoomStack = state.zoomStack;
          newState.rootPath = state.rootPath;
          newState.colIndex = state.colIndex;
          // Adjust card index if we were at the end
          const col = newState.columns[state.colIndex];
          newState.cardIndex = Math.min(
            state.cardIndex,
            Math.max(0, (col?.cards.length ?? 1) - 1),
          );
          setState(newState);
        }
      }, 50);
      return;
    }

    // Shift+J/K or Shift+Down/Up for range selection
    // Works in both outline mode (sub-item selection) and card mode (card selection)
    if (input === "J" || (key.shift && key.downArrow)) {
      if (ui.inOutlineMode) {
        // Start or extend selection downward within card
        if (!ui.selectionAnchor) {
          dispatch(
            actions.setSelectionAnchor({
              col: state.colIndex,
              card: state.cardIndex,
              sub: ui.subIndex,
            }),
          );
        }
        const maxSub = getMaxSubIndex();
        if (ui.subIndex < maxSub - 1) {
          const newSubIndex = ui.subIndex + 1;
          dispatch(actions.setSubIndex(newSubIndex));
          updateSelectionRange(state.colIndex, state.cardIndex, newSubIndex);
        } else {
          // At end of card, extend selection to next card
          const currentCol = state.columns[state.colIndex];
          if (currentCol && state.cardIndex < currentCol.cards.length - 1) {
            const newCardIndex = state.cardIndex + 1;
            setState((s) => ({ ...s, cardIndex: newCardIndex }));
            dispatch(actions.setSubIndex(0));
            updateSelectionRange(state.colIndex, newCardIndex, 0);
          }
        }
      } else {
        // Card-level selection: extend selection to include next card
        if (!ui.selectionAnchor) {
          dispatch(
            actions.setSelectionAnchor({
              col: state.colIndex,
              card: state.cardIndex,
              sub: 0,
            }),
          );
          // Select current card fully
          const currentCard = col?.cards[state.cardIndex];
          if (currentCard) {
            const maxItems =
              1 +
              countVisibleDescendants(
                currentCard.node,
                0,
                ui.maxOutlineDepth,
                ui.foldedNodes,
              );
            const newSelected = new Set<SelectionKey>();
            for (let s = 0; s < maxItems; s++) {
              newSelected.add(
                makeSelectionKey(state.colIndex, state.cardIndex, s),
              );
            }
            dispatch(actions.setMultiSelected(newSelected));
          }
        }
        const currentCol = state.columns[state.colIndex];
        if (currentCol && state.cardIndex < currentCol.cards.length - 1) {
          const newCardIndex = state.cardIndex + 1;
          setState((s) => ({ ...s, cardIndex: newCardIndex }));
          updateSelectionRange(state.colIndex, newCardIndex, 0);
        }
      }
      return;
    }
    if (input === "K" || (key.shift && key.upArrow)) {
      if (ui.inOutlineMode) {
        // Start or extend selection upward within card
        if (!ui.selectionAnchor) {
          dispatch(
            actions.setSelectionAnchor({
              col: state.colIndex,
              card: state.cardIndex,
              sub: ui.subIndex,
            }),
          );
        }
        if (ui.subIndex > 0) {
          const newSubIndex = ui.subIndex - 1;
          dispatch(actions.setSubIndex(newSubIndex));
          updateSelectionRange(state.colIndex, state.cardIndex, newSubIndex);
        } else {
          // At start of card, extend selection to previous card
          if (state.cardIndex > 0) {
            const newCardIndex = state.cardIndex - 1;
            const prevCard = state.columns[state.colIndex]?.cards[newCardIndex];
            if (prevCard) {
              const maxSub =
                1 +
                countVisibleDescendants(
                  prevCard.node,
                  0,
                  ui.maxOutlineDepth,
                  ui.foldedNodes,
                );
              setState((s) => ({ ...s, cardIndex: newCardIndex }));
              dispatch(actions.setSubIndex(maxSub - 1));
              updateSelectionRange(state.colIndex, newCardIndex, maxSub - 1);
            }
          }
        }
      } else {
        // Card-level selection: extend selection to include previous card
        if (!ui.selectionAnchor) {
          dispatch(
            actions.setSelectionAnchor({
              col: state.colIndex,
              card: state.cardIndex,
              sub: 0,
            }),
          );
          // Select current card fully
          const currentCard = col?.cards[state.cardIndex];
          if (currentCard) {
            const maxItems =
              1 +
              countVisibleDescendants(
                currentCard.node,
                0,
                ui.maxOutlineDepth,
                ui.foldedNodes,
              );
            const newSelected = new Set<SelectionKey>();
            for (let s = 0; s < maxItems; s++) {
              newSelected.add(
                makeSelectionKey(state.colIndex, state.cardIndex, s),
              );
            }
            dispatch(actions.setMultiSelected(newSelected));
          }
        }
        if (state.cardIndex > 0) {
          const newCardIndex = state.cardIndex - 1;
          setState((s) => ({ ...s, cardIndex: newCardIndex }));
          updateSelectionRange(state.colIndex, newCardIndex, 0);
        }
      }
      return;
    }

    // Shift+H/L or Shift+Left/Right for horizontal range selection (across columns)
    if (input === "H" || (key.shift && key.leftArrow)) {
      // Currently H is used for moving cards. For now, Shift+Left extends selection.
      // In the future, could remap card movement to Alt+H/L
      if (state.colIndex > 0) {
        if (!ui.selectionAnchor) {
          dispatch(
            actions.setSelectionAnchor({
              col: state.colIndex,
              card: state.cardIndex,
              sub: 0,
            }),
          );
        }
        const newColIndex = state.colIndex - 1;
        setState((s) => ({
          ...s,
          colIndex: newColIndex,
          cardIndex: Math.min(
            s.cardIndex,
            Math.max(0, (s.columns[newColIndex]?.cards.length || 1) - 1),
          ),
        }));
        // For cross-column selection, we just track that multiple columns are involved
        // Full implementation would require more complex selection model
      }
      return;
    }
    if (input === "L" || (key.shift && key.rightArrow)) {
      if (state.colIndex < state.columns.length - 1) {
        if (!ui.selectionAnchor) {
          dispatch(
            actions.setSelectionAnchor({
              col: state.colIndex,
              card: state.cardIndex,
              sub: 0,
            }),
          );
        }
        const newColIndex = state.colIndex + 1;
        setState((s) => ({
          ...s,
          colIndex: newColIndex,
          cardIndex: Math.min(
            s.cardIndex,
            Math.max(0, (s.columns[newColIndex]?.cards.length || 1) - 1),
          ),
        }));
      }
      return;
    }

    // Vertical navigation with selection levels: board -> column -> card
    if (input === "j" || key.downArrow) {
      clearSelection();
      // Handle selection level transitions
      if (ui.selectionLevel === "board") {
        // From board level, go to column level (first column)
        dispatch(actions.setSelectionLevel("column"));
        setState((s) => ({ ...s, colIndex: 0 }));
        return;
      }
      if (ui.selectionLevel === "column") {
        // From column level, go to card level (first card in column)
        dispatch(actions.setSelectionLevel("card"));
        setState((s) => ({ ...s, cardIndex: 0 }));
        return;
      }
      // At card level
      if (ui.inOutlineMode) {
        // In outline mode: navigate within card, then to next card
        const maxSub = getMaxSubIndex();
        if (ui.subIndex < maxSub - 1) {
          dispatch(actions.setSubIndex(ui.subIndex + 1));
        } else {
          // Move to next card's first item
          const currentCol = state.columns[state.colIndex];
          const nextCardIndex = Math.min(
            (currentCol?.cards.length || 1) - 1,
            state.cardIndex + 1,
          );
          if (nextCardIndex !== state.cardIndex) {
            setState((s) => ({ ...s, cardIndex: nextCardIndex }));
            dispatch(actions.setSubIndex(0));
          }
        }
      } else {
        // Not in outline mode: just move cards
        const currentCol = state.columns[state.colIndex];
        const nextCardIndex = Math.min(
          (currentCol?.cards.length || 1) - 1,
          state.cardIndex + 1,
        );
        setState((s) => ({ ...s, cardIndex: nextCardIndex }));
      }
      return;
    }

    if (input === "k" || key.upArrow) {
      clearSelection();
      // Handle selection level transitions
      if (ui.selectionLevel === "card") {
        if (ui.inOutlineMode) {
          // In outline mode: navigate within card, then to previous card, then to column
          if (ui.subIndex > 0) {
            dispatch(actions.setSubIndex(ui.subIndex - 1));
            return;
          } else if (state.cardIndex > 0) {
            // Move to previous card's last item
            const prevCardIndex = state.cardIndex - 1;
            setState((s) => ({ ...s, cardIndex: prevCardIndex }));
            const prevCard =
              state.columns[state.colIndex]?.cards[prevCardIndex];
            if (prevCard) {
              const maxSub =
                1 +
                countVisibleDescendants(
                  prevCard.node,
                  0,
                  ui.maxOutlineDepth,
                  ui.foldedNodes,
                );
              dispatch(actions.setSubIndex(maxSub - 1));
            }
            return;
          } else {
            // At first card, first item - go to column level
            dispatch(actions.setSelectionLevel("column"));
            dispatch(actions.setSubIndex(0));
            return;
          }
        } else {
          // Not in outline mode
          if (state.cardIndex > 0) {
            // Move to previous card
            setState((s) => ({ ...s, cardIndex: s.cardIndex - 1 }));
          } else {
            // At first card - go to column level
            dispatch(actions.setSelectionLevel("column"));
          }
          return;
        }
      }
      if (ui.selectionLevel === "column") {
        // From column level, go to board level
        dispatch(actions.setSelectionLevel("board"));
        return;
      }
      // Already at board level, do nothing (or beep)
      return;
    }

    setState((s) => {
      const newState = { ...s };

      // Helper to find card at same vertical position in target column
      // Uses the same absolute index, clamped to the target column's length
      const findSamePositionCard = (
        targetColIndex: number,
        currentCardIndex: number,
      ): number => {
        const targetCol = s.columns[targetColIndex];
        if (!targetCol || targetCol.cards.length === 0) return 0;
        // Keep the same index, or the last card if target column is shorter
        return Math.min(currentCardIndex, targetCol.cards.length - 1);
      };

      // Horizontal navigation - behavior depends on selection level
      if (input === "h" || key.leftArrow) {
        if (ui.selectionLevel === "board") {
          // At board level, h/l does nothing (could navigate between boards in future)
          return s;
        }
        const newColIndex = Math.max(0, s.colIndex - 1);
        newState.colIndex = newColIndex;
        if (ui.selectionLevel === "card") {
          const targetCol = s.columns[newColIndex];
          if (!targetCol || targetCol.cards.length === 0) {
            // Empty column - switch to column level
            dispatch(actions.setSelectionLevel("column"));
          } else {
            // At card level, update card index to same position in new column
            newState.cardIndex = findSamePositionCard(newColIndex, s.cardIndex);
          }
        }
        dispatch(actions.exitOutlineMode());
        dispatch(actions.setSubIndex(0));
        clearSelection();
      } else if (input === "l" || key.rightArrow) {
        if (ui.selectionLevel === "board") {
          // At board level, h/l does nothing
          return s;
        }
        const newColIndex = Math.min(s.columns.length - 1, s.colIndex + 1);
        newState.colIndex = newColIndex;
        if (ui.selectionLevel === "card") {
          const targetCol = s.columns[newColIndex];
          if (!targetCol || targetCol.cards.length === 0) {
            // Empty column - switch to column level
            dispatch(actions.setSelectionLevel("column"));
          } else {
            // At card level, update card index to same position in new column
            newState.cardIndex = findSamePositionCard(newColIndex, s.cardIndex);
          }
        }
        dispatch(actions.exitOutlineMode());
        dispatch(actions.setSubIndex(0));
        clearSelection();
      } else if (input === "g") {
        newState.cardIndex = 0;
        dispatch(actions.exitOutlineMode());
        dispatch(actions.setSubIndex(0));
        clearSelection();
      } else if (input === "G") {
        const currentCol = s.columns[s.colIndex];
        newState.cardIndex = Math.max(0, (currentCol?.cards.length || 1) - 1);
        dispatch(actions.exitOutlineMode());
        dispatch(actions.setSubIndex(0));
        clearSelection();
      }

      // Enter opens detail pane
      if (key.return && card) {
        dispatch(actions.setDetailPane(true));
        dispatch(actions.exitOutlineMode());
        dispatch(actions.setSubIndex(0));
        clearSelection();
        return s; // Don't change board state, just show pane
      }

      // Zoom in with 'o' - re-root at grandparent for context, select the item
      // For transcluded/linked items, follow the link to the original
      if (input === "o" && card) {
        const targetId = card.node.link_to || card.node.id;
        const targetNode = getNode(targetId);
        if (!targetNode) return s;

        // Find the best root: grandparent > parent > item itself
        // This gives context by showing siblings
        let rootId = targetId;
        const parentNode = targetNode.parent_id
          ? getNode(targetNode.parent_id)
          : null;
        const grandparentNode = parentNode?.parent_id
          ? getNode(parentNode.parent_id)
          : null;

        if (grandparentNode) {
          rootId = grandparentNode.id;
        } else if (parentNode) {
          rootId = parentNode.id;
        }

        const zoomed = buildBoardState(rootId);
        zoomed.zoomStack = [...s.zoomStack, s.rootId || ""];

        // Find the target item in the new board state to select it
        let foundCol = 0;
        let foundCard = 0;
        for (let cIdx = 0; cIdx < zoomed.columns.length; cIdx++) {
          const col = zoomed.columns[cIdx];
          if (!col) continue;
          for (let cardIdx = 0; cardIdx < col.cards.length; cardIdx++) {
            const c = col.cards[cardIdx];
            if (c && c.node.id === targetId) {
              foundCol = cIdx;
              foundCard = cardIdx;
              break;
            }
          }
        }
        zoomed.colIndex = foundCol;
        zoomed.cardIndex = foundCard;

        // Push current location to navigation history before navigating
        pushNavHistoryEntry(
          s.rootId,
          s.colIndex,
          s.cardIndex,
          ui.subIndex,
          ui.multiSelected,
          ui.inOutlineMode,
        );

        dispatch(actions.exitOutlineMode());
        dispatch(actions.setSubIndex(0));
        clearSelection();
        dispatch(actions.setDetailPane(false));
        return zoomed;
      }

      // Open project picker with 'p' key
      if (input === "p" && card) {
        dispatch(actions.showProjectPicker());
        dispatch(actions.exitOutlineMode());
        dispatch(actions.setSubIndex(0));
        clearSelection();
        dispatch(actions.setDetailPane(false));
        return s; // Don't change board state, just show picker
      }

      return newState;
    });
  }

  function handleDetailPaneInput(
    input: string,
    key: {
      escape?: boolean;
      return?: boolean;
      ctrl?: boolean;
      upArrow?: boolean;
      downArrow?: boolean;
      leftArrow?: boolean;
      rightArrow?: boolean;
      tab?: boolean;
      backspace?: boolean;
      delete?: boolean;
      shift?: boolean;
      meta?: boolean;
    },
  ) {
    if (!ui.showDetailPane) return;

    const col = state.columns[state.colIndex];

    // Close detail pane with 'h' key
    if (input === "h") {
      dispatch(actions.setDetailPane(false));
      return;
    }

    // Navigate cards while detail pane is open
    if (input === "j" || key.downArrow) {
      if (col && state.cardIndex < col.cards.length - 1) {
        setState((s) => ({ ...s, cardIndex: s.cardIndex + 1 }));
      }
      return;
    }
    if (input === "k" || key.upArrow) {
      if (state.cardIndex > 0) {
        setState((s) => ({ ...s, cardIndex: s.cardIndex - 1 }));
      }
      return;
    }

    // Quit from detail pane
    if (input === "q") {
      exit();
      return;
    }

    // Status cycling in detail pane with Space key
    // For linked nodes (transclusions), apply status change to the TARGET node
    // This ensures the original task is updated, not just the link
    if (input === " ") {
      const card = state.columns[state.colIndex]?.cards[state.cardIndex];
      if (card) {
        // Resolve link target: if this is a link, operate on the target
        const targetId = card.node.link_to || card.node.id;
        const targetNode = card.node.link_to
          ? getNode(card.node.link_to)
          : card.node;
        const currentStatus = targetNode?.task_status || "todo";
        const statusCycle: TaskStatus[] = [
          "todo",
          "wip",
          "blocked",
          "done",
          "dropped",
        ];
        const currentIndex = statusCycle.indexOf(currentStatus);
        const nextIndex = (currentIndex + 1) % statusCycle.length;
        const nextStatus = statusCycle[nextIndex] as TaskStatus;
        const markMap: Record<TaskStatus, string> = {
          todo: " ",
          wip: "/",
          blocked: "!",
          done: "x",
          dropped: "-",
        };
        const nextMark = markMap[nextStatus];

        // Update database via store layer (handles memory/disk mode)
        updateNode(targetId, {
          task_status: nextStatus,
          task_mark: nextMark,
        });

        // Refresh board state
        setTimeout(() => {
          const newState = state.rootId
            ? buildBoardState(state.rootId)
            : initBoardState();
          if (newState) {
            newState.zoomStack = state.zoomStack;
            newState.rootPath = state.rootPath;
            newState.colIndex = state.colIndex;
            newState.cardIndex = state.cardIndex;
            setState(newState);
          }
        }, 50);
      }
      return;
    }

    // Priority setting in detail pane (1-5)
    // For linked nodes (transclusions), apply priority change to the TARGET node
    if (["1", "2", "3", "4", "5"].includes(input)) {
      const card = state.columns[state.colIndex]?.cards[state.cardIndex];
      if (card) {
        // Resolve link target: if this is a link, operate on the target
        const targetId = card.node.link_to || card.node.id;

        // Update database via store layer (handles memory/disk mode)
        updateNode(targetId, { priority: parseInt(input, 10) });

        // Refresh board state
        setTimeout(() => {
          const newState = state.rootId
            ? buildBoardState(state.rootId)
            : initBoardState();
          if (newState) {
            newState.zoomStack = state.zoomStack;
            newState.rootPath = state.rootPath;
            newState.colIndex = state.colIndex;
            newState.cardIndex = state.cardIndex;
            setState(newState);
          }
        }, 50);
      }
      return;
    }
  }

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

  // ===========================================================================
  // Navigation & Selection Helpers (hoisted for readability)
  // ===========================================================================

  // Push a new entry to navigation history (truncating any forward history)
  // Captures current selection state so it can be restored when navigating back
  function pushNavHistoryEntry(
    rootId: string | null,
    colIndex: number,
    cardIndex: number,
    currentSubIndex: number,
    currentMultiSelected: Set<SelectionKey>,
    currentInOutlineMode: boolean,
  ) {
    dispatch(
      actions.pushNavHistory({
        rootId,
        colIndex,
        cardIndex,
        subIndex: currentSubIndex,
        multiSelected: new Set(currentMultiSelected),
        inOutlineMode: currentInOutlineMode,
      }),
    );
  }

  // Calculate max sub-items in current card
  function getMaxSubIndex(): number {
    const col = state.columns[state.colIndex];
    const card = col?.cards[state.cardIndex];
    if (!card) return 0;
    return (
      1 +
      countVisibleDescendants(card.node, 0, ui.maxOutlineDepth, ui.foldedNodes)
    );
  }

  // Update multi-selection range from anchor to current position
  function updateSelectionRange(toCol: number, toCard: number, toSub: number) {
    if (!ui.selectionAnchor) return;
    const newSelected = new Set<SelectionKey>();

    // For simplicity, only support selection within same column and card for now
    if (
      ui.selectionAnchor.col === toCol &&
      ui.selectionAnchor.card === toCard
    ) {
      const minSub = Math.min(ui.selectionAnchor.sub, toSub);
      const maxSub = Math.max(ui.selectionAnchor.sub, toSub);
      for (let s = minSub; s <= maxSub; s++) {
        newSelected.add(makeSelectionKey(toCol, toCard, s));
      }
    } else if (ui.selectionAnchor.col === toCol) {
      // Selection across cards in same column
      const minCard = Math.min(ui.selectionAnchor.card, toCard);
      const maxCard = Math.max(ui.selectionAnchor.card, toCard);
      for (let c = minCard; c <= maxCard; c++) {
        // Select all visible items in each card
        const card = state.columns[toCol]?.cards[c];
        if (card) {
          const maxItems =
            1 +
            countVisibleDescendants(
              card.node,
              0,
              ui.maxOutlineDepth,
              ui.foldedNodes,
            );
          for (let s = 0; s < maxItems; s++) {
            newSelected.add(makeSelectionKey(toCol, c, s));
          }
        }
      }
    }
    dispatch(actions.setMultiSelected(newSelected));
  }

  // Clear selection
  function clearSelection() {
    dispatch(actions.setMultiSelected(new Set()));
    dispatch(actions.setSelectionAnchor(null));
    dispatch(actions.setSelectAllLevel(0));
  }

  // Get unique selected card indices from multi-selection
  function getSelectedCardIndices(): number[] {
    if (ui.multiSelected.size === 0) return [];
    const indices = new Set<number>();
    for (const key of ui.multiSelected) {
      const [colStr, cardStr] = key.split(":");
      const col = parseInt(colStr ?? "0", 10);
      const card = parseInt(cardStr ?? "0", 10);
      // Only include cards from the current column
      if (col === state.colIndex) {
        indices.add(card);
      }
    }
    return Array.from(indices).sort((a, b) => a - b);
  }

  // ===========================================================================
  // Card Manipulation Functions (hoisted for readability)
  // ===========================================================================

  // Move card within column (up/down)
  function moveCardInColumn(card: CardState, direction: "up" | "down") {
    const col = state.columns[state.colIndex];
    if (!col) return;

    // Get all selected card indices, or just the current one if no multi-selection
    const selectedIndices = getSelectedCardIndices();
    const cardsToMove =
      selectedIndices.length > 0
        ? selectedIndices.map((i: number) => ({ index: i, card: col.cards[i] }))
        : [{ index: state.cardIndex, card }];

    // Filter out any undefined cards
    const validCards = cardsToMove.filter(
      (c): c is { index: number; card: CardState } => c.card !== undefined,
    );
    if (validCards.length === 0) return;

    // For moving up, we need to move the topmost card first
    // For moving down, we need to move the bottommost card first
    const sortedCards =
      direction === "up"
        ? validCards.sort(
            (a: { index: number }, b: { index: number }) => a.index - b.index,
          )
        : validCards.sort(
            (a: { index: number }, b: { index: number }) => b.index - a.index,
          );

    // Check if we can move in this direction
    const firstToMove = sortedCards[0];
    if (!firstToMove) return;
    const targetIndex =
      direction === "up" ? firstToMove.index - 1 : firstToMove.index + 1;
    if (targetIndex < 0 || targetIndex >= col.cards.length) return;

    // Calculate new sort order using fractional indexing
    // When cards have same parent_idx (e.g., all 0), use index-based fallback
    const getEffectiveSortOrder = (cardIndex: number): number => {
      const c = col.cards[cardIndex];
      // If all cards have parent_idx 0, use index as fallback
      // Otherwise use the actual parent_idx
      return c
        ? c.node.parent_idx === 0
          ? cardIndex
          : c.node.parent_idx
        : cardIndex;
    };

    // Move each card
    for (const { index: currentIndex, card: cardToMove } of sortedCards) {
      const cardTargetIndex =
        direction === "up" ? currentIndex - 1 : currentIndex + 1;

      if (cardTargetIndex < 0 || cardTargetIndex >= col.cards.length) continue;

      let newSortOrder: number;
      if (direction === "up") {
        if (cardTargetIndex === 0) {
          // Moving to first position: go before the current first card
          const firstOrder = getEffectiveSortOrder(0);
          newSortOrder = firstOrder - 1;
        } else {
          // Moving between two cards: use midpoint
          const prevOrder = getEffectiveSortOrder(cardTargetIndex - 1);
          const targetOrder = getEffectiveSortOrder(cardTargetIndex);
          newSortOrder = (prevOrder + targetOrder) / 2;
        }
      } else {
        if (cardTargetIndex >= col.cards.length - 1) {
          // Moving to last position: go after the current last card
          const lastOrder = getEffectiveSortOrder(col.cards.length - 1);
          newSortOrder = lastOrder + 1;
        } else {
          // Moving between two cards: use midpoint
          const targetOrder = getEffectiveSortOrder(cardTargetIndex);
          const nextOrder = getEffectiveSortOrder(cardTargetIndex + 1);
          newSortOrder = (targetOrder + nextOrder) / 2;
        }
      }

      // Update database via store layer (handles memory/disk mode)
      moveNode(cardToMove.node.id, col.node.id, newSortOrder);
    }

    // Track moved card IDs to re-select after state rebuild
    const movedCardIds = validCards.map((c) => c.card.node.id);

    // Update local state: move the focused card index
    const newCardIndex =
      direction === "up" ? state.cardIndex - 1 : state.cardIndex + 1;
    setState((s) => ({ ...s, cardIndex: newCardIndex }));

    // Rebuild board state to reflect changes
    setTimeout(() => {
      const newState = state.rootId
        ? buildBoardState(state.rootId)
        : initBoardState();

      if (newState) {
        newState.zoomStack = state.zoomStack;
        newState.rootPath = state.rootPath;
        newState.colIndex = state.colIndex;
        newState.cardIndex = newCardIndex;
        setState(newState);

        // Re-select moved cards in their new positions
        if (movedCardIds.length > 1) {
          const newSelected = new Set<SelectionKey>();
          const newCol = newState.columns[state.colIndex];
          if (newCol) {
            for (let cardIdx = 0; cardIdx < newCol.cards.length; cardIdx++) {
              const c = newCol.cards[cardIdx];
              if (c && movedCardIds.includes(c.node.id)) {
                newSelected.add(makeSelectionKey(state.colIndex, cardIdx, 0));
              }
            }
          }
          dispatch(actions.setMultiSelected(newSelected));
        }
      }
    }, 50);
  }

  // Move card to different column (left/right)
  function moveCardToColumn(card: CardState, direction: "left" | "right") {
    const col = state.columns[state.colIndex];
    if (!col) return;

    const targetColIndex =
      direction === "left" ? state.colIndex - 1 : state.colIndex + 1;
    if (targetColIndex < 0 || targetColIndex >= state.columns.length) return;

    const targetCol = state.columns[targetColIndex];
    if (!targetCol) return;

    // Get all selected card indices, or just the current one if no multi-selection
    const selectedIndices = getSelectedCardIndices();
    const cardsToMove: CardState[] =
      selectedIndices.length > 0
        ? selectedIndices
            .map((i: number) => col.cards[i])
            .filter((c): c is CardState => c !== undefined)
        : [card];

    if (cardsToMove.length === 0) return;

    // Calculate sort order (add at end of target column)
    let newSortOrder =
      targetCol.cards.length > 0
        ? (targetCol.cards[targetCol.cards.length - 1]?.node.parent_idx ?? 0) +
          1
        : 0;

    // Move each card, incrementing sort order
    for (const cardToMove of cardsToMove) {
      // Update database via store layer (handles memory/disk mode)
      moveNode(cardToMove.node.id, targetCol.node.id, newSortOrder);
      newSortOrder++;
    }

    // Track moved card IDs to re-select after state rebuild
    const movedCardIds = cardsToMove.map((c) => c.node.id);

    // Update local state
    const newCardIndex = targetCol.cards.length;
    setState((s) => ({
      ...s,
      colIndex: targetColIndex,
      cardIndex: newCardIndex,
    }));

    // Rebuild board state
    setTimeout(() => {
      // Use initBoardState for root level (null), buildBoardState for specific root
      const newState = state.rootId
        ? buildBoardState(state.rootId)
        : initBoardState();

      if (newState) {
        newState.zoomStack = state.zoomStack;
        newState.rootPath = state.rootPath;
        newState.colIndex = targetColIndex;
        newState.cardIndex = Math.min(
          newCardIndex,
          newState.columns[targetColIndex]?.cards.length || 0,
        );
        setState(newState);

        // Re-select moved cards in their new positions
        if (movedCardIds.length > 0) {
          const newSelected = new Set<SelectionKey>();
          const newCol = newState.columns[targetColIndex];
          if (newCol) {
            for (let cardIdx = 0; cardIdx < newCol.cards.length; cardIdx++) {
              const c = newCol.cards[cardIdx];
              if (c && movedCardIds.includes(c.node.id)) {
                newSelected.add(makeSelectionKey(targetColIndex, cardIdx, 0));
              }
            }
          }
          dispatch(actions.setMultiSelected(newSelected));
        }
      }
    }, 50);
  }

  // Move card to a specific column by index (for Opt+1-9)
  function moveCardToColumnByIndex(card: CardState, targetColIndex: number) {
    const col = state.columns[state.colIndex];
    if (!col) return;

    if (targetColIndex < 0 || targetColIndex >= state.columns.length) return;
    if (targetColIndex === state.colIndex) return; // Already in this column

    const targetCol = state.columns[targetColIndex];
    if (!targetCol) return;

    // Get all selected card indices, or just the current one if no multi-selection
    const selectedIndices = getSelectedCardIndices();
    const cardsToMove: CardState[] =
      selectedIndices.length > 0
        ? selectedIndices
            .map((i: number) => col.cards[i])
            .filter((c): c is CardState => c !== undefined)
        : [card];

    if (cardsToMove.length === 0) return;

    // Calculate sort order - add at TOP of target column (before first card)
    let newSortOrder =
      targetCol.cards.length > 0
        ? (targetCol.cards[0]?.node.parent_idx ?? 0) - cardsToMove.length
        : 0;

    // Move each card, incrementing sort order to keep order
    for (const cardToMove of cardsToMove) {
      // Update database via store layer (handles memory/disk mode)
      moveNode(cardToMove.node.id, targetCol.node.id, newSortOrder);
      newSortOrder++;
    }

    // Track moved card IDs to re-select after state rebuild
    const movedCardIds = cardsToMove.map((c) => c.node.id);

    // Stay in current column and select the next card that took this spot
    // (or the previous card if we were at the end)
    const newCardIndex = Math.min(
      state.cardIndex,
      Math.max(0, col.cards.length - cardsToMove.length - 1),
    );

    // Rebuild board state
    setTimeout(() => {
      const newState = state.rootId
        ? buildBoardState(state.rootId)
        : initBoardState();

      if (newState) {
        newState.zoomStack = state.zoomStack;
        newState.rootPath = state.rootPath;
        newState.colIndex = state.colIndex; // Stay in same column
        newState.cardIndex = Math.min(
          newCardIndex,
          Math.max(
            0,
            (newState.columns[state.colIndex]?.cards.length ?? 1) - 1,
          ),
        );
        setState(newState);

        // Re-select moved cards in their new positions (target column)
        if (movedCardIds.length > 0) {
          const newSelected = new Set<SelectionKey>();
          const targetColumnState = newState.columns[targetColIndex];
          if (targetColumnState) {
            for (
              let cardIdx = 0;
              cardIdx < targetColumnState.cards.length;
              cardIdx++
            ) {
              const c = targetColumnState.cards[cardIdx];
              if (c && movedCardIds.includes(c.node.id)) {
                newSelected.add(makeSelectionKey(targetColIndex, cardIdx, 0));
              }
            }
          }
          dispatch(actions.setMultiSelected(newSelected));
        }
      }
    }, 50);
  }

  // Indent node: make it a child of the sibling above it
  function indentNode(card: CardState) {
    const col = state.columns[state.colIndex];
    if (!col) return;

    const cardIndex = col.cards.findIndex((c) => c.node.id === card.node.id);
    if (cardIndex <= 0) {
      // Can't indent first item - no sibling above
      process.stdout.write("\x07"); // Beep
      return;
    }

    // Get the sibling above this card
    const siblingAbove = col.cards[cardIndex - 1];
    if (!siblingAbove) return;

    // Make this card a child of the sibling above
    // Use timestamp-based ordering for new child
    const newSortOrder = Date.now();

    // Update database via store layer (handles memory/disk mode)
    moveNode(card.node.id, siblingAbove.node.id, newSortOrder);

    // Rebuild board state
    setTimeout(() => {
      const newState = state.rootId
        ? buildBoardState(state.rootId)
        : initBoardState();

      if (newState) {
        newState.zoomStack = state.zoomStack;
        newState.rootPath = state.rootPath;
        newState.colIndex = state.colIndex;
        // Stay at same card index (will now point to different card)
        newState.cardIndex = Math.max(0, cardIndex - 1);
        setState(newState);
      }
    }, 50);
  }

  // Outdent node: make it a sibling of its parent
  function outdentNode(card: CardState) {
    const parentId = card.node.parent_id;
    if (!parentId) {
      // Can't outdent root-level item
      process.stdout.write("\x07"); // Beep
      return;
    }

    const parent = getNode(parentId);
    const grandparentId = parent?.parent_id;
    if (!parent || !grandparentId) {
      // Can't outdent if parent has no parent
      process.stdout.write("\x07"); // Beep
      return;
    }

    // Get parent's siblings to calculate sort order
    const grandparentChildren = getChildren(grandparentId);
    const parentIndex = grandparentChildren.findIndex((c) => c.id === parentId);

    // Insert after the parent, before next sibling
    let newSortOrder: number;
    if (parentIndex === grandparentChildren.length - 1) {
      // Parent is last child - add after it
      newSortOrder = parent.parent_idx + 1;
    } else {
      // Insert between parent and next sibling
      const nextSibling = grandparentChildren[parentIndex + 1];
      newSortOrder =
        (parent.parent_idx +
          (nextSibling?.parent_idx ?? parent.parent_idx + 2)) /
        2;
    }

    // Move card to be sibling of parent (child of grandparent)
    // Update database via store layer (handles memory/disk mode)
    moveNode(card.node.id, grandparentId, newSortOrder);

    // Rebuild board state
    setTimeout(() => {
      const newState = state.rootId
        ? buildBoardState(state.rootId)
        : initBoardState();

      if (newState) {
        newState.zoomStack = state.zoomStack;
        newState.rootPath = state.rootPath;
        newState.colIndex = state.colIndex;
        newState.cardIndex = state.cardIndex;
        setState(newState);
      }
    }, 50);
  }

  // Progressive select all with Shift+A
  function progressiveSelectAll() {
    const col = state.columns[state.colIndex];
    const card = col?.cards[state.cardIndex];

    // Determine current selection level based on what's already selected
    const currentLevel = ui.selectAllLevel;

    // Level 0: Select all sub-items in current card (if in outline mode)
    // Level 1: Select all cards in current column
    // Level 2: Select all cards in all columns (entire board)
    if (currentLevel === 0 && ui.inOutlineMode && card) {
      // Select all sub-items in current card
      const newSelected = new Set<SelectionKey>();
      const maxItems =
        1 +
        countVisibleDescendants(
          card.node,
          0,
          ui.maxOutlineDepth,
          ui.foldedNodes,
        );
      for (let s = 0; s < maxItems; s++) {
        newSelected.add(makeSelectionKey(state.colIndex, state.cardIndex, s));
      }
      dispatch(actions.setMultiSelected(newSelected));
      dispatch(actions.setSelectAllLevel(1));
    } else if (currentLevel <= 1 && col) {
      // Select all cards in current column
      const newSelected = new Set<SelectionKey>();
      for (let cardIdx = 0; cardIdx < col.cards.length; cardIdx++) {
        const c = col.cards[cardIdx];
        if (c) {
          const maxItems =
            1 +
            countVisibleDescendants(
              c.node,
              0,
              ui.maxOutlineDepth,
              ui.foldedNodes,
            );
          for (let s = 0; s < maxItems; s++) {
            newSelected.add(makeSelectionKey(state.colIndex, cardIdx, s));
          }
        }
      }
      dispatch(actions.setMultiSelected(newSelected));
      dispatch(actions.setSelectAllLevel(2));
    } else {
      // Select all cards in all columns
      const newSelected = new Set<SelectionKey>();
      for (let colIdx = 0; colIdx < state.columns.length; colIdx++) {
        const column = state.columns[colIdx];
        if (column) {
          for (let cardIdx = 0; cardIdx < column.cards.length; cardIdx++) {
            const c = column.cards[cardIdx];
            if (c) {
              const maxItems =
                1 +
                countVisibleDescendants(
                  c.node,
                  0,
                  ui.maxOutlineDepth,
                  ui.foldedNodes,
                );
              for (let s = 0; s < maxItems; s++) {
                newSelected.add(makeSelectionKey(colIdx, cardIdx, s));
              }
            }
          }
        }
      }
      dispatch(actions.setMultiSelected(newSelected));
      dispatch(actions.setSelectAllLevel(0)); // Wrap around
    }
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

// Default favorites: common boards accessed via 1-9 keys
// These are resolved at runtime using the same resolution as CLI commands
const DEFAULT_FAVORITES: Record<string, string> = {
  "1": "@inbox", // Inbox
  "2": "@next", // Next actions
  "3": "@waiting", // Waiting for
  "4": "@someday", // Someday/maybe
  "5": "@projects", // Projects
  "6": "@areas", // Areas of responsibility
  "7": "@archive", // Archive
  "8": "@reference", // Reference
  "9": "@goals", // Goals
};

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
  if (depth > maxDepth || ui.foldedNodes.has(node.id)) {
    return 0;
  }
  const children = getChildren(node.id).slice(0, 10);
  let count = children.length;
  for (const child of children) {
    count += countVisibleDescendants(
      child,
      depth + 1,
      maxDepth,
      ui.foldedNodes,
    );
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
