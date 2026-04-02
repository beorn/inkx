/**
 * Sync Manager
 *
 * Orchestrates bidirectional sync between filesystem and database.
 * Delegates reconciliation (FS→DB) to ReconciliationEngine,
 * projection (DB→FS) to EventHandlers, and bulk sync to BulkSync.
 */

import { createLogger } from "loggily"
import { mkdirSync, renameSync } from "fs"
import type { Database } from "bun:sqlite"

const log = createLogger("km:storage:watch:sync")
import { join } from "path"
import { EventEmitter } from "events"
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
}

const DEFAULT_CONFIG: Partial<SyncConfig> = {
  debounceFs: 5000,
  debounceApply: 3000,
  conflictStrategy: "last_write_wins",
  useWorker: true,
}

export type { SyncState } from "./heartbeat.ts"
import type { SyncState } from "./heartbeat.ts"

export class SyncManager extends EventEmitter {
  private db: Database
  private config: SyncConfig
  private watcher: WatcherInterface
  private writeQueue: WriteQueue
  private state: SyncState = "idle"
  private ignorePatterns: string[] = []
  private kmDir: string
  private emitter: Emitter
  private parsePool: ParsePoolService | undefined
  private handlers: EventHandlers
  private engine: ReconciliationEngine

  // In-flight sync tracking — prevents teardown from closing DB while syncs are running
  private inFlightSyncs: Set<Promise<void>> = new Set()
  private stopped = false

  // Write tokens — content-hash based tracking of files written by us.
  private writeTokens = new WriteTokenMap()

  // Persisted sync state — durable content-hash baseline for each file.
  private syncState: SyncStateStore

  // Heartbeat reconciliation
  private heartbeat: Heartbeat

