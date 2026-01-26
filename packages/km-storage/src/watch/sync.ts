/**
 * Sync Manager
 *
 * Coordinates bidirectional sync between filesystem and database
 */

import createDebug from "debug"
import { existsSync, mkdirSync, statSync } from "fs"
import type { Database } from "bun:sqlite"

const debug = createDebug("km:storage:watch:sync")
import { dirname, join } from "path"
import { EventEmitter } from "events"
import { FileSystemWatcher, scanDirectoryRecursive } from "./watcher.ts"
import { WorkerWatcher } from "./worker-bridge.ts"
import type { WatcherStatus } from "./worker-thread.ts"
import type { WatcherInterface } from "./types.ts"
import { reconcileDirectory, applyReconcileOps } from "./reconcile.ts"
import { WriteQueue, shouldApplyToFs } from "./writequeue.ts"
import { getIgnorePatterns } from "./ignore.ts"
import type { Event, KNode } from "@km/core"
import type { ProgressCallback } from "@beorn/inkx-ui"
import { runWithKmDir } from "../emit.ts"
import {
  getAllNodes,
  getNode,
  getSubtree,
  nodesToMarkdown,
  evaluateAllRules,
  getPendingWriteBack,
} from "../index.ts"

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

export type SyncState =
  | "idle"
  | "fs_debouncing"
  | "db_debouncing"
  | "reconciling"
  | "applying"
  | "emitting"
  | "writing"

export class SyncManager extends EventEmitter {
  private db: Database
  private config: SyncConfig
  private watcher: WatcherInterface
  private writeQueue: WriteQueue
  private state: SyncState = "idle"
  private ignorePatterns: string[] = []
  private kmDir: string // Stored for async handlers that run outside initial context

  // Heartbeat reconciliation
  private heartbeatConfig: HeartbeatConfig
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private lastActivityTime: number = Date.now()
  private heartbeatDrift: number = 0 // Changes found during heartbeat

  constructor(config: SyncConfig) {
    super()
    this.db = config.db
    this.config = { ...DEFAULT_CONFIG, ...config } as SyncConfig
    this.kmDir = join(this.config.repoPath, ".km")

    // Initialize heartbeat config
    this.heartbeatConfig = {
      ...DEFAULT_HEARTBEAT,
      ...config.heartbeat,
    }

    // Use injected watcher if provided (for testing with ChaosWatcher)
    // Otherwise use worker-based watcher by default (non-blocking)
    // Fall back to direct watcher if useWorker is explicitly false
    if (config.watcher) {
      debug("using injected watcher")
      this.watcher = config.watcher
    } else if (this.config.useWorker !== false) {
      debug("using WorkerWatcher (non-blocking)")
      this.watcher = new WorkerWatcher({
        debounceMs: this.config.debounceFs,
      })
    } else {
      debug("using FileSystemWatcher (direct)")
      this.watcher = new FileSystemWatcher({
        debounceMs: this.config.debounceFs,
      })
    }

    this.writeQueue = new WriteQueue({
      debounceMs: this.config.debounceApply,
    })

    this.writeQueue.setWatcher(this.watcher)

    // Wire up events
    this.watcher.on("sync", (data) => void this.handleFsSync(data))
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
    debug("starting sync manager for %s", this.config.repoPath)
    // Load ignore patterns for reconciliation
    this.ignorePatterns = getIgnorePatterns(this.config.repoPath)
    this.watcher.start(this.config.repoPath)

    // Start heartbeat timer if enabled
    this.startHeartbeat()

    this.emit("started")
  }

  /**
   * Stop watching and syncing
   */
  async stop(): Promise<void> {
    debug("stopping sync manager")
    this.stopHeartbeat()
    await this.watcher.stop()
    this.writeQueue.clear()
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
      debug("heartbeat disabled")
      return
    }

    if (this.heartbeatTimer) {
      return // Already running
    }

