/**
 * Sync Manager
 *
 * Orchestrates bidirectional sync between filesystem and database.
 * Delegates reconciliation (FS→DB) to ReconciliationEngine and
 * projection (DB→FS) to EventHandlers.
 */

import { createLogger } from "loggily"
import { mkdirSync, renameSync } from "fs"
import type { Database } from "bun:sqlite"

const log = createLogger("km:storage:watch:sync")
import { dirname, join } from "path"
import { toAbsoluteFsPath } from "../path-utils.ts"
import { EventEmitter } from "events"
import { FileSystemWatcher, scanDirectoryRecursiveGen, type ScanEntry } from "./watcher.ts"
import { WorkerWatcher } from "./worker-bridge.ts"
import type { WatcherStatus } from "./worker-thread.ts"
import type { WatcherInterface } from "./types.ts"
import { reconcileDirectory, applyReconcileOps, type ReconcileOp } from "./reconcile.ts"
import { createParsePool, type ParsePoolService } from "../parse-pool.ts"
import { WriteQueue } from "./writequeue.ts"
import { WriteTokenMap } from "./write-tokens.ts"
import { createSyncState, type SyncState as SyncStateStore } from "./sync-state.ts"
import { getIgnorePatterns, createIgnoreMatcher } from "../ignore.ts"
import { type Event } from "@km/core"
import { createEmitter, type Emitter, type EmitOptions } from "../emitter.ts"
import { EventHandlers, type FsWriteTarget } from "./event-handlers.ts"
import { createReconciliationEngine, type ReconciliationEngine } from "./reconciliation-engine.ts"

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
  getNode,
  getSubtree,
  nodesToMarkdown,
  evaluateAllRules,
  createRuleContext,
  type StepYield,
} from "../index.ts"
import { findFileNode } from "./watch-utils.ts"
import { createHeartbeat, DEFAULT_HEARTBEAT, type Heartbeat, type HeartbeatConfig } from "./heartbeat.ts"

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
  /** Retry config for WriteQueue (default: maxRetries=3, baseDelayMs=100, maxDelayMs=5000) */
  retry?: {
    maxRetries?: number
    baseDelayMs?: number
    maxDelayMs?: number
  }
  /** Delay before clearing in-flight status after writes, in ms (default: 1000) */
  clearInFlightDelayMs?: number
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
  private heartbeatConfig: HeartbeatConfig
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined
  private lastActivityTime: number = Date.now()
  private heartbeatDrift: number = 0

  constructor(config: SyncConfig) {
    super()
    this.db = config.db
    this.config = { ...DEFAULT_CONFIG, ...config } as SyncConfig
    this.kmDir = join(this.config.repoPath, ".km")
    this.emitter = config.emitter ?? createEmitter({ kmDir: this.kmDir, db: this.db })
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

  private startHeartbeat(): void {
    if (!this.heartbeatConfig.enabled) {
      log.debug?.("heartbeat disabled")
      return
    }
    if (this.heartbeatTimer) return

    log.debug?.(
      `starting heartbeat: interval=${this.heartbeatConfig.intervalMs}ms, idleThreshold=${this.heartbeatConfig.idleThresholdMs}ms`,
    )

    this.heartbeatTimer = setInterval(() => {
      void this.runHeartbeat()
    }, this.heartbeatConfig.intervalMs)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = undefined
      log.debug?.("heartbeat stopped")
    }
  }

  private async runHeartbeat(): Promise<void> {
    if (this.stopped) return

    const now = Date.now()
    const idleTime = now - this.lastActivityTime

    if (idleTime < this.heartbeatConfig.idleThresholdMs) {
      log.debug?.(`heartbeat: skipping, idle=${idleTime}ms < threshold=${this.heartbeatConfig.idleThresholdMs}ms`)
      return
    }

    if (this.state !== "idle") {
      log.debug?.(`heartbeat: skipping, state=${this.state}`)
      return
    }

    if (this.writeQueue.getPendingCount() > 0) {
      log.debug?.(`heartbeat: skipping, pending writes=${this.writeQueue.getPendingCount()}`)
      return
    }

    log.debug?.("heartbeat: running reconciliation")
    const start = Date.now()

    try {
      this.setState("reconciling")

      const ops = await this.engine.reconcileAsync(this.config.repoPath, this.ignorePatterns)

      if (ops.length > 0) {
        log.debug?.(`heartbeat: found ${ops.length} changes (drift detected)`)
        this.heartbeatDrift += ops.length

        this.setState("emitting")
        await this.engine.applyOpsAsync(ops, await this.getParsePool())

        this.emit("heartbeat:drift", {
          opsCount: ops.length,
          totalDrift: this.heartbeatDrift,
        })
      }

      // Re-project dirty paths (failed writes recovered by heartbeat)
      this.reprojectDirtyPaths()

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
   * Re-project dirty paths from DB to FS.
   * Called during heartbeat to recover from failed writes.
   */
  private reprojectDirtyPaths(): void {
    const dirtyPaths = this.syncState.getDirtyPaths()
    if (dirtyPaths.length === 0) return

    log.debug?.(`heartbeat: re-projecting ${dirtyPaths.length} dirty paths`)
    for (const fsPath of dirtyPaths) {
      try {
        const fileNode = getAllNodes(this.db).find((n) => n.fs_path === fsPath)
        if (!fileNode) {
          // Node no longer exists — clear the dirty flag
          this.syncState.clearDirty(fsPath)
          continue
        }
        const absPath = toAbsoluteFsPath(this.config.repoPath, fsPath)
        const subtree = getSubtree(this.db, fileNode.id)
        const content = nodesToMarkdown(subtree, getAllNodes(this.db))
        this.writeQueue.queue({
          path: absPath,
          content,
          sourceEventId: "heartbeat-reproject",
        })
        this.syncState.clearDirty(fsPath)
      } catch (error) {
        log.debug?.(`heartbeat: failed to re-project ${fsPath}: ${String(error)}`)
      }
    }
  }

  /**
   * Force a heartbeat reconciliation now (for testing/debugging).
   */
  forceHeartbeat(): { opsCount: number; duration: number } {
    const start = Date.now()
    this.setState("reconciling")

    try {
      const ops = this.engine.reconcile(this.config.repoPath, this.ignorePatterns)

      if (ops.length > 0) {
        this.setState("emitting")
        this.engine.applyOps(ops)
        this.heartbeatDrift += ops.length
      }

      // Re-project dirty paths
      this.reprojectDirtyPaths()

      return { opsCount: ops.length, duration: Date.now() - start }
    } finally {
      this.setState("idle")
    }
  }

  // ─── State & Diagnostics ────────────────────────────────────────────────

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
    this.lastActivityTime = Date.now()
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
      this.lastActivityTime = Date.now()
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

  // ─── Full Sync Operations ──────────────────────────────────────────────

  async syncFromFs(onProgress?: SyncProgressCallback): Promise<SyncFromFsResult> {
    const gen = this.syncFromFsWithProgress()
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
  }

  async *syncFromFsWithProgress(): AsyncGenerator<StepYield, SyncFromFsResult> {
    log.debug?.(`syncFromFs: scanning ${this.config.repoPath}`)
    const start = Date.now()

    const ignoreMatcher = createIgnoreMatcher(this.config.repoPath)

    yield { declare: ["Scanning", "Reconciling", "Rules"] }

    // Phase 1: Scanning
    yield "Scanning"

    const entries: ScanEntry[] = []
    const dirToFiles = new Map<string, ScanEntry[]>()
    let scanCount = 0

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
      if (scanCount % 25 === 0) {
        yield { current: scanCount, total: 0 }
      }
    }

    const totalFiles = entries.length
    log.debug?.(`syncFromFs: found ${totalFiles} files`)
    yield { current: totalFiles, total: totalFiles }

    // Phase 2: Reconciling
    yield "Reconciling"

    const allOps: ReconcileOp[] = []
    for (const dir of dirToFiles.keys()) {
      const ops = reconcileDirectory(this.db, dir, this.config.repoPath, ignoreMatcher)
      allOps.push(...ops)
    }

    const BATCH_SIZE = 25
    const totalOps = allOps.length || 1
    let opsProcessed = 0

    this.db.run("BEGIN IMMEDIATE")
    try {
      for (let i = 0; i < allOps.length; i += BATCH_SIZE) {
        const batch = allOps.slice(i, i + BATCH_SIZE)
        applyReconcileOps(this.db, batch, this.config.repoPath, wrapEmitterForReconcile(this.emitter))
        opsProcessed += batch.length
        yield { current: opsProcessed, total: totalOps }
      }
      this.db.run("COMMIT")
    } catch (error) {
      this.db.run("ROLLBACK")
      throw error
    }

    if (allOps.length === 0) {
      yield { current: 1, total: 1 }
    }

    // Phase 3: Rules
    yield "Rules"
    const ruleCtx = createRuleContext()
    for (const progress of evaluateAllRules(this.db, ruleCtx)) {
      yield { current: progress.current, total: progress.total }
    }

    const pendingFiles = Array.from(ruleCtx.pendingWriteBack)
    if (pendingFiles.length > 0) {
      log.debug?.(`syncFromFs: writing back ${pendingFiles.length} files after rule evaluation`)
      for (const filePath of pendingFiles) {
        if (!filePath.endsWith(".md")) {
          log.debug?.(`syncFromFs: SKIPPING non-.md file in write-back filePath=${filePath}`)
          continue
        }

        const fileNode = getAllNodes(this.db).find((n) => n.fs_path === filePath)
        if (fileNode) {
          const blockIds = this.handlers.createBlockIdAssigner("rule-evaluation")
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

  async syncToFs(): Promise<{ written: number }> {
    log.debug?.("syncToFs: starting")
    const start = Date.now()

    const nodes = getAllNodes(this.db)
    const fileNodes = nodes.filter(
      (n) => n.type === "h" && n.item && n.fstype === "mdfile" && n.fs_path?.endsWith(".md"),
    )

    log.debug?.(`syncToFs: writing ${fileNodes.length} files`)

    for (const fileNode of fileNodes) {
      if (!fileNode.fs_path) continue
      const blockIds = this.handlers.createBlockIdAssigner("sync-to-fs")
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
