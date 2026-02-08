/**
 * Card Operations for Keyboard Handler
 *
 * Functions for moving, indenting, and outdenting cards.
 */

import type { CardState, SelectionKey } from "../types.ts"
import { makeSelectionKey } from "../types.ts"
import type { ActionCtx } from "../tui-context.ts"
import {
  getSelectedCardIndices,
  refreshBoardState,
} from "./keyboard-helpers.ts"

// =============================================================================
// Card Movement - Helpers
// =============================================================================

/** Effective sort order for a card at a given index within a column */
function getEffectiveSortOrder(
  col: { cards: CardState[] },
  cardIndex: number,
): number {
  const c = col.cards[cardIndex]
  return c
    ? c.node.parent_idx === 0
      ? cardIndex
      : c.node.parent_idx
    : cardIndex
}

/**
 * Calculate the sort order for inserting a card at the given target index.
 * Places the value between the two neighbors, or beyond the boundary card.
 */
function calculateSortOrder(
  col: { cards: CardState[] },
  targetIndex: number,
  direction: "up" | "down",
): number {
  if (direction === "up") {
    if (targetIndex === 0) {
      return getEffectiveSortOrder(col, 0) - 1
    }
    const prevOrder = getEffectiveSortOrder(col, targetIndex - 1)
    const targetOrder = getEffectiveSortOrder(col, targetIndex)
    return (prevOrder + targetOrder) / 2
  }
  // direction === "down"
  if (targetIndex >= col.cards.length - 1) {
    return getEffectiveSortOrder(col, col.cards.length - 1) + 1
  }
  const targetOrder = getEffectiveSortOrder(col, targetIndex)
  const nextOrder = getEffectiveSortOrder(col, targetIndex + 1)
  return (targetOrder + nextOrder) / 2
}

/**
 * Rebuild multi-selection set by matching moved card IDs against
 * the current column's children after a board state refresh.
 */
function rebuildSelectionForMovedCards(
  ctx: ActionCtx,
  colIndex: number,
  movedCardIds: string[],
): void {
  const newSelected = new Set<SelectionKey>()
  const NON_COLUMN_TYPES = new Set(["paragraph", "code", "quote"])
  const allChildren = ctx.repo.getChildren(ctx.rootId)
  const columns = allChildren.filter((n) => !NON_COLUMN_TYPES.has(n.type))
  const newCol = columns[colIndex]
  if (newCol) {
    const cards = ctx.repo.getChildren(newCol.id)
    for (let cardIdx = 0; cardIdx < cards.length; cardIdx++) {
      const c = cards[cardIdx]
      if (c && movedCardIds.includes(c.id)) {
        newSelected.add(makeSelectionKey(colIndex, cardIdx, 0))
      }
    }
  }
  ctx.setUI({ multiSelected: newSelected })
}

// =============================================================================
// Card Movement
// =============================================================================

/** Move card within column (up/down) */
export function moveCardInColumn(
  ctx: ActionCtx,
  card: CardState,
  direction: "up" | "down",
): void {
  const col = ctx.layout.columns[ctx.layout.colIndex]
  if (!col) return

  const selectedIndices = getSelectedCardIndices(ctx)
  const cardsToMove =
    selectedIndices.length > 0
      ? selectedIndices.map((i: number) => ({ index: i, card: col.cards[i] }))
      : [{ index: ctx.layout.cardIndex, card }]

  const validCards = cardsToMove.filter(
    (c): c is { index: number; card: CardState } => c.card !== undefined,
  )
  if (validCards.length === 0) return

  const sortedCards =
    direction === "up"
      ? validCards.sort(
          (a: { index: number }, b: { index: number }) => a.index - b.index,
        )
      : validCards.sort(
          (a: { index: number }, b: { index: number }) => b.index - a.index,
        )

  const firstToMove = sortedCards[0]
  if (!firstToMove) return
  const targetIndex =
    direction === "up" ? firstToMove.index - 1 : firstToMove.index + 1
  if (targetIndex < 0 || targetIndex >= col.cards.length) return

  for (const { index: currentIndex, card: cardToMove } of sortedCards) {
    const cardTargetIndex =
      direction === "up" ? currentIndex - 1 : currentIndex + 1
    if (cardTargetIndex < 0 || cardTargetIndex >= col.cards.length) continue

    const newSortOrder = calculateSortOrder(col, cardTargetIndex, direction)
    ctx.repo.moveNode(cardToMove.node.id, col.node.id, newSortOrder)
  }

  const movedCardIds = validCards.map((c) => c.card.node.id)
  const newCardIndex =
    direction === "up" ? ctx.layout.cardIndex - 1 : ctx.layout.cardIndex + 1

  refreshBoardState(ctx, { cardIndex: newCardIndex })

  if (movedCardIds.length > 1) {
    rebuildSelectionForMovedCards(ctx, ctx.layout.colIndex, movedCardIds)
  }
}

/** Move card to different column (left/right) */
export function moveCardToColumn(
  ctx: ActionCtx,
  card: CardState,
  direction: "left" | "right",
): void {
  const col = ctx.layout.columns[ctx.layout.colIndex]
  if (!col) return

  const targetColIndex =
    direction === "left" ? ctx.layout.colIndex - 1 : ctx.layout.colIndex + 1
  if (targetColIndex < 0 || targetColIndex >= ctx.layout.columns.length) return

  const targetCol = ctx.layout.columns[targetColIndex]
  if (!targetCol) return

  const selectedIndices = getSelectedCardIndices(ctx)
  const cardsToMove: CardState[] =
    selectedIndices.length > 0
      ? selectedIndices
          .map((i: number) => col.cards[i])
          .filter((c): c is CardState => c !== undefined)
      : [card]

  if (cardsToMove.length === 0) return

  let newSortOrder =
    targetCol.cards.length > 0
      ? (targetCol.cards[targetCol.cards.length - 1]?.node.parent_idx ?? 0) + 1
      : 0

  for (const cardToMove of cardsToMove) {
    ctx.repo.moveNode(cardToMove.node.id, targetCol.node.id, newSortOrder)
    newSortOrder++
  }

  const movedCardIds = cardsToMove.map((c) => c.node.id)
  const expectedCardIndex = targetCol.cards.length

  refreshBoardState(ctx, {
    colIndex: targetColIndex,
    cardIndex: (col) => Math.min(expectedCardIndex, col?.cards.length || 0),
  })

  rebuildSelectionForMovedCards(ctx, targetColIndex, movedCardIds)
}

// =============================================================================
// Indent/Outdent
// =============================================================================

/** Outdent node: make it a sibling of its parent */
export function outdentNode(ctx: ActionCtx, card: CardState): void {
  const parentId = card.node.parent_id
  if (!parentId) {
    process.stdout.write("\x07")
    return
  }

  const parent = ctx.repo.getNode(parentId)
  const grandparentId = parent?.parent_id
  if (!parent || !grandparentId) {
    process.stdout.write("\x07")
    return
  }

  const grandparentChildren = ctx.repo.getChildren(grandparentId)
  const parentIndex = grandparentChildren.findIndex((c) => c.id === parentId)

  let newSortOrder: number
  if (parentIndex === grandparentChildren.length - 1) {
    newSortOrder = parent.parent_idx + 1
  } else {
    const nextSibling = grandparentChildren[parentIndex + 1]
    newSortOrder =
      (parent.parent_idx + (nextSibling?.parent_idx ?? parent.parent_idx + 2)) /
      2
  }

  ctx.repo.moveNode(card.node.id, grandparentId, newSortOrder)
  refreshBoardState(ctx)
}
