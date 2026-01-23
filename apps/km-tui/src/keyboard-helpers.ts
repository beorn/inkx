/**
 * Keyboard Handler Helpers
 *
 * Utility functions for keyboard handling.
 */

import type { CardState, SelectionKey } from "./types.ts";
import { makeSelectionKey } from "./types.ts";
import { actions } from "./ui-reducer.ts";
import { buildTreeNodes } from "./board-adapter.ts";
import type { KeyboardContext } from "./keyboard-types.ts";

// =============================================================================
// Navigation History
// =============================================================================

/** Push a new entry to navigation history */
export function pushNavHistoryEntry(
  dispatch: KeyboardContext["dispatch"],
  rootId: string | null,
  colIndex: number,
  cardIndex: number,
  subIndex: number,
  multiSelected: Set<SelectionKey>,
  inOutlineMode: boolean,
): void {
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

// =============================================================================
// Selection Helpers
// =============================================================================

/** Calculate max sub-items in current card */
export function getMaxSubIndex(ctx: KeyboardContext): number {
  const col = ctx.layout.columns[ctx.layout.colIndex];
  const card = col?.cards[ctx.layout.cardIndex];
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
export function updateSelectionRange(
  ctx: KeyboardContext,
  toCol: number,
  toCard: number,
  toSub: number,
): void {
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
      const card = ctx.layout.columns[toCol]?.cards[c];
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
export function clearSelection(ctx: KeyboardContext): void {
  ctx.dispatch(actions.setMultiSelected(new Set()));
  ctx.dispatch(actions.setSelectionAnchor(null));
  ctx.dispatch(actions.setSelectAllLevel(0));
}

/** Get unique selected card indices from multi-selection */
export function getSelectedCardIndices(ctx: KeyboardContext): number[] {
  if (ctx.ui.multiSelected.size === 0) return [];
  const indices = new Set<number>();
  for (const key of ctx.ui.multiSelected) {
    const [colStr, cardStr] = key.split(":");
    const col = parseInt(colStr ?? "0", 10);
    const card = parseInt(cardStr ?? "0", 10);
    if (col === ctx.layout.colIndex) {
      indices.add(card);
    }
  }
  return Array.from(indices).sort((a, b) => a - b);
}

// =============================================================================
// State Refresh
// =============================================================================

/** Rebuild board state after a mutation, preserving navigation context */
export function refreshBoardState(
  ctx: KeyboardContext,
  options?: {
    colIndex?: number;
    cardIndex?: number | ((col: { cards: CardState[] } | undefined) => number);
  },
): void {
  if (!ctx.boardState.rootId) return;

  // Build tree nodes directly and dispatch to boardReducer
  const nodes = buildTreeNodes(ctx.boardState.rootId);

  // Calculate new cursor position
  const colIndex = options?.colIndex ?? ctx.layout.colIndex;
  const colNode = nodes[colIndex];
  let cardIndex: number;

  if (typeof options?.cardIndex === "function") {
    // Function receives a simplified column shape for compatibility
    const colShape = colNode
      ? { cards: colNode.children.map((c) => ({ node: c, children: [] })) }
      : undefined;
    cardIndex = options.cardIndex(colShape);
  } else {
    cardIndex = options?.cardIndex ?? ctx.layout.cardIndex;
  }

  // Clamp card index to valid range
  const maxCardIndex = Math.max(0, (colNode?.children.length ?? 1) - 1);
  cardIndex = Math.min(cardIndex, maxCardIndex);

  // Dispatch refresh with updated cursor
  ctx.dispatchBoard({ type: "REFRESH", nodes });

  // If cursor changed, also dispatch navigation
  if (colIndex !== ctx.layout.colIndex || cardIndex !== ctx.layout.cardIndex) {
    ctx.dispatchBoard({
      type: "NAV_TO_PATH",
      path: cardIndex >= 0 ? [colIndex, cardIndex] : [colIndex],
    });
  }
}

// =============================================================================
// Progressive Selection
// =============================================================================

/** Progressive select all with Shift+A */
export function progressiveSelectAll(ctx: KeyboardContext): void {
  const col = ctx.layout.columns[ctx.layout.colIndex];
  const card = col?.cards[ctx.layout.cardIndex];

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
        makeSelectionKey(ctx.layout.colIndex, ctx.layout.cardIndex, s),
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
          newSelected.add(makeSelectionKey(ctx.layout.colIndex, cardIdx, s));
        }
      }
    }
    ctx.dispatch(actions.setMultiSelected(newSelected));
    ctx.dispatch(actions.setSelectAllLevel(2));
  } else {
    const newSelected = new Set<SelectionKey>();
    for (let colIdx = 0; colIdx < ctx.layout.columns.length; colIdx++) {
      const column = ctx.layout.columns[colIdx];
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
