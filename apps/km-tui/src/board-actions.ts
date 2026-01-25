/**
 * Board Action Handlers
 *
 * Extracted from Board.tsx to reduce file size and improve testability.
 * Each handler receives TUIContext and performs the action.
 *
 * These handlers bridge CommandAction from @km/commands to actual state changes.
 * Eventually, commands will be directly executable (per km-mz2g design),
 * but this extraction is a first step to make Board.tsx manageable.
 */

import type { TaskStatus, TaskMark, KNode } from "@km/core";
import { buildTreeNodes } from "./board-adapter.ts";
import { initBoardState } from "./state.ts";
import { actions } from "./ui-reducer.ts";
import type { TUIContext } from "./tui-context.ts";
import { toKeyboardContext } from "./tui-context.ts";
import { makeSelectionKey } from "./types.ts";
import {
  clearSelection,
  pushNavHistoryEntry,
  refreshBoardState,
  progressiveSelectAll,
  updateSelectionRange,
} from "./keyboard-helpers.ts";
import {
  outdentNode,
  moveCardInColumn,
  moveCardToColumn,
} from "./keyboard-card-ops.ts";
import { DEFAULT_FAVORITES } from "./keyboard-types.ts";
import { assertNever, beepUnimplemented } from "./action-handlers.ts";
import type { CommandAction } from "@km/commands";
import { getCardMidY } from "./card-positions.ts";
import createDebug from "debug";

const debug = createDebug("km:tui:nav");

// =============================================================================
// Action Handler Type
// =============================================================================

export type ActionHandler = (ctx: TUIContext, action: CommandAction) => void;

// =============================================================================
// Main Action Dispatcher
// =============================================================================

/**
 * Handle a command action from the command system.
 *
 * Uses exhaustive switch - TypeScript errors if any action type is missing.
 * See km-y00m for why this pattern replaced the layered type guard approach.
 */
export function handleCommandAction(
  ctx: TUIContext,
  action: CommandAction,
): void {
  const { state, dispatch, exit } = ctx;
  const col = state.columns[state.colIndex];
  const card = col?.cards[state.cardIndex];
  const keyboardContext = toKeyboardContext(ctx);

  switch (action.type) {
    // === TUI-specific actions ===
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
      handleJumpToFavorite(ctx, action.favoriteNumber);
      break;
    case "JUMP_TO_COLUMN":
      handleJumpToColumn(ctx, action.columnNumber);
      break;
    case "CLOSE_OR_QUIT":
      handleCloseOrQuit(ctx);
      break;
    case "OUTDENT_NODE":
      if (card) outdentNode(keyboardContext, card);
      break;
    case "NAV_SIBLING_BOARD":
      handleNavSiblingBoard(ctx, action.direction);
      break;
    case "ZOOM_INWARDS":
      handleZoomInwards(ctx);
      break;
    case "PAGE_JUMP":
      handlePageJump(ctx, action.direction);
      break;

    // === UI actions ===
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
    case "ZOOM_OUTWARDS":
      handleZoomOutwards(ctx);
      break;
    case "DELETE_NODE":
      handleDeleteNode(ctx);
      break;
    case "SELECT_ALL_PROGRESSIVE":
      progressiveSelectAll(keyboardContext);
      break;

    // === Task actions ===
    case "TASK_SET_STATUS":
      handleTaskStatusCycle(ctx);
      break;

    // === History actions (not yet implemented) ===
    case "HISTORY_UNDO":
    case "HISTORY_REDO":
      beepUnimplemented();
      break;

    // === Board/navigation actions ===
    case "CURSOR_MOVE":
      handleCursorMove(ctx, action.dir);
      break;
    case "TOGGLE_FOLD":
      handleToggleFold(ctx);
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
      handleNavBack(ctx);
      break;
    case "NAV_FORWARD":
      handleNavForward(ctx);
      break;
    case "ZOOM_IN":
      handleZoomIn(ctx);
      break;
    case "ZOOM_OUT":
      handleZoomOutwards(ctx);
      break;
    case "CLEAR_SELECTION":
      clearSelection(keyboardContext);
      break;
    case "EXTEND_SELECT_UP":
      handleExtendSelectVertical(ctx, "up");
      break;
    case "EXTEND_SELECT_DOWN":
      handleExtendSelectVertical(ctx, "down");
      break;
    case "EXTEND_SELECT_LEFT":
      handleExtendSelectHorizontal(ctx, "left");
      break;
    case "EXTEND_SELECT_RIGHT":
      handleExtendSelectHorizontal(ctx, "right");
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
      handleShiftCard(ctx, "up");
      break;
    case "SHIFT_DOWN":
      handleShiftCard(ctx, "down");
      break;
    case "SHIFT_LEFT":
      handleShiftCard(ctx, "left");
      break;
    case "SHIFT_RIGHT":
      handleShiftCard(ctx, "right");
      break;

    // === Selection actions ===
    case "SELECT_NODE_ADD":
    case "SELECT_NODE_REMOVE":
    case "SELECT_NODE_TOGGLE":
    case "SELECT_ALL_SIBLINGS":
    case "SELECT_ALL":
      beepUnimplemented();
      break;

    // === Navigation actions not yet wired ===
    case "NAV_CROSS_COLUMN":
    case "NAV_TO_PATH":
    case "NAV_PAGE":
    case "NAV_TO":
    case "REFRESH":
      beepUnimplemented();
      break;

    // === Move mode actions ===
    case "ENTER_MOVE_MODE":
    case "CONFIRM_MOVE":
    case "CANCEL_MOVE":
      beepUnimplemented();
      break;

    default:
      assertNever(action);
  }
}

