/**
 * Sync Manager
 *
 * Coordinates bidirectional sync between filesystem and database
 */

import { createLogger } from "loggily"
import { existsSync, mkdirSync, readFileSync, renameSync } from "fs"
import type { Database } from "bun:sqlite"

const log = createLogger("km:storage:watch:sync")
import { dirname, join } from "path"
import { toAbsoluteFsPath } from "../path-utils.ts"
import { EventEmitter } from "events"
import { FileSystemWatcher, scanDirectoryRecursiveGen, type ScanEntry } from "./watcher.ts"
import { WorkerWatcher } from "./worker-bridge.ts"
import type { WatcherStatus } from "./worker-thread.ts"
import type { WatcherInterface } from "./types.ts"
import {
  reconcileDirectory,
  reconcileDirectoryAsync,
  applyReconcileOps,
  applyReconcileOpsAsync,
  type ReconcileOp,
} from "./reconcile.ts"
import { createParsePool, type ParsePoolService } from "../parse-pool.ts"
import { WriteQueue } from "./writequeue.ts"
import { WriteTokenMap } from "./write-tokens.ts"
import { createSyncState, type SyncState as SyncStateStore } from "./sync-state.ts"
import { getIgnorePatterns, createIgnoreMatcher } from "../ignore.ts"
import { type Event } from "@km/core"
import { createEmitter, type Emitter, type EmitOptions } from "../emitter.ts"
import { EventHandlers, type FsWriteTarget } from "./event-handlers.ts"

/**
 * Wrap an emitter so all emit() calls use commit() (no filesystem projection).
 * Used for FS-origin reconciliation to prevent echo loops by construction:
 * FS change → DB update → commit (no project) → no write back to FS.
 *
 * This is the structural loop break: reconciliation never projects.
 */
function wrapEmitterForReconcile(emitter: Emitter): Emitter {
  return {
    ...emitter,
    emit(event: Parameters<Emitter["emit"]>[0], options: EmitOptions = {}) {
      // Use commit() directly — structurally prevents echo loops
      // (skipFsSync is still supported for backwards compat but redundant here)
      return emitter.commit(event, options)
    },
  }
}

/** Progress info for sync operations */
interface SyncProgress {
  phase: string
  current: number
  total: number
}

/** Callback for sync progress reporting */
export type SyncProgressCallback = (info: SyncProgress) => void
import {
  getAllNodes,
  getChildren,
  getNode,
  getSubtree,
  nodesToMarkdown,
  evaluateAllRules,
  createRuleContext,
  type StepYield,
} from "../index.ts"
import { findFileNode } from "./watch-utils.ts"

/** Result from syncFromFs */
export interface SyncFromFsResult {
  processed: number
  directories: number
  duration: number
}

export interface HeartbeatConfig {
  /** Enable periodic reconciliation to catch silently dropped events (default: true) */
  enabled: boolean
  /** Interval between heartbeat checks in ms (default: 60000 = 1 min) */
  intervalMs: number
  /** Only run heartbeat if idle for this long in ms (default: 30000 = 30s) */
  idleThresholdMs: number
}

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
}

const DEFAULT_HEARTBEAT: HeartbeatConfig = {
  enabled: true,
  intervalMs: 60000, // 1 minute
  idleThresholdMs: 30000, // 30 seconds
}

const DEFAULT_CONFIG: Partial<SyncConfig> = {
  debounceFs: 5000,
  debounceApply: 3000,
  conflictStrategy: "last_write_wins",
  useWorker: true,
}

export type SyncState = "idle" | "fs_debouncing" | "db_debouncing" | "reconciling" | "applying" | "emitting" | "writing"

export class SyncManager extends EventEmitter {
  private db: Database
  private config: SyncConfig
  private watcher: WatcherInterface
  private writeQueue: WriteQueue
  private state: SyncState = "idle"
  private ignorePatterns: string[] = []
  private kmDir: string
  private emitter: Emitter // Emitter domain object for event emission
  private reconcileEmitter: Emitter // Wrapped emitter using commit() for FS-origin events (no projection)
  private parsePool: ParsePoolService | undefined
  private handlers: EventHandlers

  // In-flight sync tracking — prevents teardown from closing DB while syncs are running
  private inFlightSyncs: Set<Promise<void>> = new Set()
  private stopped = false

