/**
 * Ink-based Board TUI Component
 * Full-screen board view with columns and cards
 */
import React, { useEffect, useReducer, useMemo } from "react";
import { Box, Text, useInput, useApp, useStdout } from "inkx";
import { getEngine } from "../engines/index.ts";
import chalk, { type ChalkInstance } from "chalk";
import { hyperlink } from "@beorn/chalkx";
import type {
  BoardState,
  ViewMode,
  SelectionKey,
  TuiEngine,
} from "../types.ts";
import { makeSelectionKey } from "../types.ts";
import { initBoardState, getNodeDisplayName } from "../state.ts";
import type { KNode, TaskStatus } from "@km/core";
import {
  getChildren,
  getNode,
  getStore,
  updateNode,
  deleteNode,
} from "@km/storage";
import type { KeyboardContext } from "../keyboard-types.ts";
import { DEFAULT_FAVORITES } from "../keyboard-types.ts";
import {
  clearSelection,
  getMaxSubIndex,
  pushNavHistoryEntry,
  updateSelectionRange,
  refreshBoardState,
  progressiveSelectAll,
} from "../keyboard-helpers.ts";
import {
  moveCardInColumn,
  moveCardToColumn,
  outdentNode,
} from "../keyboard-card-ops.ts";
import { resolveNode } from "@km/storage";
import { DetailPane } from "./DetailPane.tsx";
import { ProjectPicker } from "./ProjectPicker.tsx";
import { HelpOverlay } from "./HelpOverlay.tsx";
import { NewItemDialog } from "./NewItemDialog.tsx";
import { Column as InkxColumn } from "./CardColumn.tsx"; // For InkBoardTestable
import { useEngineViews, EngineProvider } from "../engines/index.ts";
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
import { tuiEvents } from "../tui.ts";
import { UIProvider } from "../ui-context.tsx";
import { uiReducer, createInitialUIState, actions } from "../ui-reducer.ts";
import { useBoardDialogs } from "./use-board-dialogs.ts";
import { ConstraintRoot } from "../constraints/index.ts";
import {
  processKeyWithContext,
  ensureCommandSystemInitialized,
  isUIAction,
  isTUIAction,
  isBoardAction,
  isTaskStatusAction,
  isHistoryAction,
} from "../command-bridge.ts";
import {
  buildTUIContext,
  toKeyboardContext,
  type TUIContext,
} from "../tui-context.ts";
import type { CommandAction } from "@km/commands";
import { boardReducer, createNodeMap } from "@km/board";
import {
  tuiStateToTreeState,
  deriveColumnsLayout,
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

  // Get engine-specific view components
  const { ColumnsView, ListView, TabsView, Column } = useEngineViews();

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

  // Derive column layout from tree state for rendering
  // This bridges the tree-based boardReducer to column-based rendering
  const columnsLayout = useMemo(
    () => deriveColumnsLayout(boardState),
    [boardState],
  );

  // Build nodeMap once when nodes change (O(n) only on tree changes, not every render)
  const nodeMap = useMemo(
    () => createNodeMap(boardState.nodes),
    [boardState.nodes],
  );

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

  // setState wrapper that dispatches to boardReducer
  // This enables gradual migration - callers still use setState pattern
  const setState = (
    updater: BoardState | ((prev: BoardState) => BoardState),
  ) => {
    // For now, we need to handle setState calls by rebuilding tree state
    // This is a bridge during migration - eventually all callers will dispatch directly
    const newState = typeof updater === "function" ? updater(state) : updater;

    // If rootId changed, we need a full refresh
    if (newState.rootId !== state.rootId) {
      const newTreeState = tuiStateToTreeState(newState, {
        foldedNodes: ui.foldedNodes,
        navHistory: ui.navHistory,
        navHistoryIndex: ui.navHistoryIndex,
      });
      dispatchBoard({ type: "REFRESH", nodes: newTreeState.nodes });
      return;
    }

    // For cursor changes, dispatch NAV_TO_PATH
    if (
      newState.colIndex !== state.colIndex ||
      newState.cardIndex !== state.cardIndex
    ) {
      const newPath =
        newState.cardIndex >= 0
          ? [newState.colIndex, newState.cardIndex]
          : [newState.colIndex];
      dispatchBoard({ type: "NAV_TO_PATH", path: newPath });
    }
  };

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

  // Build unified TUI context once - passed to all handlers
  const tuiContext: TUIContext = buildTUIContext({
    state,
    boardState,
    ui,
    layout: columnsLayout,
    nodeMap,
    dispatch,
    dispatchBoard,
    setState,
    exit,
    countVisibleDescendants,
  });

  // Legacy keyboard context for backward compatibility during migration
  const keyboardContext: KeyboardContext = toKeyboardContext(tuiContext);

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

    // Route ALL keys through the command system
    const result = processKeyWithContext(input, key, tuiContext);

    if (result.handled && result.actions) {
      const actionList = Array.isArray(result.actions)
        ? result.actions
        : [result.actions];
      for (const action of actionList) {
        handleCommandAction(action);
      }
    }
    // Unhandled keys are silently ignored (no fallback)
  });

  // Handle detail pane navigation (j/k to move cards while pane is open)
  useInput(
    (input, key) => {
      // Detail pane has limited navigation: j/k/arrows for cards, h/q to close
      if (input === "h") {
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

  // Handler for command system actions (hoisted)
  // All navigation logic is implemented here - no delegation to keyboard-handler.ts
  function handleCommandAction(action: CommandAction) {
    const col = state.columns[state.colIndex];
    const card = col?.cards[state.cardIndex];

    // Check TUI-specific actions first (with proper type narrowing)
    if (isTUIAction(action)) {
      switch (action.type) {
        case "QUIT":
          exit();
          break;
        case "SHOW_NEW_ITEM_DIALOG":
          dispatch(actions.showNewItemDialog());
          dispatch(actions.exitOutlineMode());
          dispatch(actions.setSubIndex(0));
          clearSelection(keyboardContext);
          dispatch(actions.setDetailPane(false));
          break;
        case "SHOW_PROJECT_PICKER":
          if (card) {
            dispatch(actions.showProjectPicker());
            dispatch(actions.exitOutlineMode());
            dispatch(actions.setSubIndex(0));
            clearSelection(keyboardContext);
            dispatch(actions.setDetailPane(false));
          }
          break;
        case "JUMP_TO_FAVORITE":
          handleJumpToFavorite(action.favoriteNumber);
          break;
        case "JUMP_TO_COLUMN":
          handleJumpToColumn(action.columnNumber);
          break;
        case "CLOSE_OR_QUIT":
          handleCloseOrQuit();
          break;
        case "OUTDENT_NODE":
          if (card) outdentNode(keyboardContext, card);
          break;
      }
    } else if (isUIAction(action)) {
      // Non-TUI UI actions
      switch (action.type) {
        case "CYCLE_VIEW_MODE":
          dispatch(actions.cycleViewMode());
          break;
        case "SHOW_HELP":
          dispatch(actions.showHelp());
          break;
        case "HIDE_HELP":
          dispatch(actions.hideHelp());
          break;
        case "OPEN_DETAIL_PANE":
          dispatch(actions.setDetailPane(true));
          break;
        case "CLOSE_DETAIL_PANE":
          dispatch(actions.setDetailPane(false));
          break;
        case "GO_UP_PATH":
          handleGoUpPath();
          break;
        case "DELETE_NODE":
          handleDeleteNode();
          break;
        case "SELECT_ALL_PROGRESSIVE":
          progressiveSelectAll(keyboardContext);
          break;
      }
    } else if (isTaskStatusAction(action)) {
      handleTaskStatusCycle();
    } else if (isHistoryAction(action)) {
      process.stdout.write("\x07"); // Undo/redo not yet implemented
    } else if (isBoardAction(action)) {
      switch (action.type) {
        case "CURSOR_MOVE":
          handleCursorMove(action.dir);
          break;
        case "TOGGLE_FOLD":
          handleToggleFold();
          break;
        case "FOLD_LEVEL":
          if (col) dispatch(actions.foldAll(col.cards.map((c) => c.node.id)));
          break;
        case "UNFOLD_LEVEL":
          if (col) dispatch(actions.unfoldAll(col.cards.map((c) => c.node.id)));
          break;
        case "TOGGLE_COLLAPSE":
          dispatch(actions.toggleColumnCollapse(state.colIndex));
          break;
        case "NAV_BACK":
          handleNavBack();
          break;
        case "NAV_FORWARD":
          handleNavForward();
          break;
        case "ZOOM_IN":
          handleZoomIn();
          break;
        case "CLEAR_SELECTION":
          clearSelection(keyboardContext);
          break;
        case "EXTEND_SELECT_UP":
          handleExtendSelectVertical("up");
          break;
        case "EXTEND_SELECT_DOWN":
          handleExtendSelectVertical("down");
          break;
        case "EXTEND_SELECT_LEFT":
          handleExtendSelectHorizontal("left");
          break;
        case "EXTEND_SELECT_RIGHT":
          handleExtendSelectHorizontal("right");
          break;
        case "INCREASE_OUTLINE_DEPTH":
          dispatch(actions.increaseOutlineDepth());
          break;
        case "DECREASE_OUTLINE_DEPTH":
          dispatch(actions.decreaseOutlineDepth());
          break;
        case "INCREASE_CONTENT_LINES":
          dispatch(actions.increaseContentLines());
          break;
        case "DECREASE_CONTENT_LINES":
          dispatch(actions.decreaseContentLines());
          break;
        // Card shifting (Alt+arrows)
        case "SHIFT_UP":
          handleShiftCard("up");
          break;
        case "SHIFT_DOWN":
          handleShiftCard("down");
          break;
        case "SHIFT_LEFT":
          handleShiftCard("left");
          break;
        case "SHIFT_RIGHT":
          handleShiftCard("right");
          break;
      }
    }

    // --- Implementation functions (hoisted) ---

    function handleGoUpPath() {
      if (ui.showDetailPane) {
        dispatch(actions.setDetailPane(false));
        return;
      }
      if (ui.inOutlineMode) {
        dispatch(actions.exitOutlineMode());
        dispatch(actions.setSubIndex(0));
        clearSelection(keyboardContext);
        return;
      }
      if (boardState.rootId) {
        const currentRoot = getNode(boardState.rootId);
        if (currentRoot?.parent_id) {
          const parentNode = getNode(currentRoot.parent_id);
          if (parentNode) {
            // Build tree nodes directly
            const nodes = buildTreeNodes(parentNode.id);

            pushNavHistoryEntry(
              dispatch,
              boardState.rootId,
              columnsLayout.colIndex,
              columnsLayout.cardIndex,
              ui.subIndex,
              ui.multiSelected,
              ui.inOutlineMode,
            );

            // Dispatch zoom action to navigate up
            dispatchBoard({
              type: "ZOOM_IN",
              nodeId: parentNode.id,
              nodes,
              cursor: [0, 0],
            });
            clearSelection(keyboardContext);
            return;
          }
        } else {
          // At top level with a root - zoom out to absolute root
          const rootView = initBoardState();
          if (rootView && rootView.rootId) {
            const nodes = buildTreeNodes(rootView.rootId);

            pushNavHistoryEntry(
              dispatch,
              boardState.rootId,
              columnsLayout.colIndex,
              columnsLayout.cardIndex,
              ui.subIndex,
              ui.multiSelected,
              ui.inOutlineMode,
            );

            // Navigate to root view
            dispatchBoard({
              type: "ZOOM_IN",
              nodeId: rootView.rootId,
              nodes,
              cursor: [0, 0],
            });
            clearSelection(keyboardContext);
            return;
          }
        }
      }
      process.stdout.write("\x07");
    }

    function handleDeleteNode() {
      if (!card) return;
      deleteNode(card.node.id);
      refreshBoardState(keyboardContext, {
        cardIndex: (col) =>
          Math.min(state.cardIndex, Math.max(0, (col?.cards.length ?? 1) - 1)),
      });
    }

    function handleTaskStatusCycle() {
      if (!card) return;
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
      const nextStatus = statusCycle[
        (currentIndex + 1) % statusCycle.length
      ] as TaskStatus;
      const markMap: Record<TaskStatus, string> = {
        todo: " ",
        wip: "/",
        blocked: "!",
        done: "x",
        dropped: "-",
      };
      updateNode(targetId, {
        task_status: nextStatus,
        task_mark: markMap[nextStatus],
      });
      refreshBoardState(keyboardContext);
    }

    function handleCursorMove(dir: string) {
      clearSelection(keyboardContext);

      switch (dir) {
        case "up":
        case "prev":
          if (ui.selectionLevel === "card") {
            if (ui.inOutlineMode) {
              if (ui.subIndex > 0) {
                dispatch(actions.setSubIndex(ui.subIndex - 1));
              } else if (state.cardIndex > 0) {
                const prevCardIndex = state.cardIndex - 1;
                // Dispatch directly to boardReducer
                dispatchBoard({ type: "CURSOR_MOVE", dir: "prev" });
                const prevCard = col?.cards[prevCardIndex];
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
              } else {
                dispatch(actions.setSelectionLevel("column"));
                dispatch(actions.setSubIndex(0));
              }
            } else {
              if (state.cardIndex > 0) {
                // Dispatch directly to boardReducer
                dispatchBoard({ type: "CURSOR_MOVE", dir: "prev" });
              } else {
                dispatch(actions.setSelectionLevel("column"));
              }
            }
          } else if (ui.selectionLevel === "column") {
            dispatch(actions.setSelectionLevel("board"));
          }
          break;

        case "down":
        case "next":
          if (ui.selectionLevel === "board") {
            dispatch(actions.setSelectionLevel("column"));
            dispatchBoard({ type: "NAV_TO_PATH", path: [0] });
          } else if (ui.selectionLevel === "column") {
            dispatch(actions.setSelectionLevel("card"));
            dispatchBoard({ type: "NAV_TO_PATH", path: [state.colIndex, 0] });
          } else if (ui.inOutlineMode) {
            const maxSub = getMaxSubIndex(keyboardContext);
            if (ui.subIndex < maxSub - 1) {
              dispatch(actions.setSubIndex(ui.subIndex + 1));
            } else if (col && state.cardIndex < col.cards.length - 1) {
              // Dispatch directly to boardReducer
              dispatchBoard({ type: "CURSOR_MOVE", dir: "next" });
              dispatch(actions.setSubIndex(0));
            }
          } else if (col && state.cardIndex < col.cards.length - 1) {
            // Dispatch directly to boardReducer
            dispatchBoard({ type: "CURSOR_MOVE", dir: "next" });
          }
          break;

        case "left":
          if (ui.selectionLevel !== "board" && state.colIndex > 0) {
            const targetCol = state.columns[state.colIndex - 1];
            // Dispatch directly to boardReducer for cross-column movement
            dispatchBoard({ type: "CURSOR_MOVE", dir: "left" });
            if (
              ui.selectionLevel === "card" &&
              (!targetCol || targetCol.cards.length === 0)
            ) {
              dispatch(actions.setSelectionLevel("column"));
            }
            dispatch(actions.exitOutlineMode());
            dispatch(actions.setSubIndex(0));
          }
          break;

        case "right":
          if (
            ui.selectionLevel !== "board" &&
            state.colIndex < state.columns.length - 1
          ) {
            const targetCol = state.columns[state.colIndex + 1];
            // Dispatch directly to boardReducer for cross-column movement
            dispatchBoard({ type: "CURSOR_MOVE", dir: "right" });
            if (
              ui.selectionLevel === "card" &&
              (!targetCol || targetCol.cards.length === 0)
            ) {
              dispatch(actions.setSelectionLevel("column"));
            }
            dispatch(actions.exitOutlineMode());
            dispatch(actions.setSubIndex(0));
          }
          break;

        case "first":
          // Dispatch directly to boardReducer
          dispatchBoard({ type: "CURSOR_MOVE", dir: "first" });
          dispatch(actions.exitOutlineMode());
          dispatch(actions.setSubIndex(0));
          break;

        case "last":
          // Dispatch directly to boardReducer
          dispatchBoard({ type: "CURSOR_MOVE", dir: "last" });
          dispatch(actions.exitOutlineMode());
          dispatch(actions.setSubIndex(0));
          break;
      }
    }

    function handleToggleFold() {
      if (!card) return;
      // Tab toggles fold on current card, Shift+Tab does indent/outdent
      // which is handled by keyboard-handler for now (TUI-specific)
      const nodeId = card.node.id;
      dispatch(actions.toggleFold(nodeId));
    }

    function handleNavBack() {
      if (ui.navHistoryIndex > 0) {
        const prevEntry = ui.navHistory[ui.navHistoryIndex - 1];
        if (prevEntry && prevEntry.rootId) {
          // Build tree nodes directly
          const nodes = buildTreeNodes(prevEntry.rootId);

          // Navigate to the previous location
          dispatchBoard({
            type: "ZOOM_IN",
            nodeId: prevEntry.rootId,
            nodes,
            cursor: [prevEntry.colIndex, prevEntry.cardIndex],
          });

          // Restore UI state
          dispatch(actions.setNavHistoryIndex(ui.navHistoryIndex - 1));
          dispatch(actions.setSubIndex(prevEntry.subIndex));
          dispatch(actions.setMultiSelected(new Set(prevEntry.multiSelected)));
          dispatch(actions.setSelectionAnchor(null));
          dispatch(actions.setSelectAllLevel(0));
          dispatch(actions.setInOutlineMode(prevEntry.inOutlineMode));
        }
      } else {
        process.stdout.write("\x07");
      }
    }

    function handleNavForward() {
      if (ui.navHistoryIndex < ui.navHistory.length - 1) {
        const nextEntry = ui.navHistory[ui.navHistoryIndex + 1];
        if (nextEntry && nextEntry.rootId) {
          // Build tree nodes directly
          const nodes = buildTreeNodes(nextEntry.rootId);

          // Navigate to the next location
          dispatchBoard({
            type: "ZOOM_IN",
            nodeId: nextEntry.rootId,
            nodes,
            cursor: [nextEntry.colIndex, nextEntry.cardIndex],
          });

          // Restore UI state
          dispatch(actions.setNavHistoryIndex(ui.navHistoryIndex + 1));
          dispatch(actions.setSubIndex(nextEntry.subIndex));
          dispatch(actions.setMultiSelected(new Set(nextEntry.multiSelected)));
          dispatch(actions.setSelectionAnchor(null));
          dispatch(actions.setSelectAllLevel(0));
          dispatch(actions.setInOutlineMode(nextEntry.inOutlineMode));
        }
      } else {
        process.stdout.write("\x07");
      }
    }

    function handleZoomIn() {
      if (!card) return;
      const targetId = card.node.link_to || card.node.id;
      const targetNode = getNode(targetId);
      if (!targetNode) return;

      // Determine root: prefer grandparent > parent > target
      let rootId = targetId;
      const parentNode = targetNode.parent_id
        ? getNode(targetNode.parent_id)
        : null;
      const grandparentNode = parentNode?.parent_id
        ? getNode(parentNode.parent_id)
        : null;

      if (grandparentNode) rootId = grandparentNode.id;
      else if (parentNode) rootId = parentNode.id;

      // Build tree nodes directly (bypass legacy BoardState)
      const nodes = buildTreeNodes(rootId);

      // Find the target card position in the new tree
      let foundCol = 0,
        foundCard = 0;
      for (let cIdx = 0; cIdx < nodes.length; cIdx++) {
        const colNode = nodes[cIdx];
        if (!colNode) continue;
        for (let cardIdx = 0; cardIdx < colNode.children.length; cardIdx++) {
          if (colNode.children[cardIdx]?.id === targetId) {
            foundCol = cIdx;
            foundCard = cardIdx;
            break;
          }
        }
      }

      // Push nav history before changing state
      pushNavHistoryEntry(
        dispatch,
        boardState.rootId,
        columnsLayout.colIndex,
        columnsLayout.cardIndex,
        ui.subIndex,
        ui.multiSelected,
        ui.inOutlineMode,
      );

      // Reset UI state
      dispatch(actions.exitOutlineMode());
      dispatch(actions.setSubIndex(0));
      clearSelection(keyboardContext);
      dispatch(actions.setDetailPane(false));

      // Dispatch zoom action directly to boardReducer
      dispatchBoard({
        type: "ZOOM_IN",
        nodeId: rootId,
        nodes,
        cursor: [foundCol, foundCard],
      });
    }

    function handleExtendSelectVertical(direction: "up" | "down") {
      if (ui.inOutlineMode) {
        if (!ui.selectionAnchor) {
          dispatch(
            actions.setSelectionAnchor({
              col: state.colIndex,
              card: state.cardIndex,
              sub: ui.subIndex,
            }),
          );
        }
        if (direction === "down") {
          const maxSub = getMaxSubIndex(keyboardContext);
          if (ui.subIndex < maxSub - 1) {
            const newSubIndex = ui.subIndex + 1;
            dispatch(actions.setSubIndex(newSubIndex));
            updateSelectionRange(
              keyboardContext,
              state.colIndex,
              state.cardIndex,
              newSubIndex,
            );
          } else if (col && state.cardIndex < col.cards.length - 1) {
            const newCardIndex = state.cardIndex + 1;
            dispatchBoard({ type: "CURSOR_MOVE", dir: "next" });
            dispatch(actions.setSubIndex(0));
            updateSelectionRange(
              keyboardContext,
              state.colIndex,
              newCardIndex,
              0,
            );
          }
        } else {
          if (ui.subIndex > 0) {
            const newSubIndex = ui.subIndex - 1;
            dispatch(actions.setSubIndex(newSubIndex));
            updateSelectionRange(
              keyboardContext,
              state.colIndex,
              state.cardIndex,
              newSubIndex,
            );
          } else if (state.cardIndex > 0) {
            const newCardIndex = state.cardIndex - 1;
            const prevCard = col?.cards[newCardIndex];
            if (prevCard) {
              const maxSub =
                1 +
                countVisibleDescendants(
                  prevCard.node,
                  0,
                  ui.maxOutlineDepth,
                  ui.foldedNodes,
                );
              dispatchBoard({ type: "CURSOR_MOVE", dir: "prev" });
              dispatch(actions.setSubIndex(maxSub - 1));
              updateSelectionRange(
                keyboardContext,
                state.colIndex,
                newCardIndex,
                maxSub - 1,
              );
            }
          }
        }
      } else {
        if (!ui.selectionAnchor) {
          dispatch(
            actions.setSelectionAnchor({
              col: state.colIndex,
              card: state.cardIndex,
              sub: 0,
            }),
          );
          if (card) {
            const maxItems =
              1 +
              countVisibleDescendants(
                card.node,
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
        if (
          direction === "down" &&
          col &&
          state.cardIndex < col.cards.length - 1
        ) {
          const newCardIndex = state.cardIndex + 1;
          dispatchBoard({ type: "CURSOR_MOVE", dir: "next" });
          updateSelectionRange(
            keyboardContext,
            state.colIndex,
            newCardIndex,
            0,
          );
        } else if (direction === "up" && state.cardIndex > 0) {
          const newCardIndex = state.cardIndex - 1;
          dispatchBoard({ type: "CURSOR_MOVE", dir: "prev" });
          updateSelectionRange(
            keyboardContext,
            state.colIndex,
            newCardIndex,
            0,
          );
        }
      }
    }

    function handleExtendSelectHorizontal(direction: "left" | "right") {
      const targetColIndex =
        direction === "left" ? state.colIndex - 1 : state.colIndex + 1;
      if (targetColIndex < 0 || targetColIndex >= state.columns.length) return;

      if (!ui.selectionAnchor) {
        dispatch(
          actions.setSelectionAnchor({
            col: state.colIndex,
            card: state.cardIndex,
            sub: 0,
          }),
        );
      }
      // Dispatch to boardReducer for horizontal movement
      dispatchBoard({ type: "CURSOR_MOVE", dir: direction });
    }

    // TUI-specific handler functions

    function handleJumpToFavorite(favoriteNumber: number) {
      if (ui.showDetailPane || ui.inOutlineMode) return;
      const favoriteRef = DEFAULT_FAVORITES[favoriteNumber.toString()];
      if (favoriteRef) {
        const resolved = resolveNode(favoriteRef);
        if (resolved) {
          // Build tree nodes directly
          const nodes = buildTreeNodes(resolved.id);

          // Push nav history before changing state
          pushNavHistoryEntry(
            dispatch,
            boardState.rootId,
            columnsLayout.colIndex,
            columnsLayout.cardIndex,
            ui.subIndex,
            ui.multiSelected,
            ui.inOutlineMode,
          );

          // Reset UI state
          dispatch(actions.exitOutlineMode());
          dispatch(actions.setSubIndex(0));
          clearSelection(keyboardContext);
          dispatch(actions.setDetailPane(false));

          // Dispatch zoom action directly to boardReducer
          dispatchBoard({
            type: "ZOOM_IN",
            nodeId: resolved.id,
            nodes,
            cursor: [0, 0],
          });
        } else {
          process.stdout.write("\x07");
        }
      }
    }

    function handleJumpToColumn(columnNumber: number) {
      if (ui.showDetailPane || ui.inOutlineMode) return;
      const targetColIndex = columnNumber - 1; // 1-9 maps to 0-8
      if (targetColIndex >= 0 && targetColIndex < columnsLayout.columns.length) {
        const targetCol = columnsLayout.columns[targetColIndex];
        const clampedCardIndex = Math.min(
          columnsLayout.cardIndex,
          Math.max(0, (targetCol?.cards.length ?? 1) - 1),
        );
        // Navigate directly via boardReducer
        dispatchBoard({
          type: "NAV_TO_PATH",
          path: [targetColIndex, clampedCardIndex],
        });
        clearSelection(keyboardContext);
        dispatch(actions.setSelectAllLevel(0));
      }
    }

    function handleCloseOrQuit() {
      // Contextual close: detail pane → outline mode → quit
      if (ui.showDetailPane) {
        dispatch(actions.setDetailPane(false));
        return;
      }
      if (ui.inOutlineMode) {
        dispatch(actions.exitOutlineMode());
        dispatch(actions.setSubIndex(0));
        clearSelection(keyboardContext);
        return;
      }
      exit();
    }

    function handleShiftCard(direction: "up" | "down" | "left" | "right") {
      if (!card) return;
      if (direction === "up" || direction === "down") {
        moveCardInColumn(keyboardContext, card, direction);
      } else {
        moveCardToColumn(keyboardContext, card, direction);
      }
    }
  }

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
          height={termHeight}
          minHeight={3}
          overflowY="hidden"
        >
          {/* Top bar: full path from root to selected item, inverted full width */}
          {/* flexShrink={0} prevents Ink/Yoga from clipping this when content overflows */}
          <Box height={1} width={termWidth} flexShrink={0}>
            <Text>{topBarFg(" ") + topBarContent + topBarBg(padding)}</Text>
          </Box>
          <Box
            flexGrow={1}
            flexDirection="row"
            height={termHeight - 2}
            overflowY="hidden"
          >
            {/* Cards, Columns, or List view */}
            {ui.viewMode === "cards" ? (
              <Box
                flexDirection="row"
                width={boardWidth}
                height={termHeight - 2}
              >
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
                          {Array.from({ length: termHeight - 3 }).map(
                            (_, j) => (
                              <Text key={j} color="gray">
                                │
                              </Text>
                            ),
                          )}
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
          {/* flexShrink={0} prevents this bar from being clipped when content overflows */}
          <Box
            width={termWidth}
            justifyContent="space-between"
            paddingX={1}
            flexShrink={0}
          >
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
              {ui.showProjectPicker && (
                <Text color="green">{`[PROJECT] `}</Text>
              )}
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
      if (boardState.rootId) {
        const nodes = buildTreeNodes(boardState.rootId);
        dispatchBoard({ type: "REFRESH", nodes });
      }
    };

    tuiEvents.on("refresh", handleRefresh);
    return () => {
      tuiEvents.off("refresh", handleRefresh);
    };
  }
}

/**
 * Exit the terminal alternate buffer.
 * Call this to ensure the terminal is restored to normal mode.
 */
function exitAlternateBuffer(): void {
  process.stdout.write("\x1b[?1049l");
}

export async function renderInkxBoard(
  state: BoardState,
  initialViewMode?: ViewMode,
  engine: TuiEngine = "inkx",
): Promise<void> {
  // Wrap Board with EngineProvider to inject the right view components
  const app = (
    <EngineProvider engine={engine}>
      <Board initialState={state} initialViewMode={initialViewMode} />
    </EngineProvider>
  );

  // Use the engine-specific render function
  const engineApi = getEngine(engine);
  const { waitUntilExit } = await engineApi.render(app, {
    exitOnCtrlC: true,
    patchConsole: true,
  });

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
              <InkxColumn
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
