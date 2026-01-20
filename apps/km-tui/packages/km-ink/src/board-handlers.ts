/**
 * Shared Board Handlers
 *
 * Extracted from Board.tsx to share logic between ink and inkx versions.
 * All handlers operate on TUIContext which provides unified access to state and dispatch.
 */

import type { TUIContext } from "./tui-context.ts";
import type { KeyboardContext } from "./keyboard-types.ts";
import type { CommandAction } from "@km/commands";
import type { TaskStatus } from "@km/core";
import { actions } from "./ui-reducer.ts";
import { buildBoardState, initBoardState } from "./state.ts";
import { getNode, updateNode, deleteNode, resolveNode } from "@km/storage";
import {
  clearSelection,
  getMaxSubIndex,
  pushNavHistoryEntry,
  updateSelectionRange,
  refreshBoardState,
  progressiveSelectAll,
} from "./keyboard-helpers.ts";
import { outdentNode } from "./keyboard-card-ops.ts";
import {
  isTUIAction,
  isUIAction,
  isTaskStatusAction,
  isHistoryAction,
  isBoardAction,
} from "./command-bridge.ts";
import { DEFAULT_FAVORITES } from "./keyboard-types.ts";
import { makeSelectionKey, type SelectionKey } from "./types.ts";
import { moveCardInColumn, moveCardToColumn } from "./keyboard-card-ops.ts";

// =============================================================================
// Types
// =============================================================================

/**
 * Handler context extends TUIContext with additional callbacks.
 */
export interface HandlerContext extends TUIContext {
  /** Keyboard context for helper functions */
  keyboardContext: KeyboardContext;
}

/**
 * Handlers returned by createBoardHandlers.
 */
export interface BoardHandlers {
  handleCommandAction: (action: CommandAction) => void;
  handleCursorMove: (dir: string) => void;
  handleExtendSelectVertical: (direction: "up" | "down") => void;
  handleExtendSelectHorizontal: (direction: "left" | "right") => void;
  handleZoomIn: () => void;
  handleNavBack: () => void;
  handleNavForward: () => void;
  handleGoUpPath: () => void;
  handleDeleteNode: () => void;
  handleTaskStatusCycle: () => void;
  handleToggleFold: () => void;
  handleShiftCard: (direction: "up" | "down" | "left" | "right") => void;
  handleJumpToFavorite: (favoriteNumber: number) => void;
  handleJumpToColumn: (columnNumber: number) => void;
  handleCloseOrQuit: () => void;
}

// =============================================================================
// Handler Factory
// =============================================================================

/**
 * Create all board handlers from a context.
 *
 * This factory creates closures over the context, allowing handlers to be
 * called without passing context each time.
 */