// =============================================================================
// Individual Action Handlers
// =============================================================================

function handleZoomOutwards(ctx: TUIContext): void {
  const { state, boardState, ui, layout, dispatch, dispatchBoard } = ctx;
  const keyboardContext = toKeyboardContext(ctx);
  const col = state.columns[state.colIndex];
  const card = col?.cards[state.cardIndex];

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
    const currentRoot = ctx.vault.getNode(boardState.rootId);
    if (currentRoot?.parent_id) {
      const parentNode = ctx.vault.getNode(currentRoot.parent_id);
      if (parentNode) {
        const nodes = buildTreeNodes(ctx.vault, parentNode.id);

        pushNavHistoryEntry(
          dispatch,
          boardState.rootId,
          layout.colIndex,
          layout.cardIndex,
          ui.subIndex,
          ui.multiSelected,
          ui.inOutlineMode,
        );

        dispatchBoard({
          type: "ZOOM_IN",
          nodeId: parentNode.id,
          nodes,
        });
        clearSelection(keyboardContext);
        return;
      }
    } else {
      const rootView = initBoardState(ctx.vault);
      if (rootView && rootView.rootId !== boardState.rootId) {
        const nodes = buildTreeNodes(ctx.vault, rootView.rootId);

        pushNavHistoryEntry(
          dispatch,
          boardState.rootId,
          layout.colIndex,
          layout.cardIndex,
          ui.subIndex,
          ui.multiSelected,
          ui.inOutlineMode,
        );

        dispatchBoard({
          type: "ZOOM_IN",
          nodeId: rootView.rootId,
          nodes,
        });
        clearSelection(keyboardContext);
        return;
      }
    }
  }

  // Already at root level - try to move cursor to parent of current selection
  if (card?.node.parent_id) {
    const parentNode = ctx.vault.getNode(card.node.parent_id);
    if (parentNode) {
      // Search in layout.columns for the parent node
      const columns = layout.columns;

      // Check if parent is a column header
      const colIdx = columns.findIndex((col) => col.node.id === parentNode.id);
      if (colIdx >= 0) {
        dispatchBoard({ type: "NAV_TO_PATH", path: [colIdx] });
        clearSelection(keyboardContext);
        return;
      }

      // Check if parent is a card within any column
      for (let cIdx = 0; cIdx < columns.length; cIdx++) {
        const column = columns[cIdx];
        if (!column) continue;
        const cardIdx = column.cards.findIndex(
          (c) => c.node.id === parentNode.id,
        );
        if (cardIdx >= 0) {
          dispatchBoard({ type: "NAV_TO_PATH", path: [cIdx, cardIdx] });
          clearSelection(keyboardContext);
          return;
        }
      }
    }
  }

  // Try moving from card to column level
  if (layout.cardIndex >= 0) {
    dispatchBoard({ type: "NAV_TO_PATH", path: [layout.colIndex] });
    return;
  }

  // Try moving from column level to board level
  // Derive selection level from layout indices
  const derivedSelectionLevel =
    layout.cardIndex >= 0 ? "card" : layout.colIndex >= 0 ? "column" : "board";
  if (derivedSelectionLevel === "column") {
    dispatchBoard({ type: "NAV_TO_PATH", path: [] });
    return;
  }

  process.stdout.write("\x07");
}

