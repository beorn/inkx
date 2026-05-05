/**
 * Sync — Decorator-based bidirectional sync between filesystem and database.
 *
 * Orchestrates reconciliation (FS→DB) via ReconciliationEngine,
 * projection (DB→FS) via ChangeHandlers, and bulk sync via BulkSync.
 *
 * Usage: const syncedRepo = withSync({ debounceFs: 2000 })(repo)
 */

import { createLogger } from "loggily"
import { mkdirSync, renameSync, statSync } from "fs"
import type { Database } from "bun:sqlite"

const log = createLogger("km:storage:watch:sync")
import { FileSystemWatcher } from "./watcher.ts"
import { WorkerWatcher } from "./worker-bridge.ts"
import type { WatcherStatus } from "./worker-thread.ts"
import type { WatcherInterface } from "./types.ts"
import {
  createParsePool,
  getNodeByPath,
  type ParsePoolService,
  type Emitter,
  type EmitOptions,
  type StepYield,
} from "@km/storage"
import { WriteQueue, type ConflictInfo, type WriteImpl, type WriteImplResult } from "./writequeue.ts"
export type { ConflictInfo } from "./writequeue.ts"
import { createOwnershipTracker, type OwnershipTracker } from "./ownership-tracker.ts"
import { getIgnorePatterns } from "../fs/ignore.ts"
import { toRelativeFsPath } from "../fs/path-utils.ts"
import { type Change } from "@km/core"
import { ChangeHandlers, type FsWriteTarget } from "./change-handlers.ts"
import { createReconciliationEngine, type ReconciliationEngine } from "./reconciliation-engine.ts"
import { BulkSync, wrapEmitterForReconcile } from "./bulk-sync.ts"
import type { BulkSyncDeps, SyncProgressCallback, SyncFromFsResult } from "./bulk-sync.ts"
export type { SyncProgressCallback, SyncFromFsResult } from "./bulk-sync.ts"
import { createHeartbeat, DEFAULT_HEARTBEAT, type Heartbeat, type HeartbeatConfig } from "./heartbeat.ts"
import { safeWriteFile } from "./safe-write.ts"
import { createEchoGuard, type EchoGuard } from "./echo-guard.ts"

export type { HeartbeatConfig } from "./heartbeat.ts"

// ─── Config ──────────────────────────────────────────────────────────────────

export interface SyncConfig {
  debounceFs: number
  debounceApply: number
  conflictStrategy: "last_write_wins" | "fs_wins" | "db_wins"
  /** Use worker thread for file watching (default: true). Prevents UI blocking on large repos. */
  useWorker?: boolean
  /** Heartbeat reconciliation config */
  heartbeat?: Partial<HeartbeatConfig>
  /** Custom watcher instance (for testing with ChaosWatcher). If provided, useWorker is ignored. */
  watcher?: WatcherInterface
  /** Retry config for WriteQueue (default: maxRetries=3, baseDelayMs=100, maxDelayMs=5000) */
  retry?: {
    maxRetries?: number
    baseDelayMs?: number
    maxDelayMs?: number
  }
  /** Delay before clearing in-flight status after writes, in ms (default: 1000) */
  clearInFlightDelayMs?: number
  /** Typed callbacks replacing EventEmitter events */
  callbacks?: SyncCallbacks
}

const DEFAULT_CONFIG: Partial<SyncConfig> = {
  debounceFs: 5000,
  debounceApply: 3000,
  conflictStrategy: "last_write_wins",
  useWorker: true,
}

// ─── Callbacks (replaces EventEmitter) ───────────────────────────────────────