  constructor(config: SyncConfig) {
    super()
    this.db = config.db
    this.config = { ...DEFAULT_CONFIG, ...config } as SyncConfig
    this.kmDir = join(this.config.repoPath, ".km")
    this.emitter = config.emitter ?? createEmitter({ kmDir: this.kmDir, db: this.db })
    this.syncState = createSyncState(this.db)

    // Use injected watcher if provided (for testing with ChaosWatcher)
    // Otherwise use worker-based watcher by default (non-blocking)
    // Fall back to direct watcher if useWorker is explicitly false
    if (config.watcher) {
      log.debug?.("using injected watcher")
      this.watcher = config.watcher
    } else if (this.config.useWorker !== false) {
      log.debug?.("using WorkerWatcher (non-blocking)")
      this.watcher = new WorkerWatcher({
        debounceMs: this.config.debounceFs,
      })
    } else {
      log.debug?.("using FileSystemWatcher (direct)")
      this.watcher = new FileSystemWatcher({
        debounceMs: this.config.debounceFs,
      })
    }

    this.writeQueue = new WriteQueue({
      debounceMs: this.config.debounceApply,
      retry: this.config.retry,
      clearInFlightDelayMs: this.config.clearInFlightDelayMs,
      onWrite: (path, content) => {
        this.writeTokens.record(path, content)
        this.syncState.recordProjection(path, content)
      },
    })

    this.writeQueue.setWatcher(this.watcher)

    // Create reconciliation engine
    const reconcileEmitter = wrapEmitterForReconcile(this.emitter)
    this.engine = createReconciliationEngine({
      db: this.db,
      repoPath: this.config.repoPath,
      writeTokens: this.writeTokens,
      syncState: this.syncState,
      writeQueue: this.writeQueue,
      reconcileEmitter,
    })

    // Create heartbeat
    this.heartbeat = createHeartbeat(
      { ...DEFAULT_HEARTBEAT, ...config.heartbeat },
      {
        engine: this.engine,
        syncState: this.syncState,
        writeQueue: this.writeQueue,
        db: this.db,
        repoPath: this.config.repoPath,
        ignorePatterns: () => this.ignorePatterns,
        getParsePool: () => this.getParsePool(),
        getState: () => this.state,
        setState: (s) => this.setState(s),
        isStopped: () => this.stopped,
        onError: (error) => this.emit("error", error),
        onDrift: (info) => this.emit("heartbeat:drift", info),
        onComplete: (info) => this.emit("heartbeat:complete", info),
      },
    )

    // Create async FsWriteTarget that queues writes to WriteQueue
    const fsTarget: FsWriteTarget = {
      writeFile: (absPath: string, content: string, eventId?: string) => {
        this.writeQueue.queue({
          path: absPath,
          content,
          sourceEventId: eventId || "",
        })
      },
      deleteFile: (absPath: string, eventId?: string) => {
        this.writeQueue.queueDelete(absPath, eventId || "")
      },
      renameFile: (oldPath: string, newPath: string) => {
        // Renames are handled synchronously to maintain fs/db consistency
        renameSync(oldPath, newPath)
      },
      mkdir: (absPath: string) => {
        mkdirSync(absPath, { recursive: true })
      },
      markInFlight: (absPath: string) => {
        this.watcher.markInFlight(absPath)
      },
      clearInFlight: (absPath: string, delayMs?: number) => {
        this.watcher.clearInFlight(absPath, delayMs)
      },
      recordWriteToken: (absPath: string, content: string) => {
        this.writeTokens.record(absPath, content)
        this.syncState.recordProjection(absPath, content)
      },
      renamePending: (oldPath: string, newPath: string) => {
        return this.writeQueue.renamePending(oldPath, newPath)
      },
      renamePendingSubtree: (oldPrefix: string, newPrefix: string) => {
        return this.writeQueue.renamePendingSubtree(oldPrefix, newPrefix)
      },
      dropPending: (path: string) => {
        return this.writeQueue.dropPending(path)
      },
    }

    this.handlers = new EventHandlers(this.db, this.config.repoPath, this.emitter, fsTarget)

    // Wire up events
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Watcher event data is untyped
    this.watcher.on("sync", (data) => this.handleFsSync(data))
    this.watcher.on("error", (error) => this.emit("error", error))
    this.watcher.on("ready", () => this.emit("ready"))

    // Forward watcher status events (WorkerWatcher only)
    if (this.watcher instanceof WorkerWatcher) {
      this.watcher.on("status", (status: WatcherStatus) => {
        this.emit("watcher-status", status)
      })
    }

    this.writeQueue.on("flushed", (data) => this.emit("write-complete", data))
    this.writeQueue.on("errors", (errors) => {
      this.emit("write-errors", errors)
      // Mark paths dirty on permanent write errors for heartbeat re-projection
      for (const err of errors as Array<{ path: string; errorClass?: string }>) {
        if (err.errorClass === "permanent") {
          this.syncState.markDirty(err.path)
        }
      }
    })
  }

  /**
   * Start watching and syncing
   */
  start(): void {
    log.debug?.(`starting sync manager for ${this.config.repoPath}`)
    this.ignorePatterns = getIgnorePatterns(this.config.repoPath)
    this.watcher.start(this.config.repoPath)
    this.heartbeat.start()
    this.emit("started")
  }

  /**
   * Stop watching and syncing.
   * Awaits any in-flight handleFsSync operations to prevent
   * "Cannot use a closed database" errors during teardown.
   */
  async stop(): Promise<void> {
    log.debug?.("stopping sync manager")
    this.stopped = true
    this.heartbeat.stop()
    await this.watcher.stop()
    if (this.inFlightSyncs.size > 0) {
      log.debug?.(`waiting for ${this.inFlightSyncs.size} in-flight syncs`)
      await Promise.allSettled(this.inFlightSyncs)
    }
    await this.writeQueue.flush()
    if (this.parsePool) {
      await this.parsePool[Symbol.asyncDispose]()
      this.parsePool = undefined
    }
    this.emit("stopped")
  }

