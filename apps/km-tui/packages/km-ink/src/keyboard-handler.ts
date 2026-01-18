/**
 * Keyboard Input Handler for Board TUI
 *
 * Extracted from Board.tsx for better modularity and testability.
 * Handles all keyboard shortcuts and navigation.
 */

import type { KNode, TaskStatus } from "@km/core";
import type { BoardState, CardState, SelectionKey } from "./types.ts";
import type { UIState } from "./ui-reducer.ts";
import { actions } from "./ui-reducer.ts";
import { makeSelectionKey } from "./types.ts";
import {
  getNode,
  getChildren,
  resolveNode,
  updateNode,
  deleteNode,
  moveNode,
} from "@km/storage";
import { buildBoardState, initBoardState } from "./state.ts";

// =============================================================================
// Types
// =============================================================================

export interface KeyEvent {
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
}

export interface KeyboardContext {
  state: BoardState;
  ui: UIState;
  setState: React.Dispatch<React.SetStateAction<BoardState>>;
  dispatch: React.Dispatch<ReturnType<(typeof actions)[keyof typeof actions]>>;
  exit: () => void;
  countVisibleDescendants: (
    node: KNode,
    depth: number,
    maxDepth: number,
    foldedNodes: Set<string>,
  ) => number;
}

// =============================================================================
// Constants
// =============================================================================

/** Default favorites: common boards accessed via 1-9 keys */
export const DEFAULT_FAVORITES: Record<string, string> = {
  "1": "@inbox",
  "2": "@next",
  "3": "@waiting",
  "4": "@someday",
  "5": "@projects",
  "6": "@areas",
  "7": "@archive",
  "8": "@reference",
  "9": "@goals",
};