export interface SyncCallbacks {
  onStarted?: () => void
  onStopped?: () => void
  onReady?: () => void
  onError?: (error: unknown) => void
  onStateChange?: (state: SyncState) => void
  onWriteComplete?: (data: { count: number; errors: number }) => void
  onWriteErrors?: (errors: Array<{ path: string; error: Error; errorClass?: string }>) => void
  /**
   * Fired when `safeWriteFile` detects that the on-disk bytes no longer
   * match the hash km last observed for the file (external edit since
   * km loaded). The write is discarded — disk bytes preserved intact,
   * a `conflict_created` change is emitted, and this callback fires so
   * the TUI can surface a toast asking the user to reconcile manually.
   */
  onConflicts?: (conflicts: ConflictInfo[]) => void
  onWatcherStatus?: (status: WatcherStatus) => void
  onHeartbeatDrift?: (info: { opsCount: number; totalDrift: number }) => void
  onHeartbeatComplete?: (info: { duration: number; opsCount: number }) => void
}

// ─── Sync interface ──────────────────────────────────────────────────────────

export type { SyncState } from "./heartbeat.ts"
import type { SyncState } from "./heartbeat.ts"

export interface Sync {
  start(): void
  stop(): Promise<void>
  applyChangeToFs(change: Change): void
  syncFromFs(onProgress?: SyncProgressCallback): Promise<SyncFromFsResult>
  syncFromFsWithProgress(): AsyncGenerator<StepYield, SyncFromFsResult>
  syncToFs(): Promise<{ written: number }>
  forceHeartbeat(): { opsCount: number; duration: number }
  getState(): SyncState
  getStatus(): { state: SyncState; pendingWrites: number; repoPath: string; watcher?: WatcherStatus }
  getWatcherStatus(): WatcherStatus | null
  getHeartbeatDiagnostics(): { enabled: boolean; totalDrift: number; lastActivityTime: number; idleSinceMs: number }
  waitForInflight(): Promise<void>
  getInFlightCount(): number
  [Symbol.asyncDispose](): Promise<void>
}

// ─── Minimal repo shape required by withSync ────────────────────────────────

/**
 * Minimal repo interface that withSync can decorate.
 *
 * Note: the emitter is **not** part of SyncableRepo. It must be passed
 * explicitly to `withSync(emitter, config?)` — this is a structural
 * invariant that prevents `repo.emitter` drift on the public Repo surface.
 * See bead `@km/storage/sync-emitter-migration`.
 */
