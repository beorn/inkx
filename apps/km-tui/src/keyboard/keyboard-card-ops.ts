/**
 * Card Operations for Keyboard Handler
 *
 * Functions for moving, indenting, and outdenting cards.
 */

import { type OpResult, boundary, ok } from "@km/commands"
import type { ID } from "@silvery/selection"
import { KNode } from "@km/core"
import type { OpCtx } from "../tui-context.ts"
import { nodesSelect } from "../state/selection.ts"
import { clearSelection, getSelectedCardIndices } from "../board/board-selection-helpers.ts"
import { indexOfChild } from "../navigation/sibling-index.ts"
import { captureTree } from "../state/capture-tree.ts"

/** Get column info from ViewTree by index. Returns colId + card IDs + KNode[] for the column. */
function treeColumn(ctx: OpCtx, colIndex: number) {
  const rootId = ctx.tree.rootId
  if (!rootId) return null
  const colIds = ctx.tree.children(rootId)
  const colId = colIds[colIndex]
  if (!colId) return null
  const cardIds = ctx.tree.children(colId)
  return {
    node: { id: colId } as { id: string; parent_idx: number },
    cardNodes: cardIds.map((id) => ctx.repo.getNode(id)).filter((n): n is KNode => n != null),
    cardIds,
  }
}

// =============================================================================
// Card Movement - Helpers
// =============================================================================

/**
 * Ensure all cards in a column have distinct parent_idx values.
 * When siblings share the same parent_idx (e.g., all default to 0),
 * fractional insertion between equal values produces wrong sort order.
 * Assigns sequential integers [0, 1, 2, ...] when duplicates exist.
 */
function normalizeSortOrders(ctx: OpCtx, col: { cardNodes: KNode[]; node: { id: string } }): void {
  const seen = new Set<number>()
  let hasDuplicates = false
  for (const card of col.cardNodes) {
    if (seen.has(card.parent_idx)) {
      hasDuplicates = true
      break
    }
    seen.add(card.parent_idx)
  }
  if (!hasDuplicates) return

  for (let i = 0; i < col.cardNodes.length; i++) {
    const card = col.cardNodes[i]
    if (card && card.parent_idx !== i) {
      ctx.repo.moveNode(card.id, col.node.id, i)
      card.parent_idx = i
    }
  }
}

/**
 * Calculate the sort order for inserting a card at the given target index.
 * Places the value between the two neighbors, or beyond the boundary card.
 * Requires normalizeSortOrders to have been called first.
 */
function calculateSortOrder(col: { cardNodes: KNode[] }, targetIndex: number, direction: "up" | "down"): number {
  const order = (i: number) => col.cardNodes[i]?.parent_idx ?? i

  if (direction === "up") {
    if (targetIndex === 0) {
      return order(0) - 1
    }
    return (order(targetIndex - 1) + order(targetIndex)) / 2
  }
  // direction === "down"
  if (targetIndex >= col.cardNodes.length - 1) {
    return order(col.cardNodes.length - 1) + 1
  }
  return (order(targetIndex) + order(targetIndex + 1)) / 2
}

/**
 * Rebuild multi-selection set by matching moved card IDs against
 * the current column's children after a board state refresh.
 */
function rebuildSelectionForMovedCards(ctx: OpCtx, colIndex: number, movedCardIds: string[]): void {
  const newSelected = new Set<string>()
  const allChildren = ctx.repo.getChildren(ctx.rootId)
  const columns = allChildren.filter((n) => !KNode.isBlock(n))
  const newCol = columns[colIndex]
  if (newCol) {
    const cards = ctx.repo.getChildren(newCol.id)
    for (let cardIdx = 0; cardIdx < cards.length; cardIdx++) {
      const c = cards[cardIdx]
      if (c && movedCardIds.includes(c.id)) {
        newSelected.add(c.id)
      }
    }
  }
  ctx.setSelection(nodesSelect(Array.from(newSelected)))
}

// =============================================================================
// Card Movement
// =============================================================================

