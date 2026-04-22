/**
 * Filesystem Store — wraps the filesystem as a Store-shaped projection boundary.
 *
 * The FS store maintains an in-memory SQLite database that mirrors FS state.
 * It composes existing infrastructure (ChangeHandlers, ReconciliationEngine,
 * BulkSync, WriteQueue, FileSystemWatcher) behind the Store & Observable interface.
 *
 * - peekNode/peekChildIds: read from the internal DB (populated via syncFromFs)
 * - commit: apply changes to the internal DB, then project to FS via ChangeHandlers
 * - onCommit: watch for external FS changes, reconcile into changes, fire callbacks
 */

import { Database } from "bun:sqlite"
import { createLogger } from "loggily"
import { mkdirSync, renameSync, existsSync } from "fs"
import { join } from "path"

import type { KNode, Change } from "@km/core"
import {
  type Store,
  type Observable,
  type CommitMeta,
  type CommitResult,
  type RepoDelta,
  computeDelta,
  mergeDeltas,
  rowToNode,
  SCHEMA,
  createEmitter,
  type Emitter,
  createParsePool,
  type ParsePoolService,
} from "@km/storage"
import { ChangeHandlers, type FsWriteTarget } from "../watch/change-handlers.ts"
import { WriteQueue } from "../watch/writequeue.ts"
import { createOwnershipTracker, type OwnershipTracker } from "../watch/ownership-tracker.ts"
import { createReconciliationEngine, type ReconciliationEngine } from "../watch/reconciliation-engine.ts"
import { wrapEmitterForReconcile, BulkSync } from "../watch/bulk-sync.ts"
import type { BulkSyncDeps, SyncFromFsResult } from "../watch/bulk-sync.ts"
import { FileSystemWatcher } from "../watch/watcher.ts"
import { createIgnoreMatcher, type PatternMatcher } from "../fs/ignore.ts"
import { ulid } from "ulid"

const log = createLogger("km:storage:fs-store")

export interface FsStoreOptions {
  /** Debounce for filesystem watcher in ms (default: 2000) */
  debounceFs?: number
  /** Debounce for write queue in ms (default: 500) */
  debounceWrite?: number
}

/** Extended interface returned by createFsStore */
export interface FsStore extends Store, Observable, AsyncDisposable {
  /** Populate the internal DB from the current filesystem state */
  syncFromFs(): Promise<SyncFromFsResult>
  /** Start watching for filesystem changes (auto-called on first onCommit subscription) */
  startWatching(): void
  /** Flush pending writes to disk */
  flush(): Promise<void>
}

/**
 * Create a filesystem-backed Store & Observable.
 *
 * The returned store wraps a directory as a store-shaped projection boundary:
 * - Reads come from an in-memory SQLite DB synced from the filesystem
 * - Writes project changes as file mutations via the existing ChangeHandlers
 * - External FS changes are detected by the watcher and emitted as commits
 *
 * After creation, call `syncFromFs()` to populate the internal state from disk.
 */
