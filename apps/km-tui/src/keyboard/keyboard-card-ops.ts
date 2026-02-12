/**
 * Card Operations for Keyboard Handler
 *
 * Functions for moving, indenting, and outdenting cards.
 */

import type { CardState, SelectionKey } from "../types.ts"
import { makeSelectionKey } from "../types.ts"
import type { ActionCtx } from "../tui-context.ts"
import { clearSelection, getSelectedCardIndices, refreshBoardState } from "./keyboard-helpers.ts"
import { indexOfChild } from "../sibling-index.ts"

// =============================================================================
// Card Movement - Helpers
// =============================================================================

/**
 * Ensure all cards in a column have distinct parent_idx values.
 * When siblings share the same parent_idx (e.g., all default to 0),
 * fractional insertion between equal values produces wrong sort order.
 * Assigns sequential integers [0, 1, 2, ...] when duplicates exist.
 */
function normalizeSortOrders(ctx: ActionCtx, col: { cards: CardState[]; node: { id: string } }): void {
  const seen = new Set<number>()
  let hasDuplicates = false
  for (const card of col.cards) {
    if (seen.has(card.node.parent_idx)) {
      hasDuplicates = true
      break
    }
    seen.add(card.node.parent_idx)
  }
  if (!hasDuplicates) return

  for (let i = 0; i < col.cards.length; i++) {
    const card = col.cards[i]
    if (card && card.node.parent_idx !== i) {
      ctx.repo.moveNode(card.node.id, col.node.id, i)
      card.node.parent_idx = i
    }
  }
}

/**
 * Calculate the sort order for inserting a card at the given target index.
 * Places the value between the two neighbors, or beyond the boundary card.
 * Requires normalizeSortOrders to have been called first.
 */
function calculateSortOrder(col: { cards: CardState[] }, targetIndex: number, direction: "up" | "down"): number {
  const order = (i: number) => col.cards[i]?.node.parent_idx ?? i

  if (direction === "up") {
    if (targetIndex === 0) {
      return order(0) - 1
    }
    return (order(targetIndex - 1) + order(targetIndex)) / 2
  }
  // direction === "down"
  if (targetIndex >= col.cards.length - 1) {
    return order(col.cards.length - 1) + 1
  }
  return (order(targetIndex) + order(targetIndex + 1)) / 2
}

/**
 * Rebuild multi-selection set by matching moved card IDs against
 * the current column's children after a board state refresh.
 */
function rebuildSelectionForMovedCards(ctx: ActionCtx, colIndex: number, movedCardIds: string[]): void {
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
        newSelected.add(makeSelectionKey(c.id, 0))
      }
    }
  }
  ctx.setUI({ multiSelected: newSelected })
}

// =============================================================================
// Card Movement
// =============================================================================

/** Move card within column (up/down) */
export function moveCardInColumn(ctx: ActionCtx, card: CardState, direction: "up" | "down"): void {
  const col = ctx.layout.columns[ctx.layout.colIndex]
  if (!col) return

  // Fix duplicate parent_idx before calculating new sort order
  normalizeSortOrders(ctx, col)

  const selectedIndices = getSelectedCardIndices(ctx)
  const cardsToMove =
    selectedIndices.length > 0
      ? selectedIndices.map((i: number) => ({ index: i, card: col.cards[i] }))
      : [{ index: ctx.layout.cardIndex, card }]

  const validCards = cardsToMove.filter((c): c is { index: number; card: CardState } => c.card !== undefined)
  if (validCards.length === 0) return

  const sortedCards =
    direction === "up"
      ? validCards.sort((a: { index: number }, b: { index: number }) => a.index - b.index)
      : validCards.sort((a: { index: number }, b: { index: number }) => b.index - a.index)

  const firstToMove = sortedCards[0]
  if (!firstToMove) return
  const targetIndex = direction === "up" ? firstToMove.index - 1 : firstToMove.index + 1
  if (targetIndex < 0 || targetIndex >= col.cards.length) return

  for (const { index: currentIndex, card: cardToMove } of sortedCards) {
    const cardTargetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1
    if (cardTargetIndex < 0 || cardTargetIndex >= col.cards.length) continue

    const newSortOrder = calculateSortOrder(col, cardTargetIndex, direction)
    ctx.repo.moveNode(cardToMove.node.id, col.node.id, newSortOrder)
  }

  const movedCardIds = validCards.map((c) => c.card.node.id)
  const newCardIndex = direction === "up" ? ctx.layout.cardIndex - 1 : ctx.layout.cardIndex + 1

  refreshBoardState(ctx, { cardIndex: newCardIndex })

  if (movedCardIds.length > 1) {
    rebuildSelectionForMovedCards(ctx, ctx.layout.colIndex, movedCardIds)
  }
}

