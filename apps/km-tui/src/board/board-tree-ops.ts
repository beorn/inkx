/**
 * Board Tree Operations — Atomic tree change + cursor update
 *
 * Wraps low-level tree operations (split, merge) with cursor dispatch
 * so callers cannot forget to update the cursor after a tree mutation.
 * Every function: undo batch → tree change → cursor SELECT → UI update.
 *
 * These replace the pattern of calling split/merge then manually dispatching
 * SELECT — the bug surface where callers used stale cursor IDs.
 */

import { split, mergeBackward, mergeForward, type SplitResult, type MergeResult } from "@km/tree"
import type { ActionCtx } from "../tui-context.ts"

// =============================================================================
// Split
// =============================================================================

/**
 * Split a node at offset, creating a sibling after. Cursor moves to the new node.
 * Caller must save the edit target and materialize content before calling.
 */
export function boardSplit(ctx: ActionCtx, nodeId: string, offset: number): SplitResult {
  ctx.undoHandle.setCursor(nodeId)
  ctx.undoHandle.startBatch("Split node")
  const result = split(ctx.repo, nodeId, offset)
  ctx.undoHandle.endBatch()
  ctx.dispatchBoard({ type: "SELECT", nodeId: result.afterId })
  ctx.sel.text.edit(result.afterId as import("@silvery/selection").ID, 0)
  ctx.textEditHints = { blockIndex: 0 }
  return result
}

// =============================================================================
// Merge Backward
// =============================================================================

/**
 * Merge a node with its previous sibling. Cursor moves to the survivor.
 * Returns null if no previous sibling exists.
 */
export function boardMergeBackward(ctx: ActionCtx, nodeId: string): MergeResult | null {
  ctx.undoHandle.setCursor(ctx.cursorNodeId ?? nodeId)
  ctx.undoHandle.startBatch("Merge backward")
  const result = mergeBackward(ctx.repo, nodeId)
  ctx.undoHandle.endBatch()
  if (result) {
    ctx.sel.text.deselect()
    ctx.dispatchBoard({ type: "SELECT", nodeId: result.survivorId })
  }
  return result
}

// =============================================================================
// Merge Forward
// =============================================================================

/**
 * Merge a node with its next sibling. Cursor moves to the survivor.
 * Returns null if no next sibling exists.
 */
export function boardMergeForward(ctx: ActionCtx, nodeId: string): MergeResult | null {
  ctx.undoHandle.setCursor(ctx.cursorNodeId ?? nodeId)
  ctx.undoHandle.startBatch("Merge forward")
  const result = mergeForward(ctx.repo, nodeId)
  ctx.undoHandle.endBatch()
  if (result) {
    ctx.sel.text.deselect()
    ctx.dispatchBoard({ type: "SELECT", nodeId: result.survivorId })
  }
  return result
}