/** Terminal sends these characters for Shift+1-9 */
const SHIFT_NUMBER_MAP: Record<string, number> = {
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

// =============================================================================
// Helper Functions
// =============================================================================

/** Push a new entry to navigation history */
function pushNavHistoryEntry(
  dispatch: KeyboardContext["dispatch"],
  rootId: string | null,
  colIndex: number,
  cardIndex: number,
  subIndex: number,
  multiSelected: Set<SelectionKey>,
  inOutlineMode: boolean,
) {
  dispatch(
    actions.pushNavHistory({
      rootId,
      colIndex,
      cardIndex,
      subIndex,
      multiSelected: new Set(multiSelected),
      inOutlineMode,
    }),
  );
}

/** Calculate max sub-items in current card */
function getMaxSubIndex(ctx: KeyboardContext): number {
  const col = ctx.state.columns[ctx.state.colIndex];
  const card = col?.cards[ctx.state.cardIndex];
  if (!card) return 0;
  return (
    1 +
    ctx.countVisibleDescendants(
      card.node,
      0,
      ctx.ui.maxOutlineDepth,
      ctx.ui.foldedNodes,
    )
  );
}

/** Update multi-selection range from anchor to current position */
function updateSelectionRange(
  ctx: KeyboardContext,
  toCol: number,
  toCard: number,
  toSub: number,
) {
  if (!ctx.ui.selectionAnchor) return;
  const newSelected = new Set<SelectionKey>();

  if (
    ctx.ui.selectionAnchor.col === toCol &&
    ctx.ui.selectionAnchor.card === toCard
  ) {
    const minSub = Math.min(ctx.ui.selectionAnchor.sub, toSub);
    const maxSub = Math.max(ctx.ui.selectionAnchor.sub, toSub);
    for (let s = minSub; s <= maxSub; s++) {
      newSelected.add(makeSelectionKey(toCol, toCard, s));
    }
  } else if (ctx.ui.selectionAnchor.col === toCol) {
    const minCard = Math.min(ctx.ui.selectionAnchor.card, toCard);
    const maxCard = Math.max(ctx.ui.selectionAnchor.card, toCard);
    for (let c = minCard; c <= maxCard; c++) {
      const card = ctx.state.columns[toCol]?.cards[c];
      if (card) {
        const maxItems =
          1 +
          ctx.countVisibleDescendants(
            card.node,
            0,
            ctx.ui.maxOutlineDepth,
            ctx.ui.foldedNodes,
          );
        for (let s = 0; s < maxItems; s++) {
          newSelected.add(makeSelectionKey(toCol, c, s));
        }
      }
    }
  }
  ctx.dispatch(actions.setMultiSelected(newSelected));
}

/** Clear all selection state */
function clearSelection(ctx: KeyboardContext) {
  ctx.dispatch(actions.setMultiSelected(new Set()));
  ctx.dispatch(actions.setSelectionAnchor(null));
  ctx.dispatch(actions.setSelectAllLevel(0));
}

/** Rebuild board state after a mutation, preserving navigation context */
function refreshBoardState(
  ctx: KeyboardContext,
  options?: {
    colIndex?: number;
    cardIndex?: number | ((col: { cards: CardState[] } | undefined) => number);
  },
): BoardState | null {
  const newState = ctx.state.rootId
    ? buildBoardState(ctx.state.rootId)
    : initBoardState();

  if (newState) {
    newState.zoomStack = ctx.state.zoomStack;
    newState.rootPath = ctx.state.rootPath;
    newState.colIndex = options?.colIndex ?? ctx.state.colIndex;

    const col = newState.columns[newState.colIndex];
    if (typeof options?.cardIndex === "function") {
      newState.cardIndex = options.cardIndex(col);
    } else {
      newState.cardIndex = options?.cardIndex ?? ctx.state.cardIndex;
    }

    ctx.setState(newState);
  }
  return newState;
}

/** Get unique selected card indices from multi-selection */
function getSelectedCardIndices(ctx: KeyboardContext): number[] {
  if (ctx.ui.multiSelected.size === 0) return [];
  const indices = new Set<number>();
  for (const key of ctx.ui.multiSelected) {
    const [colStr, cardStr] = key.split(":");
    const col = parseInt(colStr ?? "0", 10);
    const card = parseInt(cardStr ?? "0", 10);
    if (col === ctx.state.colIndex) {
      indices.add(card);
    }
  }
  return Array.from(indices).sort((a, b) => a - b);
}

// =============================================================================
// Card Manipulation Functions
// =============================================================================

/** Move card within column (up/down) */
function moveCardInColumn(
  ctx: KeyboardContext,
  card: CardState,
  direction: "up" | "down",
) {
  const col = ctx.state.columns[ctx.state.colIndex];
  if (!col) return;

  const selectedIndices = getSelectedCardIndices(ctx);
  const cardsToMove =
    selectedIndices.length > 0
      ? selectedIndices.map((i: number) => ({ index: i, card: col.cards[i] }))
      : [{ index: ctx.state.cardIndex, card }];

  const validCards = cardsToMove.filter(
    (c): c is { index: number; card: CardState } => c.card !== undefined,
  );
  if (validCards.length === 0) return;

  const sortedCards =
    direction === "up"
      ? validCards.sort(
          (a: { index: number }, b: { index: number }) => a.index - b.index,
        )
      : validCards.sort(
          (a: { index: number }, b: { index: number }) => b.index - a.index,
        );

  const firstToMove = sortedCards[0];
  if (!firstToMove) return;
  const targetIndex =
    direction === "up" ? firstToMove.index - 1 : firstToMove.index + 1;
  if (targetIndex < 0 || targetIndex >= col.cards.length) return;

  const getEffectiveSortOrder = (cardIndex: number): number => {
    const c = col.cards[cardIndex];
    return c
      ? c.node.parent_idx === 0
        ? cardIndex
        : c.node.parent_idx
      : cardIndex;
  };

  for (const { index: currentIndex, card: cardToMove } of sortedCards) {
    const cardTargetIndex =
      direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (cardTargetIndex < 0 || cardTargetIndex >= col.cards.length) continue;

    let newSortOrder: number;
    if (direction === "up") {
      if (cardTargetIndex === 0) {
        const firstOrder = getEffectiveSortOrder(0);
        newSortOrder = firstOrder - 1;
      } else {
        const prevOrder = getEffectiveSortOrder(cardTargetIndex - 1);
        const targetOrder = getEffectiveSortOrder(cardTargetIndex);
        newSortOrder = (prevOrder + targetOrder) / 2;
      }
    } else {
      if (cardTargetIndex >= col.cards.length - 1) {
        const lastOrder = getEffectiveSortOrder(col.cards.length - 1);
        newSortOrder = lastOrder + 1;
      } else {
        const targetOrder = getEffectiveSortOrder(cardTargetIndex);
        const nextOrder = getEffectiveSortOrder(cardTargetIndex + 1);
        newSortOrder = (targetOrder + nextOrder) / 2;
      }
    }

    moveNode(cardToMove.node.id, col.node.id, newSortOrder);
  }

  const movedCardIds = validCards.map((c) => c.card.node.id);
  const newCardIndex =
    direction === "up" ? ctx.state.cardIndex - 1 : ctx.state.cardIndex + 1;

  const newState = refreshBoardState(ctx, { cardIndex: newCardIndex });

  if (newState && movedCardIds.length > 1) {
    const newSelected = new Set<SelectionKey>();
    const newCol = newState.columns[ctx.state.colIndex];
    if (newCol) {
      for (let cardIdx = 0; cardIdx < newCol.cards.length; cardIdx++) {
        const c = newCol.cards[cardIdx];
        if (c && movedCardIds.includes(c.node.id)) {
          newSelected.add(makeSelectionKey(ctx.state.colIndex, cardIdx, 0));
        }
      }
    }
    ctx.dispatch(actions.setMultiSelected(newSelected));
  }
}

/** Move card to different column (left/right) */
function moveCardToColumn(
  ctx: KeyboardContext,
  card: CardState,
  direction: "left" | "right",
) {
  const col = ctx.state.columns[ctx.state.colIndex];
  if (!col) return;

  const targetColIndex =
    direction === "left" ? ctx.state.colIndex - 1 : ctx.state.colIndex + 1;
  if (targetColIndex < 0 || targetColIndex >= ctx.state.columns.length) return;

  const targetCol = ctx.state.columns[targetColIndex];
  if (!targetCol) return;

  const selectedIndices = getSelectedCardIndices(ctx);
  const cardsToMove: CardState[] =
    selectedIndices.length > 0
      ? selectedIndices
          .map((i: number) => col.cards[i])
          .filter((c): c is CardState => c !== undefined)
      : [card];

  if (cardsToMove.length === 0) return;

  let newSortOrder =
    targetCol.cards.length > 0
      ? (targetCol.cards[targetCol.cards.length - 1]?.node.parent_idx ?? 0) + 1
      : 0;

  for (const cardToMove of cardsToMove) {
    moveNode(cardToMove.node.id, targetCol.node.id, newSortOrder);
    newSortOrder++;
  }

  const movedCardIds = cardsToMove.map((c) => c.node.id);
  const expectedCardIndex = targetCol.cards.length;

  const newState = refreshBoardState(ctx, {
    colIndex: targetColIndex,
    cardIndex: (col) => Math.min(expectedCardIndex, col?.cards.length || 0),
  });

  if (newState && movedCardIds.length > 0) {
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
    ctx.dispatch(actions.setMultiSelected(newSelected));
  }
}

/** Move card to a specific column by index (for Opt+1-9) */
function moveCardToColumnByIndex(
  ctx: KeyboardContext,
  card: CardState,
  targetColIndex: number,
) {
  const col = ctx.state.columns[ctx.state.colIndex];
  if (!col) return;

  if (targetColIndex < 0 || targetColIndex >= ctx.state.columns.length) return;
  if (targetColIndex === ctx.state.colIndex) return;

  const targetCol = ctx.state.columns[targetColIndex];
  if (!targetCol) return;

  const selectedIndices = getSelectedCardIndices(ctx);
  const cardsToMove: CardState[] =
    selectedIndices.length > 0
      ? selectedIndices
          .map((i: number) => col.cards[i])
          .filter((c): c is CardState => c !== undefined)
      : [card];

  if (cardsToMove.length === 0) return;

  let newSortOrder =
    targetCol.cards.length > 0
      ? (targetCol.cards[0]?.node.parent_idx ?? 0) - cardsToMove.length
      : 0;

  for (const cardToMove of cardsToMove) {
    moveNode(cardToMove.node.id, targetCol.node.id, newSortOrder);
    newSortOrder++;
  }

  const movedCardIds = cardsToMove.map((c) => c.node.id);
  const expectedCardIndex = Math.min(
    ctx.state.cardIndex,
    Math.max(0, col.cards.length - cardsToMove.length - 1),
  );

  const newState = refreshBoardState(ctx, {
    cardIndex: (col) =>
      Math.min(expectedCardIndex, Math.max(0, (col?.cards.length ?? 1) - 1)),
  });

  if (newState && movedCardIds.length > 0) {
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
    ctx.dispatch(actions.setMultiSelected(newSelected));
  }
}

/** Indent node: make it a child of the sibling above it */
function indentNode(ctx: KeyboardContext, card: CardState) {
  const col = ctx.state.columns[ctx.state.colIndex];
  if (!col) return;

  const cardIndex = col.cards.findIndex((c) => c.node.id === card.node.id);
  if (cardIndex <= 0) {
    process.stdout.write("\x07");
    return;
  }

  const siblingAbove = col.cards[cardIndex - 1];
  if (!siblingAbove) return;

  const newSortOrder = Date.now();
  moveNode(card.node.id, siblingAbove.node.id, newSortOrder);
  refreshBoardState(ctx, { cardIndex: Math.max(0, cardIndex - 1) });
}

/** Outdent node: make it a sibling of its parent */
function outdentNode(ctx: KeyboardContext, card: CardState) {
  const parentId = card.node.parent_id;
  if (!parentId) {
    process.stdout.write("\x07");
    return;
  }

  const parent = getNode(parentId);
  const grandparentId = parent?.parent_id;
  if (!parent || !grandparentId) {
    process.stdout.write("\x07");
    return;
  }

  const grandparentChildren = getChildren(grandparentId);
  const parentIndex = grandparentChildren.findIndex((c) => c.id === parentId);

  let newSortOrder: number;
  if (parentIndex === grandparentChildren.length - 1) {
    newSortOrder = parent.parent_idx + 1;
  } else {
    const nextSibling = grandparentChildren[parentIndex + 1];
    newSortOrder =
      (parent.parent_idx + (nextSibling?.parent_idx ?? parent.parent_idx + 2)) /
      2;
  }

  moveNode(card.node.id, grandparentId, newSortOrder);
  refreshBoardState(ctx);
}

/** Progressive select all with Shift+A */
function progressiveSelectAll(ctx: KeyboardContext) {
  const col = ctx.state.columns[ctx.state.colIndex];
  const card = col?.cards[ctx.state.cardIndex];

  const currentLevel = ctx.ui.selectAllLevel;

  if (currentLevel === 0 && ctx.ui.inOutlineMode && card) {
    const newSelected = new Set<SelectionKey>();
    const maxItems =
      1 +
      ctx.countVisibleDescendants(
        card.node,
        0,
        ctx.ui.maxOutlineDepth,
        ctx.ui.foldedNodes,
      );
    for (let s = 0; s < maxItems; s++) {
      newSelected.add(
        makeSelectionKey(ctx.state.colIndex, ctx.state.cardIndex, s),
      );
    }
    ctx.dispatch(actions.setMultiSelected(newSelected));
    ctx.dispatch(actions.setSelectAllLevel(1));
  } else if (currentLevel <= 1 && col) {
    const newSelected = new Set<SelectionKey>();
    for (let cardIdx = 0; cardIdx < col.cards.length; cardIdx++) {
      const c = col.cards[cardIdx];
      if (c) {
        const maxItems =
          1 +
          ctx.countVisibleDescendants(
            c.node,
            0,
            ctx.ui.maxOutlineDepth,
            ctx.ui.foldedNodes,
          );
        for (let s = 0; s < maxItems; s++) {
          newSelected.add(makeSelectionKey(ctx.state.colIndex, cardIdx, s));
        }
      }
    }
    ctx.dispatch(actions.setMultiSelected(newSelected));
    ctx.dispatch(actions.setSelectAllLevel(2));
  } else {
    const newSelected = new Set<SelectionKey>();
    for (let colIdx = 0; colIdx < ctx.state.columns.length; colIdx++) {
      const column = ctx.state.columns[colIdx];
      if (column) {
        for (let cardIdx = 0; cardIdx < column.cards.length; cardIdx++) {
          const c = column.cards[cardIdx];
          if (c) {
            const maxItems =
              1 +
              ctx.countVisibleDescendants(
                c.node,
                0,
                ctx.ui.maxOutlineDepth,
                ctx.ui.foldedNodes,
              );
            for (let s = 0; s < maxItems; s++) {
              newSelected.add(makeSelectionKey(colIdx, cardIdx, s));
            }
          }
        }
      }
    }
    ctx.dispatch(actions.setMultiSelected(newSelected));
    ctx.dispatch(actions.setSelectAllLevel(0));
  }
}

// =============================================================================
// Main Keyboard Handler
// =============================================================================

/**
 * Handle keyboard input for the main board view.
 * Returns true if the input was handled, false otherwise.
 */
export function handleKeyboardInput(
  ctx: KeyboardContext,
  input: string,
  key: KeyEvent,
): boolean {
  const col = ctx.state.columns[ctx.state.colIndex];
  const card = col?.cards[ctx.state.cardIndex];

  // Toggle help with '?'
  if (input === "?") {
    ctx.dispatch(actions.toggleHelp());
    return true;
  }

  // Close help with Escape
  if (ctx.ui.showHelp && key.escape) {
    ctx.dispatch(actions.hideHelp());
    return true;
  }

  // Ignore other keys when help is shown
  if (ctx.ui.showHelp) {
    return true;
  }

  // Cycle view mode with 'v'
  if (input === "v") {
    ctx.dispatch(actions.cycleViewMode());
    return true;
  }

  // Open new item dialog with 'n' key
  if (input === "n") {
    ctx.dispatch(actions.showNewItemDialog());
    ctx.dispatch(actions.exitOutlineMode());
    ctx.dispatch(actions.setSubIndex(0));
    clearSelection(ctx);
    ctx.dispatch(actions.setDetailPane(false));
    return true;
  }

  // Shift+A: progressive select all
  if (input === "A") {
    progressiveSelectAll(ctx);
    return true;
  }

  // Shift+1-9: jump cursor to column
  const shiftColIndex = SHIFT_NUMBER_MAP[input];
  if (
    shiftColIndex !== undefined &&
    !ctx.ui.showDetailPane &&
    !ctx.ui.inOutlineMode &&
    shiftColIndex < ctx.state.columns.length
  ) {
    ctx.setState((s) => ({
      ...s,
      colIndex: shiftColIndex,
      cardIndex: Math.min(
        s.cardIndex,
        Math.max(0, (s.columns[shiftColIndex]?.cards.length ?? 1) - 1),
      ),
    }));
    clearSelection(ctx);
    ctx.dispatch(actions.setSelectAllLevel(0));
    return true;
  }

  // Plain 1-9: jump to favorite boards
  if (
    /^[1-9]$/.test(input) &&
    !ctx.ui.showDetailPane &&
    !ctx.ui.inOutlineMode &&
    !key.meta
  ) {
    const favoriteRef = DEFAULT_FAVORITES[input];
    if (favoriteRef) {
      const resolved = resolveNode(favoriteRef);
      if (resolved) {
        const zoomed = buildBoardState(resolved.id);
        zoomed.zoomStack = [...ctx.state.zoomStack, ctx.state.rootId || ""];
        pushNavHistoryEntry(
          ctx.dispatch,
          ctx.state.rootId,
          ctx.state.colIndex,
          ctx.state.cardIndex,
          ctx.ui.subIndex,
          ctx.ui.multiSelected,
          ctx.ui.inOutlineMode,
        );
        ctx.dispatch(actions.exitOutlineMode());
        ctx.dispatch(actions.setSubIndex(0));
        clearSelection(ctx);
        ctx.dispatch(actions.setDetailPane(false));
        ctx.setState(zoomed);
      } else {
        process.stdout.write("\x07");
      }
    }
    return true;
  }

  // Quit
  if (input === "q") {
    ctx.exit();
    return true;
  }

  // Alt/Opt + key for moving items
  if (key.meta && card) {
    if (key.upArrow) {
      moveCardInColumn(ctx, card, "up");
      return true;
    }
    if (key.downArrow) {
      moveCardInColumn(ctx, card, "down");
      return true;
    }
    if (key.leftArrow) {
      moveCardToColumn(ctx, card, "left");
      return true;
    }
    if (key.rightArrow) {
      moveCardToColumn(ctx, card, "right");
      return true;
    }
    if (input === "k") {
      moveCardInColumn(ctx, card, "up");
      return true;
    }
    if (input === "j") {
      moveCardInColumn(ctx, card, "down");
      return true;
    }
    if (input === "h") {
      moveCardToColumn(ctx, card, "left");
      return true;
    }
    if (input === "l") {
      moveCardToColumn(ctx, card, "right");
      return true;
    }
    if (/^[1-9]$/.test(input) && !ctx.ui.showDetailPane) {
      const targetCol = parseInt(input, 10) - 1;
      if (targetCol < ctx.state.columns.length) {
        moveCardToColumnByIndex(ctx, card, targetCol);
      }
      return true;
    }
  }

  // Escape: close UI elements progressively, then quit
  if (key.escape) {
    if (ctx.ui.showDetailPane) {
      ctx.dispatch(actions.setDetailPane(false));
      return true;
    }
    if (ctx.ui.inOutlineMode) {
      ctx.dispatch(actions.exitOutlineMode());
      ctx.dispatch(actions.setSubIndex(0));
      clearSelection(ctx);
      return true;
    }
    ctx.exit();
    return true;
  }

  // 'u': Go up the physical path
  if (input === "u") {
    if (ctx.ui.showDetailPane) {
      ctx.dispatch(actions.setDetailPane(false));
      return true;
    }
    if (ctx.ui.inOutlineMode) {
      ctx.dispatch(actions.exitOutlineMode());
      ctx.dispatch(actions.setSubIndex(0));
      clearSelection(ctx);
      return true;
    }

    if (ctx.state.rootId) {
      const currentRoot = getNode(ctx.state.rootId);
      if (currentRoot?.parent_id) {
        const parentNode = getNode(currentRoot.parent_id);
        if (parentNode) {
          const zoomed = buildBoardState(parentNode.id);
          pushNavHistoryEntry(
            ctx.dispatch,
            ctx.state.rootId,
            ctx.state.colIndex,
            ctx.state.cardIndex,
            ctx.ui.subIndex,
            ctx.ui.multiSelected,
            ctx.ui.inOutlineMode,
          );
          ctx.setState(zoomed);
          clearSelection(ctx);
          return true;
        }
      } else {
        const rootView = initBoardState();
        if (rootView) {
          pushNavHistoryEntry(
            ctx.dispatch,
            ctx.state.rootId,
            ctx.state.colIndex,
            ctx.state.cardIndex,
            ctx.ui.subIndex,
            ctx.ui.multiSelected,
            ctx.ui.inOutlineMode,
          );
          ctx.setState(rootView);
          clearSelection(ctx);
          return true;
        }
      }
    }
    process.stdout.write("\x07");
    return true;
  }

  // '[': Navigate back in history
  if (input === "[") {
    if (ctx.ui.navHistoryIndex > 0) {
      const prevEntry = ctx.ui.navHistory[ctx.ui.navHistoryIndex - 1];
      if (prevEntry) {
        const newState = prevEntry.rootId
          ? buildBoardState(prevEntry.rootId)
          : initBoardState();
        if (newState) {
          newState.colIndex = prevEntry.colIndex;
          newState.cardIndex = prevEntry.cardIndex;
          ctx.setState(newState);
          ctx.dispatch(actions.setNavHistoryIndex(ctx.ui.navHistoryIndex - 1));
          ctx.dispatch(actions.setSubIndex(prevEntry.subIndex));
          ctx.dispatch(
            actions.setMultiSelected(new Set(prevEntry.multiSelected)),
          );
          ctx.dispatch(actions.setSelectionAnchor(null));
          ctx.dispatch(actions.setSelectAllLevel(0));
          ctx.dispatch(actions.setInOutlineMode(prevEntry.inOutlineMode));
        }
      }
    } else {
      process.stdout.write("\x07");
    }
    return true;
  }

  // ']': Navigate forward in history
  if (input === "]") {
    if (ctx.ui.navHistoryIndex < ctx.ui.navHistory.length - 1) {
      const nextEntry = ctx.ui.navHistory[ctx.ui.navHistoryIndex + 1];
      if (nextEntry) {
        const newState = nextEntry.rootId
          ? buildBoardState(nextEntry.rootId)
          : initBoardState();
        if (newState) {
          newState.colIndex = nextEntry.colIndex;
          newState.cardIndex = nextEntry.cardIndex;
          ctx.setState(newState);
          ctx.dispatch(actions.setNavHistoryIndex(ctx.ui.navHistoryIndex + 1));
          ctx.dispatch(actions.setSubIndex(nextEntry.subIndex));
          ctx.dispatch(
            actions.setMultiSelected(new Set(nextEntry.multiSelected)),
          );
          ctx.dispatch(actions.setSelectionAnchor(null));
          ctx.dispatch(actions.setSelectAllLevel(0));
          ctx.dispatch(actions.setInOutlineMode(nextEntry.inOutlineMode));
        }
      }
    } else {
      process.stdout.write("\x07");
    }
    return true;
  }

  // Tab/Shift-Tab: indent/outdent
  if (key.tab && card) {
    if (key.shift) {
      outdentNode(ctx, card);
    } else {
      indentNode(ctx, card);
    }
    return true;
  }

  // Adjust content lines with +/-
  if (input === "+" || input === "=") {
    ctx.dispatch(actions.increaseContentLines());
    return true;
  }
  if (input === "-" || input === "_") {
    ctx.dispatch(actions.decreaseContentLines());
    return true;
  }

  // Adjust outline depth with < and >
  if (input === ">") {
    ctx.dispatch(actions.increaseOutlineDepth());
    return true;
  }
  if (input === "<") {
    ctx.dispatch(actions.decreaseOutlineDepth());
    return true;
  }

  // Fold all / unfold all
  if (input === "z") {
    if (col) {
      ctx.dispatch(actions.foldAll(col.cards.map((c) => c.node.id)));
    }
    return true;
  }
  if (input === "Z") {
    if (col) {
      ctx.dispatch(actions.unfoldAll(col.cards.map((c) => c.node.id)));
    }
    return true;
  }

  // Toggle column collapse
  if (input === "c") {
    ctx.dispatch(actions.toggleColumnCollapse(ctx.state.colIndex));
    return true;
  }

  // Status cycling with Space key
  if (input === " " && card) {
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

    updateNode(targetId, { task_status: nextStatus, task_mark: nextMark });
    refreshBoardState(ctx);
    return true;
  }

  // Delete with 'D' key
  if (input === "D" && card) {
    const nodeToDelete = card.node.id;
    deleteNode(nodeToDelete);
    refreshBoardState(ctx, {
      cardIndex: (col) =>
        Math.min(
          ctx.state.cardIndex,
          Math.max(0, (col?.cards.length ?? 1) - 1),
        ),
    });
    return true;
  }

  // Shift+J/K for range selection
  if (input === "J" || (key.shift && key.downArrow)) {
    if (ctx.ui.inOutlineMode) {
      if (!ctx.ui.selectionAnchor) {
        ctx.dispatch(
          actions.setSelectionAnchor({
            col: ctx.state.colIndex,
            card: ctx.state.cardIndex,
            sub: ctx.ui.subIndex,
          }),
        );
      }
      const maxSub = getMaxSubIndex(ctx);
      if (ctx.ui.subIndex < maxSub - 1) {
        const newSubIndex = ctx.ui.subIndex + 1;
        ctx.dispatch(actions.setSubIndex(newSubIndex));
        updateSelectionRange(
          ctx,
          ctx.state.colIndex,
          ctx.state.cardIndex,
          newSubIndex,
        );
      } else {
        const currentCol = ctx.state.columns[ctx.state.colIndex];
        if (currentCol && ctx.state.cardIndex < currentCol.cards.length - 1) {
          const newCardIndex = ctx.state.cardIndex + 1;
          ctx.setState((s) => ({ ...s, cardIndex: newCardIndex }));
          ctx.dispatch(actions.setSubIndex(0));
          updateSelectionRange(ctx, ctx.state.colIndex, newCardIndex, 0);
        }
      }
    } else {
      if (!ctx.ui.selectionAnchor) {
        ctx.dispatch(
          actions.setSelectionAnchor({
            col: ctx.state.colIndex,
            card: ctx.state.cardIndex,
            sub: 0,
          }),
        );
        const currentCard = col?.cards[ctx.state.cardIndex];
        if (currentCard) {
          const maxItems =
            1 +
            ctx.countVisibleDescendants(
              currentCard.node,
              0,
              ctx.ui.maxOutlineDepth,
              ctx.ui.foldedNodes,
            );
          const newSelected = new Set<SelectionKey>();
          for (let s = 0; s < maxItems; s++) {
            newSelected.add(
              makeSelectionKey(ctx.state.colIndex, ctx.state.cardIndex, s),
            );
          }
          ctx.dispatch(actions.setMultiSelected(newSelected));
        }
      }
      const currentCol = ctx.state.columns[ctx.state.colIndex];
      if (currentCol && ctx.state.cardIndex < currentCol.cards.length - 1) {
        const newCardIndex = ctx.state.cardIndex + 1;
        ctx.setState((s) => ({ ...s, cardIndex: newCardIndex }));
        updateSelectionRange(ctx, ctx.state.colIndex, newCardIndex, 0);
      }
    }
    return true;
  }

  if (input === "K" || (key.shift && key.upArrow)) {
    if (ctx.ui.inOutlineMode) {
      if (!ctx.ui.selectionAnchor) {
        ctx.dispatch(
          actions.setSelectionAnchor({
            col: ctx.state.colIndex,
            card: ctx.state.cardIndex,
            sub: ctx.ui.subIndex,
          }),
        );
      }
      if (ctx.ui.subIndex > 0) {
        const newSubIndex = ctx.ui.subIndex - 1;
        ctx.dispatch(actions.setSubIndex(newSubIndex));
        updateSelectionRange(
          ctx,
          ctx.state.colIndex,
          ctx.state.cardIndex,
          newSubIndex,
        );
      } else {
        if (ctx.state.cardIndex > 0) {
          const newCardIndex = ctx.state.cardIndex - 1;
          const prevCard =
            ctx.state.columns[ctx.state.colIndex]?.cards[newCardIndex];
          if (prevCard) {
            const maxSub =
              1 +
              ctx.countVisibleDescendants(
                prevCard.node,
                0,
                ctx.ui.maxOutlineDepth,
                ctx.ui.foldedNodes,
              );
            ctx.setState((s) => ({ ...s, cardIndex: newCardIndex }));
            ctx.dispatch(actions.setSubIndex(maxSub - 1));
            updateSelectionRange(
              ctx,
              ctx.state.colIndex,
              newCardIndex,
              maxSub - 1,
            );
          }
        }
      }
    } else {
      if (!ctx.ui.selectionAnchor) {
        ctx.dispatch(
          actions.setSelectionAnchor({
            col: ctx.state.colIndex,
            card: ctx.state.cardIndex,
            sub: 0,
          }),
        );
        const currentCard = col?.cards[ctx.state.cardIndex];
        if (currentCard) {
          const maxItems =
            1 +
            ctx.countVisibleDescendants(
              currentCard.node,
              0,
              ctx.ui.maxOutlineDepth,
              ctx.ui.foldedNodes,
            );
          const newSelected = new Set<SelectionKey>();
          for (let s = 0; s < maxItems; s++) {
            newSelected.add(
              makeSelectionKey(ctx.state.colIndex, ctx.state.cardIndex, s),
            );
          }
          ctx.dispatch(actions.setMultiSelected(newSelected));
        }
      }
      if (ctx.state.cardIndex > 0) {
        const newCardIndex = ctx.state.cardIndex - 1;
        ctx.setState((s) => ({ ...s, cardIndex: newCardIndex }));
        updateSelectionRange(ctx, ctx.state.colIndex, newCardIndex, 0);
      }
    }
    return true;
  }

  // Shift+H/L for horizontal range selection
  if (input === "H" || (key.shift && key.leftArrow)) {
    if (ctx.state.colIndex > 0) {
      if (!ctx.ui.selectionAnchor) {
        ctx.dispatch(
          actions.setSelectionAnchor({
            col: ctx.state.colIndex,
            card: ctx.state.cardIndex,
            sub: 0,
          }),
        );
      }
      const newColIndex = ctx.state.colIndex - 1;
      ctx.setState((s) => ({
        ...s,
        colIndex: newColIndex,
        cardIndex: Math.min(
          s.cardIndex,
          Math.max(0, (s.columns[newColIndex]?.cards.length || 1) - 1),
        ),
      }));
    }
    return true;
  }

  if (input === "L" || (key.shift && key.rightArrow)) {
    if (ctx.state.colIndex < ctx.state.columns.length - 1) {
      if (!ctx.ui.selectionAnchor) {
        ctx.dispatch(
          actions.setSelectionAnchor({
            col: ctx.state.colIndex,
            card: ctx.state.cardIndex,
            sub: 0,
          }),
        );
      }
      const newColIndex = ctx.state.colIndex + 1;
      ctx.setState((s) => ({
        ...s,
        colIndex: newColIndex,
        cardIndex: Math.min(
          s.cardIndex,
          Math.max(0, (s.columns[newColIndex]?.cards.length || 1) - 1),
        ),
      }));
    }
    return true;
  }

  // Vertical navigation
  if (input === "j" || key.downArrow) {
    clearSelection(ctx);
    if (ctx.ui.selectionLevel === "board") {
      ctx.dispatch(actions.setSelectionLevel("column"));
      ctx.setState((s) => ({ ...s, colIndex: 0 }));
      return true;
    }
    if (ctx.ui.selectionLevel === "column") {
      ctx.dispatch(actions.setSelectionLevel("card"));
      ctx.setState((s) => ({ ...s, cardIndex: 0 }));
      return true;
    }
    if (ctx.ui.inOutlineMode) {
      const maxSub = getMaxSubIndex(ctx);
      if (ctx.ui.subIndex < maxSub - 1) {
        ctx.dispatch(actions.setSubIndex(ctx.ui.subIndex + 1));
      } else {
        const currentCol = ctx.state.columns[ctx.state.colIndex];
        const nextCardIndex = Math.min(
          (currentCol?.cards.length || 1) - 1,
          ctx.state.cardIndex + 1,
        );
        if (nextCardIndex !== ctx.state.cardIndex) {
          ctx.setState((s) => ({ ...s, cardIndex: nextCardIndex }));
          ctx.dispatch(actions.setSubIndex(0));
        }
      }
    } else {
      const currentCol = ctx.state.columns[ctx.state.colIndex];
      const nextCardIndex = Math.min(
        (currentCol?.cards.length || 1) - 1,
        ctx.state.cardIndex + 1,
      );
      ctx.setState((s) => ({ ...s, cardIndex: nextCardIndex }));
    }
    return true;
  }

  if (input === "k" || key.upArrow) {
    clearSelection(ctx);
    if (ctx.ui.selectionLevel === "card") {
      if (ctx.ui.inOutlineMode) {
        if (ctx.ui.subIndex > 0) {
          ctx.dispatch(actions.setSubIndex(ctx.ui.subIndex - 1));
          return true;
        } else if (ctx.state.cardIndex > 0) {
          const prevCardIndex = ctx.state.cardIndex - 1;
          ctx.setState((s) => ({ ...s, cardIndex: prevCardIndex }));
          const prevCard =
            ctx.state.columns[ctx.state.colIndex]?.cards[prevCardIndex];
          if (prevCard) {
            const maxSub =
              1 +
              ctx.countVisibleDescendants(
                prevCard.node,
                0,
                ctx.ui.maxOutlineDepth,
                ctx.ui.foldedNodes,
              );
            ctx.dispatch(actions.setSubIndex(maxSub - 1));
          }
          return true;
        } else {
          ctx.dispatch(actions.setSelectionLevel("column"));
          ctx.dispatch(actions.setSubIndex(0));
          return true;
        }
      } else {
        if (ctx.state.cardIndex > 0) {
          ctx.setState((s) => ({ ...s, cardIndex: s.cardIndex - 1 }));
        } else {
          ctx.dispatch(actions.setSelectionLevel("column"));
        }
        return true;
      }
    }
    if (ctx.ui.selectionLevel === "column") {
      ctx.dispatch(actions.setSelectionLevel("board"));
      return true;
    }
    return true;
  }

  // Horizontal navigation and other keys handled via setState
  let handled = false;
  ctx.setState((s) => {
    const newState = { ...s };

    const findSamePositionCard = (
      targetColIndex: number,
      currentCardIndex: number,
    ): number => {
      const targetCol = s.columns[targetColIndex];
      if (!targetCol || targetCol.cards.length === 0) return 0;
      return Math.min(currentCardIndex, targetCol.cards.length - 1);
    };

    if (input === "h" || key.leftArrow) {
      if (ctx.ui.selectionLevel === "board") {
        return s;
      }
      handled = true;
      const newColIndex = Math.max(0, s.colIndex - 1);
      newState.colIndex = newColIndex;
      if (ctx.ui.selectionLevel === "card") {
        const targetCol = s.columns[newColIndex];
        if (!targetCol || targetCol.cards.length === 0) {
          ctx.dispatch(actions.setSelectionLevel("column"));
        } else {
          newState.cardIndex = findSamePositionCard(newColIndex, s.cardIndex);
        }
      }
      ctx.dispatch(actions.exitOutlineMode());
      ctx.dispatch(actions.setSubIndex(0));
      clearSelection(ctx);
    } else if (input === "l" || key.rightArrow) {
      if (ctx.ui.selectionLevel === "board") {
        return s;
      }
      handled = true;
      const newColIndex = Math.min(s.columns.length - 1, s.colIndex + 1);
      newState.colIndex = newColIndex;
      if (ctx.ui.selectionLevel === "card") {
        const targetCol = s.columns[newColIndex];
        if (!targetCol || targetCol.cards.length === 0) {
          ctx.dispatch(actions.setSelectionLevel("column"));
        } else {
          newState.cardIndex = findSamePositionCard(newColIndex, s.cardIndex);
        }
      }
      ctx.dispatch(actions.exitOutlineMode());
      ctx.dispatch(actions.setSubIndex(0));
      clearSelection(ctx);
    } else if (input === "g") {
      handled = true;
      newState.cardIndex = 0;
      ctx.dispatch(actions.exitOutlineMode());
      ctx.dispatch(actions.setSubIndex(0));
      clearSelection(ctx);
    } else if (input === "G") {
      handled = true;
      const currentCol = s.columns[s.colIndex];
      newState.cardIndex = Math.max(0, (currentCol?.cards.length || 1) - 1);
      ctx.dispatch(actions.exitOutlineMode());
      ctx.dispatch(actions.setSubIndex(0));
      clearSelection(ctx);
    }

    // Enter opens detail pane
    if (key.return && card) {
      handled = true;
      ctx.dispatch(actions.setDetailPane(true));
      ctx.dispatch(actions.exitOutlineMode());
      ctx.dispatch(actions.setSubIndex(0));
      clearSelection(ctx);
      return s;
    }

    // Zoom in with 'o'
    if (input === "o" && card) {
      handled = true;
      const targetId = card.node.link_to || card.node.id;
      const targetNode = getNode(targetId);
      if (!targetNode) return s;

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

      pushNavHistoryEntry(
        ctx.dispatch,
        s.rootId,
        s.colIndex,
        s.cardIndex,
        ctx.ui.subIndex,
        ctx.ui.multiSelected,
        ctx.ui.inOutlineMode,
      );

      ctx.dispatch(actions.exitOutlineMode());
      ctx.dispatch(actions.setSubIndex(0));
      clearSelection(ctx);
      ctx.dispatch(actions.setDetailPane(false));
      return zoomed;
    }

    // Open project picker with 'p' key
    if (input === "p" && card) {
      handled = true;
      ctx.dispatch(actions.showProjectPicker());
      ctx.dispatch(actions.exitOutlineMode());
      ctx.dispatch(actions.setSubIndex(0));
      clearSelection(ctx);
      ctx.dispatch(actions.setDetailPane(false));
      return s;
    }

    return newState;
  });

  return handled;
}

// =============================================================================
// Detail Pane Keyboard Handler
// =============================================================================

/**
 * Handle keyboard input when detail pane is active.
 * Returns true if the input was handled.
 */
export function handleDetailPaneInput(
  ctx: KeyboardContext,
  input: string,
  key: KeyEvent,
): boolean {
  if (!ctx.ui.showDetailPane) return false;

  const col = ctx.state.columns[ctx.state.colIndex];

  // Close detail pane with 'h' key
  if (input === "h") {
    ctx.dispatch(actions.setDetailPane(false));
    return true;
  }

  // Navigate cards while detail pane is open
  if (input === "j" || key.downArrow) {
    if (col && ctx.state.cardIndex < col.cards.length - 1) {
      ctx.setState((s) => ({ ...s, cardIndex: s.cardIndex + 1 }));
    }
    return true;
  }
  if (input === "k" || key.upArrow) {
    if (ctx.state.cardIndex > 0) {
      ctx.setState((s) => ({ ...s, cardIndex: s.cardIndex - 1 }));
    }
    return true;
  }

  // Quit from detail pane
  if (input === "q") {
    ctx.exit();
    return true;
  }

  // Status cycling in detail pane with Space key
  if (input === " ") {
    const card =
      ctx.state.columns[ctx.state.colIndex]?.cards[ctx.state.cardIndex];
    if (card) {
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

      updateNode(targetId, {
        task_status: nextStatus,
        task_mark: nextMark,
      });

      refreshBoardState(ctx);
    }
    return true;
  }

  // Priority setting in detail pane (1-5)
  if (["1", "2", "3", "4", "5"].includes(input)) {
    const card =
      ctx.state.columns[ctx.state.colIndex]?.cards[ctx.state.cardIndex];
    if (card) {
      const targetId = card.node.link_to || card.node.id;
      updateNode(targetId, { priority: parseInt(input, 10) });
      refreshBoardState(ctx);
    }
    return true;
  }

  return false;
}
