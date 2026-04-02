/**
 * Sync — Factory-based bidirectional sync between filesystem and database.
 *
 * Orchestrates reconciliation (FS→DB) via ReconciliationEngine,
 * projection (DB→FS) via EventHandlers, and bulk sync via BulkSync.
 * Replaces the old class-based SyncManager with a plain object from createSync().
 */

import { createLogger } from "loggily"
import { mkdirSync, renameSync } from "fs"
import type { Database } from "bun:sqlite"

const log = createLogger("km:storage:watch:sync")
import { join } from "path"
import { FileSystemWatcher } from "./watcher.ts"
import { WorkerWatcher } from "./worker-bridge.ts"
import type { WatcherStatus } from "./worker-thread.ts"
import type { WatcherInterface } from "./types.ts"
import { createParsePool, type ParsePoolService } from "../parse-pool.ts"
import { WriteQueue } from "./writequeue.ts"
import { WriteTokenMap } from "./write-tokens.ts"
import { createSyncState, type SyncState as SyncStateStore } from "./sync-state.ts"
import { getIgnorePatterns } from "../ignore.ts"
import { type Event } from "@km/core"
import { createEmitter, type Emitter } from "../emitter.ts"
import { EventHandlers, type FsWriteTarget } from "./event-handlers.ts"
import { createReconciliationEngine, type ReconciliationEngine } from "./reconciliation-engine.ts"
import { BulkSync, wrapEmitterForReconcile } from "./bulk-sync.ts"
import type { BulkSyncDeps, SyncProgressCallback, SyncFromFsResult } from "./bulk-sync.ts"
export type { SyncProgressCallback, SyncFromFsResult } from "./bulk-sync.ts"
import type { StepYield } from "../index.ts"
import { createHeartbeat, DEFAULT_HEARTBEAT, type Heartbeat, type HeartbeatConfig } from "./heartbeat.ts"

export type { HeartbeatConfig } from "./heartbeat.ts"

// ─── Config ──────────────────────────────────────────────────────────────────

export interface SyncConfig {
  db: Database
  repoPath: string
  debounceFs: number
  debounceApply: number
  conflictStrategy: "last_write_wins" | "fs_wins" | "db_wins"
  /** Use worker thread for file watching (default: true). Prevents UI blocking on large repos. */
  useWorker?: boolean
  /** Heartbeat reconciliation config */
  heartbeat?: Partial<HeartbeatConfig>
  /** Custom watcher instance (for testing with ChaosWatcher). If provided, useWorker is ignored. */
  watcher?: WatcherInterface
  /** Inject shared emitter (e.g., repo's emitter). If not provided, creates a private emitter. */
  emitter?: Emitter
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
  applyEventToFs(event: Event): void
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

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createSync(config: SyncConfig): Sync {
  const cfg = { ...DEFAULT_CONFIG, ...config } as SyncConfig
  const callbacks = cfg.callbacks
  const kmDir = join(cfg.repoPath, ".km")

  // ── Core services ──────────────────────────────────────────────────────

  const emitter: Emitter = config.emitter ?? createEmitter({ kmDir, db: cfg.db })
  const syncState: SyncStateStore = createSyncState(cfg.db)
  const writeTokens = new WriteTokenMap()

  // ── Watcher ────────────────────────────────────────────────────────────

  let watcher: WatcherInterface
  if (config.watcher) {
    log.debug?.("using injected watcher")
    watcher = config.watcher
  } else if (cfg.useWorker !== false) {
    log.debug?.("using WorkerWatcher (non-blocking)")
    watcher = new WorkerWatcher({ debounceMs: cfg.debounceFs })
  } else {
    log.debug?.("using FileSystemWatcher (direct)")
    watcher = new FileSystemWatcher({ debounceMs: cfg.debounceFs })
  }

  // ── WriteQueue ─────────────────────────────────────────────────────────

  const writeQueue = new WriteQueue({
    debounceMs: cfg.debounceApply,
    retry: cfg.retry,
    clearInFlightDelayMs: cfg.clearInFlightDelayMs,
    onWrite: (path, content) => {
      writeTokens.record(path, content)
      syncState.recordProjection(path, content)
    },
  })
  writeQueue.setWatcher(watcher)

  // ── ReconciliationEngine ───────────────────────────────────────────────

  const reconcileEmitter = wrapEmitterForReconcile(emitter)
  const engine: ReconciliationEngine = createReconciliationEngine({
    db: cfg.db,
    repoPath: cfg.repoPath,
    writeTokens,
    syncState,
    writeQueue,
    reconcileEmitter,
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

  // ── FsWriteTarget (for EventHandlers) ──────────────────────────────────

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
      writeTokens.record(absPath, content)
      syncState.recordProjection(absPath, content)
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

  const handlers = new EventHandlers(cfg.db, cfg.repoPath, emitter, fsTarget)

  // ── Heartbeat ──────────────────────────────────────────────────────────

  const heartbeat: Heartbeat = createHeartbeat(
    { ...DEFAULT_HEARTBEAT, ...config.heartbeat },
    {
      engine,
      syncState,
      writeQueue,
      db: cfg.db,
      repoPath: cfg.repoPath,
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

  writeQueue.on("flushed", (data) => callbacks?.onWriteComplete?.(data))
  writeQueue.on("errors", (errors) => {
    callbacks?.onWriteErrors?.(errors as Array<{ path: string; error: Error; errorClass?: string }>)
    for (const err of errors as Array<{ path: string; errorClass?: string }>) {
      if (err.errorClass === "permanent") {
        syncState.markDirty(err.path)
      }
    }
  })

  // ── BulkSync deps ─────────────────────────────────────────────────────

  function getBulkSyncDeps(): BulkSyncDeps {
    return {
      db: cfg.db,
      repoPath: cfg.repoPath,
      writeQueue,
      emitter,
      createBlockIdAssigner: (eventId: string) => handlers.createBlockIdAssigner(eventId),
    }
  }

  // ── Build and return the Sync object ───────────────────────────────────

  const sync: Sync = {
    start(): void {
      log.debug?.(`starting sync for ${cfg.repoPath}`)
      ignorePatterns = getIgnorePatterns(cfg.repoPath)
      watcher.start(cfg.repoPath)
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

    applyEventToFs(event: Event): void {
      void handlers.applyEventToFs(event)
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
        repoPath: cfg.repoPath,
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
      await sync.stop()
    },
  }

  return sync
}