function handleDeleteNode(ctx: TUIContext): void {
  const { state } = ctx;
  const keyboardContext = toKeyboardContext(ctx);
  const col = state.columns[state.colIndex];
  const card = col?.cards[state.cardIndex];

  if (!card) return;
  ctx.vault.deleteNode(card.node.id);
  refreshBoardState(keyboardContext, {
    cardIndex: (c) =>
      Math.min(state.cardIndex, Math.max(0, (c?.cards.length ?? 1) - 1)),
  });
}

function handleTaskStatusCycle(ctx: TUIContext): void {
  const { state } = ctx;
  const keyboardContext = toKeyboardContext(ctx);
  const col = state.columns[state.colIndex];
  const card = col?.cards[state.cardIndex];

  if (!card) return;
  const targetId = card.node.link_to || card.node.id;
  const targetNode = card.node.link_to
    ? ctx.vault.getNode(card.node.link_to)
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
  const markMap: Record<TaskStatus, TaskMark> = {
    todo: " ",
    wip: "/",
    blocked: "!",
    done: "x",
    dropped: "-",
  };
  ctx.vault.updateNode(targetId, {
    task_status: nextStatus,
    task_mark: markMap[nextStatus],
  });
  refreshBoardState(keyboardContext);
}

function handleCursorMove(ctx: TUIContext, dir: string): void {
  const { state, ui, dispatch, dispatchBoard, positionRegistry } = ctx;
  const keyboardContext = toKeyboardContext(ctx);
  const col = state.columns[state.colIndex];
  const card = col?.cards[state.cardIndex];

  // Check for special modes first
  if (ui.inOutlineMode && (dir === "prev" || dir === "next")) {
    // Outline mode sub-item navigation
    if (dir === "prev" && ui.subIndex > 0) {
      dispatch(actions.setSubIndex(ui.subIndex - 1));
      return;
    }
    if (dir === "next" && card) {
      const maxIdx = ctx.countVisibleDescendants(
        card.node,
        0,
        ui.maxOutlineDepth,
        ui.foldedNodes,
      );
      if (ui.subIndex < maxIdx) {
        dispatch(actions.setSubIndex(ui.subIndex + 1));
        return;
      }
    }
    return;
  }

  // Vertical movement (j/k) clears sticky Y
  if (dir === "prev" || dir === "next") {
    positionRegistry.clearStickyY();
  }

  // Selection range extension mode
  const isShiftSelection =
    ui.multiSelected.size > 0 && ui.selectionAnchor !== null;
  if (isShiftSelection) {
    const verticalDirs = ["prev", "next"];
    const horizontalDirs = ["left", "right"];

    if (verticalDirs.includes(dir)) {
      // Vertical navigation with selection
      const targetIdx =
        dir === "prev"
          ? Math.max(0, state.cardIndex - 1)
          : Math.min((col?.cards.length ?? 1) - 1, state.cardIndex + 1);

      if (targetIdx !== state.cardIndex) {
        dispatchBoard({
          type: "CURSOR_MOVE",
          dir: dir === "prev" ? "prev" : "next",
        });
        if (ui.selectionAnchor !== null) {
          updateSelectionRange(keyboardContext, state.colIndex, targetIdx, 0);
        }
      }
      return;
    }

    if (horizontalDirs.includes(dir)) {
      // Horizontal: clear selection and move
      clearSelection(keyboardContext);
    }
  }

  // Horizontal movement (h/l) uses visual Y coordinates for cross-column navigation
  // Per docs/06-ui.md: curswantY = head midpoint, find card whose box intersects
  if (dir === "left" || dir === "right") {
    // Find next non-virtual column, skipping body columns
    let targetColIndex = state.colIndex;
    const step = dir === "left" ? -1 : 1;
    do {
      targetColIndex += step;
    } while (
      targetColIndex >= 0 &&
      targetColIndex < state.columns.length &&
      state.columns[targetColIndex]?.isVirtual
    );

    // Clamp to valid range
    targetColIndex = Math.max(
      0,
      Math.min(state.columns.length - 1, targetColIndex),
    );

    // No movement possible (or landed on virtual column at boundary)
    if (
      targetColIndex === state.colIndex ||
      state.columns[targetColIndex]?.isVirtual
    ) {
      return;
    }

    const targetCol = state.columns[targetColIndex];
    if (!targetCol || targetCol.cards.length === 0) {
      // Target column is empty - just move to column level
      dispatchBoard({ type: "NAV_TO_PATH", path: [targetColIndex] });
      return;
    }

    // If at column level (cardIndex < 0), move to target column's header (not a card)
    if (state.cardIndex < 0) {
      dispatchBoard({ type: "NAV_TO_PATH", path: [targetColIndex] });
      return;
    }

    // Positions are registered by rendered Card components via useLayoutCallback.
    // Check if we have positions available for visual navigation.
    const hasCurrentPositions = positionRegistry.hasCardsInColumn(
      state.colIndex,
    );
    const hasTargetPositions =
      positionRegistry.hasCardsInColumn(targetColIndex);

    // Debug: always show registry state on h/l
    debug(
      "h/l nav: curCol=%d hasCur=%s, targetCol=%d hasTgt=%s",
      state.colIndex,
      hasCurrentPositions,
      targetColIndex,
      hasTargetPositions,
    );
    debug("registry dump:\n%s", positionRegistry.dump());

    if (!hasCurrentPositions || !hasTargetPositions) {
      // Positions not yet registered (first render hasn't completed).
      // Fall back to same card index, clamped to target column bounds.
      debug(
        "h/l fallback: current=%d has=%s, target=%d has=%s",
        state.colIndex,
        hasCurrentPositions,
        targetColIndex,
        hasTargetPositions,
      );
      const targetCardIndex = Math.min(
        state.cardIndex,
        targetCol.cards.length - 1,
      );
      dispatchBoard({
        type: "NAV_TO_PATH",
        path: [targetColIndex, Math.max(0, targetCardIndex)],
      });
      return;
    }

    // Get or calculate curswantY (head midpoint of current card)
    let curswantY = positionRegistry.getStickyY();
    if (curswantY === null) {
      // First h/l move - get head midpoint of current card from measured position
      const currentLayout = positionRegistry.getCardOptional(
        state.colIndex,
        state.cardIndex,
      );
      debug(
        "h/l: getting curswantY from current card col=%d idx=%d layout=%s",
        state.colIndex,
        state.cardIndex,
        currentLayout ? JSON.stringify(currentLayout.layout) : "null",
      );
      if (!currentLayout) {
        // Current card not registered (virtualized out) - fall back
        debug("h/l: current card not registered, fallback to same index");
        const targetCardIndex = Math.min(
          state.cardIndex,
          targetCol.cards.length - 1,
        );
        dispatchBoard({
          type: "NAV_TO_PATH",
          path: [targetColIndex, Math.max(0, targetCardIndex)],
        });
        return;
      }
      curswantY = getCardMidY(currentLayout.layout);
      debug("h/l: computed curswantY=%d", curswantY);
      positionRegistry.setStickyY(curswantY);
    } else {
      debug("h/l: using sticky curswantY=%d", curswantY);
    }

    // Find card in target column whose box intersects curswantY (or closest)
    const targetCardIndex = positionRegistry.findCardAtYVisual(
      targetColIndex,
      curswantY,
    );

    // targetCardIndex can be -1 if curswantY is above all cards (land on header)
    // For now, clamp to first card (column header navigation is separate)
    const finalCardIndex = Math.max(0, targetCardIndex);

    debug(
      "h/l visual: curswantY=%d, targetCol=%d, targetCard=%d",
      curswantY,
      targetColIndex,
      finalCardIndex,
    );

    dispatchBoard({
      type: "NAV_TO_PATH",
      path: [targetColIndex, finalCardIndex],
    });
    return;
  }

  // Normal cursor movement (first, last, etc.)
  dispatchBoard({
    type: "CURSOR_MOVE",
    dir: dir as "prev" | "next" | "left" | "right" | "first" | "last",
  });
}

