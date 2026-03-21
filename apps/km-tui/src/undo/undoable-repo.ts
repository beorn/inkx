/**
 * UndoableRepo — Wraps Repo mutation methods to auto-record operations.
 *
 * Every mutation (addNode, deleteNode, moveNode, updateNode) is intercepted
 * to capture a snapshot-based Operation with a precomputed inverse.
 *
 * ## Batching
 *
 * By default, each mutation is its own HistoryEntry (auto-batch).
 * Use `startBatch(label)` / `endBatch()` to group multiple mutations
 * into a single undoable entry.
 *
 * ## Cursor State
 *
 * Call `setCursor(nodeId)` before mutations to record cursorBefore.
 * After mutations, call `setCursorAfter(nodeId)` to record cursorAfter.
 * These are stored in the HistoryEntry for cursor restoration on undo/redo.
 */

import { createLogger } from "loggily"
import type { KNode } from "@km/core"
import type { Repo } from "../repo-context.tsx"
import type { UndoStack } from "../undo-stack.ts"
import { type Operation, type HistoryEntry, invertOperations } from "./operations.ts"

const log = createLogger("km:tui:undo:repo")

const OP_LABELS: Record<string, string> = {
  add_node: "Add",
  remove_node: "Remove",
  move_node: "Move",
  update_node: "Edit",
}

function readableOpLabel(opType: string): string {
  return OP_LABELS[opType] ?? opType
}

// =============================================================================
// Types
// =============================================================================

export interface UndoableRepoHandle {
  /** Start a batch — mutations accumulate until endBatch() */
  startBatch(label?: string): void
  /** End the current batch — push accumulated operations as one HistoryEntry */
  endBatch(): void
  /** Set cursor position before the operation */
  setCursor(nodeId: string | null): void
  /** Set cursor position after the operation */
  setCursorAfter(nodeId: string | null): void
  /** Undo the last entry — applies inverse operations via the raw repo */
  undo(): UndoResult
  /** Redo the last undone entry — applies forward operations via the raw repo */
  redo(): UndoResult
  /** Whether undo is available */
  canUndo(): boolean
  /** Whether redo is available */
  canRedo(): boolean
  /** The underlying undo stack */
  readonly stack: UndoStack
}

