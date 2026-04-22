/**
 * Reconciliation Engine
 *
 * Handles FS→DB reconciliation: scanning the filesystem for changes,
 * filtering out owned writes, and recording observations after successful ops.
 *
 * Extracted from withSync to separate reconciliation concerns from
 * watcher lifecycle, heartbeat scheduling, and event wiring.
 */

import { createLogger } from "loggily"
import { readFileSync } from "fs"
import { join } from "path"
import type { Database } from "bun:sqlite"

const log = createLogger("km:storage:watch:reconcile-engine")

import {
  reconcileDirectory,
  reconcileDirectoryAsync,
  applyReconcileOps,
  applyReconcileOpsAsync,
  type ReconcileOp,
} from "./reconcile.ts"
import type { OwnershipTracker } from "./ownership-tracker.ts"
import type { WriteQueue } from "./writequeue.ts"
import type { Emitter, ParsePoolService } from "@km/storage"
import type { PatternMatcher } from "../fs/ignore.ts"

export interface ReconciliationEngineConfig {
  db: Database
  repoPath: string
  tracker: OwnershipTracker
  writeQueue: WriteQueue
  reconcileEmitter: Emitter
}

export interface ReconciliationResult {
  opsCount: number
  duration: number
}

/**
 * Create a reconciliation engine.
 *
 * Encapsulates all FS→DB reconciliation logic:
 * - Owned-write detection (via OwnershipTracker — two-tier L1/L2)
 * - Pending-write filtering (WriteQueue paths)
 * - Observation recording after successful ops
 */
export function createReconciliationEngine(config: ReconciliationEngineConfig) {
  const { db, repoPath, tracker, writeQueue, reconcileEmitter } = config

  /**
   * Check if a delete op was caused by us. Delete ops use relative paths,
   * so we resolve to absolute for lookup against tracker (which stores abs paths).
   * Consumes the tombstone on match (one-shot).
   */
  function isOwnedDelete(relPath: string): boolean {
    const absPath = join(repoPath, relPath)

    // Tier 1: in-memory delete tombstone (hot path)
    if (tracker.consumeDelete(absPath)) return true

    // Tier 2: pending delete in WriteQueue (pre-flush)
    // Already covered by pendingPaths check in filterOwnedWriteOps,
    // but pendingPaths uses abs paths and delete ops use rel paths,
    // so we check explicitly here.
    const pendingPaths = writeQueue.getPendingPaths()
    if (pendingPaths.has(absPath)) return true

    return false
  }

  /**
   * Filter reconcile ops to exclude files we wrote or have pending writes for.
   *
   * Four suppression layers:
   * 1. tracker L1 — in-memory content-hash tracking of files we wrote (post-flush)
   * 2. tracker L2 — persisted content-hash baseline (survives restarts, falls back on L1 miss)
   * 3. pendingPaths — files currently in the WriteQueue awaiting flush (pre-flush)
   * 4. tracker delete tombstones — in-memory tombstone for files we deleted (post-flush)
   *
   * Layer 3 is critical for the delete-noop bug (km-tui.delete-noop): after deleting
   * a node, the parent file is queued for regeneration. Before the WriteQueue flushes,
   * the old file content is still on disk. Without this check, reconciliation would
   * re-parse the stale file and re-create the deleted node.
   *
   * Layer 4 prevents the watcher from reconciling our own deletes: when km deletes
   * a file via WriteQueue, the watcher sees the unlink and generates a delete op.
   * Without this check, the delete op would re-emit node_deleted for an already-deleted node.
   */
  function filterOwnedWriteOps(ops: ReconcileOp[]): ReconcileOp[] {
    const pendingPaths = writeQueue.getPendingPaths()
    const filtered = ops.filter((op) => {
      // Delete ops use relative paths — check via dedicated delete ownership
      if (op.type === "delete") {
        return !isOwnedDelete(op.path)
      }
      // Create/update/rename ops use absolute paths
      return !tracker.isOwnedWrite(op.path) && !pendingPaths.has(op.path)
    })
    const skipped = ops.length - filtered.length
    if (skipped > 0) {
      log.debug?.(`reconcile: skipped ${skipped} ops for owned-write or pending-write files`)
    }
    return filtered
  }

  /**
   * Record observations in sync_state for successfully reconciled ops.
   * After reconciliation applies ops to the DB, record the current file
   * content as our baseline so future reconciliations know it's not external.
   */
  function recordObservationsForOps(ops: ReconcileOp[]): void {
    for (const op of ops) {
      try {
        switch (op.type) {
          case "create":
          case "update": {
            const content = readFileSync(op.path, "utf-8")
            tracker.recordObservation(op.path, content, op.nodeId)
            break
          }
          case "rename":
            if (op.oldPath) {
              tracker.renamePath(op.oldPath, op.path)
            }
            break
          case "delete":
            tracker.removePath(op.path)
            break
        }
      } catch {
        // File may have been deleted between reconciliation and observation recording.
        // This is benign — the next reconciliation will handle it.
      }
    }
  }

  return {
    /**
     * Synchronous reconciliation for a single directory.
     * Returns filtered ops (owned writes and pending writes excluded).
     */
    reconcile(dirPath: string, ignorePatterns: string[] | PatternMatcher): ReconcileOp[] {
      const rawOps = reconcileDirectory(db, dirPath, repoPath, ignorePatterns)
      return filterOwnedWriteOps(rawOps)
    },

    /**
     * Async reconciliation for a single directory.
     * Returns filtered ops (owned writes and pending writes excluded).
     */
    async reconcileAsync(dirPath: string, ignorePatterns: string[] | PatternMatcher): Promise<ReconcileOp[]> {
      const rawOps = await reconcileDirectoryAsync(db, dirPath, repoPath, ignorePatterns)
      return filterOwnedWriteOps(rawOps)
    },

    /**
     * Apply reconciled ops to the DB synchronously and record observations.
     */
    applyOps(ops: ReconcileOp[]): void {
      applyReconcileOps(db, ops, repoPath, reconcileEmitter)
      recordObservationsForOps(ops)
    },

    /**
     * Apply reconciled ops to the DB asynchronously and record observations.
     */
    async applyOpsAsync(ops: ReconcileOp[], parsePool: ParsePoolService): Promise<void> {
      await applyReconcileOpsAsync({
        db,
        ops,
        repoRoot: repoPath,
        emitter: reconcileEmitter,
        parsePool,
      })
      recordObservationsForOps(ops)
    },

    /**
     * Filter ops — exposed for syncFromFs which collects ops from multiple dirs
     * before applying them in a transaction.
     */
    filterOwnedWriteOps,

    /**
     * Record observations — exposed for syncFromFs batch apply path.
     */
    recordObservationsForOps,
  }
}

export type ReconciliationEngine = ReturnType<typeof createReconciliationEngine>
