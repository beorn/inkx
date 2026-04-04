/**
 * History — Op-based undo/redo via operation inverse.
 *
 * SlateJS-inspired: withHistory wraps a TreeMutator to capture every mutation
 * as an Operation. Undo replays inverse(op) in reverse order; redo re-applies
 * the original ops. Operations are grouped into batches — one undo step per batch.
 *
 * Composes with withNormalization:
 *   const editor = withHistory(withNormalization(tree))
 *   editor.addNode(...)   // normalizes + records op for undo
 *   editor.undo()         // replays inverse ops (normalization runs automatically)
 */

import { KNode } from "@km/core"
import type { TreeMutator } from "./block-ops.ts"
import { inverse, applyTreeOp, type TreeOp } from "./operations.ts"
import type { TreeOpLog } from "./operation-log.ts"

// =============================================================================
// Types
// =============================================================================

export interface HistoryEditor extends TreeMutator {
  /** Undo the last batch of operations. */
  undo(): void
  /** Redo the last undone batch. */
  redo(): void
  /** Run a batch of operations that will be a single undo step. */
  batch<R>(fn: () => R): R
  /** The undo/redo stacks. */
  history: { undos: TreeOp[][]; redos: TreeOp[][] }
}

// =============================================================================
// withHistory — decorator
// =============================================================================

/**
 * Wrap a TreeMutator to capture operations for undo/redo.
 *
 * Every mutation (addNode, updateNode, moveNode, deleteNode) is recorded as
 * an Operation. By default each mutation is its own undo batch. Use batch()
 * to group multiple mutations into a single undo step.
 *
 * Undo applies inverse(op) for each op in the batch, in reverse order.
 * Redo re-applies the original ops in forward order.
 */
export function withHistory(tree: TreeMutator, options?: { log?: TreeOpLog }): HistoryEditor {
  const log = options?.log
  const undos: TreeOp[][] = []
  const redos: TreeOp[][] = []
  let currentBatch: TreeOp[] | null = null
  let isUndoRedo = false

  function record(op: TreeOp): void {
    if (isUndoRedo) return

    if (currentBatch) {
      currentBatch.push(op)
    } else {
      // Auto-batch: single op = single undo step
      undos.push([op])
      redos.length = 0 // new mutation clears redo stack
      log?.append([op], { source: "user" })
    }
  }

  function snapshotNode(id: string): Partial<KNode> {
    const node = tree.getNode(id)
    if (!node) return {}
    // Capture all properties for restore
    const { id: _id, ...rest } = node
    return rest
  }

  const editor: HistoryEditor = {
    getNode: (id) => tree.getNode(id),
    getChildren: (parentId) => tree.getChildren(parentId),

    addNode(parentId, node) {
      const id = tree.addNode(parentId, node)
      const inserted = tree.getNode(id)
      record({
        type: "insert_node",
        parentId: parentId ?? "",
        index: inserted?.parent_idx ?? 0,
        node,
        newId: id,
      })
      return id
    },

    updateNode(id, changes) {
      const oldProps: Partial<KNode> = {}
      const node = tree.getNode(id)
      if (node) {
        for (const key of Object.keys(changes) as (keyof KNode)[]) {
          ;(oldProps as Record<string, unknown>)[key] = node[key]
        }
      }
      tree.updateNode(id, changes)
      record({
        type: "set_node",
        nodeId: id,
        properties: changes,
        oldProperties: oldProps,
      })
    },

    moveNode(id, newParentId, position) {
      const node = tree.getNode(id)
      const oldParentId = node?.parent_id ?? ""
      const oldIndex = node?.parent_idx ?? 0
      tree.moveNode(id, newParentId, position)
      record({
        type: "move_node",
        nodeId: id,
        oldParentId,
        oldIndex,
        newParentId,
        newIndex: position,
      })
    },

    deleteNode(id) {
      const snapshot = snapshotNode(id)
      const node = tree.getNode(id)
      const parentId = node?.parent_id ?? ""
      const index = node?.parent_idx ?? 0
      tree.deleteNode(id)
      record({
        type: "remove_node",
        nodeId: id,
        snapshot,
        parentId,
        index,
      })
    },

    undo() {
      const batch = undos.pop()
      if (!batch) return
      isUndoRedo = true
      const inverseOps: TreeOp[] = []
      try {
        for (const op of [...batch].reverse()) {
          const inv = inverse(op)
          applyTreeOp(tree, inv)
          inverseOps.push(inv)
        }
      } finally {
        isUndoRedo = false
      }
      redos.push(batch)
      log?.append(inverseOps, { source: "undo" })
    },

    redo() {
      const batch = redos.pop()
      if (!batch) return
      isUndoRedo = true
      try {
        for (const op of batch) {
          applyTreeOp(tree, op)
        }
      } finally {
        isUndoRedo = false
      }
      undos.push(batch)
      log?.append([...batch], { source: "redo" })
    },

    batch<R>(fn: () => R): R {
      const wasBatching = currentBatch !== null
      if (!wasBatching) {
        currentBatch = []
      }
      try {
        return fn()
      } finally {
        if (!wasBatching && currentBatch) {
          if (currentBatch.length > 0) {
            undos.push(currentBatch)
            redos.length = 0
            log?.append([...currentBatch], { source: "user" })
          }
          currentBatch = null
        }
      }
    },

    history: { undos, redos },
  }

  return editor
}