  // Write tokens — content-hash based tracking of files written by us.
  // When reconciliation sees a file change, it checks the token to determine
  // if the change was ours (skip) or external (process). Replaces the old
  // timestamp-based recentWrites with deterministic SHA-256 hashing.
  // WriteTokenMap is the fast in-memory cache; syncState is the durable ground truth.
  private writeTokens = new WriteTokenMap()

  // Persisted sync state — durable content-hash baseline for each file.
  // Survives process restarts. WriteTokenMap is checked first (fast, no DB query),
  // syncState is the fallback for cache misses (e.g., after restart).
  private syncState: SyncStateStore

  // Heartbeat reconciliation
  private heartbeatConfig: HeartbeatConfig
  // Timer ID type - setInterval returns Timer in Node/Bun
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined
  private lastActivityTime: number = Date.now()
  private heartbeatDrift: number = 0 // Changes found during heartbeat
  constructor(config: SyncConfig) {
    super()
    this.db = config.db
    this.config = { ...DEFAULT_CONFIG, ...config } as SyncConfig
    this.kmDir = join(this.config.repoPath, ".km")
    this.emitter = config.emitter ?? createEmitter({ kmDir: this.kmDir, db: this.db })
    this.reconcileEmitter = wrapEmitterForReconcile(this.emitter)
    this.syncState = createSyncState(this.db)

    // Initialize heartbeat config
    this.heartbeatConfig = {
      ...DEFAULT_HEARTBEAT,
      ...config.heartbeat,
    }

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
      onWrite: (path, content) => {
        this.writeTokens.record(path, content)
        this.syncState.recordProjection(path, content)
      },
    })

    this.writeQueue.setWatcher(this.watcher)

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
    this.writeQueue.on("errors", (errors) => this.emit("write-errors", errors))
  }

  /**
   * Start watching and syncing
   */
  start(): void {
    log.debug?.(`starting sync manager for ${this.config.repoPath}`)
    // Load ignore patterns for reconciliation
    this.ignorePatterns = getIgnorePatterns(this.config.repoPath)
    this.watcher.start(this.config.repoPath)

    // Start heartbeat timer if enabled
    this.startHeartbeat()

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
    this.stopHeartbeat()
    await this.watcher.stop()
    // Wait for in-flight syncs to complete before flushing writes
    if (this.inFlightSyncs.size > 0) {
      log.debug?.(`waiting for ${this.inFlightSyncs.size} in-flight syncs`)
      await Promise.allSettled(this.inFlightSyncs)
    }
    // Flush pending writes to disk instead of dropping them (clear() would lose data)
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

  /**
   * Start heartbeat timer for periodic reconciliation
   */
  private startHeartbeat(): void {
    if (!this.heartbeatConfig.enabled) {
      log.debug?.("heartbeat disabled")
      return
    }

    if (this.heartbeatTimer) {
      return // Already running
    }

    log.debug?.(
      `starting heartbeat: interval=${this.heartbeatConfig.intervalMs}ms, idleThreshold=${this.heartbeatConfig.idleThresholdMs}ms`,
    )

    this.heartbeatTimer = setInterval(() => {
      void this.runHeartbeat()
    }, this.heartbeatConfig.intervalMs)
  }

  /**
   * Stop heartbeat timer
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = undefined
      log.debug?.("heartbeat stopped")
    }
  }

  /**
   * Run heartbeat reconciliation if idle
   */
  private async runHeartbeat(): Promise<void> {
    if (this.stopped) return

    const now = Date.now()
    const idleTime = now - this.lastActivityTime

    // Only run if we've been idle long enough
    if (idleTime < this.heartbeatConfig.idleThresholdMs) {
      log.debug?.(`heartbeat: skipping, idle=${idleTime}ms < threshold=${this.heartbeatConfig.idleThresholdMs}ms`)
      return
    }

    // Don't run if we're in the middle of something
    if (this.state !== "idle") {
      log.debug?.(`heartbeat: skipping, state=${this.state}`)
      return
    }

    // Don't run if there are pending writes
    if (this.writeQueue.getPendingCount() > 0) {
      log.debug?.(`heartbeat: skipping, pending writes=${this.writeQueue.getPendingCount()}`)
      return
    }

    log.debug?.("heartbeat: running reconciliation")
    const start = Date.now()

    try {
      this.setState("reconciling")

      // Scan entire repo for changes (async to avoid blocking main thread)
      const rawOps = await reconcileDirectoryAsync(
        this.db,
        this.config.repoPath,
        this.config.repoPath,
        this.ignorePatterns,
      )
      const ops = this.filterOwnedWriteOps(rawOps)

      if (ops.length > 0) {
        log.debug?.(`heartbeat: found ${ops.length} changes (drift detected)`)
        this.heartbeatDrift += ops.length

        this.setState("emitting")
        await applyReconcileOpsAsync({
          db: this.db,
          ops,
          repoRoot: this.config.repoPath,
          emitter: this.reconcileEmitter,
          parsePool: await this.getParsePool(),
        })

        // Record observations for successfully reconciled files
        this.recordObservationsForOps(ops)

        // Emit event so consumers know about drift
        this.emit("heartbeat:drift", {
          opsCount: ops.length,
          totalDrift: this.heartbeatDrift,
        })
      }

      log.debug?.(`heartbeat: completed in ${Date.now() - start}ms, ops=${ops.length}`)
      this.emit("heartbeat:complete", {
        duration: Date.now() - start,
        opsCount: ops.length,
      })
    } catch (error) {
      log.debug?.(`heartbeat: error ${String(error)}`)
      this.emit("error", error)
    } finally {
      this.setState("idle")
    }
  }

  /**
   * Check if we own a file change. Two-tier lookup:
   * 1. WriteTokenMap (in-memory hot cache) — fast, no DB query
   * 2. syncState (persisted baseline) — survives restarts, requires file content read
   *
   * Returns true if the file content matches what we last wrote.
   */
  private isOwnedWrite(absPath: string): boolean {
    // Tier 1: in-memory cache (fast path)
    if (this.writeTokens.has(absPath)) return true

    // Tier 2: persisted sync_state (cold path — survives restart)
    try {
      const content = readFileSync(absPath, "utf-8")
      if (this.syncState.isOurs(absPath, content)) {
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
  private filterOwnedWriteOps(ops: ReconcileOp[]): ReconcileOp[] {
    const pendingPaths = this.writeQueue.getPendingPaths()
    const filtered = ops.filter((op) => !this.isOwnedWrite(op.path) && !pendingPaths.has(op.path))
    const skipped = ops.length - filtered.length
    if (skipped > 0) {
      log.debug?.(`reconcile: skipped ${skipped} ops for owned-write or pending-write files`)
    }
    return filtered
  }

  /**
   * Force a heartbeat reconciliation now (for testing/debugging).
   * Applies the same safety filters as the regular heartbeat to prevent
   * stale file content from overwriting DB state.
   */
  forceHeartbeat(): { opsCount: number; duration: number } {
    const start = Date.now()
    this.setState("reconciling")

    try {
      const rawOps = reconcileDirectory(this.db, this.config.repoPath, this.config.repoPath, this.ignorePatterns)
      const ops = this.filterOwnedWriteOps(rawOps)

      if (ops.length > 0) {
        this.setState("emitting")
        applyReconcileOps(this.db, ops, this.config.repoPath, this.reconcileEmitter)
        this.heartbeatDrift += ops.length

        // Record observations for successfully reconciled files
        this.recordObservationsForOps(ops)
      }

      return { opsCount: ops.length, duration: Date.now() - start }
    } finally {
      this.setState("idle")
    }
  }

  /**
   * Get heartbeat diagnostics
   */
  getHeartbeatDiagnostics(): {
    enabled: boolean
    totalDrift: number
    lastActivityTime: number
    idleSinceMs: number
  } {
    return {
      enabled: this.heartbeatConfig.enabled,
      totalDrift: this.heartbeatDrift,
      lastActivityTime: this.lastActivityTime,
      idleSinceMs: Date.now() - this.lastActivityTime,
    }
  }

  /**
   * Get current sync state
   */
  getState(): SyncState {
    return this.state
  }

  /**
   * Wait for all in-flight sync operations to complete.
   * Useful in tests to ensure async reconciliation finishes before asserting.
   */
  async waitForInflight(): Promise<void> {
    if (this.inFlightSyncs.size > 0) {
      await Promise.allSettled(this.inFlightSyncs)
    }
  }

  /**
   * Get number of in-flight sync operations (for test polling with fake timers).
   */
  getInFlightCount(): number {
    return this.inFlightSyncs.size
  }

  /**
   * Get or create the parse pool for async markdown parsing.
   * Lazily creates and starts the pool on first use.
   */
  private async getParsePool(): Promise<ParsePoolService> {
    if (!this.parsePool) {
      this.parsePool = createParsePool()
      await this.parsePool.start()
    }
    return this.parsePool
  }

  /**
   * Handle filesystem sync event — async to allow parallel markdown parsing.
   * Tracks in-flight promises so stop() can await them before closing resources.
   */
  private handleFsSync(data: { paths: string[]; directories: string[] }): void {
    const promise = this.handleFsSyncInner(data)
    this.inFlightSyncs.add(promise)
    void promise.finally(() => this.inFlightSyncs.delete(promise))
  }

  private async handleFsSyncInner(data: { paths: string[]; directories: string[] }): Promise<void> {
    // Bail out if stop() has been called to prevent accessing closed resources
    if (this.stopped) return

    using span = log.span("fs-sync", { paths: data.paths.length, dirs: data.directories.length })
    this.lastActivityTime = Date.now()
    this.setState("reconciling")

    for (const dir of data.directories) {
      if (this.stopped) break
      try {
        using dirSpan = span.span("reconcile-dir", { dir })
        const rawOps = await reconcileDirectoryAsync(this.db, dir, this.config.repoPath, this.ignorePatterns)
        const ops = this.filterOwnedWriteOps(rawOps)
        dirSpan.spanData.ops = ops.length

        if (ops.length > 0 && !this.stopped) {
          this.setState("emitting")
          using applySpan = dirSpan.span("apply")
          await applyReconcileOpsAsync({
            db: this.db,
            ops,
            repoRoot: this.config.repoPath,
            emitter: this.reconcileEmitter,
            parsePool: await this.getParsePool(),
          })
          applySpan.spanData.ops = ops.length

          // Record observations for successfully reconciled files
          this.recordObservationsForOps(ops)
        }
      } catch (error) {
        // Suppress errors after stop (DB closed, temp dir removed — expected during teardown)
        if (this.stopped) return
        // F7: Log error for this directory but continue processing remaining directories.
        // One bad directory (EACCES, ENOENT race, corrupt file) should not abort the entire sync.
        span.error?.(`directory ${dir} failed: ${error instanceof Error ? error.message : String(error)}`)
        this.emit("error", error)
      }
    }
    if (!this.stopped) {
      this.lastActivityTime = Date.now()
      this.setState("idle")
    }
  }

  /**
   * Record observations in sync_state for successfully reconciled ops.
   * After reconciliation applies ops to the DB, record the current file
   * content as our baseline so future reconciliations know it's not external.
   */
  private recordObservationsForOps(ops: ReconcileOp[]): void {
    for (const op of ops) {
      try {
        switch (op.type) {
          case "create":
          case "update": {
            const content = readFileSync(op.path, "utf-8")
            this.syncState.recordObservation(op.path, content, op.nodeId)
            break
          }
          case "rename":
            if (op.oldPath) {
              this.syncState.renamePath(op.oldPath, op.path)
            }
            break
          case "delete":
            this.syncState.removePath(op.path)
            break
        }
      } catch {
        // File may have been deleted between reconciliation and observation recording.
        // This is benign — the next reconciliation will handle it.
      }
    }
  }

  private setState(newState: SyncState): void {
    if (this.state !== newState) {
      log.debug?.(`state: ${this.state} → ${newState}`)
      this.state = newState
      this.emit("state-change", this.state)
    }
  }

  /**
   * Apply a database event to filesystem
   */
  applyEventToFs(event: Event): void {
    // Delegated to EventHandlers via shared handler logic
    // (See EventHandlers class for handler implementations)
    void this.handlers.applyEventToFs(event)
  }

  /**
   * Force sync from filesystem (callback version)
   *
   * @param onProgress - Optional callback for progress reporting
   */
  async syncFromFs(onProgress?: SyncProgressCallback): Promise<SyncFromFsResult> {
    // Delegate to generator version, forwarding progress via callback
    const gen = this.syncFromFsWithProgress()
    let result = await gen.next()
    let currentPhase = "Syncing"
    while (!result.done) {
      // Convert StepYield to SyncProgress for callback
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
      // Skip 'declare' yields - they're for steps() display only
      result = await gen.next()
    }
    return result.value
  }

  /**
   * Force sync from filesystem (async generator version)
   *
   * Yields StepYield updates for use with steps() - file-based progress.
   * Uses same pattern as loadRepo for consistent styling.
   *
   * @example
   * ```typescript
   * const results = await steps({
   *   syncFiles: () => manager.syncFromFsWithProgress(),
   * }).run({ clear: true })
   * ```
   */
  async *syncFromFsWithProgress(): AsyncGenerator<StepYield, SyncFromFsResult> {
    log.debug?.(`syncFromFs: scanning ${this.config.repoPath}`)
    const start = Date.now()

    // Pre-compile ignore patterns once (avoids O(n*m) regex compilation during scan)
    const ignoreMatcher = createIgnoreMatcher(this.config.repoPath)

    // Declare sub-steps upfront for consistent display
    yield { declare: ["Scanning", "Reconciling", "Rules"] }

    // Phase 1: Scanning - use generator for progress during scan
    yield "Scanning"

    const entries: ScanEntry[] = []
    const dirToFiles = new Map<string, ScanEntry[]>()
    let scanCount = 0

    // Scan with periodic yields to keep UI responsive
    for (const entry of scanDirectoryRecursiveGen(
      this.config.repoPath,
      (path) => path.endsWith(".md"),
      ignoreMatcher,
    )) {
      entries.push(entry)
      const dir = dirname(entry.path)
      const files = dirToFiles.get(dir) ?? []
      files.push(entry)
      dirToFiles.set(dir, files)

      scanCount++
      // Yield frequently - display layer debounces at 80ms
      if (scanCount % 25 === 0) {
        yield { current: scanCount, total: 0 } // total=0 means "unknown"
      }
    }

    const totalFiles = entries.length
    log.debug?.(`syncFromFs: found ${totalFiles} files`)
    yield { current: totalFiles, total: totalFiles }

    // Phase 2: Reconciling - collect all ops first, then apply in batches
    yield "Reconciling"

    // Step 2a: Collect all reconcile ops (fast - just comparing metadata)
    const allOps: ReturnType<typeof reconcileDirectory> = []
    for (const dir of dirToFiles.keys()) {
      const ops = reconcileDirectory(this.db, dir, this.config.repoPath, ignoreMatcher)
      allOps.push(...ops)
    }

    // Step 2b: Apply ops in batches with progress
    // Display layer auto-debounces at 80ms, so we can yield freely after each batch
    const BATCH_SIZE = 25 // Balance between progress granularity and function call overhead
    const totalOps = allOps.length || 1
    let opsProcessed = 0

    // Wrap in transaction for much faster DB writes (avoids per-op commit overhead)
    this.db.run("BEGIN IMMEDIATE")
    try {
      for (let i = 0; i < allOps.length; i += BATCH_SIZE) {
        const batch = allOps.slice(i, i + BATCH_SIZE)
        applyReconcileOps(this.db, batch, this.config.repoPath, this.reconcileEmitter)
        opsProcessed += batch.length
        yield { current: opsProcessed, total: totalOps }
      }
      this.db.run("COMMIT")
    } catch (error) {
      this.db.run("ROLLBACK")
      throw error
    }

    // If no ops, still show completion
    if (allOps.length === 0) {
      yield { current: 1, total: 1 }
    }

    // Phase 3: Evaluate rules (add= materialization)
    yield "Rules"
    const ruleCtx = createRuleContext()
    for (const progress of evaluateAllRules(this.db, ruleCtx)) {
      yield { current: progress.current, total: progress.total }
    }

    // Write back any files that were modified by rule evaluation
    // SAFETY: Only write .md files to prevent corruption of source code/config files
    const pendingFiles = Array.from(ruleCtx.pendingWriteBack)
    if (pendingFiles.length > 0) {
      log.debug?.(`syncFromFs: writing back ${pendingFiles.length} files after rule evaluation`)
      for (const filePath of pendingFiles) {
        // CRITICAL: Skip non-.md files to prevent corruption
        if (!filePath.endsWith(".md")) {
          log.debug?.(`syncFromFs: SKIPPING non-.md file in write-back filePath=${filePath}`)
          continue
        }

        // Find the file node and regenerate its content
        // pendingWriteBack stores relative paths (as in DB)
        const fileNode = getAllNodes(this.db).find((n) => n.fs_path === filePath)
        if (fileNode) {
          const blockIds = this.createBlockIdAssigner("rule-evaluation")
          const absPath = toAbsoluteFsPath(this.config.repoPath, filePath)
          const subtree = getSubtree(this.db, fileNode.id)
          const content = nodesToMarkdown(subtree, getAllNodes(this.db), blockIds.assign)
          this.writeQueue.queue({
            path: absPath,
            content,
            sourceEventId: "rule-evaluation",
          })
          blockIds.rewriteSourceFiles(fileNode.id)
        }
      }
      await this.writeQueue.forceFlush()
    }

    const duration = Date.now() - start
    const dirCount = dirToFiles.size
    log.debug?.(`syncFromFs: processed ${opsProcessed} ops in ${dirCount} dirs in ${duration}ms`)
    return { processed: opsProcessed, directories: dirCount, duration }
  }

  /**
   * Force sync to filesystem
   *
   * SAFETY: Only writes .md files. Never touches source code, config files, or binaries.
   * This is critical to prevent corruption of non-repo files (km-me0n bug).
   */
  async syncToFs(): Promise<{ written: number }> {
    log.debug?.("syncToFs: starting")
    const start = Date.now()

    const nodes = getAllNodes(this.db)
    // CRITICAL: Only sync .md files to prevent corruption of source code/config files
    const fileNodes = nodes.filter(
      (n) => n.type === "h" && n.item && n.fstype === "mdfile" && n.fs_path?.endsWith(".md"),
    )

    log.debug?.(`syncToFs: writing ${fileNodes.length} files`)

    for (const fileNode of fileNodes) {
      if (!fileNode.fs_path) continue
      const blockIds = this.createBlockIdAssigner("sync-to-fs")
      const absPath = toAbsoluteFsPath(this.config.repoPath, fileNode.fs_path)
      const subtree = getSubtree(this.db, fileNode.id)
      const content = nodesToMarkdown(subtree, nodes, blockIds.assign)

      this.writeQueue.queue({
        path: absPath,
        content,
        sourceEventId: "sync-to-fs",
      })
      blockIds.rewriteSourceFiles(fileNode.id)
    }

    await this.writeQueue.forceFlush()

    log.debug?.(`syncToFs: wrote ${fileNodes.length} files in ${Date.now() - start}ms`)
    return { written: fileNodes.length }
  }

  /**
   * Get sync status
   */
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

    // Include watcher status if using WorkerWatcher
    if (this.watcher instanceof WorkerWatcher) {
      status.watcher = this.watcher.getStatus()
    }

    return status
  }

  /**
   * Get watcher status (WorkerWatcher only)
   */
  getWatcherStatus(): WatcherStatus | null {
    if (this.watcher instanceof WorkerWatcher) {
      return this.watcher.getStatus()
    }
    return null
  }

  /**
   * Create an assignBlockId callback that collects newly assigned IDs.
   * After serialization, call rewriteSourceFiles to write ^block-id
   * suffixes into the files that contain the referenced nodes.
   */
  private createBlockIdAssigner(_eventId: string): {
    assign: (nodeId: string, blockId: string) => void
    rewriteSourceFiles: (excludeFileId?: string) => void
  } {
    const assigned = new Map<string, string>() // nodeId → blockId
    return {
      assign: (nodeId: string, blockId: string) => {
        this.db.run("UPDATE nodes SET block_id = ? WHERE id = ?", [blockId, nodeId])
        assigned.set(nodeId, blockId)
      },
      rewriteSourceFiles: (excludeFileId?: string) => {
        if (assigned.size === 0) return
        // Group by containing file
        const fileIds = new Set<string>()
        for (const [nodeId, blockId] of assigned) {
          const node = getNode(this.db, nodeId)
          if (!node) {
            log.error?.(`rewriteSourceFiles: node ${nodeId} vanished after block_id assignment`)
            continue
          }
          // Update in-memory node for serialization
          node.block_id = blockId
          const file = findFileNode(this.db, node)
          if (file && file.id !== excludeFileId) fileIds.add(file.id)
        }
        // Rewrite each affected source file (without assignBlockId to prevent cascading)
        for (const fileId of fileIds) {
          const file = getNode(this.db, fileId)
          if (!file?.fs_path) {
            log.error?.(`rewriteSourceFiles: file node ${fileId} missing or has no fs_path`)
            continue
          }
          const absPath = toAbsoluteFsPath(this.config.repoPath, file.fs_path)
          const subtreeNodes = getSubtree(this.db, fileId)
          const content = nodesToMarkdown(subtreeNodes, getAllNodes(this.db))
          this.writeQueue.queue({
            path: absPath,
            content,
            sourceEventId: _eventId,
          })
        }
      },
    }
  }
}