/** Move card within column (up/down) */
export function moveCardInColumn(ctx: OpCtx, card: KNode, direction: "up" | "down"): OpResult {
  const col = treeColumn(ctx, ctx.colIndex)
  if (!col) return boundary(direction)

  // Batch all moves (normalize + card moves) into a single undo entry
  ctx.undoHandle.setCursor(ctx.cursor)
  ctx.undoHandle.startBatch("Move card")

  // Fix duplicate parent_idx before calculating new sort order
  normalizeSortOrders(ctx, col)

  const selectedIndices = getSelectedCardIndices(ctx)
  const cardsToMove =
    selectedIndices.length > 0
      ? selectedIndices.map((i: number) => ({ index: i, card: col.cardNodes[i] }))
      : [{ index: ctx.cardIndex, card }]

  const validCards = cardsToMove.filter((c): c is { index: number; card: KNode } => c.card !== undefined)
  if (validCards.length === 0) {
    ctx.undoHandle.endBatch()
    return boundary(direction)
  }

  const sortedCards =
    direction === "up"
      ? validCards.sort((a: { index: number }, b: { index: number }) => a.index - b.index)
      : validCards.sort((a: { index: number }, b: { index: number }) => b.index - a.index)

  const firstToMove = sortedCards[0]
  if (!firstToMove) {
    ctx.undoHandle.endBatch()
    return boundary(direction)
  }
  const targetIndex = direction === "up" ? firstToMove.index - 1 : firstToMove.index + 1
  if (targetIndex < 0 || targetIndex >= col.cardNodes.length) {
    ctx.undoHandle.endBatch()
    return boundary(direction)
  }

  // Snapshot tree BEFORE mutations for sel.transform()
  const selRoot = ctx.sel.root.id()
  const prevTree = captureTree(ctx.repo, selRoot)

  for (const { index: currentIndex, card: cardToMove } of sortedCards) {
    const cardTargetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1
    if (cardTargetIndex < 0 || cardTargetIndex >= col.cardNodes.length) continue

    const newSortOrder = calculateSortOrder(col, cardTargetIndex, direction)
    ctx.repo.moveNode(cardToMove.id, col.node.id, newSortOrder)
  }

  ctx.undoHandle.endBatch()

  const movedCardIds = validCards.map((c) => c.card.id)

  // Atomic selection repair: transform re-orders IDs in walk order after moves
  const nextTree = captureTree(ctx.repo, selRoot)
  for (const cardId of movedCardIds) {
    ctx.sel.transform({ type: "moveNode", id: cardId as ID, newParent: col.node.id as ID }, prevTree, nextTree)
  }

  if (movedCardIds.length > 1) {
    rebuildSelectionForMovedCards(ctx, ctx.colIndex, movedCardIds)
  }

  return ok()
}

/** Move card to different column (left/right) */
export function moveCardToColumn(ctx: OpCtx, card: KNode, direction: "left" | "right"): OpResult {
  const col = treeColumn(ctx, ctx.colIndex)
  if (!col) return boundary(direction)

  const rootId = ctx.tree.rootId
  const colCount = rootId ? ctx.tree.children(rootId).length : 0
  const targetColIndex = direction === "left" ? ctx.colIndex - 1 : ctx.colIndex + 1
  if (targetColIndex < 0 || targetColIndex >= colCount) return boundary(direction)

  const targetCol = treeColumn(ctx, targetColIndex)
  if (!targetCol) return boundary(direction)

  const selectedIndices = getSelectedCardIndices(ctx)
  const cardsToMove =
    selectedIndices.length > 0
      ? selectedIndices.map((i: number) => col.cardNodes[i]).filter((c) => c !== undefined)
      : [card]

  if (cardsToMove.length === 0) return boundary(direction)

  // Snapshot tree BEFORE mutations for sel.transform()
  const selRoot = ctx.sel.root.id()
  const prevTree = captureTree(ctx.repo, selRoot)

  // Batch all moves into a single undo entry
  ctx.undoHandle.setCursor(ctx.cursor)
  ctx.undoHandle.startBatch("Move card to column")

  let newSortOrder =
    targetCol.cardNodes.length > 0 ? (targetCol.cardNodes[targetCol.cardNodes.length - 1]?.parent_idx ?? 0) + 1 : 0

  for (const cardToMove of cardsToMove) {
    ctx.repo.moveNode(cardToMove.id, targetCol.node.id, newSortOrder)
    newSortOrder++
  }

  ctx.undoHandle.endBatch()

  const movedCardIds = cardsToMove.map((c) => c.id)

  // Atomic selection repair: transform handles cursor/anchor for cross-column moves
  const nextTree = captureTree(ctx.repo, selRoot)
  for (const cardId of movedCardIds) {
    ctx.sel.transform({ type: "moveNode", id: cardId as ID, newParent: targetCol.node.id as ID }, prevTree, nextTree)
  }

  rebuildSelectionForMovedCards(ctx, targetColIndex, movedCardIds)

  return ok()
}

