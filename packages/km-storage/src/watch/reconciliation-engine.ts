/**
 * Reconciliation Engine
 *
 * Handles FS→DB reconciliation: scanning the filesystem for changes,
 * filtering out owned writes, and recording observations after successful ops.
 *
 * Extracted from SyncManager to separate reconciliation concerns from
 * watcher lifecycle, heartbeat scheduling, and event wiring.
 */

import { createLogger } from "loggily"
import { readFileSync } from "fs"
import type { Database } from "bun:sqlite"

const log = createLogger("km:storage:watch:reconcile-engine")

import {
  reconcileDirectory,
  reconcileDirectoryAsync,
  applyReconcileOps,
  applyReconcileOpsAsync,
  type ReconcileOp,
} from "./reconcile.ts"
import type { WriteTokenMap } from "./write-tokens.ts"
import type { SyncState as SyncStateStore } from "./sync-state.ts"
import type { WriteQueue } from "./writequeue.ts"
import type { Emitter } from "../emitter.ts"
import type { ParsePoolService } from "../parse-pool.ts"
import type { PatternMatcher } from "../ignore.ts"

export interface ReconciliationEngineConfig {
  db: Database
  repoPath: string
  writeTokens: WriteTokenMap
  syncState: SyncStateStore
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
 * - Owned-write detection (two-tier: WriteTokenMap + syncState)
 * - Pending-write filtering (WriteQueue paths)
 * - Observation recording after successful ops
 */
export function createReconciliationEngine(config: ReconciliationEngineConfig) {
  const { db, repoPath, writeTokens, syncState, writeQueue, reconcileEmitter } = config

  /**
   * Check if we own a file change. Two-tier lookup:
   * 1. WriteTokenMap (in-memory hot cache) — fast, no DB query
   * 2. syncState (persisted baseline) — survives restarts, requires file content read
   *
   * Returns true if the file content matches what we last wrote.
   */
  function isOwnedWrite(absPath: string): boolean {
    // Tier 1: in-memory cache (fast path)
    if (writeTokens.has(absPath)) return true

    // Tier 2: persisted sync_state (cold path — survives restart)
    try {
      const content = readFileSync(absPath, "utf-8")
      if (syncState.isOurs(absPath, content)) {
        log.debug?.(`syncState hit for ${absPath} (writeToken cache miss, post-restart?)`)
        return true
      }
    } catch {
      // File unreadable (ENOENT, EACCES) — treat as external
    }

    return false
  }

  /**
   * Filter reconcile ops to exclude files we wrote or have pending writes for.
   *
   * Three suppression layers:
   * 1. writeTokens — in-memory content-hash tracking of files we wrote (post-flush)
   * 2. syncState — persisted content-hash baseline (survives restarts, falls back on cache miss)
   * 3. pendingPaths — files currently in the WriteQueue awaiting flush (pre-flush)
   *
   * Layer 3 is critical for the delete-noop bug (km-tui.delete-noop): after deleting
   * a node, the parent file is queued for regeneration. Before the WriteQueue flushes,
   * the old file content is still on disk. Without this check, reconciliation would
   * re-parse the stale file and re-create the deleted node.
   */
  function filterOwnedWriteOps(ops: ReconcileOp[]): ReconcileOp[] {
    const pendingPaths = writeQueue.getPendingPaths()
    const filtered = ops.filter((op) => !isOwnedWrite(op.path) && !pendingPaths.has(op.path))
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
            syncState.recordObservation(op.path, content, op.nodeId)
            break
          }
          case "rename":
            if (op.oldPath) {
              syncState.renamePath(op.oldPath, op.path)
            }
            break
          case "delete":
            syncState.removePath(op.path)
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
    reconcile(
      dirPath: string,
      ignorePatterns: string[] | PatternMatcher,
    ): ReconcileOp[] {
      const rawOps = reconcileDirectory(db, dirPath, repoPath, ignorePatterns)
      return filterOwnedWriteOps(rawOps)
    },

    /**
     * Async reconciliation for a single directory.
     * Returns filtered ops (owned writes and pending writes excluded).
     */
    async reconcileAsync(
      dirPath: string,
      ignorePatterns: string[] | PatternMatcher,
    ): Promise<ReconcileOp[]> {
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
