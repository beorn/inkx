/**
 * Operation Log — records every Operation for undo/collaboration/replay.
 *
 * In-memory append-only log. Each entry is a batch of operations with metadata.
 * Supports sequence-based filtering for incremental sync.
 */

import type { Operation } from "./operations.ts"
import { applyOperation } from "./operations.ts"
import type { TreeMutator } from "./block-ops.ts"

// =============================================================================
// Types
// =============================================================================

export interface OperationEntry {
  seq: number
  ops: Operation[]
  timestamp: number
  source?: string // "user" | "undo" | "redo" | "sync" | "normalize"
}

export interface OperationLog {
  /** Append operations from a completed batch. */
  append(ops: Operation[], metadata?: { source?: string; timestamp?: number }): void

  /** Get all operations (for replay). */
  getAll(): OperationEntry[]

  /** Get operations since a sequence number (exclusive). */
  getSince(seq: number): OperationEntry[]

  /** Current sequence number (0 if empty). */
  seq(): number

  /** Clear the log. */
  clear(): void
}

// =============================================================================
// Factory
// =============================================================================

export function createOperationLog(): OperationLog {
  const entries: OperationEntry[] = []
  let nextSeq = 1

  return {
    append(ops, metadata) {
      if (ops.length === 0) return
      entries.push({
        seq: nextSeq++,
        ops: [...ops],
        timestamp: metadata?.timestamp ?? Date.now(),
        source: metadata?.source,
      })
    },

    getAll() {
      return entries.slice()
    },

    getSince(seq) {
      return entries.filter((e) => e.seq > seq)
    },

    seq() {
      return entries.length > 0 ? entries[entries.length - 1]!.seq : 0
    },

    clear() {
      entries.length = 0
    },
  }
}

// =============================================================================
// Replay
// =============================================================================

/**
 * Replay operations from a log onto a tree.
 * If fromSeq is provided, only replays entries after that sequence number.
 */
export function replay(tree: TreeMutator, log: OperationLog, fromSeq?: number): void {
  const entries = fromSeq != null ? log.getSince(fromSeq) : log.getAll()
  for (const entry of entries) {
    for (const op of entry.ops) {
      applyOperation(tree, op)
    }
  }
}