function handleToggleFold(ctx: TUIContext): void {
  const { state, dispatch } = ctx;
  const col = state.columns[state.colIndex];
  const card = col?.cards[state.cardIndex];

  if (!card) return;
  dispatch(actions.toggleFold(card.node.id));
}

function handleNavBack(ctx: TUIContext): void {
  const { ui, dispatch, dispatchBoard } = ctx;
  const keyboardContext = toKeyboardContext(ctx);

  // Check if we can go back
  if (ui.navHistoryIndex <= 0) {
    process.stdout.write("\x07");
    return;
  }

  // Move index back
  dispatch(actions.navBack());

  // Get the entry we're navigating to
  const entry = ui.navHistory[ui.navHistoryIndex - 1];
  if (!entry) return;

  // Navigate to the saved state
  const nodes = buildTreeNodes(ctx.vault, entry.rootId || null);
  dispatchBoard({
    type: "ZOOM_IN",
    nodeId: entry.rootId || null,
    nodes,
    cursor:
      entry.cardIndex >= 0
        ? [entry.colIndex, entry.cardIndex]
        : [entry.colIndex],
  });

  // Restore selection state
  if (entry.multiSelected && entry.multiSelected.size > 0) {
    dispatch(actions.setMultiSelected(entry.multiSelected));
  } else {
    clearSelection(keyboardContext);
  }

  if (entry.inOutlineMode) {
    dispatch(actions.enterOutlineMode());
    dispatch(actions.setSubIndex(entry.subIndex));
  }
}

