/**
 * Selection Namespace
 *
 * Typed helpers for operating on the current selection (multi-selected cards
 * or cursor card fallback). Replaces ad-hoc getSelectedCards() with a
 * discoverable, testable namespace.
 *
 * Every card operation should use `Selection.nodes(ctx)` to get the cards
 * to operate on. Single card = batch of 1.
 */

import type { KNode, Position } from "@km/core"
import { TreeOps } from "@km/tree"
import type { SelectionKey } from "./types.ts"
import { parseSelectionKey } from "./types.ts"

// =============================================================================
// Minimal context interface — keeps Selection testable without full ActionCtx
// =============================================================================

export interface SelectionCtx {
  /** Visual multi-selection set (SelectionKey ≡ nodeId) */
  ui: { readonly multiSelected: ReadonlySet<SelectionKey> }
  /** Board column layout */
  columns: ReadonlyArray<{
    readonly cardNodes: readonly KNode[]
  }>
  /** Current column index */
  colIndex: number
  /** Current card index within column */
  cardIndex: number
  /** Node index: nodeId → { colIndex, cardIndex } */
  nodeIndex: ReadonlyMap<string, { colIndex: number; cardIndex: number }> | null
  /** Repository for node lookups */
  repo: { getNode(id: string): KNode | null }
}

/** Extended context for undo-batched operations (moveTo, forEach). */
export interface BatchCtx extends SelectionCtx {
  cursorNodeId: string | null
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
   * Get selected card nodes (or cursor card if nothing selected).
   *
   * When multiSelected has entries, resolves them to card nodes in the
   * current column. Otherwise returns the cursor card as a single-item array.
   * Returns cards in column order (sorted by cardIndex).
   */
  nodes(ctx: SelectionCtx): KNode[] {
    const col = ctx.columns[ctx.colIndex]
    const cursorCard = col?.cardNodes[ctx.cardIndex]
    if (!col || !cursorCard) return []

    const indices = Selection.cardIndices(ctx)
    if (indices.length > 1) {
      return indices.map((i) => col.cardNodes[i]).filter((c): c is KNode => c !== undefined)
    }
    return [cursorCard]
  },

  /**
   * Get selected node IDs (or cursor card ID if nothing selected).
   *
   * Convenience wrapper over `Selection.nodes()`.
   */
  nodeIds(ctx: SelectionCtx): string[] {
    return Selection.nodes(ctx).map((n) => n.id)
  },

  /**
   * Get unique selected card indices from multi-selection, sorted ascending.
   *
   * Maps SelectionKeys back to card positions in the current column via
   * nodeIndex. For sub-items not in nodeIndex, walks the parent chain.
   */
  cardIndices(ctx: SelectionCtx): number[] {
    if (ctx.ui.multiSelected.size === 0) return []
    const nodeIndex = ctx.nodeIndex
    if (!nodeIndex) return []
    const indices = new Set<number>()
    for (const key of ctx.ui.multiSelected) {
      const { nodeId } = parseSelectionKey(key)
      // Check nodeIndex for card roots
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
      if (TreeOps.moveTo(ctx.repo, card.id, to)) moved++
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
