/**
 * Card Operations for Keyboard Handler
 *
 * Functions for moving, indenting, and outdenting cards.
 */

import type { CardState, ColumnState, SelectionKey } from "../types.ts"
import { makeSelectionKey } from "../types.ts"
import { actions } from "../ui-reducer.ts"
import type { TUIContext } from "../tui-context.ts"
import {
  getSelectedCardIndices,
  refreshBoardState,
} from "./keyboard-helpers.ts"

// =============================================================================
// Card Movement Helpers
// =============================================================================

const NON_COLUMN_TYPES = new Set(["paragraph", "code", "quote"])

type IndexedCard = { index: number; card: CardState }

/** Get cards to move - either selected cards or single card */
function getCardsToMove(
  ctx: TUIContext,
  col: ColumnState,
  card: CardState,
): IndexedCard[] {
  const selectedIndices = getSelectedCardIndices(ctx)
  if (selectedIndices.length === 0) {
    return [{ index: ctx.layout.cardIndex, card }]
  }
  return selectedIndices
    .map((i: number) => ({ index: i, card: col.cards[i] }))
    .filter((c): c is IndexedCard => c.card !== undefined)
}

/** Update multi-selection after cards move to new positions */
function updateSelectionAfterMove(
  ctx: TUIContext,
  movedCardIds: string[],
  colIndex: number,
): void {
  if (movedCardIds.length <= 1) return

  const allChildren = ctx.repo.getChildren(ctx.boardState.rootId)
  const columns = allChildren.filter((n) => !NON_COLUMN_TYPES.has(n.type))
  const newCol = columns[colIndex]
  if (!newCol) return

  const newSelected = new Set<SelectionKey>()
  const cards = ctx.repo.getChildren(newCol.id)
  for (let cardIdx = 0; cardIdx < cards.length; cardIdx++) {
    const c = cards[cardIdx]
    if (c && movedCardIds.includes(c.id)) {
      newSelected.add(makeSelectionKey(colIndex, cardIdx, 0))
    }
  }
  ctx.dispatch(actions.setMultiSelected(newSelected))
}

/** Calculate sort order for inserting before a position */
function getSortOrderBefore(
  col: ColumnState,
  targetIndex: number,
  getEffectiveSortOrder: (i: number) => number,
): number {
  if (targetIndex === 0) {
    return getEffectiveSortOrder(0) - 1
  }
  const prevOrder = getEffectiveSortOrder(targetIndex - 1)
  const targetOrder = getEffectiveSortOrder(targetIndex)
  return (prevOrder + targetOrder) / 2
}

/** Calculate sort order for inserting after a position */
function getSortOrderAfter(
  col: ColumnState,
  targetIndex: number,
  getEffectiveSortOrder: (i: number) => number,
): number {
  if (targetIndex >= col.cards.length - 1) {
    return getEffectiveSortOrder(col.cards.length - 1) + 1
  }
  const targetOrder = getEffectiveSortOrder(targetIndex)
  const nextOrder = getEffectiveSortOrder(targetIndex + 1)
  return (targetOrder + nextOrder) / 2
}

// =============================================================================
// Card Movement
// =============================================================================

/** Move card within column (up/down) */
export function moveCardInColumn(
  ctx: TUIContext,
  card: CardState,
  direction: "up" | "down",
): void {
  const col = ctx.layout.columns[ctx.layout.colIndex]
  if (!col) return

  const validCards = getCardsToMove(ctx, col, card)
  if (validCards.length === 0) return

  // Sort cards by index - process in direction order to avoid collisions
  const sortedCards = validCards.toSorted((a, b) =>
    direction === "up" ? a.index - b.index : b.index - a.index,
  )

  // Check if move is possible
  const firstToMove = sortedCards[0]
  if (!firstToMove) return
  const boundaryIndex =
    direction === "up" ? firstToMove.index - 1 : firstToMove.index + 1
  if (boundaryIndex < 0 || boundaryIndex >= col.cards.length) return

  // Helper to get effective sort order (use parent_idx or fallback to index)
  const getEffectiveSortOrder = (cardIndex: number): number => {
    const c = col.cards[cardIndex]
    if (!c) return cardIndex
    return c.node.parent_idx === 0 ? cardIndex : c.node.parent_idx
  }

  // Move each card
  for (const { index: currentIndex, card: cardToMove } of sortedCards) {
    const cardTargetIndex =
      direction === "up" ? currentIndex - 1 : currentIndex + 1
    if (cardTargetIndex < 0 || cardTargetIndex >= col.cards.length) continue

    const newSortOrder =
      direction === "up"
        ? getSortOrderBefore(col, cardTargetIndex, getEffectiveSortOrder)
        : getSortOrderAfter(col, cardTargetIndex, getEffectiveSortOrder)

    ctx.repo.moveNode(cardToMove.node.id, col.node.id, newSortOrder)
  }

  // Update UI state
  const newCardIndex =
    direction === "up" ? ctx.layout.cardIndex - 1 : ctx.layout.cardIndex + 1
  refreshBoardState(ctx, { cardIndex: newCardIndex })

  const movedCardIds = validCards.map((c) => c.card.node.id)
  updateSelectionAfterMove(ctx, movedCardIds, ctx.layout.colIndex)
}

/** Move card to different column (left/right) */
export function moveCardToColumn(
  ctx: TUIContext,
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

  const cardsToMove = getCardsToMove(ctx, col, card).map((c) => c.card)
  if (cardsToMove.length === 0) return

  // Move cards to end of target column
  let newSortOrder =
    targetCol.cards.length > 0
      ? (targetCol.cards[targetCol.cards.length - 1]?.node.parent_idx ?? 0) + 1
      : 0

  for (const cardToMove of cardsToMove) {
    ctx.repo.moveNode(cardToMove.node.id, targetCol.node.id, newSortOrder)
    newSortOrder++
  }

  // Update UI state
  const expectedCardIndex = targetCol.cards.length
  refreshBoardState(ctx, {
    colIndex: targetColIndex,
    cardIndex: (col) => Math.min(expectedCardIndex, col?.cards.length || 0),
  })

  const movedCardIds = cardsToMove.map((c) => c.node.id)
  updateSelectionAfterMove(ctx, movedCardIds, targetColIndex)
}

// =============================================================================
// Indent/Outdent
// =============================================================================

/** Outdent node: make it a sibling of its parent */
export function outdentNode(ctx: TUIContext, card: CardState): void {
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