function handleNavForward(ctx: TUIContext): void {
  const { ui, dispatch, dispatchBoard } = ctx;
  const keyboardContext = toKeyboardContext(ctx);

  // Check if we can go forward
  if (ui.navHistoryIndex >= ui.navHistory.length - 1) {
    process.stdout.write("\x07");
    return;
  }

  // Move index forward
  dispatch(actions.navForward());

  // Get the entry we're navigating to
  const entry = ui.navHistory[ui.navHistoryIndex + 1];
  if (!entry) return;

  // Navigate to the saved state
  const nodes = buildTreeNodes(ctx.vault, entry.rootId || null);
  dispatchBoard({
    type: "ZOOM_IN",
    nodeId: entry.rootId || null,
    nodes,
    cursor:
      entry.cardIndex >= 0
        ? [entry.colIndex, entry.cardIndex]
        : [entry.colIndex],
  });

  // Restore selection state
  if (entry.multiSelected && entry.multiSelected.size > 0) {
    dispatch(actions.setMultiSelected(entry.multiSelected));
  } else {
    clearSelection(keyboardContext);
  }

  if (entry.inOutlineMode) {
    dispatch(actions.enterOutlineMode());
    dispatch(actions.setSubIndex(entry.subIndex));
  }
}

function handleZoomIn(ctx: TUIContext): void {
  const { state, boardState, ui, dispatch, dispatchBoard, layout } = ctx;
  const keyboardContext = toKeyboardContext(ctx);
  const col = state.columns[state.colIndex];
  const card = col?.cards[state.cardIndex];

  if (!card) return;

  // If card has no children, beep and return (nothing to zoom into)
  const hasChildren = ctx.vault.getChildren(card.node.id).length > 0;
  if (!hasChildren) {
    process.stdout.write("\x07");
    return;
  }

  // Save current state to history
  pushNavHistoryEntry(
    dispatch,
    boardState.rootId,
    layout.colIndex,
    layout.cardIndex,
    ui.subIndex,
    ui.multiSelected,
    ui.inOutlineMode,
  );

  // Build tree for new root
  const nodes = buildTreeNodes(ctx.vault, card.node.id);

  // Dispatch zoom - board reducer handles cursor reset
  dispatchBoard({
    type: "ZOOM_IN",
    nodeId: card.node.id,
    nodes,
    cursor: [0, 0],
  });

  clearSelection(keyboardContext);
}