// =============================================================================
// Indent/Outdent
// =============================================================================

/** Indent node: reparent under previous sibling (make it last child).
 * Returns true if indent succeeded, false if blocked (caller should bell). */
export function indentNode(ctx: OpCtx, card: KNode): boolean {
  const col = treeColumn(ctx, ctx.colIndex)
  if (!col) return false

  const selectedIndices = getSelectedCardIndices(ctx)
  if (selectedIndices.length > 1) {
    return indentNodesAtomically(ctx, col, selectedIndices)
  }

  if (!canIndent(ctx, card)) return false

  const selRoot = ctx.sel.root.id()
  const prevTree = captureTree(ctx.repo, selRoot)

  ctx.undoHandle.setCursor(ctx.cursor)
  executeIndent(ctx, card)

  // Atomic selection repair: transform handles cursor for indented node
  const nextTree = captureTree(ctx.repo, selRoot)
  const newParent = ctx.repo.getNode(card.id)?.parent_id
  if (newParent) {
    ctx.sel.transform({ type: "moveNode", id: card.id as ID, newParent: newParent as ID }, prevTree, nextTree)
  }
  return true
}

/** Outdent node: make it a sibling of its parent.
 * Returns true if outdent succeeded, false if blocked (caller should bell). */
export function outdentNode(ctx: OpCtx, card: KNode): boolean {
  const col = treeColumn(ctx, ctx.colIndex)
  if (!col) return false

  const selectedIndices = getSelectedCardIndices(ctx)
  if (selectedIndices.length > 1) {
    return outdentNodesAtomically(ctx, col, selectedIndices)
  }

  if (!canOutdent(ctx, card)) return false

  const selRoot = ctx.sel.root.id()
  const prevTree = captureTree(ctx.repo, selRoot)

  ctx.undoHandle.setCursor(ctx.cursor)
  executeOutdent(ctx, card)

  // Atomic selection repair: transform handles cursor for outdented node
  const nextTree = captureTree(ctx.repo, selRoot)
  const newParent = ctx.repo.getNode(card.id)?.parent_id
  if (newParent) {
    ctx.sel.transform({ type: "moveNode", id: card.id as ID, newParent: newParent as ID }, prevTree, nextTree)
  }
  return true
}

// --- Indent/Outdent Validation ---

/** Node types that support indentation (outline structure, not content blocks). */
// Items (oi, li) are indentable — not blocks or links

/** Check if a card can be indented (has a previous sibling to nest under) */
function canIndent(ctx: OpCtx, card: KNode): boolean {
  if (!KNode.isItem(card)) return false

  const parentId = card.parent_id
  if (!parentId) return false

  const siblings = ctx.repo.getChildren(parentId)
  const myIndex = indexOfChild(siblings, card.id)
  return myIndex > 0
}

/** Check if a card can be outdented (has a grandparent to move to) */
function canOutdent(ctx: OpCtx, card: KNode): boolean {
  if (!KNode.isItem(card)) return false

  const parentId = card.parent_id
  if (!parentId) return false

  const parent = ctx.repo.getNode(parentId)
  return !!parent?.parent_id
}

// --- Indent/Outdent Execution ---

