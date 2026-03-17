/**
 * Sync Manager
 *
 * Coordinates bidirectional sync between filesystem and database
 */

import { createLogger } from "loggily"
import { existsSync, mkdirSync, statSync } from "fs"
import type { Database } from "bun:sqlite"

const log = createLogger("km:storage:watch:sync")
import { dirname, join } from "path"
import { toAbsoluteFsPath } from "../path-utils.ts"
import { EventEmitter } from "events"
import { FileSystemWatcher, scanDirectoryRecursiveGen, type ScanEntry } from "./watcher.ts"
import { WorkerWatcher } from "./worker-bridge.ts"
import type { WatcherStatus } from "./worker-thread.ts"
import type { WatcherInterface } from "./types.ts"
import { reconcileDirectory, reconcileDirectoryAsync, applyReconcileOps, applyReconcileOpsAsync } from "./reconcile.ts"
import { createParsePool, type ParsePoolService } from "../parse-pool.ts"
import { findFileNode, titleToFilename } from "./watch-utils.ts"
import { WriteQueue, shouldApplyToFs } from "./writequeue.ts"
import { getIgnorePatterns, createIgnoreMatcher } from "../ignore.ts"
import type { Event, KNode } from "@km/core"
import { isOutline } from "@km/core"
import { createEmitter, type Emitter } from "../emitter.ts"
import { findIndexFile } from "@km/tree"
import { getFolderIndexConfig } from "../config.ts"
import { generateIndexFileContent, indexFileName } from "../index-file-writer.ts"

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
  private parsePool: ParsePoolService | undefined

  // In-flight sync tracking — prevents teardown from closing DB while syncs are running
  private inFlightSyncs: Set<Promise<void>> = new Set()
  private stopped = false

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
    this.emitter = createEmitter({ kmDir: this.kmDir, db: this.db })

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
    })

    this.writeQueue.setWatcher(this.watcher)

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
    // Wait for in-flight syncs to complete before clearing resources
    if (this.inFlightSyncs.size > 0) {
      log.debug?.(`waiting for ${this.inFlightSyncs.size} in-flight syncs`)
      await Promise.allSettled([...this.inFlightSyncs])
    }
    this.writeQueue.clear()
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
      const ops = await reconcileDirectoryAsync(
        this.db,
        this.config.repoPath,
        this.config.repoPath,
        this.ignorePatterns,
      )

      if (ops.length > 0) {
        log.debug?.(`heartbeat: found ${ops.length} changes (drift detected)`)
        this.heartbeatDrift += ops.length

        this.setState("emitting")
        await applyReconcileOpsAsync({
          db: this.db,
          ops,
          repoRoot: this.config.repoPath,
          emitter: this.emitter,
          parsePool: await this.getParsePool(),
        })

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
   * Force a heartbeat reconciliation now (for testing/debugging)
   */
  forceHeartbeat(): { opsCount: number; duration: number } {
    const start = Date.now()
    this.setState("reconciling")

    try {
      const ops = reconcileDirectory(this.db, this.config.repoPath, this.config.repoPath, this.ignorePatterns)

      if (ops.length > 0) {
        this.setState("emitting")
        applyReconcileOps(this.db, ops, this.config.repoPath, this.emitter)
        this.heartbeatDrift += ops.length
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
      await Promise.allSettled([...this.inFlightSyncs])
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
    promise.finally(() => this.inFlightSyncs.delete(promise))
  }

  private async handleFsSyncInner(data: { paths: string[]; directories: string[] }): Promise<void> {
    // Bail out if stop() has been called to prevent accessing closed resources
    if (this.stopped) return

    using span = log.span("fs-sync", { paths: data.paths.length, dirs: data.directories.length })
    this.lastActivityTime = Date.now()
    this.setState("reconciling")

    try {
      for (const dir of data.directories) {
        if (this.stopped) break
        using dirSpan = span.span("reconcile-dir", { dir })
        const ops = await reconcileDirectoryAsync(this.db, dir, this.config.repoPath, this.ignorePatterns)
        dirSpan.spanData.ops = ops.length

        if (ops.length > 0 && !this.stopped) {
          this.setState("emitting")
          using applySpan = dirSpan.span("apply")
          await applyReconcileOpsAsync({
            db: this.db,
            ops,
            repoRoot: this.config.repoPath,
            emitter: this.emitter,
            parsePool: await this.getParsePool(),
          })
          applySpan.spanData.ops = ops.length
        }
      }
    } catch (error) {
      // Suppress errors after stop (DB closed, temp dir removed — expected during teardown)
      if (this.stopped) return
      span.error?.(error instanceof Error ? error : String(error))
      this.emit("error", error)
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

  /**
   * Apply a database event to filesystem
   */
  applyEventToFs(event: Event): void {
    if (!shouldApplyToFs(event.actor)) {
      log.debug?.(`skipping fs apply for actor=${event.actor} event=${event.type}`)
      return
    }

    log.debug?.(`applying ${event.type} to fs: ${event.target ?? "no-target"}`)

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
   * Create an assignBlockId callback that collects newly assigned IDs.
   * After serialization, call rewriteSourceFiles to queue ^block-id
   * suffix writes into the files that contain the referenced nodes.
   */
  private createBlockIdAssigner(eventId: string): {
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
          node.block_id = blockId // Update in-memory for serialization
          const file = this.findFileNode(node)
          if (file && file.id !== excludeFileId) fileIds.add(file.id)
        }
        // Queue rewrites for affected source files (no assignBlockId to prevent cascading)
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
            sourceEventId: eventId,
          })
        }
      },
    }
  }

  /** Walk up parent chain to find the containing file node */
  private findFileNode(node: KNode): KNode | null {
    return findFileNode(this.db, node)
  }

  /**
   * Regenerate the file containing a given node.
   * Looks up the parent chain to find the file node, then serializes
   * its subtree to markdown and queues a write.
   *
   * @param nodeOrParentId - A node to find the file for, or a parent_id to look up first
   * @param eventId - The event ID that triggered the regeneration
   * @param reconcileFirst - If true, reconcile pending FS changes before regenerating
   */
  private regenerateFileForNode(nodeOrParentId: KNode | string, eventId: string, reconcileFirst = false): void {
    const node = typeof nodeOrParentId === "string" ? getNode(this.db, nodeOrParentId) : nodeOrParentId
    if (!node) return
    const fileNode = findFileNode(this.db, node)
    if (!fileNode?.fs_path) return

    if (reconcileFirst) {
      this.reconcileIfChanged(fileNode)
    }

    const blockIds = this.createBlockIdAssigner(eventId)
    const absPath = toAbsoluteFsPath(this.config.repoPath, fileNode.fs_path)
    const subtreeNodes = getSubtree(this.db, fileNode.id)
    const content = nodesToMarkdown(subtreeNodes, getAllNodes(this.db), blockIds.assign)
    this.writeQueue.queue({
      path: absPath,
      content,
      sourceEventId: eventId,
    })
    blockIds.rewriteSourceFiles(fileNode.id)
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
    const changes = event.data as Partial<KNode>

    // Folder rename: content change on a folder → rename directory on disk
    if (node.type === "h" && node.item && node.fstype === "folder" && node.fs_path && changes.content) {
      this.handleFolderRename(node, changes.content, event.id)
      return
    }

    // Folder metadata update: update or create index file
    if (node.type === "h" && node.item && node.fstype === "folder" && node.fs_path) {
      this.handleFolderIndexUpdate(node, event.id)
      return
    }

    // Find the file this node belongs to
    const fileNode = findFileNode(this.db, node)
    if (!fileNode?.fs_path) {
      log.warn?.(`handleNodeUpdated: no file node found for ${node.id} (type=${node.type})`)
      return
    }

    // File rename: content change on the file node itself → rename .md file on disk
    if (node.id === fileNode.id && changes.content && fileNode.fs_path.endsWith(".md")) {
      this.handleFileRename(fileNode, changes.content, event.id)
      // After rename, still regenerate content at the new path (fall through)
    }

    const absPath = toAbsoluteFsPath(this.config.repoPath, fileNode.fs_path)

    // Check if file has been modified externally (mtime differs from DB)
    // If so, reconcile first to avoid losing external changes
    this.reconcileIfChanged(fileNode)

    // Regenerate the file from (now-updated) DB state
    const blockIds = this.createBlockIdAssigner(event.id)
    const subtreeNodes = getSubtree(this.db, fileNode.id)
    const content = nodesToMarkdown(subtreeNodes, getAllNodes(this.db), blockIds.assign)

    this.writeQueue.queue({
      path: absPath,
      content,
      sourceEventId: event.id,
    })
    blockIds.rewriteSourceFiles(fileNode.id)
  }

  /**
   * Rename a folder directory on disk and update all descendant fs_path values.
   */
  /**
   * Update or create an index file for a folder node.
   * Respects the folderIndex config — does nothing if materialization is "none".
   */
  private handleFolderIndexUpdate(node: KNode, eventId: string): void {
    const config = getFolderIndexConfig(this.config.repoPath)
    if (config.materialization === "none") return

    const folderPath = node.fs_path
    if (!folderPath) return

    const children = getChildren(this.db, node.id)
    const existingIndex = findIndexFile(node, children)

    const title = node.content ?? node.name ?? ""
    if (!title) {
      log.warn?.(`handleFolderIndexUpdate: folder ${node.id} has no title or name, skipping index file`)
      return
    }
    const childSlots = children.filter(
      (c) => (!existingIndex || c.id !== existingIndex.id) && isOutline(c.type, c.item),
    )
    const content = generateIndexFileContent(
      title,
      "",
      childSlots.map((c) => ({ name: c.name ?? "" })),
      config.materialization,
    )

    if (existingIndex?.fs_path) {
      const absPath = toAbsoluteFsPath(this.config.repoPath, existingIndex.fs_path)
      this.writeQueue.queue({ path: absPath, content, sourceEventId: eventId })
    } else {
      const filename = indexFileName(node.name ?? "", config.naming)
      const newFsPath = join(folderPath, filename)
      const absPath = toAbsoluteFsPath(this.config.repoPath, newFsPath)
      this.writeQueue.queue({ path: absPath, content, sourceEventId: eventId })
    }
  }

  private handleFolderRename(node: KNode, newName: string, eventId: string): void {
    const oldFsPath = node.fs_path ?? ""
    const oldAbsPath = toAbsoluteFsPath(this.config.repoPath, oldFsPath)
    const parentDir = dirname(oldFsPath)
    const newFsPath = parentDir === "." ? newName : join(parentDir, newName)
    const newAbsPath = toAbsoluteFsPath(this.config.repoPath, newFsPath)

    if (oldAbsPath === newAbsPath) return

    // Collision check: don't overwrite an existing directory
    if (existsSync(newAbsPath)) {
      log.warn?.(`folder rename aborted: target already exists: ${newFsPath}`)
      return
    }

    log.info?.(`folder rename: ${oldFsPath} → ${newFsPath}`)

    // Queue the directory rename
    this.writeQueue.queueRename(oldAbsPath, newAbsPath, eventId)

    // Update fs_path for this node and all descendants in DB
    // Use REPLACE to update paths that start with the old prefix
    const oldPrefix = oldFsPath + "/"
    const newPrefix = newFsPath + "/"
    this.db.run("UPDATE nodes SET fs_path = ?, name = ?, updated_at = ? WHERE id = ?", [
      newFsPath,
      newName,
      Date.now(),
      node.id,
    ])
    // Update all descendants whose fs_path starts with oldPrefix
    this.db.run(`UPDATE nodes SET fs_path = ? || SUBSTR(fs_path, ?), updated_at = ? WHERE fs_path LIKE ?`, [
      newPrefix,
      oldPrefix.length + 1,
      Date.now(),
      oldPrefix + "%",
    ])
  }

  /**
   * Rename a .md file on disk when its H1 title changes.
   * Derives new filename from the title, renames the file, updates DB.
   * Mutates fileNode.fs_path and fileNode.name in place so callers use the new path.
   */
  private handleFileRename(fileNode: KNode, newTitle: string, eventId: string): void {
    const oldFsPath = fileNode.fs_path
    if (!oldFsPath) {
      throw new Error("[sync] handleFileRename: fileNode has no fs_path")
    }
    const newFileName = titleToFilename(newTitle)
    const parentDir = dirname(oldFsPath)
    const newFsPath = parentDir === "." ? newFileName : join(parentDir, newFileName)

    if (oldFsPath === newFsPath) return

    const oldAbsPath = toAbsoluteFsPath(this.config.repoPath, oldFsPath)
    const newAbsPath = toAbsoluteFsPath(this.config.repoPath, newFsPath)

    // Collision check: don't overwrite an existing file
    if (existsSync(newAbsPath)) {
      log.warn?.(`file rename aborted: target already exists: ${newFsPath}`)
      return
    }

    log.info?.(`file rename: ${oldFsPath} → ${newFsPath}`)

    // Queue the file rename
    this.writeQueue.queueRename(oldAbsPath, newAbsPath, eventId)

    // Update DB: fs_path, name, and title (title is used by nodesToMarkdown for H1 heading)
    const newName = newFileName.replace(/\.md$/i, "")
    this.db.run("UPDATE nodes SET fs_path = ?, name = ?, title = ?, updated_at = ? WHERE id = ?", [
      newFsPath,
      newName,
      newTitle,
      Date.now(),
      fileNode.id,
    ])

    // Mutate the node so the caller writes content to the new path
    fileNode.fs_path = newFsPath
    fileNode.name = newName
  }

  /**
   * Reconcile a file if it has been modified externally (mtime differs from DB).
   * This prevents data loss when DB changes race with FS changes.
   */
  private reconcileIfChanged(fileNode: KNode): void {
    if (!fileNode.fs_path) return
    const absPath = toAbsoluteFsPath(this.config.repoPath, fileNode.fs_path)
    if (!existsSync(absPath)) return

    try {
      const stat = statSync(absPath)
      const dbMtime = fileNode.fs_mtime

      if (dbMtime !== undefined && stat.mtimeMs !== dbMtime) {
        log.debug?.(
          `reconcile-before-write: file changed externally, reconciling path=${absPath} dbMtime=${dbMtime} fsMtime=${stat.mtimeMs}`,
        )

        // Reconcile this directory to bring FS changes into DB
        const dir = dirname(absPath)
        const ops = reconcileDirectory(this.db, dir, this.config.repoPath, this.ignorePatterns)

        if (ops.length > 0) {
          log.debug?.(`reconcile-before-write: applying ${ops.length} ops`)
          // Apply synchronously to ensure DB is updated before we regenerate
          applyReconcileOps(this.db, ops, this.config.repoPath, this.emitter)
        }
      }
    } catch (err) {
      log.error?.(`reconcile-before-write: error checking file ${absPath}: ${String(err)}`)
    }
  }

  /**
   * Handle node created event
   */
  private handleNodeCreated(event: Event): void {
    const data = event.data as Partial<KNode>

    if (data.type === "h" && data.item && data.fstype === "folder" && data.fs_path) {
      // Create directory — resolve relative path for FS operation
      const absPath = toAbsoluteFsPath(this.config.repoPath, data.fs_path)
      try {
        mkdirSync(absPath, { recursive: true })
      } catch (err) {
        this.emit("error", err instanceof Error ? err : new Error(String(err)))
      }
    } else if (data.type === "h" && data.item && (data.fstype === "file" || data.fstype === "mdfile") && data.fs_path) {
      // Create file — resolve relative path for FS operation
      const absPath = toAbsoluteFsPath(this.config.repoPath, data.fs_path)
      this.writeQueue.queue({
        path: absPath,
        content: "",
        sourceEventId: event.id,
      })
    } else if (data.parent_id && data.parent_id !== ".") {
      // Section/task/paragraph node: regenerate parent file to include it
      this.regenerateFileForNode(data.parent_id, event.id)
    }
  }

  /**
   * Handle node deleted event
   */
  private handleNodeDeleted(event: Event): void {
    if (!event.target) return

    // Node is already deleted from DB — use data passed in event payload
    const data = event.data as
      | {
          fs_path?: string
          type?: string
          parent_id?: string | null
        }
      | undefined
    const fsPath = data?.fs_path
    const nodeType = data?.type

    if (fsPath && nodeType === "h" && data?.item) {
      // File/folder node: delete the file from disk
      const absPath = toAbsoluteFsPath(this.config.repoPath, fsPath)
      this.writeQueue.queueDelete(absPath, event.id)

      // If deleted node's parent is a folder, regenerate index file (in case it was the index)
      const parentId = data.parent_id
      if (parentId && parentId !== ".") {
        const parent = getNode(this.db, parentId)
        if (parent?.fstype === "folder" && parent.fs_path) {
          this.handleFolderIndexUpdate(parent, event.id)
        }
      }
    } else if (data?.parent_id) {
      // Section node: regenerate the parent file to reflect the deletion
      this.regenerateFileForNode(data.parent_id, event.id)
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

    // Regenerate affected files (reconcile first to avoid losing external changes)
    this.regenerateFileForNode(node, event.id, true)

    // If moved node's parent is a folder with materialization, regenerate its index file
    const parent = node.parent_id ? getNode(this.db, node.parent_id) : null
    if (parent?.fstype === "folder" && parent.fs_path) {
      this.handleFolderIndexUpdate(parent, event.id)
    }
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
        applyReconcileOps(this.db, batch, this.config.repoPath, this.emitter)
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
}