function handleExtendSelectVertical(
  ctx: TUIContext,
  direction: "up" | "down",
): void {
  const { state, ui, dispatch, dispatchBoard } = ctx;
  const col = state.columns[state.colIndex];
  const card = col?.cards[state.cardIndex];

  if (!card || !col) return;

  // Initialize selection if starting fresh
  if (ui.multiSelected.size === 0) {
    dispatch(
      actions.setSelectionAnchor({
        col: state.colIndex,
        card: state.cardIndex,
        sub: 0,
      }),
    );
    const newSelected = new Set(ui.multiSelected);
    newSelected.add(makeSelectionKey(state.colIndex, state.cardIndex, 0));
    dispatch(actions.setMultiSelected(newSelected));
  }

  // Calculate target
  const targetIdx =
    direction === "up"
      ? Math.max(0, state.cardIndex - 1)
      : Math.min(col.cards.length - 1, state.cardIndex + 1);

  if (targetIdx === state.cardIndex) return;

  // Move cursor
  dispatchBoard({
    type: "CURSOR_MOVE",
    dir: direction === "up" ? "prev" : "next",
  });

  // Update selection range
  const keyboardContext = toKeyboardContext(ctx);
  updateSelectionRange(keyboardContext, state.colIndex, targetIdx, 0);
}

function handleExtendSelectHorizontal(
  ctx: TUIContext,
  direction: "left" | "right",
): void {
  const { state, ui, dispatch, dispatchBoard } = ctx;
  const col = state.columns[state.colIndex];
  const card = col?.cards[state.cardIndex];

  if (!card) return;

  // Clear selection and move
  if (ui.multiSelected.size > 0) {
    dispatch(actions.clearMultiSelection());
    dispatch(actions.setSelectionAnchor(null));
  }

  dispatchBoard({ type: "CURSOR_MOVE", dir: direction });
}

function handleJumpToFavorite(ctx: TUIContext, favoriteNumber: number): void {
  const { boardState, ui, dispatch, dispatchBoard, layout } = ctx;
  const keyboardContext = toKeyboardContext(ctx);

  const favoriteKey =
    `favorite${favoriteNumber}` as keyof typeof DEFAULT_FAVORITES;
  const favoriteId = DEFAULT_FAVORITES[favoriteKey];

  if (!favoriteId) return;

  const targetNode = ctx.vault.getNode(favoriteId);
  if (!targetNode) return;

  // Save current state
  pushNavHistoryEntry(
    dispatch,
    boardState.rootId,
    layout.colIndex,
    layout.cardIndex,
    ui.subIndex,
    ui.multiSelected,
    ui.inOutlineMode,
  );

  // Navigate to favorite
  const nodes = buildTreeNodes(ctx.vault, favoriteId);
  dispatchBoard({
    type: "ZOOM_IN",
    nodeId: favoriteId,
    nodes,
    cursor: [0, 0],
  });

  clearSelection(keyboardContext);
}

function handleJumpToColumn(ctx: TUIContext, columnNumber: number): void {
  const { state, dispatchBoard } = ctx;

  // Column numbers are 1-indexed for user, 0-indexed internally
  const targetColIdx = columnNumber - 1;

  if (targetColIdx < 0 || targetColIdx >= state.columns.length) {
    process.stdout.write("\x07");
    return;
  }

  dispatchBoard({ type: "NAV_TO_PATH", path: [targetColIdx, 0] });
}

function handleCloseOrQuit(ctx: TUIContext): void {
  const { ui, dispatch, exit } = ctx;

  // Close any open overlay first
  if (ui.showDetailPane) {
    dispatch(actions.setDetailPane(false));
    return;
  }
  if (ui.inOutlineMode) {
    dispatch(actions.exitOutlineMode());
    dispatch(actions.setSubIndex(0));
    return;
  }
  if (ui.showHelp) {
    dispatch(actions.hideHelp());
    return;
  }
  if (ui.showProjectPicker) {
    dispatch(actions.hideProjectPicker());
    return;
  }
  if (ui.showNewItemDialog) {
    dispatch(actions.hideNewItemDialog());
    return;
  }

  // Nothing to close, quit
  exit();
}

function handleShiftCard(
  ctx: TUIContext,
  direction: "up" | "down" | "left" | "right",
): void {
  const { state } = ctx;
  const keyboardContext = toKeyboardContext(ctx);
  const col = state.columns[state.colIndex];
  const card = col?.cards[state.cardIndex];

  if (!card) return;

  if (direction === "up" || direction === "down") {
    moveCardInColumn(keyboardContext, card, direction);
  } else {
    moveCardToColumn(keyboardContext, card, direction);
  }
}