/** Move card to different column (left/right) */
export function moveCardToColumn(ctx: ActionCtx, card: CardState, direction: "left" | "right"): void {
  const col = ctx.layout.columns[ctx.layout.colIndex]
  if (!col) return

  const targetColIndex = direction === "left" ? ctx.layout.colIndex - 1 : ctx.layout.colIndex + 1
  if (targetColIndex < 0 || targetColIndex >= ctx.layout.columns.length) return

  const targetCol = ctx.layout.columns[targetColIndex]
  if (!targetCol) return

  const selectedIndices = getSelectedCardIndices(ctx)
  const cardsToMove: CardState[] =
    selectedIndices.length > 0
      ? selectedIndices.map((i: number) => col.cards[i]).filter((c): c is CardState => c !== undefined)
      : [card]

  if (cardsToMove.length === 0) return

  let newSortOrder =
    targetCol.cards.length > 0 ? (targetCol.cards[targetCol.cards.length - 1]?.node.parent_idx ?? 0) + 1 : 0

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

/** Indent node: reparent under previous sibling (make it last child).
 * Returns true if indent succeeded, false if blocked (caller should bell). */
export function indentNode(ctx: ActionCtx, card: CardState): boolean {
  const col = ctx.layout.columns[ctx.layout.colIndex]
  if (!col) return false

  const selectedIndices = getSelectedCardIndices(ctx)
  if (selectedIndices.length > 1) {
    return indentNodesAtomically(ctx, col, selectedIndices)
  }

  if (!canIndent(ctx, card)) return false

  executeIndent(ctx, card)
  // Cursor follows the indented node. nodeIndex maps descendants to their
  // containing card, so visual cursor lands on the parent card. Navigation
  // resolves sub-card nodes to card level (see navigateVertical).
  ctx.dispatchBoard({ type: "SELECT", nodeId: card.node.id })
  return true
}

/** Outdent node: make it a sibling of its parent.
 * Returns true if outdent succeeded, false if blocked (caller should bell). */
export function outdentNode(ctx: ActionCtx, card: CardState): boolean {
  const col = ctx.layout.columns[ctx.layout.colIndex]
  if (!col) return false

  const selectedIndices = getSelectedCardIndices(ctx)
  if (selectedIndices.length > 1) {
    return outdentNodesAtomically(ctx, col, selectedIndices)
  }

  if (!canOutdent(ctx, card)) return false

  executeOutdent(ctx, card)
  ctx.dispatchBoard({ type: "SELECT", nodeId: card.node.id })
  return true
}

// --- Indent/Outdent Validation ---

/** Node types that support indentation (outline structure, not content blocks). */
const INDENTABLE_TYPES = new Set(["section", "task", "folder", "file"])

/** Check if a card can be indented (has a previous sibling to nest under) */
function canIndent(ctx: ActionCtx, card: CardState): boolean {
  if (!INDENTABLE_TYPES.has(card.node.type)) return false

  const parentId = card.node.parent_id
  if (!parentId) return false

  const siblings = ctx.repo.getChildren(parentId)
  const myIndex = indexOfChild(siblings, card.node.id)
  return myIndex > 0
}

/** Check if a card can be outdented (has a grandparent to move to) */
function canOutdent(ctx: ActionCtx, card: CardState): boolean {
  if (!INDENTABLE_TYPES.has(card.node.type)) return false

  const parentId = card.node.parent_id
  if (!parentId) return false

  const parent = ctx.repo.getNode(parentId)
  return !!parent?.parent_id
}

// --- Indent/Outdent Execution ---

/** Execute indent for a single card (no validation, no refresh). */
function executeIndent(ctx: ActionCtx, card: CardState): void {
  const parentId = card.node.parent_id
  if (!parentId) return

  const siblings = ctx.repo.getChildren(parentId)
  const myIndex = indexOfChild(siblings, card.node.id)
  if (myIndex <= 0) return

  const prevSibling = siblings[myIndex - 1]
  if (!prevSibling) return
  const newParentId = prevSibling.id

  const newParentChildren = ctx.repo.getChildren(newParentId)
  const lastChild = newParentChildren[newParentChildren.length - 1]
  const newSortOrder = lastChild ? lastChild.parent_idx + 1 : 0

  ctx.repo.moveNode(card.node.id, newParentId, newSortOrder)
}

/** Execute outdent for a single card (no validation, no refresh) */
function executeOutdent(ctx: ActionCtx, card: CardState): void {
  const parentId = card.node.parent_id
  if (!parentId) return

  const parent = ctx.repo.getNode(parentId)
  const grandparentId = parent?.parent_id
  if (!parent || !grandparentId) return

  const grandparentChildren = ctx.repo.getChildren(grandparentId)
  const parentIndex = indexOfChild(grandparentChildren, parentId)

  let newSortOrder: number
  if (parentIndex === grandparentChildren.length - 1) {
    newSortOrder = parent.parent_idx + 1
  } else {
    const nextSibling = grandparentChildren[parentIndex + 1]
    newSortOrder = (parent.parent_idx + (nextSibling?.parent_idx ?? parent.parent_idx + 2)) / 2
  }

  ctx.repo.moveNode(card.node.id, grandparentId, newSortOrder)
}

// --- Atomic Batch Operations ---

/**
 * Indent multiple selected cards atomically.
 * All-or-nothing: if any card can't be indented, none are.
 * Cards are processed bottom-up to avoid invalidating indices.
 */
function indentNodesAtomically(ctx: ActionCtx, col: { cards: CardState[] }, selectedIndices: number[]): boolean {
  // Validate ALL cards can be indented
  const cards = selectedIndices.map((i) => col.cards[i]).filter((c): c is CardState => c !== undefined)
  if (cards.length === 0) return false

  for (const card of cards) {
    if (!canIndent(ctx, card)) return false
  }

  // Process bottom-up (highest column index first) to avoid invalidating sibling indices
  const bottomUp = [...selectedIndices].sort((a, b) => b - a)
  for (const idx of bottomUp) {
    const card = col.cards[idx]
    if (card) executeIndent(ctx, card)
  }

  // Cursor follows first indented card (resolves to parent card via nodeIndex)
  ctx.dispatchBoard({ type: "SELECT", nodeId: cards[0]!.node.id })
  clearSelection(ctx)
  return true
}

/**
 * Outdent multiple selected cards atomically.
 * All-or-nothing: if any card can't be outdented, none are.
 * Cards are processed top-down to maintain sort order.
 */
function outdentNodesAtomically(ctx: ActionCtx, col: { cards: CardState[] }, selectedIndices: number[]): boolean {
  // Validate ALL cards can be outdented
  const cards = selectedIndices.map((i) => col.cards[i]).filter((c): c is CardState => c !== undefined)
  if (cards.length === 0) return false

  for (const card of cards) {
    if (!canOutdent(ctx, card)) return false
  }

  // Process top-down (lowest column index first) to maintain relative order
  const topDown = [...selectedIndices].sort((a, b) => a - b)
  for (const idx of topDown) {
    const card = col.cards[idx]
    if (card) executeOutdent(ctx, card)
  }

  // Cursor follows first card in batch
  ctx.dispatchBoard({ type: "SELECT", nodeId: cards[0]!.node.id })
  clearSelection(ctx)
  return true
}