export function createBoardHandlers(ctx: HandlerContext): BoardHandlers {
  const {
    state,
    ui,
    dispatch,
    dispatchBoard,
    setState,
    exit,
    keyboardContext,
    countVisibleDescendants,
  } = ctx;

  // Derived values
  const col = state.columns[state.colIndex];
  const card = col?.cards[state.cardIndex];

  // --- Handler implementations ---

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
            dispatchBoard({ type: "CURSOR_MOVE", dir: "next" });
            dispatch(actions.setSubIndex(0));
          }
        } else if (col && state.cardIndex < col.cards.length - 1) {
          dispatchBoard({ type: "CURSOR_MOVE", dir: "next" });
        }
        break;

      case "left":
        if (ui.selectionLevel !== "board" && state.colIndex > 0) {
          const targetCol = state.columns[state.colIndex - 1];
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
        dispatchBoard({ type: "CURSOR_MOVE", dir: "first" });
        dispatch(actions.exitOutlineMode());
        dispatch(actions.setSubIndex(0));
        break;

      case "last":
        dispatchBoard({ type: "CURSOR_MOVE", dir: "last" });
        dispatch(actions.exitOutlineMode());
        dispatch(actions.setSubIndex(0));
        break;
    }
  }

  function handleToggleFold() {
    if (!card) return;
    const nodeId = card.node.id;
    dispatch(actions.toggleFold(nodeId));
  }

  function handleNavBack() {
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
          dispatch(actions.setSubIndex(prevEntry.subIndex));
          dispatch(actions.setMultiSelected(new Set(prevEntry.multiSelected)));
          dispatch(actions.setSelectionAnchor(null));
          dispatch(actions.setSelectAllLevel(0));
          dispatch(actions.setInOutlineMode(prevEntry.inOutlineMode));
        }
      }
    } else {
      process.stdout.write("\x07");
    }
  }

  function handleNavForward() {
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
          dispatch(actions.setSubIndex(nextEntry.subIndex));
          dispatch(actions.setMultiSelected(new Set(nextEntry.multiSelected)));
          dispatch(actions.setSelectionAnchor(null));
          dispatch(actions.setSelectAllLevel(0));
          dispatch(actions.setInOutlineMode(nextEntry.inOutlineMode));
        }
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

    let rootId = targetId;
    const parentNode = targetNode.parent_id
      ? getNode(targetNode.parent_id)
      : null;
    const grandparentNode = parentNode?.parent_id
      ? getNode(parentNode.parent_id)
      : null;

    if (grandparentNode) rootId = grandparentNode.id;
    else if (parentNode) rootId = parentNode.id;

    const zoomed = buildBoardState(rootId);
    zoomed.zoomStack = [...state.zoomStack, state.rootId || ""];

    // Find the target card in the zoomed view
    let foundCol = 0,
      foundCard = 0;
    for (let cIdx = 0; cIdx < zoomed.columns.length; cIdx++) {
      const c = zoomed.columns[cIdx];
      if (!c) continue;
      for (let cardIdx = 0; cardIdx < c.cards.length; cardIdx++) {
        if (c.cards[cardIdx]?.node.id === targetId) {
          foundCol = cIdx;
          foundCard = cardIdx;
          break;
        }
      }
    }
    zoomed.colIndex = foundCol;
    zoomed.cardIndex = foundCard;

    pushNavHistoryEntry(
      dispatch,
      state.rootId,
      state.colIndex,
      state.cardIndex,
      ui.subIndex,
      ui.multiSelected,
      ui.inOutlineMode,
    );
    dispatch(actions.exitOutlineMode());
    dispatch(actions.setSubIndex(0));
    clearSelection(keyboardContext);
    dispatch(actions.setDetailPane(false));
    setState(zoomed);
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
          setState((s) => ({ ...s, cardIndex: newCardIndex }));
          dispatch(actions.setSubIndex(0));
          updateSelectionRange(keyboardContext, state.colIndex, newCardIndex, 0);
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
            setState((s) => ({ ...s, cardIndex: newCardIndex }));
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
            newSelected.add(makeSelectionKey(state.colIndex, state.cardIndex, s));
          }
          dispatch(actions.setMultiSelected(newSelected));
        }
      }
      if (direction === "down" && col && state.cardIndex < col.cards.length - 1) {
        const newCardIndex = state.cardIndex + 1;
        setState((s) => ({ ...s, cardIndex: newCardIndex }));
        updateSelectionRange(keyboardContext, state.colIndex, newCardIndex, 0);
      } else if (direction === "up" && state.cardIndex > 0) {
        const newCardIndex = state.cardIndex - 1;
        setState((s) => ({ ...s, cardIndex: newCardIndex }));
        updateSelectionRange(keyboardContext, state.colIndex, newCardIndex, 0);
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
    const targetCol = state.columns[targetColIndex];
    setState((s) => ({
      ...s,
      colIndex: targetColIndex,
      cardIndex: Math.min(
        s.cardIndex,
        Math.max(0, (targetCol?.cards.length || 1) - 1),
      ),
    }));
  }

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
    if (state.rootId) {
      const currentRoot = getNode(state.rootId);
      if (currentRoot?.parent_id) {
        const parentNode = getNode(currentRoot.parent_id);
        if (parentNode) {
          const zoomed = buildBoardState(parentNode.id);
          pushNavHistoryEntry(
            dispatch,
            state.rootId,
            state.colIndex,
            state.cardIndex,
            ui.subIndex,
            ui.multiSelected,
            ui.inOutlineMode,
          );
          setState(zoomed);
          clearSelection(keyboardContext);
          return;
        }
      } else {
        const rootView = initBoardState();
        if (rootView) {
          pushNavHistoryEntry(
            dispatch,
            state.rootId,
            state.colIndex,
            state.cardIndex,
            ui.subIndex,
            ui.multiSelected,
            ui.inOutlineMode,
          );
          setState(rootView);
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

  function handleShiftCard(direction: "up" | "down" | "left" | "right") {
    if (!card) return;
    if (direction === "up" || direction === "down") {
      moveCardInColumn(keyboardContext, card, direction);
    } else {
      moveCardToColumn(keyboardContext, card, direction);
    }
  }

  function handleJumpToFavorite(favoriteNumber: number) {
    if (ui.showDetailPane || ui.inOutlineMode) return;
    const favoriteRef = DEFAULT_FAVORITES[favoriteNumber.toString()];
    if (favoriteRef) {
      const resolved = resolveNode(favoriteRef);
      if (resolved) {
        const zoomed = buildBoardState(resolved.id);
        zoomed.zoomStack = [...state.zoomStack, state.rootId || ""];
        pushNavHistoryEntry(
          dispatch,
          state.rootId,
          state.colIndex,
          state.cardIndex,
          ui.subIndex,
          ui.multiSelected,
          ui.inOutlineMode,
        );
        dispatch(actions.exitOutlineMode());
        dispatch(actions.setSubIndex(0));
        clearSelection(keyboardContext);
        dispatch(actions.setDetailPane(false));
        setState(zoomed);
      } else {
        process.stdout.write("\x07");
      }
    }
  }

  function handleJumpToColumn(columnNumber: number) {
    if (ui.showDetailPane || ui.inOutlineMode) return;
    const targetColIndex = columnNumber - 1;
    if (targetColIndex >= 0 && targetColIndex < state.columns.length) {
      setState((s) => ({
        ...s,
        colIndex: targetColIndex,
        cardIndex: Math.min(
          s.cardIndex,
          Math.max(0, (s.columns[targetColIndex]?.cards.length ?? 1) - 1),
        ),
      }));
      clearSelection(keyboardContext);
      dispatch(actions.setSelectAllLevel(0));
    }
  }

  function handleCloseOrQuit() {
    // Contextual close: detail pane → outline mode → selection → quit
    if (ui.showDetailPane) {
      dispatch(actions.setDetailPane(false));
    } else if (ui.inOutlineMode) {
      dispatch(actions.exitOutlineMode());
      dispatch(actions.setSubIndex(0));
    } else if (ui.multiSelected.size > 0) {
      clearSelection(keyboardContext);
    } else {
      exit();
    }
  }

  // --- Main command action handler ---

  function handleCommandAction(action: CommandAction) {
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
  }

  return {
    handleCommandAction,
    handleCursorMove,
    handleExtendSelectVertical,
    handleExtendSelectHorizontal,
    handleZoomIn,
    handleNavBack,
    handleNavForward,
    handleGoUpPath,
    handleDeleteNode,
    handleTaskStatusCycle,
    handleToggleFold,
    handleShiftCard,
    handleJumpToFavorite,
    handleJumpToColumn,
    handleCloseOrQuit,
  };
}