export interface SyncableRepo {
  readonly database: Database
  readonly path: string
  apply(change: Omit<Change, "id" | "ts">, options?: EmitOptions): Change
  commit(change: Omit<Change, "id" | "ts">, options?: EmitOptions): Change
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Decorator that adds bidirectional filesystem sync to a repo.
 *
 * The emitter is passed as the first argument — explicit injection,
 * not pulled off the repo surface. This is the L4 plateau move that
 * prevents `repo.emitter` drift: invalid state is impossible by
 * construction, the emitter is wired at decoration-time and closed
 * over privately.
 *
 * @example
 * const syncedRepo = withSync(emitter, { debounceFs: 2000 })(repo)
 * syncedRepo.start()
 * syncedRepo.apply(change) // DB + journal + broadcast + save to FS
 * await syncedRepo.stop()
 */
export function withSync(emitter: Emitter, config?: Partial<SyncConfig>) {
  // oxlint-disable-next-line complexity/complexity -- sync-decorator factory: composes OwnershipTracker, WriteQueue, EchoGuard, Watcher, Reconciler, heartbeat, emitter wiring, FS→DB handlers, DB→FS handlers — each a separate nested closure that must share `cfg`/`db`/`repo` context
  return <R extends SyncableRepo>(repo: R): R & Sync => {
    const cfg = { ...DEFAULT_CONFIG, ...config } as SyncConfig
    const callbacks = cfg.callbacks
    const db = repo.database
    const repoPath = repo.path
    // ── Core services ──────────────────────────────────────────────────────

    const tracker: OwnershipTracker = createOwnershipTracker(db)

    // ── Watcher ────────────────────────────────────────────────────────────

    let watcher: WatcherInterface
    if (cfg.watcher) {
      log.debug?.("using injected watcher")
      watcher = cfg.watcher
    } else if (cfg.useWorker !== false) {
      log.debug?.("using WorkerWatcher (non-blocking)")
      watcher = new WorkerWatcher({ debounceMs: cfg.debounceFs })
    } else {
      log.debug?.("using FileSystemWatcher (direct)")
      watcher = new FileSystemWatcher({ debounceMs: cfg.debounceFs })
    }

    // ── EchoGuard ──────────────────────────────────────────────────────────
    //
    // Two-tier watcher echo suppression (§7.4). `expect()` records our own
    // write's post-stat + content hash; `consume()` classifies incoming
    // watcher events as "echo" (our write coming back) or "external" (a
    // genuine outside edit). Complements the markInFlight fast-path and
    // the reconciliation-engine's owned-write filter — this tier is what
    // catches echoes whose mtime/size shifted after `clearInFlight` fired.

    const echoGuard: EchoGuard = createEchoGuard()

    // ── WriteQueue ─────────────────────────────────────────────────────────
    //
    // `writeImpl` is the CAS-guarded safe-write backend. On every write:
    //   1. Look up the fs_content_hash km last observed for this file (baseline).
    //   2. Call safeWriteFile — atomic write iff current disk bytes match baseline.
    //   3. On "wrote":    update fs_content_hash in the DB + arm echo-guard.
    //      On "noop":     disk is already what we intended; arm echo-guard from disk stat.
    //      On "conflict": DO NOT overwrite. Emit `conflict_created` via the
    //                     emitter so the user sees the divergence, and surface
    //                     ConflictInfo to the "conflicts" event.

    const cfgWriteImpl: WriteImpl = (absPath, content, sourceEventId): WriteImplResult => {
      const relPath = toRelativeFsPath(repoPath, absPath)
      const node = getNodeByPath(db, relPath)
      const expectedHash = node?.fs_content_hash ?? null

      const result = safeWriteFile(absPath, content, { expectedHash })

      if (result.outcome === "conflict") {
        log.warn?.(
          `safe-write conflict: ${absPath} (expected=${expectedHash ?? "<none>"}, actual=${result.actualHashBefore ?? "<missing>"})`,
        )
        // Fire a `conflict_created` change so the emitter persists an audit
        // record and anyone listening to changes sees the divergence. Use
        // source=fs-import so this meta-change isn't re-projected to disk.
        try {
          emitter.apply(
            {
              type: "conflict_created",
              actor: "system",
              data: {
                fs_path: relPath,
                reason: "external_edit_detected",
                expected_hash: expectedHash,
                actual_hash: result.actualHashBefore,
                change_id: sourceEventId,
              },
            },
            { source: "fs-import" },
          )
        } catch (err) {
          log.warn?.(
            `failed to emit conflict_created for ${relPath}: ${err instanceof Error ? err.message : String(err)}`,
          )
        }
        return {
          outcome: "conflict",
          expectedHash,
          actualHashBefore: result.actualHashBefore,
        }
      }

      // "wrote" or "noop" — disk is consistent with `content`. Refresh
      // the stat-tracking fields (fs_content_hash, fs_mtime, fs_size,
      // fs_ino) so the next reconcile sees no drift. Without this, our
      // own writeback drives mtime forward on disk while the DB's
      // fs_mtime stays at the pre-write value — the next `km sync`
      // sees `entry.mtime !== existingByPath.fs_mtime` → emits an
      // update op → re-parses → re-emits node_created/updated/deleted
      // events for every embed line the rule wrote. That's how
      // rule-driven boards leak recomputable shape into the events table.
      // Refreshing the four fields atomically here closes the leak
      // (the @km/storage/dont-journal-rule-derived-events fix).
      //
      // The CAS guard above already validated the on-disk state matches
      // `content`; reading the post-write stat one more time gives us
      // the current mtime/size/ino without a second hash.
      const finalHash = result.newHash ?? result.actualHashBefore
      let postStat: { mtimeMs: number; size: number; ino: number; dev: number } | undefined
      try {
        const stat = statSync(absPath)
        postStat = { mtimeMs: stat.mtimeMs, size: stat.size, ino: stat.ino, dev: stat.dev }
      } catch {
        // stat-after-write failed: the file may have just been deleted
        // by a racing handler. Skip the row update — the next reconcile
        // will tombstone the node anyway.
      }

      try {
        if (postStat) {
          db.run(
            "UPDATE nodes SET fs_content_hash = ?, fs_mtime = ?, fs_size = ?, fs_ino = ?, fs_dev = ? WHERE fs_path = ?",
            [finalHash ?? null, postStat.mtimeMs, postStat.size, postStat.ino, postStat.dev, relPath],
          )
        } else if (finalHash) {
          db.run("UPDATE nodes SET fs_content_hash = ? WHERE fs_path = ?", [finalHash, relPath])
        }
      } catch (err) {
        log.warn?.(`failed to refresh fs_* fields for ${relPath}: ${err instanceof Error ? err.message : String(err)}`)
      }

      // Arm the echo-guard with the post-write stat + content-hash so the
      // watcher event caused by our own write gets classified as "echo"
      // and skipped. Fast-path uses (mtime, size); slow-path falls back
      // to hashing. The 5s TTL self-cleans expired expectations.
      if (postStat) {
        echoGuard.expect(absPath, postStat.mtimeMs, postStat.size, finalHash ?? content, finalHash != null)
      } else {
        echoGuard.expect(absPath, 0, content.length, finalHash ?? content, finalHash != null)
      }

      return {
        outcome: result.outcome,
        expectedHash,
        actualHashBefore: result.actualHashBefore,
        newHash: result.newHash,
      }
    }

    const writeQueue = new WriteQueue({
      debounceMs: cfg.debounceApply,
      retry: cfg.retry,
      clearInFlightDelayMs: cfg.clearInFlightDelayMs,
      writeImpl: cfgWriteImpl,
      onWrite: (path, content) => {
        tracker.recordWrite(path, content)
      },
      onDelete: (path) => {
        tracker.recordDelete(path)
      },
    })
    writeQueue.setWatcher(watcher)

    // ── ReconciliationEngine ───────────────────────────────────────────────

    const reconcileEmitter = wrapEmitterForReconcile(emitter)
    const engine: ReconciliationEngine = createReconciliationEngine({
      db: db,
      repoPath: repoPath,
      tracker,
      writeQueue,
      reconcileEmitter,
      echoGuard,
    })

    // ── Mutable state ──────────────────────────────────────────────────────

    let state: SyncState = "idle"
    let stopped = false
    let ignorePatterns: string[] = []
    let parsePool: ParsePoolService | undefined
    const inFlightSyncs = new Set<Promise<void>>()

    // ── Internal helpers ───────────────────────────────────────────────────

    function setState(newState: SyncState): void {
      if (state !== newState) {
        log.debug?.(`state: ${state} → ${newState}`)
        state = newState
        callbacks?.onStateChange?.(state)
      }
    }

    async function getParsePool(): Promise<ParsePoolService> {
      if (!parsePool) {
        parsePool = createParsePool()
        await parsePool.start()
      }
      return parsePool
    }

    async function handleFsSyncInner(data: { paths: string[]; directories: string[] }): Promise<void> {
      if (stopped) return

      using span = log.span("fs-sync", { paths: data.paths.length, dirs: data.directories.length })
      heartbeat.touchActivity()
      setState("reconciling")

      for (const dir of data.directories) {
        if (stopped) break
        try {
          using dirSpan = span.span("reconcile-dir", { dir })
          const ops = await engine.reconcileAsync(dir, ignorePatterns)
          dirSpan.spanData.ops = ops.length

          if (ops.length > 0 && !stopped) {
            setState("emitting")
            using applySpan = dirSpan.span("apply")
            await engine.applyOpsAsync(ops, await getParsePool())
            applySpan.spanData.ops = ops.length
          }
        } catch (error) {
          if (stopped) return
          span.error?.(`directory ${dir} failed: ${error instanceof Error ? error.message : String(error)}`)
          callbacks?.onError?.(error)
        }
      }
      if (!stopped) {
        heartbeat.touchActivity()
        setState("idle")
      }
    }

    function handleFsSync(data: { paths: string[]; directories: string[] }): void {
      const promise = handleFsSyncInner(data)
      inFlightSyncs.add(promise)
      void promise.finally(() => inFlightSyncs.delete(promise))
    }

    // ── FsWriteTarget (for ChangeHandlers) ──────────────────────────────────

    const fsTarget: FsWriteTarget = {
      writeFile: (absPath: string, content: string, eventId?: string) => {
        writeQueue.queue({ path: absPath, content, sourceEventId: eventId || "" })
      },
      deleteFile: (absPath: string, eventId?: string) => {
        writeQueue.queueDelete(absPath, eventId || "")
      },
      renameFile: (oldPath: string, newPath: string) => {
        renameSync(oldPath, newPath)
      },
      mkdir: (absPath: string) => {
        mkdirSync(absPath, { recursive: true })
      },
      markInFlight: (absPath: string) => {
        watcher.markInFlight(absPath)
      },
      clearInFlight: (absPath: string, delayMs?: number) => {
        watcher.clearInFlight(absPath, delayMs)
      },
      recordWriteToken: (absPath: string, content: string) => {
        tracker.recordWrite(absPath, content)
      },
      recordExternalObservation: (absPath: string, content: string, nodeId?: string) => {
        tracker.recordObservation(absPath, content, nodeId)
      },
      renamePending: (oldPath: string, newPath: string) => {
        return writeQueue.renamePending(oldPath, newPath)
      },
      renamePendingSubtree: (oldPrefix: string, newPrefix: string) => {
        return writeQueue.renamePendingSubtree(oldPrefix, newPrefix)
      },
      dropPending: (path: string) => {
        return writeQueue.dropPending(path)
      },
    }

    const handlers = new ChangeHandlers(db, repoPath, emitter, fsTarget)

    // ── Heartbeat ──────────────────────────────────────────────────────────

    const heartbeat: Heartbeat = createHeartbeat(
      { ...DEFAULT_HEARTBEAT, ...cfg.heartbeat },
      {
        engine,
        tracker,
        writeQueue,
        db: db,
        repoPath: repoPath,
        ignorePatterns: () => ignorePatterns,
        getParsePool: () => getParsePool(),
        getState: () => state,
        setState: (s) => setState(s),
        isStopped: () => stopped,
        onError: (error) => callbacks?.onError?.(error),
        onDrift: (info) => callbacks?.onHeartbeatDrift?.(info),
        onComplete: (info) => callbacks?.onHeartbeatComplete?.(info),
      },
    )

    // ── Wire up watcher & writeQueue events ────────────────────────────────

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Watcher event data is untyped
    watcher.on("sync", (data) => handleFsSync(data))
    watcher.on("error", (error) => callbacks?.onError?.(error))
    watcher.on("ready", () => callbacks?.onReady?.())

    if (watcher instanceof WorkerWatcher) {
      watcher.on("status", (status: WatcherStatus) => {
        callbacks?.onWatcherStatus?.(status)
      })
    }

    writeQueue.on("flushed", (data) => callbacks?.onWriteComplete?.(data as { count: number; errors: number }))
    writeQueue.on("errors", (errors) => {
      callbacks?.onWriteErrors?.(errors as Array<{ path: string; error: Error; errorClass?: string }>)
      for (const err of errors as Array<{ path: string; errorClass?: string }>) {
        if (err.errorClass === "permanent") {
          tracker.markDirty(err.path)
        }
      }
    })
    writeQueue.on("conflicts", (conflicts) => {
      callbacks?.onConflicts?.(conflicts as ConflictInfo[])
    })

    // ── BulkSync deps ─────────────────────────────────────────────────────

    function getBulkSyncDeps(): BulkSyncDeps {
      return {
        db: db,
        repoPath: repoPath,
        writeQueue,
        emitter,
        createAnchorAssigner: (eventId: string) => handlers.createAnchorAssigner(eventId),
        tracker,
      }
    }

    // ── Build the decorated repo ────────────────────────────────────────────

    const syncMethods: Sync = {
      start(): void {
        log.debug?.(`starting sync for ${repoPath}`)
        ignorePatterns = getIgnorePatterns(repoPath)
        watcher.start(repoPath)
        heartbeat.start()
        callbacks?.onStarted?.()
      },

      async stop(): Promise<void> {
        log.debug?.("stopping sync")
        stopped = true
        heartbeat.stop()
        await watcher.stop()
        if (inFlightSyncs.size > 0) {
          log.debug?.(`waiting for ${inFlightSyncs.size} in-flight syncs`)
          await Promise.allSettled(inFlightSyncs)
        }
        await writeQueue.flush()
        if (parsePool) {
          await parsePool[Symbol.asyncDispose]()
          parsePool = undefined
        }
        callbacks?.onStopped?.()
      },

      applyChangeToFs(change: Change): void {
        void handlers.applyChangeToFs(change)
      },

      async syncFromFs(onProgress?: SyncProgressCallback): Promise<SyncFromFsResult> {
        return BulkSync.fromFs(getBulkSyncDeps(), onProgress)
      },

      async *syncFromFsWithProgress(): AsyncGenerator<StepYield, SyncFromFsResult> {
        return yield* BulkSync.fromFsWithProgress(getBulkSyncDeps())
      },

      async syncToFs(): Promise<{ written: number }> {
        return BulkSync.toFs(getBulkSyncDeps())
      },

      forceHeartbeat(): { opsCount: number; duration: number } {
        return heartbeat.force()
      },

      getState(): SyncState {
        return state
      },

      getStatus(): { state: SyncState; pendingWrites: number; repoPath: string; watcher?: WatcherStatus } {
        const status: { state: SyncState; pendingWrites: number; repoPath: string; watcher?: WatcherStatus } = {
          state,
          pendingWrites: writeQueue.getPendingCount(),
          repoPath,
        }
        if (watcher instanceof WorkerWatcher) {
          status.watcher = watcher.getStatus()
        }
        return status
      },

      getWatcherStatus(): WatcherStatus | null {
        if (watcher instanceof WorkerWatcher) {
          return watcher.getStatus()
        }
        return null
      },

      getHeartbeatDiagnostics(): {
        enabled: boolean
        totalDrift: number
        lastActivityTime: number
        idleSinceMs: number
      } {
        return heartbeat.diagnostics()
      },

      async waitForInflight(): Promise<void> {
        if (inFlightSyncs.size > 0) {
          await Promise.allSettled(inFlightSyncs)
        }
      },

      getInFlightCount(): number {
        return inFlightSyncs.size
      },

      async [Symbol.asyncDispose](): Promise<void> {
        await syncMethods.stop()
      },
    }

    // Subscribe to apply() to add FS projection.
    // onApply fires after DB + persist + broadcast; commit() does NOT fire it,
    // so FS-origin changes (which use commit()) structurally cannot echo back.
    const unsubscribe = emitter.onApply((change, options) => {
      if (options.source !== "fs-import") {
        void handlers.applyChangeToFs(change)
      }
    })

    // Ensure unsubscribe on stop
    const baseStop = syncMethods.stop.bind(syncMethods)
    syncMethods.stop = async () => {
      unsubscribe()
      await baseStop()
    }

    return { ...repo, ...syncMethods } as R & Sync
  }
}
