/**
 * Selection Namespace
 *
 * Typed helpers for operating on the current selection (multi-selected nodes
 * or cursor node fallback). Tree-level — does not depend on view layout.
 *
 * Every node operation should use `Selection.nodes(ctx)` to get the nodes
 * to operate on. Single cursor = batch of 1.
 */

import type { KNode, Position } from "@km/core"
import { Tree } from "@km/tree"

// =============================================================================
// Minimal context interface — keeps Selection testable without full ActionCtx
// =============================================================================

export interface SelectionCtx {
  /** Multi-selection set (node IDs). Empty = use cursor as single selection. */
  ui: { readonly multiSelected: ReadonlySet<string> }
  /** Board column layout (needed only for multi-selection ordering) */
  columns: ReadonlyArray<{
    readonly cardNodes: readonly KNode[]
  }>
  /** Current cursor node (tree-level, single source of truth) */
  cursorNodeId: string | null
  /** Current column index (view-level, for multi-selection ordering) */
  colIndex: number
  /** Current card index within column (view-level, for multi-selection ordering) */
  cardIndex: number
  /** Node index: nodeId → { colIndex, cardIndex } (for multi-selection ordering) */
  nodeIndex: ReadonlyMap<string, { colIndex: number; cardIndex: number }> | null
  /** Repository for node lookups */
  repo: { getNode(id: string): KNode | null }
}

/** Extended context for undo-batched operations (moveTo, forEach). */
export interface BatchCtx extends SelectionCtx {
  undoHandle: { setCursor(id: string | null): void; startBatch(label: string): void; endBatch(): void }
}

/** Extended context for batch move operations. */
export interface MoveCtx extends BatchCtx {
  repo: SelectionCtx["repo"] & {
    moveNode(id: string, parentId: string, sortOrder: number): void
    getChildren(parentId: string | null): { id: string; parent_idx: number }[]
  }
}

// =============================================================================
// Selection namespace
// =============================================================================

export const Selection = {
  /**
   * Get selected nodes (or cursor node if no multi-selection).
   *
   * Multi-selection: resolves node IDs to KNodes, ordered by column position.
   * Single selection: returns the cursor node as a single-item array.
   */
  nodes(ctx: SelectionCtx): KNode[] {
    // Multi-selection: resolve from card positions
    const indices = Selection.cardIndices(ctx)
    if (indices.length > 1) {
      const col = ctx.columns[ctx.colIndex]
      if (!col) return []
      return indices.map((i) => col.cardNodes[i]).filter((c): c is KNode => c !== undefined)
    }

    // Single selection: the cursor node (tree-level)
    if (!ctx.cursorNodeId) return []
    const node = ctx.repo.getNode(ctx.cursorNodeId)
    return node ? [node] : []
  },

  /**
   * Get selected node IDs (or cursor node ID if no multi-selection).
   */
  nodeIds(ctx: SelectionCtx): string[] {
    return Selection.nodes(ctx).map((n) => n.id)
  },

  /**
   * Get unique selected card indices from multi-selection, sorted ascending.
   *
   * Maps node IDs back to card positions in the current column via
   * nodeIndex. For sub-items not in nodeIndex, walks the parent chain.
   */
  cardIndices(ctx: SelectionCtx): number[] {
    if (ctx.ui.multiSelected.size === 0) return []
    const nodeIndex = ctx.nodeIndex
    if (!nodeIndex) return []
    const indices = new Set<number>()
    for (const nodeId of ctx.ui.multiSelected) {
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
  },

  /**
   * True if no nodes are in the multi-selection (ignores cursor).
   */
  isEmpty(ctx: SelectionCtx): boolean {
    return ctx.ui.multiSelected.size === 0
  },

  /**
   * True if a specific node is in the multi-selection.
   */
  contains(ctx: SelectionCtx, nodeId: string): boolean {
    return ctx.ui.multiSelected.has(nodeId)
  },

  /**
   * Batch move all selected nodes to a Position, with undo batching.
   * Skips nodes that would move into themselves. Returns the count moved.
   */
  moveTo(ctx: MoveCtx, to: Position): { moved: number } {
    const cards = Selection.nodes(ctx)
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
  },

  /**
   * Iterate over selected nodes with automatic undo batch wrapping.
   * Batches only when >1 node (single node doesn't need batch overhead).
   * Returns the number of nodes iterated.
   */
  forEach(ctx: BatchCtx, label: string, fn: (node: KNode) => void): number {
    const cards = Selection.nodes(ctx)
    if (cards.length === 0) return 0
    ctx.undoHandle.setCursor(ctx.cursorNodeId)
    if (cards.length > 1) ctx.undoHandle.startBatch(label)
    for (const card of cards) fn(card)
    if (cards.length > 1) ctx.undoHandle.endBatch()
    return cards.length
  },
} as const
