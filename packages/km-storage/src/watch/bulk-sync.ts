/**
 * BulkSync — standalone bulk sync operations (FS<->DB)
 *
 * Extracted from SyncManager so these operations can be used from
 * both TUI (via SyncManager) and CLI (directly, without watcher lifecycle).
 *
 * BulkSync.fromFs: scan filesystem, reconcile into DB, evaluate rules.
 * BulkSync.toFs: write all DB file nodes to disk.
 */

import { createLogger } from "loggily"
import { dirname } from "path"
import type { Database } from "bun:sqlite"
import { toAbsoluteFsPath } from "../path-utils.ts"
import { scanDirectoryRecursiveGen, type ScanEntry } from "./watcher.ts"
import { reconcileDirectory, applyReconcileOps, type ReconcileOp } from "./reconcile.ts"
import { createIgnoreMatcher } from "../ignore.ts"
import type { Emitter, EmitOptions } from "../emitter.ts"
import type { WriteQueue } from "./writequeue.ts"
import {
  getAllNodes,
  getSubtree,
  nodesToMarkdown,
  evaluateAllRules,
  createRuleContext,
  type StepYield,
} from "../index.ts"

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
 * Block ID assigner — assigns block_id values during serialization
 * and rewrites source files that reference re-assigned blocks.
 */
export interface BlockIdAssigner {
  assign: (nodeId: string, blockId: string) => void
  rewriteSourceFiles: (excludeFileId?: string) => void
}

/** Dependencies for BulkSync operations */
export interface BulkSyncDeps {
  db: Database
  repoPath: string
  writeQueue: WriteQueue
  emitter: Emitter
  createBlockIdAssigner: (eventId: string) => BlockIdAssigner
}

/**
 * Wrap an emitter so all emit() calls use commit() (no filesystem projection).
 * Used for FS-origin reconciliation to prevent echo loops by construction:
 * FS change -> DB update -> commit (no project) -> no write back to FS.
 *
 * This is the structural loop break: reconciliation never projects.
 */
export function wrapEmitterForReconcile(emitter: Emitter): Emitter {
  return {
    ...emitter,
    emit(event: Parameters<Emitter["emit"]>[0], options: EmitOptions = {}) {
      // Use commit() directly — structurally prevents echo loops
      return emitter.commit(event, options)
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
  async *fromFsWithProgress(deps: BulkSyncDeps): AsyncGenerator<StepYield, SyncFromFsResult> {
    const { db, repoPath, writeQueue, emitter, createBlockIdAssigner } = deps
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

      scanCount++
      if (scanCount % 25 === 0) {
        yield { current: scanCount, total: 0 }
      }
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
          const blockIds = createBlockIdAssigner("rule-evaluation")
          const absPath = toAbsoluteFsPath(repoPath, filePath)
          const subtree = getSubtree(db, fileNode.id)
          const content = nodesToMarkdown(subtree, getAllNodes(db), blockIds.assign)
          writeQueue.queue({
            path: absPath,
            content,
            sourceEventId: "rule-evaluation",
          })
          blockIds.rewriteSourceFiles(fileNode.id)
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
    const { db, repoPath, writeQueue, createBlockIdAssigner } = deps
    log.debug?.("toFs: starting")
    const start = Date.now()

    const nodes = getAllNodes(db)
    const fileNodes = nodes.filter(
      (n) => n.type === "h" && n.item && n.fstype === "mdfile" && n.fs_path?.endsWith(".md"),
    )

    log.debug?.(`toFs: writing ${fileNodes.length} files`)

    for (const fileNode of fileNodes) {
      if (!fileNode.fs_path) continue
      const blockIds = createBlockIdAssigner("sync-to-fs")
      const absPath = toAbsoluteFsPath(repoPath, fileNode.fs_path)
      const subtree = getSubtree(db, fileNode.id)
      const content = nodesToMarkdown(subtree, nodes, blockIds.assign)

      writeQueue.queue({
        path: absPath,
        content,
        sourceEventId: "sync-to-fs",
      })
      blockIds.rewriteSourceFiles(fileNode.id)
    }

    await writeQueue.forceFlush()

    log.debug?.(`toFs: wrote ${fileNodes.length} files in ${Date.now() - start}ms`)
    return { written: fileNodes.length }
  },
}
