/**
 * Worker-based Filesystem Watcher
 *
 * Wraps a Web Worker that runs chokidar, providing the same interface as FileSystemWatcher
 * but without blocking the main event loop during initialization.
 *
 * This solves the problem of chokidar blocking for 20+ seconds on large directories (21k+ files)
 * during FSEvents setup.
 */

import { createLogger } from "loggily"
import { createWorkerLogHandler } from "loggily/worker"
import { EventEmitter } from "events"
import { getIgnorePatterns } from "../fs/ignore.ts"
import type { WorkerCommand, WorkerMessage, WatcherStatus, WatcherState } from "./worker-thread.ts"

const log = createLogger("km:storage:watch:worker-bridge")
// Handler for worker logger messages
const handleWorkerLog = createWorkerLogHandler()

export interface WorkerWatcherConfig {
  debounceMs: number
}

const DEFAULT_CONFIG: WorkerWatcherConfig = {
  debounceMs: 5000,
}

/**
 * Worker-based filesystem watcher
 *
 * Provides the same interface as FileSystemWatcher but runs chokidar in a worker thread
 * to avoid blocking the main event loop.
 */
export class WorkerWatcher extends EventEmitter {
  private worker: Worker | null = null
  private config: WorkerWatcherConfig
  private repoPath: string = ""
  private isReady: boolean = false
  private currentStatus: WatcherStatus = {
    state: "stopped",
    pendingPaths: 0,
  }

  constructor(config: Partial<WorkerWatcherConfig> = {}) {
    super()
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Start watching a directory
   *
   * Unlike FileSystemWatcher, this returns immediately and emits 'ready' when
   * the worker has finished initializing chokidar.
   */
  start(repoPath: string): void {
    this.repoPath = repoPath
    log.debug?.(`starting worker watcher for ${repoPath}`)

    // Load ignore patterns (this is fast, runs in main thread)
    const ignorePatterns = getIgnorePatterns(repoPath)
    log.debug?.(`ignore patterns: ${JSON.stringify(ignorePatterns)}`)

    // Create worker
    // Use import.meta.url to resolve the worker file path
    this.worker = new Worker(new URL("./worker-thread.ts", import.meta.url))

    // Handle messages from worker
    this.worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      this.handleWorkerMessage(event.data)
    }

    this.worker.onerror = (error: ErrorEvent) => {
      log.debug?.(`worker error: ${error.message}`)
      this.emit("error", new Error(error.message))
    }

    // Send start command to worker
    this.postCommand({
      type: "start",
      repoPath,
      ignorePatterns,
      debounceMs: this.config.debounceMs,
    })
  }

  /**
   * Stop watching
   */
  async stop(): Promise<void> {
    log.debug?.("stopping worker watcher")

    if (!this.worker) {
      return
    }

    const worker = this.worker
    this.worker = null
    this.isReady = false

    // Request worker to stop
    worker.postMessage({ type: "stop" } satisfies WorkerCommand)

    // Wait for stopped message or timeout
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        log.debug?.("worker stop timeout, terminating")
        worker.terminate()
        resolve()
      }, 5000)

      // Listen for stopped message
      worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        if (event.data.type === "stopped") {
          log.debug?.("worker stopped gracefully")
          clearTimeout(timeout)
          // Don't call terminate() after graceful stop - causes Bun segfault (km-a4l5)
          // The worker has already cleaned up; calling terminate() races with internal cleanup
          resolve()
        }
      }
    })
  }

  /**
   * Mark a path as in-flight (being written by us)
   */
  markInFlight(path: string): void {
    log.debug?.(`marking in-flight: ${path}`)
    this.postCommand({ type: "markInFlight", path })
  }

  /**
   * Clear in-flight status after write settles
   */
  clearInFlight(path: string, delayMs: number = 1000): void {
    this.postCommand({ type: "clearInFlight", path, delayMs })
  }

  /**
   * Check if a path is in-flight
   *
   * Note: This is best-effort since the worker maintains the actual set.
   * For strict checking, the caller should track this themselves.
   */
  isInFlight(_path: string): boolean {
    // Worker maintains the in-flight set, we can't query it synchronously
    // Callers should track their own writes if they need synchronous checks
    return false
  }

  /**
   * Force immediate sync (bypass debounce)
   */
  forceSync(): void {
    this.postCommand({ type: "forceSync" })
  }

  /**
   * Check if the watcher is ready
   */
  get ready(): boolean {
    return this.isReady
  }

  /**
   * Get current watcher status
   */
  getStatus(): WatcherStatus {
    return this.currentStatus
  }

  /**
   * Get current watcher state
   */
  getState(): WatcherState {
    return this.currentStatus.state
  }

  /**
   * Request status update from worker
   */
  requestStatus(): void {
    this.postCommand({ type: "getStatus" })
  }

  /**
   * Handle messages from the worker
   */
  private handleWorkerMessage(message: WorkerMessage): void {
    switch (message.type) {
      case "ready":
        log.debug?.("worker ready")
        this.isReady = true
        this.emit("ready")
        break

      case "sync":
        log.debug?.(`worker sync: ${message.paths.length} paths, ${message.directories.length} directories`)
        this.emit("sync", {
          paths: message.paths,
          directories: message.directories,
        })
        break

      case "error":
        log.debug?.(`worker error: ${message.message}`)
        this.emit("error", new Error(message.message))
        break

      case "stopped":
        log.debug?.("worker stopped")
        this.currentStatus = { state: "stopped", pendingPaths: 0 }
        break

      case "status":
        log.debug?.(`worker status state=${message.status.state} pending=${message.status.pendingPaths}`)
        this.currentStatus = message.status
        this.emit("status", message.status)
        break

      case "log":
      case "span":
      case "console":
        // Forward worker logger messages through main thread's logger
        handleWorkerLog(message)
        break
    }
  }

  /**
   * Send a command to the worker
   */
  private postCommand(command: WorkerCommand): void {
    if (this.worker) {
      this.worker.postMessage(command)
    }
  }
}