function handleNavSiblingBoard(
  ctx: TUIContext,
  direction: "next" | "prev",
): void {
  const { boardState, ui, dispatch, dispatchBoard, layout } = ctx;
  const keyboardContext = toKeyboardContext(ctx);

  if (!boardState.rootId) {
    process.stdout.write("\x07");
    return;
  }

  const currentRoot = ctx.vault.getNode(boardState.rootId);
  if (!currentRoot?.parent_id) {
    process.stdout.write("\x07");
    return;
  }

  const siblings = ctx.vault.getChildren(currentRoot.parent_id);
  const currentIdx = siblings.findIndex((n) => n.id === currentRoot.id);

  if (currentIdx < 0) return;

  const targetIdx =
    direction === "next"
      ? (currentIdx + 1) % siblings.length
      : (currentIdx - 1 + siblings.length) % siblings.length;

  const targetSibling = siblings[targetIdx];
  if (!targetSibling || targetSibling.id === currentRoot.id) return;

  // Save current state
  pushNavHistoryEntry(
    dispatch,
    boardState.rootId,
    layout.colIndex,
    layout.cardIndex,
    ui.subIndex,
    ui.multiSelected,
    ui.inOutlineMode,
  );

  // Navigate to sibling
  const nodes = buildTreeNodes(ctx.vault, targetSibling.id);
  dispatchBoard({
    type: "ZOOM_IN",
    nodeId: targetSibling.id,
    nodes,
    cursor: [0, 0],
  });

  clearSelection(keyboardContext);
}

function handleZoomInwards(ctx: TUIContext): void {
  const { state, boardState, ui, dispatch, dispatchBoard, layout } = ctx;
  const keyboardContext = toKeyboardContext(ctx);
  const col = state.columns[state.colIndex];
  const card = col?.cards[state.cardIndex];

  if (!card) {
    process.stdout.write("\x07");
    return;
  }

  // If we're in outline mode with a sub-selection, zoom to that child
  if (ui.inOutlineMode && ui.subIndex > 0) {
    const flatChildren: { node: KNode; depth: number }[] = [];

    // Build flat list of visible descendants
    function collectVisible(
      nodeId: string,
      depth: number,
      maxDepth: number,
    ): void {
      if (depth > maxDepth) return;
      const nodeChildren = ctx.vault.getChildren(nodeId);
      for (const child of nodeChildren) {
        flatChildren.push({ node: child, depth });
        if (!ui.foldedNodes.has(child.id)) {
          collectVisible(child.id, depth + 1, maxDepth);
        }
      }
    }

    collectVisible(card.node.id, 1, ui.maxOutlineDepth);

    const targetChild = flatChildren[ui.subIndex - 1];
    if (targetChild?.node) {
      // Save state and zoom to child
      pushNavHistoryEntry(
        dispatch,
        boardState.rootId,
        layout.colIndex,
        layout.cardIndex,
        ui.subIndex,
        ui.multiSelected,
        ui.inOutlineMode,
      );

      dispatch(actions.exitOutlineMode());
      dispatch(actions.setSubIndex(0));

      const nodes = buildTreeNodes(ctx.vault, targetChild.node.id);
      dispatchBoard({
        type: "ZOOM_IN",
        nodeId: targetChild.node.id,
        nodes,
        cursor: [0, 0],
      });

      clearSelection(keyboardContext);
      return;
    }
  }

  // Standard zoom in behavior
  handleZoomIn(ctx);
}

function handlePageJump(ctx: TUIContext, direction: "up" | "down"): void {
  const { state, ui, dispatchBoard } = ctx;
  const col = state.columns[state.colIndex];

  if (!col) return;

  // Page size is roughly half the visible cards
  const pageSize = Math.max(5, Math.floor((ui.dimensions.rows - 4) / 2));

  const targetIdx =
    direction === "up"
      ? Math.max(0, state.cardIndex - pageSize)
      : Math.min(col.cards.length - 1, state.cardIndex + pageSize);

  if (targetIdx !== state.cardIndex) {
    dispatchBoard({
      type: "NAV_TO_PATH",
      path: [state.colIndex, targetIdx],
    });
  }
}