export function createFsStore(repoPath: string, options?: FsStoreOptions): FsStore {
  const debounceFs = options?.debounceFs ?? 2000
  const debounceWrite = options?.debounceWrite ?? 500

  // Ensure the repo directory exists
  if (!existsSync(repoPath)) {
    mkdirSync(repoPath, { recursive: true })
  }

  // Ensure .km directory exists for emitter changes.jsonl
  const kmDir = join(repoPath, ".km")
  if (!existsSync(kmDir)) {
    mkdirSync(kmDir, { recursive: true })
  }

  // Internal in-memory DB mirroring the FS state
  const db = new Database(":memory:")
  db.run(SCHEMA)

  // Emitter for change lifecycle (skipPersist — we don't journal FS store changes)
  const emitter: Emitter = createEmitter({ kmDir, db, skipPersist: true })

  // Ownership tracker for watcher suppression
  const tracker: OwnershipTracker = createOwnershipTracker(db)

  // Write queue for debounced FS writes.
  // The FS store uses the default (unguarded) write implementation — it's
  // an in-memory SQLite projection, not a long-running TUI session, and
  // doesn't need safe-write's external-edit detection. Callers that want
  // CAS-guarded writes go through `withSync`.
  const writeQueue = new WriteQueue({
    debounceMs: debounceWrite,
    onWrite: (path, content) => tracker.recordWrite(path, content),
    onDelete: (path) => tracker.recordDelete(path),
  })

  // File watcher
  const watcher = new FileSystemWatcher({ debounceMs: debounceFs })
  writeQueue.setWatcher(watcher)

  // Reconciliation engine (FS→DB)
  const reconcileEmitter = wrapEmitterForReconcile(emitter)
  const engine: ReconciliationEngine = createReconciliationEngine({
    db,
    repoPath,
    tracker,
    writeQueue,
    reconcileEmitter,
  })

  // FS write target for ChangeHandlers (DB→FS projection)
  const fsTarget: FsWriteTarget = {
    writeFile: (absPath, content, changeId) => {
      writeQueue.queue({ path: absPath, content, sourceEventId: changeId || "" })
    },
    deleteFile: (absPath, changeId) => {
      writeQueue.queueDelete(absPath, changeId || "")
    },
    renameFile: (oldPath, newPath) => {
      renameSync(oldPath, newPath)
    },
    mkdir: (absPath) => {
      mkdirSync(absPath, { recursive: true })
    },
    markInFlight: (absPath) => watcher.markInFlight(absPath),
    clearInFlight: (absPath, delayMs) => watcher.clearInFlight(absPath, delayMs),
    recordWriteToken: (absPath, content) => tracker.recordWrite(absPath, content),
    renamePending: (oldPath, newPath) => writeQueue.renamePending(oldPath, newPath),
    renamePendingSubtree: (oldPrefix, newPrefix) => writeQueue.renamePendingSubtree(oldPrefix, newPrefix),
    dropPending: (path) => writeQueue.dropPending(path),
  }

  const handlers = new ChangeHandlers(db, repoPath, emitter, fsTarget)

  // Commit listeners (for onCommit)
  const listeners = new Set<(result: CommitResult) => void>()

  // Ignore matcher for reconciliation (pre-compiled patterns)
  let ignoreMatcher: PatternMatcher | undefined

  // Mutable state
  let watcherStarted = false
  let stopped = false
  let parsePool: ParsePoolService | undefined

  // Wire up watcher → reconciliation → onCommit
  watcher.on("sync", (data: { paths: string[]; directories: string[] }) => {
    if (stopped) return
    void handleFsSync(data)
  })

  async function handleFsSync(data: { paths: string[]; directories: string[] }): Promise<void> {
    // Build a delta from reconciliation ops
    const nodeIds = new Set<string>()
    const parentIds = new Set<string>()
    const deletedNodeIds = new Set<string>()
    const linkHostIds = new Set<string>()
    const linkTargetHrefs = new Set<string>()

    for (const dir of data.directories) {
      if (stopped) break
      try {
        const ops = await engine.reconcileAsync(dir, ignoreMatcher!)
        if (ops.length > 0 && !stopped) {
          if (!parsePool) {
            parsePool = createParsePool()
            await parsePool.start()
          }
          const applyResult = await engine.applyOpsAsync(ops, parsePool)
          for (const id of applyResult.hostIds) linkHostIds.add(id)
          for (const href of applyResult.targetHrefs) linkTargetHrefs.add(href)

          // Build delta from ops
          for (const op of ops) {
            if (op.nodeId) {
              if (op.type === "delete") {
                deletedNodeIds.add(op.nodeId)
              } else {
                nodeIds.add(op.nodeId)
              }
            }
          }
        }
      } catch (error) {
        log.error?.(`reconcile failed for ${dir}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    const hasNodeChanges = nodeIds.size > 0 || deletedNodeIds.size > 0
    const hasLinkChanges = linkHostIds.size > 0 || linkTargetHrefs.size > 0
    if (hasNodeChanges || hasLinkChanges) {
      const delta: RepoDelta = {
        nodeIds: [...nodeIds],
        parentIds: [...parentIds],
        deletedNodeIds: [...deletedNodeIds],
      }
      if (hasLinkChanges) {
        delta.linkChanges = {
          hostIds: [...linkHostIds],
          targetHrefs: [...linkTargetHrefs],
        }
      }
      const commitResult: CommitResult = {
        meta: { commitId: ulid(), source: "fs-import" },
        changes: [], // FS reconciliation doesn't produce discrete events
        delta,
      }
      for (const cb of listeners) cb(commitResult)
    }
  }

  // Subscribe to apply() to project user-origin changes to FS
  const unsubApply = emitter.onApply((change, emitOptions) => {
    if (emitOptions.source !== "fs-import") {
      handlers.applyChangeToFs(change)
    }
  })

  // BulkSync deps (shared by syncFromFs and syncToFs)
  function getBulkSyncDeps(): BulkSyncDeps {
    return {
      db,
      repoPath,
      writeQueue,
      emitter,
      createBlockIdAssigner: (eventId: string) => handlers.createBlockIdAssigner(eventId),
      tracker,
    }
  }

  const store: FsStore = {
    peekNode(id: string): KNode | null {
      const row = db.query("SELECT * FROM nodes WHERE id = ?").get(id) as Record<string, unknown> | null
      if (!row) return null
      return rowToNode(row)
    },

    peekChildIds(parentId: string): readonly string[] {
      const rows = db
        .query("SELECT id FROM nodes WHERE parent_id = ? ORDER BY parent_idx, created_at")
        .all(parentId) as { id: string }[]
      return rows.map((r) => r.id)
    },

    commit(changes: readonly Omit<Change, "id" | "ts">[], meta?: Partial<CommitMeta>): CommitResult {
      const applied: Change[] = []
      for (const partial of changes) {
        const change = emitter.apply(partial, { source: meta?.source ?? "local" })
        applied.push(change)
      }

      const delta = mergeDeltas(applied)
      const commitId = meta?.commitId ?? ulid()
      const commitResult: CommitResult = {
        meta: {
          ...meta,
          commitId,
          source: meta?.source ?? "local",
        },
        changes: applied,
        delta,
      }

      for (const cb of listeners) cb(commitResult)
      return commitResult
    },

    onCommit(cb: (result: CommitResult) => void): () => void {
      listeners.add(cb)

      // Auto-start the watcher on first subscription
      if (!watcherStarted && !stopped) {
        store.startWatching()
      }

      return () => listeners.delete(cb)
    },

    async syncFromFs(): Promise<SyncFromFsResult> {
      return BulkSync.fromFs(getBulkSyncDeps())
    },

    startWatching(): void {
      if (watcherStarted || stopped) return
      watcherStarted = true
      ignoreMatcher = createIgnoreMatcher(repoPath)
      watcher.start(repoPath)
    },

    async flush(): Promise<void> {
      await writeQueue.flush()
    },

    async [Symbol.asyncDispose](): Promise<void> {
      stopped = true
      unsubApply()
      if (watcherStarted) {
        await watcher.stop()
      }
      await writeQueue.flush()
      if (parsePool) {
        await parsePool[Symbol.asyncDispose]()
        parsePool = undefined
      }
      emitter.close()
      db.close()
    },
  }

  return store
}
