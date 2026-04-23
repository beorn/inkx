/**
 * BulkSync — standalone bulk sync operations (FS<->DB)
 *
 * Standalone bulk sync operations, usable from both TUI (via withSync)
 * and CLI (directly, without watcher lifecycle).
 *
 * BulkSync.fromFs: scan filesystem, reconcile into DB, evaluate rules.
 * BulkSync.toFs: write all DB file nodes to disk.
 */

import { createLogger } from "loggily"
import { dirname } from "path"
import { readFileSync } from "fs"
import type { Database } from "bun:sqlite"
import { toAbsoluteFsPath } from "../fs/path-utils.ts"
import { scanDirectoryRecursiveGen, type ScanEntry } from "./watcher.ts"
import { reconcileDirectory, applyReconcileOps, type ReconcileOp } from "./reconcile.ts"
import { createIgnoreMatcher } from "../fs/ignore.ts"
import {
  type Emitter,
  type EmitOptions,
  getAllNodes,
  getSubtree,
  nodesToMarkdown,
  evaluateAllRules,
  createRuleContext,
  type StepYield,
} from "@km/storage"
import type { WriteQueue } from "./writequeue.ts"
import type { OwnershipTracker } from "./ownership-tracker.ts"

const log = createLogger("km:storage:watch:bulk-sync")

/** Progress info for sync operations */
export interface SyncProgress {
  phase: string
  current: number
  total: number
}

/** Callback for sync progress reporting */
export type SyncProgressCallback = (info: SyncProgress) => void

/** Result from fromFs */
export interface SyncFromFsResult {
  processed: number
  directories: number
  duration: number
}

/**
 * Anchor assigner — assigns anchor literals (`^abc`) during serialization.
 * Post-v6 the anchor is written to `.name` (storage-architecture §2.3);
 * `rewriteSourceFiles` propagates the new anchor to source files.
 */
export interface AnchorAssigner {
  assign: (nodeId: string, anchor: string) => void
  rewriteSourceFiles: (excludeFileId?: string) => void
}

/** Dependencies for BulkSync operations */
export interface BulkSyncDeps {
  db: Database
  repoPath: string
  writeQueue: WriteQueue
  emitter: Emitter
  createAnchorAssigner: (eventId: string) => AnchorAssigner
  /**
   * OwnershipTracker for recording sync_state baselines after reconciliation.
   * When provided, BulkSync.fromFs records the hash of each file it reconciles
   * so future writes can detect external edits via hash-based conflict check.
   * Optional for backwards compatibility.
   */
  tracker?: OwnershipTracker
}

/**
 * Wrap an emitter so all apply() calls use commit() (no filesystem save).
 * Used for FS-origin reconciliation to prevent echo loops by construction:
 * FS change -> DB update -> commit (no save) -> no write back to FS.
 *
 * This is the structural loop break: reconciliation never saves.
 */
export function wrapEmitterForReconcile(emitter: Emitter): Emitter {
  return {
    ...emitter,
    apply(change: Parameters<Emitter["apply"]>[0], options: EmitOptions = {}) {
      // Use commit() directly — structurally prevents echo loops
      return emitter.commit(change, options)
    },
  }
}

/**
 * BulkSync — namespace for standalone bulk sync operations.
 */