    debug(
      "starting heartbeat: interval=%dms, idleThreshold=%dms",
      this.heartbeatConfig.intervalMs,
      this.heartbeatConfig.idleThresholdMs,
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
      this.heartbeatTimer = null
      debug("heartbeat stopped")
    }
  }

  /**
   * Run heartbeat reconciliation if idle
   *
   * Note: This runs within runWithKmDir context because it's triggered by
   * setInterval, which doesn't inherit AsyncLocalStorage context.
   */
  private runHeartbeat(): void {
    const now = Date.now()
    const idleTime = now - this.lastActivityTime

    // Only run if we've been idle long enough
    if (idleTime < this.heartbeatConfig.idleThresholdMs) {
      debug(
        "heartbeat: skipping, idle=%dms < threshold=%dms",
        idleTime,
        this.heartbeatConfig.idleThresholdMs,
      )
      return
    }

    // Don't run if we're in the middle of something
    if (this.state !== "idle") {
      debug("heartbeat: skipping, state=%s", this.state)
      return
    }

    // Don't run if there are pending writes
    if (this.writeQueue.getPendingCount() > 0) {
      debug(
        "heartbeat: skipping, pending writes=%d",
        this.writeQueue.getPendingCount(),
      )
      return
    }

    debug("heartbeat: running reconciliation")
    const start = Date.now()

    try {
      this.setState("reconciling")

      runWithKmDir(this.kmDir, () => {
        // Scan entire repo for changes
        const ops = reconcileDirectory(
          this.db,
          this.config.repoPath,
          this.config.repoPath,
          this.ignorePatterns,
        )

        if (ops.length > 0) {
          debug("heartbeat: found %d changes (drift detected)", ops.length)
          this.heartbeatDrift += ops.length

          this.setState("emitting")
          applyReconcileOps(this.db, ops, this.config.repoPath)

          // Emit event so consumers know about drift
          this.emit("heartbeat:drift", {
            opsCount: ops.length,
            totalDrift: this.heartbeatDrift,
          })
        }

        debug(
          "heartbeat: completed in %dms, ops=%d",
          Date.now() - start,
          ops.length,
        )
        this.emit("heartbeat:complete", {
          duration: Date.now() - start,
          opsCount: ops.length,
        })
      })
    } catch (error) {
      debug("heartbeat: error %O", error)
      this.emit("error", error)
    } finally {
      this.setState("idle")
    }
  }

  /**
   * Force a heartbeat reconciliation now (for testing/debugging)
   *
   * Note: This runs within runWithKmDir context because it may be called
   * from contexts that don't have AsyncLocalStorage setup.
   */
  forceHeartbeat(): { opsCount: number; duration: number } {
    const start = Date.now()
    this.setState("reconciling")

    try {
      return runWithKmDir(this.kmDir, () => {
        const ops = reconcileDirectory(
          this.db,
          this.config.repoPath,
          this.config.repoPath,
          this.ignorePatterns,
        )

        if (ops.length > 0) {
          this.setState("emitting")
          applyReconcileOps(this.db, ops, this.config.repoPath)
          this.heartbeatDrift += ops.length
        }

        return { opsCount: ops.length, duration: Date.now() - start }
      })
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
   * Handle filesystem sync event
   *
   * Note: This runs within runWithKmDir context because it's triggered by
   * worker thread messages, which don't inherit AsyncLocalStorage context.
   */
  private handleFsSync(data: { paths: string[]; directories: string[] }): void {
    debug(
      "fs sync triggered: %d paths, %d directories",
      data.paths.length,
      data.directories.length,
    )
    this.lastActivityTime = Date.now()
    this.setState("reconciling")

    try {
      runWithKmDir(this.kmDir, () => {
        for (const dir of data.directories) {
          const ops = reconcileDirectory(
            this.db,
            dir,
            this.config.repoPath,
            this.ignorePatterns,
          )
          debug("reconciled %s: %d ops", dir, ops.length)

          if (ops.length > 0) {
            this.setState("emitting")
            applyReconcileOps(this.db, ops, this.config.repoPath)
          }
        }
      })
    } catch (error) {
      debug("fs sync error: %O", error)
      this.emit("error", error)
    }

    this.lastActivityTime = Date.now()
    this.setState("idle")
  }

  private setState(newState: SyncState): void {
    if (this.state !== newState) {
      debug("state: %s → %s", this.state, newState)
      this.state = newState
      this.emit("state-change", this.state)
    }
  }

  /**
   * Apply a database event to filesystem
   */
  applyEventToFs(event: Event): void {
    if (!shouldApplyToFs(event.actor)) {
      debug("skipping fs apply for actor=%s event=%s", event.actor, event.type)
      return
    }

    debug("applying %s to fs: %s", event.type, event.target ?? "no-target")

    switch (event.type) {
      case "node_updated":
        this.handleNodeUpdated(event)
        break
      case "node_created":
        this.handleNodeCreated(event)
        break
      case "node_deleted":
        this.handleNodeDeleted(event)
        break
      case "node_moved":
        this.handleNodeMoved(event)
        break
    }
  }

  /**
   * Handle node updated event - regenerate file
   *
   * CRITICAL: Before regenerating, we must reconcile any pending FS changes
   * to avoid data loss. If the file was modified externally (mtime differs),
   * we reconcile first to bring FS changes into DB, then regenerate.
   */
  private handleNodeUpdated(event: Event): void {
    if (!event.target) return

    const node = getNode(this.db, event.target)
    if (!node) return

    // Find the file this node belongs to
    const fileNode = findFileNode(this.db, node)
    if (!fileNode?.fs_path) return

    // Check if file has been modified externally (mtime differs from DB)
    // If so, reconcile first to avoid losing external changes
    this.reconcileIfChanged(fileNode)

    // Regenerate the file from (now-updated) DB state
    const allNodes = getSubtree(this.db, fileNode.id)
    const content = nodesToMarkdown(allNodes)

    this.writeQueue.queue({
      path: fileNode.fs_path,
      content,
      sourceEventId: event.id,
    })
  }

  /**
   * Reconcile a file if it has been modified externally (mtime differs from DB).
   * This prevents data loss when DB changes race with FS changes.
   */
  private reconcileIfChanged(fileNode: KNode): void {
    if (!fileNode.fs_path || !existsSync(fileNode.fs_path)) return

    try {
      const stat = statSync(fileNode.fs_path)
      const dbMtime = fileNode.fs_mtime

      if (dbMtime !== undefined && stat.mtimeMs !== dbMtime) {
        debug("reconcile-before-write: file changed externally, reconciling", {
          path: fileNode.fs_path,
          dbMtime,
          fsMtime: stat.mtimeMs,
        })

        // Reconcile this directory to bring FS changes into DB
        const dir = dirname(fileNode.fs_path)
        const ops = reconcileDirectory(
          this.db,
          dir,
          this.config.repoPath,
          this.ignorePatterns,
        )

        if (ops.length > 0) {
          debug("reconcile-before-write: applying %d ops", ops.length)
          // Apply synchronously to ensure DB is updated before we regenerate
          void applyReconcileOps(this.db, ops, this.config.repoPath)
        }
      }
    } catch (err) {
      debug("reconcile-before-write: error checking file", err)
      // Continue with write anyway - better than losing the DB change
    }
  }

  /**
   * Handle node created event
   */
  private handleNodeCreated(event: Event): void {
    const data = event.data as Partial<KNode>

    if (data.type === "folder" && data.fs_path) {
      // Create directory
      try {
        mkdirSync(data.fs_path, { recursive: true })
      } catch {
        // Ignore errors
      }
    } else if (data.type === "file" && data.fs_path) {
      // Create file
      this.writeQueue.queue({
        path: data.fs_path,
        content: "",
        sourceEventId: event.id,
      })
    }
  }

  /**
   * Handle node deleted event
   */
  private handleNodeDeleted(event: Event): void {
    if (!event.target) return

    // Get node before deletion (using km-storage abstraction)
    const node = getNode(this.db, event.target)

    if (node?.fs_path && (node.type === "file" || node.type === "folder")) {
      this.writeQueue.queueDelete(node.fs_path, event.id)
    }
  }

  /**
   * Handle node moved event
   *
   * CRITICAL: Before regenerating, we must reconcile any pending FS changes
   * to avoid data loss (same as handleNodeUpdated).
   */
  private handleNodeMoved(event: Event): void {
    // Movement might require file regeneration
    if (!event.target) return

    const node = getNode(this.db, event.target)
    if (!node) return

    // Regenerate affected files
    const fileNode = findFileNode(this.db, node)
    if (fileNode?.fs_path) {
      // Check if file has been modified externally and reconcile if needed
      this.reconcileIfChanged(fileNode)

      const allNodes = getSubtree(this.db, fileNode.id)
      const content = nodesToMarkdown(allNodes)

      this.writeQueue.queue({
        path: fileNode.fs_path,
        content,
        sourceEventId: event.id,
      })
    }
  }

  /**
   * Force sync from filesystem
   *
   * @param onProgress - Optional callback for progress reporting
   */
  async syncFromFs(onProgress?: ProgressCallback): Promise<SyncFromFsResult> {
    debug("syncFromFs: scanning %s", this.config.repoPath)
    const start = Date.now()

    // Run within kmDir context so database operations use correct path
    const kmDir = join(this.config.repoPath, ".km")

    return runWithKmDir(kmDir, async () => {
      // Event application handled via context-local database in emit.ts

      // Load ignore patterns for this repo
      const ignorePatterns = getIgnorePatterns(this.config.repoPath)

      // Phase 1: Scanning
      onProgress?.({ phase: "scanning", current: 0, total: 1 })

      const entries = scanDirectoryRecursive(
        this.config.repoPath,
        (path) => path.endsWith(".md"),
        ignorePatterns,
      )

      debug("syncFromFs: found %d entries", entries.length)

      // Group by directory
      const dirs = new Set<string>()

      for (const entry of entries) {
        dirs.add(dirname(entry.path))
      }

      onProgress?.({ phase: "scanning", current: 1, total: 1 })

      // Phase 2: Reconciling
      const dirArray = Array.from(dirs)
      const totalDirs = dirArray.length
      let processed = 0

      for (const [i, dir] of dirArray.entries()) {
        const ops = reconcileDirectory(
          this.db,
          dir,
          this.config.repoPath,
          ignorePatterns,
        )
        applyReconcileOps(this.db, ops, this.config.repoPath)
        processed += ops.length

        // Report progress for each directory
        onProgress?.({
          phase: "reconciling",
          current: i + 1,
          total: totalDirs,
        })
      }

      // Phase 3: Evaluate rules (add= materialization)
      for (const progress of evaluateAllRules(this.db)) {
        onProgress?.({
          phase: "rules",
          current: progress.current,
          total: progress.total,
        })
      }

      // Write back any files that were modified by rule evaluation
      // SAFETY: Only write .md files to prevent corruption of source code/config files
      const pendingFiles = getPendingWriteBack()
      if (pendingFiles.length > 0) {
        debug(
          "syncFromFs: writing back %d files after rule evaluation",
          pendingFiles.length,
        )
        for (const filePath of pendingFiles) {
          // CRITICAL: Skip non-.md files to prevent corruption
          if (!filePath.endsWith(".md")) {
            debug("syncFromFs: SKIPPING non-.md file in write-back", {
              filePath,
            })
            continue
          }

          // Find the file node and regenerate its content
          const fileNode = getAllNodes(this.db).find(
            (n) => n.fs_path === filePath,
          )
          if (fileNode) {
            const subtree = getSubtree(this.db, fileNode.id)
            const content = nodesToMarkdown(subtree)
            this.writeQueue.queue({
              path: filePath,
              content,
              sourceEventId: "rule-evaluation",
            })
          }
        }
        await this.writeQueue.forceFlush()
      }

      const duration = Date.now() - start
      debug(
        "syncFromFs: processed %d ops in %d dirs in %dms",
        processed,
        totalDirs,
        duration,
      )
      return { processed, directories: totalDirs, duration }
    })
  }

  /**
   * Force sync to filesystem
   *
   * SAFETY: Only writes .md files. Never touches source code, config files, or binaries.
   * This is critical to prevent corruption of non-repo files (km-me0n bug).
   */
  async syncToFs(): Promise<{ written: number }> {
    debug("syncToFs: starting")
    const start = Date.now()

    // Run within kmDir context so database operations use correct path
    const kmDir = join(this.config.repoPath, ".km")

    return runWithKmDir(kmDir, async () => {
      const nodes = getAllNodes(this.db)
      // CRITICAL: Only sync .md files to prevent corruption of source code/config files
      const fileNodes = nodes.filter(
        (n) => n.type === "file" && n.fs_path?.endsWith(".md"),
      )

      debug("syncToFs: writing %d files", fileNodes.length)

      for (const fileNode of fileNodes) {
        if (!fileNode.fs_path) continue
        const subtree = getSubtree(this.db, fileNode.id)
        const content = nodesToMarkdown(subtree)

        this.writeQueue.queue({
          path: fileNode.fs_path,
          content,
          sourceEventId: "sync-to-fs",
        })
      }

      await this.writeQueue.forceFlush()

      debug(
        "syncToFs: wrote %d files in %dms",
        fileNodes.length,
        Date.now() - start,
      )
      return { written: fileNodes.length }
    })
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
}

/**
 * Find the file node that contains a given node
 */
function findFileNode(db: Database, node: KNode): KNode | null {
  if (node.type === "file") {
    return node
  }

  if (!node.parent_id) {
    return null
  }

  const parent = getNode(db, node.parent_id)
  if (!parent) {
    return null
  }

  return findFileNode(db, parent)
}

/**
 * One-time sync from filesystem to database
 */
export async function syncOnce(
  db: Database,
  repoPath: string,
): Promise<{
  created: number
  updated: number
  deleted: number
}> {
  const manager = new SyncManager({
    db,
    repoPath,
    debounceFs: 0,
    debounceApply: 0,
    conflictStrategy: "fs_wins",
  })

  const result = await manager.syncFromFs()

  return {
    created: result.processed,
    updated: 0,
    deleted: 0,
  }
}