/** Execute indent for a single card (no validation, no refresh). */
function executeIndent(ctx: OpCtx, card: KNode): void {
  const parentId = card.parent_id
  if (!parentId) return

  const siblings = ctx.repo.getChildren(parentId)
  const myIndex = indexOfChild(siblings, card.id)
  if (myIndex <= 0) return

  const prevSibling = siblings[myIndex - 1]
  if (!prevSibling) return
  const newParentId = prevSibling.id

  const newParentChildren = ctx.repo.getChildren(newParentId)
  const lastChild = newParentChildren[newParentChildren.length - 1]
  const newSortOrder = lastChild ? lastChild.parent_idx + 1 : 0

  ctx.repo.moveNode(card.id, newParentId, newSortOrder)
}

/** Execute outdent for a single card (no validation, no refresh) */
function executeOutdent(ctx: OpCtx, card: KNode): void {
  const parentId = card.parent_id
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

  ctx.repo.moveNode(card.id, grandparentId, newSortOrder)
}

// --- Atomic Batch Operations ---

/**
 * Indent multiple selected cards atomically.
 * All-or-nothing: if any card can't be indented, none are.
 * Cards are processed bottom-up to avoid invalidating indices.
 */
function indentNodesAtomically(ctx: OpCtx, col: { cardNodes: KNode[] }, selectedIndices: number[]): boolean {
  // Validate ALL cards can be indented
  const cards = selectedIndices.map((i) => col.cardNodes[i]).filter((c): c is KNode => c !== undefined)
  if (cards.length === 0) return false

  for (const card of cards) {
    if (!canIndent(ctx, card)) return false
  }

  // Snapshot tree BEFORE mutations for sel.transform()
  const selRoot = ctx.sel.root.id()
  const prevTree = captureTree(ctx.repo, selRoot)

  // Batch all indent moves into a single undo entry
  ctx.undoHandle.setCursor(ctx.cursor)
  ctx.undoHandle.startBatch("Indent nodes")

  // Process bottom-up (highest column index first) to avoid invalidating sibling indices
  const bottomUp = [...selectedIndices].sort((a, b) => b - a)
  for (const idx of bottomUp) {
    const card = col.cardNodes[idx]
    if (card) executeIndent(ctx, card)
  }

  ctx.undoHandle.endBatch()

  // Atomic selection repair: transform handles cursor for all indented cards
  const nextTree = captureTree(ctx.repo, selRoot)
  for (const card of cards) {
    const newParent = ctx.repo.getNode(card.id)?.parent_id
    if (newParent) {
      ctx.sel.transform({ type: "moveNode", id: card.id as ID, newParent: newParent as ID }, prevTree, nextTree)
    }
  }
  clearSelection(ctx)
  return true
}

/**
 * Outdent multiple selected cards atomically.
 * All-or-nothing: if any card can't be outdented, none are.
 * Cards are processed top-down to maintain sort order.
 */
function outdentNodesAtomically(ctx: OpCtx, col: { cardNodes: KNode[] }, selectedIndices: number[]): boolean {
  // Validate ALL cards can be outdented
  const cards = selectedIndices.map((i) => col.cardNodes[i]).filter((c): c is KNode => c !== undefined)
  if (cards.length === 0) return false

  for (const card of cards) {
    if (!canOutdent(ctx, card)) return false
  }

  // Snapshot tree BEFORE mutations for sel.transform()
  const selRoot = ctx.sel.root.id()
  const prevTree = captureTree(ctx.repo, selRoot)

  // Batch all outdent moves into a single undo entry
  ctx.undoHandle.setCursor(ctx.cursor)
  ctx.undoHandle.startBatch("Outdent nodes")

  // Process top-down (lowest column index first) to maintain relative order
  const topDown = [...selectedIndices].sort((a, b) => a - b)
  for (const idx of topDown) {
    const card = col.cardNodes[idx]
    if (card) executeOutdent(ctx, card)
  }

  ctx.undoHandle.endBatch()

  // Atomic selection repair: transform handles cursor for all outdented cards
  const nextTree = captureTree(ctx.repo, selRoot)
  for (const card of cards) {
    const newParent = ctx.repo.getNode(card.id)?.parent_id
    if (newParent) {
      ctx.sel.transform({ type: "moveNode", id: card.id as ID, newParent: newParent as ID }, prevTree, nextTree)
    }
  }
  clearSelection(ctx)
  return true
}