export const BulkSync = {
  /**
   * Sync from filesystem to DB with optional progress callback.
   * Wraps fromFsWithProgress into a simple async call.
   */
  async fromFs(deps: BulkSyncDeps, onProgress?: SyncProgressCallback): Promise<SyncFromFsResult> {
    const gen = BulkSync.fromFsWithProgress(deps)
    let result = await gen.next()
    let currentPhase = "Syncing"
    while (!result.done) {
      const value = result.value
      if (typeof value === "string") {
        currentPhase = value
        onProgress?.({ phase: value, current: 0, total: 0 })
      } else if ("current" in value || "total" in value) {
        onProgress?.({
          phase: currentPhase,
          current: value.current ?? 0,
          total: value.total ?? 0,
        })
      }
      result = await gen.next()
    }
    return result.value
  },

  /**
   * Sync from filesystem to DB as an async generator (3-phase: scan, reconcile, rules).
   * Yields progress updates as StepYield values.
   */
  // oxlint-disable-next-line complexity/complexity -- 3-phase sync generator: scan (ignore matching, file discovery), reconcile (per-file parse + DB upsert, anchor assignment, echo guard), rules (projection, emit); each phase has independent error paths — splitting would lose the yielded progress contract
  async *fromFsWithProgress(deps: BulkSyncDeps): AsyncGenerator<StepYield, SyncFromFsResult> {
    const { db, repoPath, writeQueue, emitter, createAnchorAssigner, tracker } = deps
    log.debug?.(`fromFs: scanning ${repoPath}`)
    const start = Date.now()

    const ignoreMatcher = createIgnoreMatcher(repoPath)

    yield { declare: ["Scanning", "Reconciling", "Rules"] }

    // Phase 1: Scanning
    yield "Scanning"

    const entries: ScanEntry[] = []
    const dirToFiles = new Map<string, ScanEntry[]>()
    let scanCount = 0

    for (const entry of scanDirectoryRecursiveGen(repoPath, (path) => path.endsWith(".md"), ignoreMatcher)) {
      entries.push(entry)
      const dir = dirname(entry.path)
      const files = dirToFiles.get(dir) ?? []
      files.push(entry)
      dirToFiles.set(dir, files)

      // Ensure all ancestor directories up to (but not including) repoPath are reconciled.
      // Without this, directories that don't directly contain .md files are never
      // discovered (e.g., empty sibling folders, intermediate parent directories).
      let ancestor = dirname(dir)
      while (ancestor.length >= repoPath.length && !dirToFiles.has(ancestor)) {
        dirToFiles.set(ancestor, [])
        ancestor = dirname(ancestor)
      }

      scanCount++
      if (scanCount % 25 === 0) {
        yield { current: scanCount, total: 0 }
      }
    }

    // Always reconcile the repo root to discover top-level directories/files
    if (!dirToFiles.has(repoPath)) {
      dirToFiles.set(repoPath, [])
    }

    const totalFiles = entries.length
    log.debug?.(`fromFs: found ${totalFiles} files`)
    yield { current: totalFiles, total: totalFiles }

    // Phase 2: Reconciling
    yield "Reconciling"

    const allOps: ReconcileOp[] = []
    for (const dir of dirToFiles.keys()) {
      const ops = reconcileDirectory(db, dir, repoPath, ignoreMatcher)
      allOps.push(...ops)
    }

    // De-duplicate cross-directory rename + delete pairs.
    //
    // The per-directory reconcile loop above doesn't share state across
    // directories, so a cross-dir rename detected via inode-primary in one
    // dir's reconcile can collide with a stale "Remaining = deleted" op in
    // the source dir's reconcile (the source dir sees the file is missing
    // and emits delete; the destination dir sees the inode and emits rename).
    // Both ops target the same DB nodeId — the rename should win, the
    // delete must be dropped.
    //
    // reconcileDirectoryRecursive avoids this via shared ReconcileState
    // (claimedNodeIds), but bulk-sync uses the flat per-dir loop because the
    // scan was done up-front; threading state would require restructuring.
    // De-duping post-hoc is the pragmatic fix.
    const renamedNodeIds = new Set<string>()
    for (const op of allOps) {
      if (op.type === "rename" && op.nodeId) renamedNodeIds.add(op.nodeId)
    }
    if (renamedNodeIds.size > 0) {
      const filtered: ReconcileOp[] = []
      for (const op of allOps) {
        if (op.type === "delete" && op.nodeId && renamedNodeIds.has(op.nodeId)) {
          log.debug?.(`bulk-sync: dropping delete op for renamed node ${op.nodeId} (path=${op.path})`)
          continue
        }
        filtered.push(op)
      }
      allOps.length = 0
      allOps.push(...filtered)
    }

    const BATCH_SIZE = 25
    const totalOps = allOps.length || 1
    let opsProcessed = 0
    const reconcileEmitter = wrapEmitterForReconcile(emitter)

    db.run("BEGIN IMMEDIATE")
    try {
      for (let i = 0; i < allOps.length; i += BATCH_SIZE) {
        const batch = allOps.slice(i, i + BATCH_SIZE)
        applyReconcileOps(db, batch, repoPath, reconcileEmitter)
        opsProcessed += batch.length
        yield { current: opsProcessed, total: totalOps }
      }
      db.run("COMMIT")
    } catch (error) {
      db.run("ROLLBACK")
      throw error
    }

    // Record sync_state baselines so future writes can detect external edits
    // via hash-based conflict detection. Done outside the transaction since
    // sync_state is a separate concern from node tree state.
    if (tracker) {
      for (const op of allOps) {
        try {
          if (op.type === "create" || op.type === "update") {
            const content = readFileSync(op.path, "utf-8")
            tracker.recordObservation(op.path, content, op.nodeId)
          } else if (op.type === "rename" && op.oldPath) {
            tracker.renamePath(op.oldPath, op.path)
          } else if (op.type === "delete") {
            tracker.removePath(op.path)
          }
        } catch (err) {
          log.debug?.(`recordObservation failed path=${op.path}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    }

    if (allOps.length === 0) {
      yield { current: 1, total: 1 }
    }

    // Phase 3: Rules
    yield "Rules"
    const ruleCtx = createRuleContext()
    for (const progress of evaluateAllRules(db, ruleCtx)) {
      yield { current: progress.current, total: progress.total }
    }

    const pendingFiles = Array.from(ruleCtx.pendingWriteBack)
    if (pendingFiles.length > 0) {
      log.debug?.(`fromFs: writing back ${pendingFiles.length} files after rule evaluation`)
      for (const filePath of pendingFiles) {
        if (!filePath.endsWith(".md")) {
          log.debug?.(`fromFs: SKIPPING non-.md file in write-back filePath=${filePath}`)
          continue
        }

        const fileNode = getAllNodes(db).find((n) => n.fs_path === filePath)
        if (fileNode) {
          const anchors = createAnchorAssigner("rule-evaluation")
          const absPath = toAbsoluteFsPath(repoPath, filePath)
          const subtree = getSubtree(db, fileNode.id)
          const content = nodesToMarkdown(subtree, getAllNodes(db), anchors.assign)
          writeQueue.queue({
            path: absPath,
            content,
            sourceEventId: "rule-evaluation",
          })
          anchors.rewriteSourceFiles(fileNode.id)
        }
      }
      await writeQueue.forceFlush()
    }

    const duration = Date.now() - start
    const dirCount = dirToFiles.size
    log.debug?.(`fromFs: processed ${opsProcessed} ops in ${dirCount} dirs in ${duration}ms`)
    return { processed: opsProcessed, directories: dirCount, duration }
  },

  /**
   * Sync from DB to filesystem — write all file nodes to disk.
   */
  async toFs(deps: BulkSyncDeps): Promise<{ written: number }> {
    const { db, repoPath, writeQueue, createAnchorAssigner } = deps
    log.debug?.("toFs: starting")
    const start = Date.now()

    const nodes = getAllNodes(db)
    const fileNodes = nodes.filter(
      (n) => n.type === "h" && n.item && n.fstype === "mdfile" && n.fs_path?.endsWith(".md"),
    )

    log.debug?.(`toFs: writing ${fileNodes.length} files`)

    for (const fileNode of fileNodes) {
      if (!fileNode.fs_path) continue
      const anchors = createAnchorAssigner("sync-to-fs")
      const absPath = toAbsoluteFsPath(repoPath, fileNode.fs_path)
      const subtree = getSubtree(db, fileNode.id)
      const content = nodesToMarkdown(subtree, nodes, anchors.assign)

      writeQueue.queue({
        path: absPath,
        content,
        sourceEventId: "sync-to-fs",
      })
      anchors.rewriteSourceFiles(fileNode.id)
    }

    await writeQueue.forceFlush()

    log.debug?.(`toFs: wrote ${fileNodes.length} files in ${Date.now() - start}ms`)
    return { written: fileNodes.length }
  },
}