export interface UndoResult {
  ok: boolean
  cursorNodeId?: string | null
  /** Human-readable label of the operation (e.g., "Delete", "Move cards") */
  label?: string
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create an undoable wrapper around a Repo.
 *
 * Returns:
 * - `repo`: A wrapped Repo whose mutations auto-record operations.
 * - `handle`: Batching/undo/redo API.
 *
 * The wrapped repo proxies all methods to the original repo. Only the four
 * mutation methods (addNode, deleteNode, moveNode, updateNode) are intercepted.
 *
 * IMPORTANT: `handle.undo()` and `handle.redo()` apply operations via the
 * original (raw) repo to avoid re-recording the undo/redo mutations.
 */
export function createUndoableRepo(rawRepo: Repo, undoStack: UndoStack): { repo: Repo; handle: UndoableRepoHandle } {
  // --- Batch state ---
  let batchOps: Operation[] | null = null
  let batchLabel: string | undefined
  let cursorBefore: string | null | undefined
  let cursorAfter: string | null | undefined

  // --- Recording flag: when true, mutations are NOT recorded ---
  let replaying = false

  /** Push a single operation (or accumulate into batch) */
  function recordOp(op: Operation): void {
    if (replaying) return

    if (batchOps !== null) {
      batchOps.push(op)
      return
    }

    // Auto-batch: single mutation = one HistoryEntry
    const entry: HistoryEntry = {
      operations: [op],
      inverseOperations: invertOperations([op]),
      cursorBefore,
      cursorAfter,
      label: undefined,
    }

    undoStack.push({
      label: entry.label ?? readableOpLabel(op.type),
      cursorNodeId: entry.cursorBefore,
      undo: () => applyOps(entry.inverseOperations),
      redo: () => applyOps(entry.operations),
    })

    // Reset cursor state after push
    cursorBefore = undefined
    cursorAfter = undefined
  }

  /** Apply a list of operations to the raw repo (bypassing recording) */
  function applyOps(ops: Operation[]): void {
    replaying = true
    try {
      for (const op of ops) {
        applyOp(rawRepo, op)
      }
    } finally {
      replaying = false
    }
  }

  // --- Build the proxy repo ---
  // We create a Proxy that intercepts only the 4 mutation methods.
  // Everything else passes through to rawRepo.
  const wrappedRepo = new Proxy(rawRepo, {
    get(target, prop, receiver) {
      switch (prop) {
        case "addNode":
          return (parentId: string | null, node: Partial<KNode>): string => {
            // Snapshot before: nothing (node doesn't exist yet)
            const newId = target.addNode(parentId, node)

            // After addNode, read the full node to get final parent_idx
            const created = target.getNode(newId)
            const parentIdx = created?.parent_idx ?? node.parent_idx ?? 0

            recordOp({
              type: "add_node",
              nodeId: newId,
              parentId,
              parentIdx,
              snapshot: { ...node, id: newId },
            })

            return newId
          }

        case "deleteNode":
          return (id: string): void => {
            // Snapshot BEFORE deletion — critical for undo
            const existing = target.getNode(id)
            if (!existing) {
              target.deleteNode(id)
              return
            }

            // Capture full subtree (descendants) for recursive restore
            const descendants = collectDescendants(target, id)

            const parentId = existing.parent_id ?? null
            const parentIdx = existing.parent_idx ?? 0

            target.deleteNode(id)

            recordOp({
              type: "remove_node",
              nodeId: id,
              parentId,
              parentIdx,
              snapshot: { ...existing },
              descendants,
            })
          }

        case "moveNode":
          return (id: string, newParentId: string, position: number): void => {
            // Snapshot before: current position
            const existing = target.getNode(id)
            const fromParentId = existing?.parent_id ?? null
            const fromIdx = existing?.parent_idx ?? 0

            target.moveNode(id, newParentId, position)

            recordOp({
              type: "move_node",
              nodeId: id,
              fromParentId,
              fromIdx,
              toParentId: newParentId,
              toIdx: position,
            })
          }

        case "updateNode":
          return (id: string, changes: Partial<KNode>): void => {
            // Snapshot before: only the fields being changed
            const existing = target.getNode(id)
            const before: Partial<KNode> = {}
            if (existing) {
              for (const key of Object.keys(changes)) {
                const k = key as keyof KNode
                ;(before as Record<string, unknown>)[k] = existing[k]
              }
            }

            target.updateNode(id, changes)

            recordOp({
              type: "update_node",
              nodeId: id,
              before,
              after: { ...changes },
            })
          }

        default:
          return Reflect.get(target, prop, receiver)
      }
    },
  }) as Repo

  // --- Handle ---
  const handle: UndoableRepoHandle = {
    startBatch(label?: string) {
      if (batchOps !== null) {
        log.warn?.("startBatch called while batch already open — closing previous batch")
        this.endBatch()
      }
      batchOps = []
      batchLabel = label
    },

    endBatch() {
      if (batchOps === null) {
        log.warn?.("endBatch called without open batch — ignoring")
        return
      }

      const ops = batchOps
      batchOps = null

      if (ops.length === 0) {
        batchLabel = undefined
        cursorBefore = undefined
        cursorAfter = undefined
        return
      }

      const entry: HistoryEntry = {
        operations: ops,
        inverseOperations: invertOperations(ops),
        cursorBefore,
        cursorAfter,
        label: batchLabel,
      }

      undoStack.push({
        label: entry.label ?? `batch(${ops.length})`,
        cursorNodeId: entry.cursorBefore,
        undo: () => applyOps(entry.inverseOperations),
        redo: () => applyOps(entry.operations),
      })

      batchLabel = undefined
      cursorBefore = undefined
      cursorAfter = undefined
    },

    setCursor(nodeId: string | null) {
      cursorBefore = nodeId
    },

    setCursorAfter(nodeId: string | null) {
      cursorAfter = nodeId
    },

    undo(): UndoResult {
      return undoStack.undo()
    },

    redo(): UndoResult {
      return undoStack.redo()
    },

    canUndo() {
      return undoStack.canUndo()
    },

    canRedo() {
      return undoStack.canRedo()
    },

    get stack() {
      return undoStack
    },
  }

  return { repo: wrappedRepo, handle }
}

// =============================================================================
// Apply Operation
// =============================================================================

/** Apply a single operation to a repo (used during undo/redo replay) */
function applyOp(repo: Repo, op: Operation): void {
  switch (op.type) {
    case "add_node": {
      // Re-add the node with its original ID and properties
      const { id: _id, parent_id: _pid, parent_idx: _pidx, ...rest } = op.snapshot as KNode
      repo.addNode(op.parentId, { ...rest, id: op.nodeId, parent_idx: op.parentIdx })
      break
    }

    case "remove_node": {
      // Delete descendants bottom-up first, then the node itself
      for (const desc of [...op.descendants].reverse()) {
        repo.deleteNode(desc.id)
      }
      repo.deleteNode(op.nodeId)
      break
    }

    case "move_node":
      repo.moveNode(op.nodeId, op.toParentId ?? "", op.toIdx)
      break

    case "update_node":
      repo.updateNode(op.nodeId, op.after)
      break
  }
}

// =============================================================================
// Helpers
// =============================================================================

/** Collect all descendants of a node (depth-first, for snapshot before delete) */
function collectDescendants(repo: Repo, nodeId: string): KNode[] {
  const result: KNode[] = []
  const children = repo.getChildren(nodeId)
  for (const child of children) {
    result.push({ ...child })
    result.push(...collectDescendants(repo, child.id))
  }
  return result
}
