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
import type { ID } from "@silvery/selection"
import { Tree } from "@km/tree"
import type { OpCtx } from "../tui-context.ts"
import type { CardView } from "../types.ts"

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
    const col = ctx.columns[ctx.colIndex]
    if (!col) return []
    return indices.map((i) => col.cardNodes[i]).filter((c): c is CardView => c !== undefined)
  }

  // Single selection: the cursor node (tree-level)
  if (!ctx.cursorNodeId) return []
  const node = ctx.repo.getNode(ctx.cursorNodeId as string)
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
  ctx.undoHandle.setCursor(ctx.cursorNodeId)
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
  ctx.undoHandle.setCursor(ctx.cursorNodeId)
  if (cards.length > 1) ctx.undoHandle.startBatch(label)
  for (const card of cards) fn(card)
  if (cards.length > 1) ctx.undoHandle.endBatch()
  return cards.length
}

/**
 * Clear all selection state and dismiss status bar message.
 */
export function clearSelection(ctx: OpCtx): void {
  ctx.sel.deselect()
  ctx.setUI({ status: null })
}

// =============================================================================
// Progressive Selection
// =============================================================================

type SelectionScope = "card" | "column" | "board"

/** Build a selection set for the given scope (card, column, or board) */
function buildSelectAllSet(ctx: OpCtx, scope: SelectionScope): string[] {
  const selected: string[] = []

  if (scope === "card") {
    const card = ctx.columns[ctx.colIndex]?.cardNodes[ctx.cardIndex]
    if (card) {
      selected.push(card.id)
    }
  } else if (scope === "column") {
    const col = ctx.columns[ctx.colIndex]
    if (col) {
      for (const c of col.cardNodes) {
        selected.push(c.id)
      }
    }
  } else {
    for (const column of ctx.columns) {
      for (const c of column.cardNodes) {
        selected.push(c.id)
      }
    }
  }

  return selected
}

/**
 * Progressive select all with Shift+A.
 *
 * Uses the size of the current selection to determine the next scope.
 * Derives scope from current selection size.
 */
export function progressiveSelectAll(ctx: OpCtx): void {
  const col = ctx.columns[ctx.colIndex]
  const card = col?.cardNodes[ctx.cardIndex]

  // Derive outline mode: cursor is inside a card's sub-items
  const inOutlineMode = ctx.cursorNodeId !== null && card !== undefined && (ctx.cursorNodeId as string) !== card.id
  const currentSize = ctx.selectedIds.size

  // Determine next scope based on current selection size
  let scope: SelectionScope
  if (currentSize === 0 && inOutlineMode && card) {
    scope = "card"
  } else if (col && currentSize <= (inOutlineMode ? 1 : 0)) {
    scope = "column"
  } else if (col && currentSize <= col.cardNodes.length) {
    scope = "board"
  } else {
    // Already at board level, cycle back
    scope = "board"
  }

  const newSelected = buildSelectAllSet(ctx, scope)
  ctx.sel.node.select(newSelected as ID[])
  ctx.setUI({
    status: {
      level: "info",
      message: `All ${newSelected.length} items in ${scope} selected`,
    },
  })
}