  /**
   * AsyncDisposable implementation for `await using` pattern
   */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.stop()
  }

  // ─── Heartbeat ──────────────────────────────────────────────────────────

  /**
   * Force a heartbeat reconciliation now (for testing/debugging).
   */
  forceHeartbeat(): { opsCount: number; duration: number } {
    return this.heartbeat.force()
  }

  // ─── State & Diagnostics ────────────────────────────────────────────────

  getHeartbeatDiagnostics(): {
    enabled: boolean
    totalDrift: number
    lastActivityTime: number
    idleSinceMs: number
  } {
    return this.heartbeat.diagnostics()
  }

  getState(): SyncState {
    return this.state
  }

  async waitForInflight(): Promise<void> {
    if (this.inFlightSyncs.size > 0) {
      await Promise.allSettled(this.inFlightSyncs)
    }
  }

  getInFlightCount(): number {
    return this.inFlightSyncs.size
  }

  private async getParsePool(): Promise<ParsePoolService> {
    if (!this.parsePool) {
      this.parsePool = createParsePool()
      await this.parsePool.start()
    }
    return this.parsePool
  }

  // ─── FS→DB Sync (watcher events) ───────────────────────────────────────

  private handleFsSync(data: { paths: string[]; directories: string[] }): void {
    const promise = this.handleFsSyncInner(data)
    this.inFlightSyncs.add(promise)
    void promise.finally(() => this.inFlightSyncs.delete(promise))
  }

  private async handleFsSyncInner(data: { paths: string[]; directories: string[] }): Promise<void> {
    if (this.stopped) return

    using span = log.span("fs-sync", { paths: data.paths.length, dirs: data.directories.length })
    this.heartbeat.touchActivity()
    this.setState("reconciling")

    for (const dir of data.directories) {
      if (this.stopped) break
      try {
        using dirSpan = span.span("reconcile-dir", { dir })
        const ops = await this.engine.reconcileAsync(dir, this.ignorePatterns)
        dirSpan.spanData.ops = ops.length

        if (ops.length > 0 && !this.stopped) {
          this.setState("emitting")
          using applySpan = dirSpan.span("apply")
          await this.engine.applyOpsAsync(ops, await this.getParsePool())
          applySpan.spanData.ops = ops.length
        }
      } catch (error) {
        if (this.stopped) return
        span.error?.(`directory ${dir} failed: ${error instanceof Error ? error.message : String(error)}`)
        this.emit("error", error)
      }
    }
    if (!this.stopped) {
      this.heartbeat.touchActivity()
      this.setState("idle")
    }
  }

  private setState(newState: SyncState): void {
    if (this.state !== newState) {
      log.debug?.(`state: ${this.state} → ${newState}`)
      this.state = newState
      this.emit("state-change", this.state)
    }
  }

  // ─── DB→FS Projection ──────────────────────────────────────────────────

  applyEventToFs(event: Event): void {
    void this.handlers.applyEventToFs(event)
  }

  // ─── Full Sync Operations (delegated to BulkSync) ─────────────────────

  /** Build BulkSyncDeps from SyncManager internals */
  private getBulkSyncDeps(): BulkSyncDeps {
    return {
      db: this.db,
      repoPath: this.config.repoPath,
      writeQueue: this.writeQueue,
      emitter: this.emitter,
      createBlockIdAssigner: (eventId: string) => this.handlers.createBlockIdAssigner(eventId),
    }
  }

  async syncFromFs(onProgress?: SyncProgressCallback): Promise<SyncFromFsResult> {
    return BulkSync.fromFs(this.getBulkSyncDeps(), onProgress)
  }

  async *syncFromFsWithProgress(): AsyncGenerator<StepYield, SyncFromFsResult> {
    return yield* BulkSync.fromFsWithProgress(this.getBulkSyncDeps())
  }

  async syncToFs(): Promise<{ written: number }> {
    return BulkSync.toFs(this.getBulkSyncDeps())
  }

  // ─── Status ─────────────────────────────────────────────────────────────

  getStatus(): {
    state: SyncState
    pendingWrites: number
    repoPath: string
    watcher?: WatcherStatus
  } {
    const status: {
      state: SyncState
      pendingWrites: number
      repoPath: string
      watcher?: WatcherStatus
    } = {
      state: this.state,
      pendingWrites: this.writeQueue.getPendingCount(),
      repoPath: this.config.repoPath,
    }

    if (this.watcher instanceof WorkerWatcher) {
      status.watcher = this.watcher.getStatus()
    }

    return status
  }

  getWatcherStatus(): WatcherStatus | null {
    if (this.watcher instanceof WorkerWatcher) {
      return this.watcher.getStatus()
    }
    return null
  }
}
