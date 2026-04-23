/**
 * Board Selection Helpers
 *
 * Pure helpers for resolving the current selection (multi-selected nodes
 * or cursor node fallback) from OpCtx. Replaces the old Selection namespace.
 *
 * Every batch operation should use `getSelectedNodes(ctx)` to get the nodes
 * to operate on. Single cursor = batch of 1.
 */

import type { KNode, Position } from "@km/core"
import { Tree } from "@km/tree"
import type { OpCtx } from "../tui-context.ts"
import { nodesSelect } from "../state/selection.ts"

/**
 * Get unique selected card indices from multi-selection, sorted ascending.
 *
 * Maps node IDs back to card positions in the current column via
 * nodeIndex. For sub-items not in nodeIndex, walks the parent chain.
 */
export function getSelectedCardIndices(ctx: OpCtx): number[] {
  if (ctx.selectedIds.size === 0) return []
  const nodeIndex = ctx.nodeIndex
  if (!nodeIndex) return []
  const indices = new Set<number>()
  for (const nodeId of ctx.selectedIds) {
    const pos = nodeIndex.get(nodeId)
    if (pos && pos.colIndex === ctx.colIndex) {
      indices.add(pos.cardIndex)
    }
    // For sub-items not in nodeIndex, walk parent chain
    if (!pos) {
      let current = ctx.repo.getNode(nodeId)
      while (current?.parent_id) {
        const parentPos = nodeIndex.get(current.parent_id)
        if (parentPos && parentPos.colIndex === ctx.colIndex) {
          indices.add(parentPos.cardIndex)
          break
        }
        current = ctx.repo.getNode(current.parent_id)
      }
    }
  }
  return Array.from(indices).sort((a, b) => a - b)
}

/**
 * Get selected nodes (or cursor node if no multi-selection).
 *
 * Multi-selection: resolves node IDs to KNodes, ordered by column position.
 * Single selection: returns the cursor node as a single-item array.
 */
export function getSelectedNodes(ctx: OpCtx): KNode[] {
  const indices = getSelectedCardIndices(ctx)
  if (indices.length > 1) {
    const columnIds = ctx.tree.rootId ? ctx.tree.children(ctx.tree.rootId) : []
    const colId = columnIds[ctx.colIndex]
    if (!colId) return []
    const cardIds = ctx.tree.children(colId)
    return indices
      .map((i) => {
        const cardId = cardIds[i]
        return cardId ? ctx.tree.node(cardId) : undefined
      })
      .filter((c): c is KNode => c !== undefined)
  }

  // Single selection: the cursor node (tree-level)
  if (!ctx.cursor) return []
  const node = ctx.repo.getNode(ctx.cursor as string)
  return node ? [node] : []
}

/**
 * Get selected node IDs (or cursor node ID if no multi-selection).
 */
export function getSelectedNodeIds(ctx: OpCtx): string[] {
  return getSelectedNodes(ctx).map((n) => n.id)
}

/**
 * Batch move all selected nodes to a Position, with undo batching.
 * Skips nodes that would move into themselves. Returns the count moved.
 */
export function moveSelectedTo(ctx: OpCtx, to: Position): { moved: number } {
  const cards = getSelectedNodes(ctx)
  if (cards.length === 0) return { moved: 0 }
  ctx.undoHandle.setCursor(ctx.cursor)
  ctx.undoHandle.startBatch("Move")
  let moved = 0
  for (const card of cards) {
    if (card.id === to.parentId) continue // don't move into self
    if (Tree.moveTo(ctx.repo, card.id, to)) moved++
  }
  ctx.undoHandle.endBatch()
  return { moved }
}

/**
 * Iterate over selected nodes with automatic undo batch wrapping.
 * Batches only when >1 node (single node doesn't need batch overhead).
 * Returns the number of nodes iterated.
 */
export function forEachSelected(ctx: OpCtx, label: string, fn: (node: KNode) => void): number {
  const cards = getSelectedNodes(ctx)
  if (cards.length === 0) return 0
  ctx.undoHandle.setCursor(ctx.cursor)
  if (cards.length > 1) ctx.undoHandle.startBatch(label)
  for (const card of cards) fn(card)
  if (cards.length > 1) ctx.undoHandle.endBatch()
  return cards.length
}

/**
 * Clear multi-selection state, collapsing to single cursor node.
 *
 * Uses sel.node.collapse() to go from multi-selection → single-item selection
 * (cursor preserved). This matches the original pre-@silvery/selection behavior
 * where clearSelection only cleared the multiSelected set without touching cursor.
 *
 * IMPORTANT: Do NOT use sel.deselect() here — that clears cursor to null, which
 * breaks any subsequent boundary-case navigation (cursor null → no recovery).
 */
export function clearSelection(ctx: OpCtx): void {
  ctx.sel.node.collapse()
  ctx.setUI({ status: null })
}

// =============================================================================
// Progressive Selection
// =============================================================================

type SelectionScope = "card" | "column" | "board"

/** Build a selection set for the given scope (card, column, or board) */
function buildSelectAllSet(ctx: OpCtx, scope: SelectionScope): string[] {
  const columnIds = ctx.tree.rootId ? ctx.tree.children(ctx.tree.rootId) : []

  if (scope === "card") {
    // Select the current card (from ctx.card which is pre-computed)
    const card = ctx.card
    if (card) return [card.id]
    return []
  } else if (scope === "column") {
    const colId = columnIds[ctx.colIndex]
    return colId ? [...ctx.tree.children(colId)] : []
  } else {
    // board: all cards across all columns
    return columnIds.flatMap((colId) => [...ctx.tree.children(colId)])
  }
}

/**
 * Progressive select all with Shift+A.
 *
 * Uses the size of the current selection to determine the next scope.
 * Derives scope from current selection size.
 */
export function progressiveSelectAll(ctx: OpCtx): void {
  const columnIds = ctx.tree.rootId ? ctx.tree.children(ctx.tree.rootId) : []
  const colId = columnIds[ctx.colIndex]
  const card = ctx.card

  // Derive outline mode: cursor is inside a card's sub-items
  const inOutlineMode = ctx.cursor !== null && card !== undefined && (ctx.cursor as string) !== card.id
  const currentSize = ctx.selectedIds.size
  const colCardCount = colId ? ctx.tree.children(colId).length : 0

  // Determine next scope based on current selection size
  let scope: SelectionScope
  if (currentSize === 0 && inOutlineMode && card) {
    scope = "card"
  } else if (colId && currentSize <= (inOutlineMode ? 1 : 0)) {
    scope = "column"
  } else if (colId && currentSize <= colCardCount) {
    scope = "board"
  } else {
    // Already at board level, cycle back
    scope = "board"
  }

  const newSelected = buildSelectAllSet(ctx, scope)
  ctx.setSelection(nodesSelect(newSelected))
  ctx.setUI({
    status: {
      level: "info",
      message: `All ${newSelected.length} items in ${scope} selected`,
    },
  })
}
