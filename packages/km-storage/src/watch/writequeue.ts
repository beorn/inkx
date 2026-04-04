/**
 * Write Queue
 *
 * Manages pending filesystem writes with debouncing and retry logic
 */

import { createLogger } from "loggily"
import * as fs from "fs"
import { dirname } from "path"
import { EventEmitter } from "events"

const log = createLogger("km:storage:watch:writequeue")

// ─────────────────────────────────────────────────────────────────────────────
// Error Classification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Error classification for retry decisions
 */
export type ErrorClass = "transient" | "permanent"

/**
 * Detailed error type for user-facing messages
 */
export type ErrorType =
  | "transient" // Temporary, will retry
  | "permission" // EACCES, EPERM - user can fix
  | "not_found" // ENOENT - file missing
  | "read_only" // EROFS - filesystem read-only
  | "disk_full" // ENOSPC after retries exhausted
  | "other" // Other permanent errors

/**
 * Permission error information for user notification
 */
export interface PermissionError {
  path: string
  treeop: "read" | "write" | "delete" | "rename"
  code: string
  message: string
  suggestion: string
}

/**
 * Classify an error as transient (should retry) or permanent (don't retry)
 */
export function classifyError(error: Error & { code?: string }): ErrorClass {
  const code = error.code

  // Transient errors - worth retrying
  const transientCodes = [
    "EBUSY", // Resource busy (file locked by another process)
    "EAGAIN", // Resource temporarily unavailable
    "EMFILE", // Too many open files
    "ENFILE", // File table overflow
    "ENOSPC", // No space left (might clear up)
    "ETXTBSY", // Text file busy
    "EIO", // I/O error (might be transient disk issue)
    "ETIMEDOUT", // Operation timed out
    "ECONNRESET", // Connection reset (network FS)
    "ENETUNREACH", // Network unreachable
    "EHOSTUNREACH", // Host unreachable
  ]

  if (code && transientCodes.includes(code)) {
    return "transient"
  }

  // Permanent errors - don't retry
  // ENOENT, EACCES, EPERM, EEXIST, EISDIR, ENOTDIR, EROFS, etc.
  return "permanent"
}

/**
 * Get detailed error type for user-facing messages
 */
export function getErrorType(error: Error & { code?: string }): ErrorType {
  const code = error.code

  if (!code) return "other"

  // Permission errors - user can potentially fix
  if (code === "EACCES" || code === "EPERM") {
    return "permission"
  }

  // Not found - often expected
  if (code === "ENOENT") {
    return "not_found"
  }

  // Read-only filesystem
  if (code === "EROFS") {
    return "read_only"
  }

  // Disk full (after retries exhausted)
  if (code === "ENOSPC") {
    return "disk_full"
  }

  // Check if transient
  if (classifyError(error) === "transient") {
    return "transient"
  }

  return "other"
}

/**
 * Get a user-friendly suggestion for fixing a permission error
 */
export function getPermissionSuggestion(path: string, code: string): string {
  if (code === "EACCES") {
    return `Check file permissions for "${path}". You may need to run: chmod u+rw "${path}"`
  }
  if (code === "EPERM") {
    return `Operation not permitted on "${path}". The file may be owned by another user or have special attributes.`
  }
  if (code === "EROFS") {
    return `The filesystem containing "${path}" is mounted read-only.`
  }
  return `Unable to access "${path}". Check file and directory permissions.`
}

// ─────────────────────────────────────────────────────────────────────────────
// Retry Configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries: number
  /** Base delay in ms for exponential backoff (default: 100) */
  baseDelayMs: number
  /** Maximum delay in ms (default: 5000) */
  maxDelayMs: number
  /** Jitter factor 0-1 to randomize delays (default: 0.1) */
  jitterFactor: number
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 100,
  maxDelayMs: 5000,
  jitterFactor: 0.1,
}

/**
 * Calculate delay for a given attempt using exponential backoff with jitter
 */
export function calculateBackoffDelay(attempt: number, config: RetryConfig): number {
  // Exponential: baseDelay * 2^attempt
  const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt)
  const clampedDelay = Math.min(exponentialDelay, config.maxDelayMs)

  // Add jitter: ±jitterFactor of the delay
  const jitter = clampedDelay * config.jitterFactor * (Math.random() * 2 - 1)
  return Math.max(0, Math.round(clampedDelay + jitter))
}

/**
 * Sleep helper for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Filesystem Operations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stat result interface compatible with Node's fs.Stats
 */
export interface StatResult {
  ino: number
  mtimeMs: number
  size: number
  isDirectory(): boolean
  isFile(): boolean
}

/**
 * Filesystem operations interface for dependency injection
 */
export interface FileSystemOps {
  writeFileSync(path: string, content: string, encoding?: BufferEncoding): void
  unlinkSync(path: string): void
  rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void
  mkdirSync(path: string, options?: { recursive?: boolean }): void
  existsSync(path: string): boolean
  renameSync(oldPath: string, newPath: string): void
  readFileSync(path: string, encoding?: BufferEncoding): string
  statSync(path: string): StatResult
}

/**
 * Default real filesystem implementation
 */
export const realFs: FileSystemOps = {
  writeFileSync: (p, c, e) => fs.writeFileSync(p, c, e ?? "utf-8"),
  unlinkSync: fs.unlinkSync,
  rmSync: fs.rmSync,
  mkdirSync: fs.mkdirSync,
  existsSync: fs.existsSync,
  renameSync: fs.renameSync,
  readFileSync: (p, e) => fs.readFileSync(p, e ?? "utf-8"),
  statSync: (p) => fs.statSync(p),
}

/**
 * Interface for watcher in-flight tracking
 * Both FileSystemWatcher and WorkerWatcher implement this
 */
export interface InFlightTracker {
  markInFlight(path: string): void
  clearInFlight(path: string, delayMs?: number): void
}

/**
 * Conflict resolution strategies
 */
export type ConflictStrategy =
  | "last_write_wins" // Always write (current behavior)
  | "fs_wins" // If file changed, discard pending write
  | "db_wins" // If file changed, still write but emit warning

/**
 * Write operation types using discriminated union
 */
export type WriteTreeOp =
  | {
      type: "write"
      path: string
      content: string
      sourceEventId: string
      /** mtime when the write was queued (for conflict detection) */
      baseMtime?: number
    }
  | { type: "delete"; path: string; sourceEventId: string }
  | {
      type: "rename"
      path: string
      newPath: string
      sourceEventId: string
    }

// Legacy interface for backwards compatibility
export interface PendingWrite {
  path: string
  content: string
  sourceEventId: string
  /** mtime when the write was queued (for conflict detection) */
  baseMtime?: number
}

/**
 * Conflict information when detected
 */
export interface ConflictInfo {
  path: string
  baseMtime: number
  currentMtime: number
  strategy: ConflictStrategy
  resolution: "written" | "discarded"
}

export interface WriteQueueConfig {
  debounceMs: number
  fs?: FileSystemOps
  /** Retry configuration for transient failures */
  retry?: Partial<RetryConfig>
  /** Conflict resolution strategy (default: last_write_wins) */
  conflictStrategy?: ConflictStrategy
  /** Called after a successful writeFileSync with the path and content actually written */
  onWrite?: (path: string, content: string) => void
  /** Called after a successful delete (unlinkSync/rmSync) with the path deleted */
  onDelete?: (path: string) => void
  /** Delay before clearing in-flight status after writes, in ms (default: 1000) */
  clearInFlightDelayMs?: number
}

const DEFAULT_CONFIG: WriteQueueConfig = {
  debounceMs: 3000,
  conflictStrategy: "last_write_wins",
}

/**
 * Result of a single operation execution with retry
 */
export interface TreeOpResult {
  op: WriteTreeOp
  success: boolean
  attempts: number
  error?: Error & { code?: string }
  errorClass?: ErrorClass
  /** Conflict detected during execution */
  conflict?: ConflictInfo
}

export class WriteQueue extends EventEmitter {
  private pending: Map<string, WriteTreeOp> = new Map()
  private debounceTimer: ReturnType<typeof setTimeout> | undefined
  private config: WriteQueueConfig
  private retryConfig: RetryConfig
  private conflictStrategy: ConflictStrategy
  private watcher: InFlightTracker | null = null
  private fs: FileSystemOps
  private onWrite: ((path: string, content: string) => void) | undefined
  private onDelete: ((path: string) => void) | undefined
  private clearInFlightDelayMs: number
  /** Generation counter for in-flight tracking — prevents older flush timers from clearing newer markInFlight calls */
  private flushGeneration = new Map<string, number>()
  private currentGeneration = 0
  /** Flush mutex — only one flush can run at a time; concurrent callers wait then re-check */
  private flushPromise: Promise<void> | null = null

  constructor(config: Partial<WriteQueueConfig> = {}) {
    super()
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config.retry }
    this.conflictStrategy = config.conflictStrategy ?? "last_write_wins"
    this.fs = config.fs ?? realFs
    this.onWrite = config.onWrite
    this.onDelete = config.onDelete
    this.clearInFlightDelayMs = config.clearInFlightDelayMs ?? 1000
  }

  /**
   * Set the watcher for in-flight tracking
   * Accepts any object implementing InFlightTracker (FileSystemWatcher or WorkerWatcher)
   */
  setWatcher(watcher: InFlightTracker): void {
    this.watcher = watcher
  }

  /**
   * Queue a write operation
   */
  queue(write: PendingWrite): void {
    log.debug?.(`queuing write: ${write.path} (${write.content.length} bytes)`)

    // Get current mtime for conflict detection (if file exists)
    let baseMtime = write.baseMtime
    if (baseMtime === undefined && this.fs.statSync) {
      try {
        const stat = this.fs.statSync(write.path)
        baseMtime = stat.mtimeMs
      } catch {
        // File doesn't exist yet, no conflict possible
      }
    }

    // Coalesce writes to same file
    this.pending.set(write.path, {
      type: "write",
      path: write.path,
      content: write.content,
      sourceEventId: write.sourceEventId,
      baseMtime,
    })
    this.scheduleFlush()
  }

  /**
   * Queue a delete operation
   */
  queueDelete(path: string, sourceEventId: string): void {
    log.debug?.(`queuing delete: ${path}`)
    this.pending.set(path, {
      type: "delete",
      path,
      sourceEventId,
    })
    this.scheduleFlush()
  }

  /**
   * Queue a rename operation
   */
  queueRename(oldPath: string, newPath: string, sourceEventId: string): void {
    log.debug?.(`queuing rename: ${oldPath} → ${newPath}`)
    this.pending.set(oldPath, {
      type: "rename",
      path: oldPath,
      newPath,
      sourceEventId,
    })
    this.scheduleFlush()
  }

  /**
   * Schedule a flush after debounce period
   */
  private scheduleFlush(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }

    this.debounceTimer = setTimeout(() => {
      void this.flush()
    }, this.config.debounceMs)
  }

  /**
   * Execute a single filesystem operation (no retry)
   */
  private executeOp(op: WriteTreeOp): void {
    switch (op.type) {
      case "delete":
        if (this.fs.existsSync(op.path)) {
          const stat = this.fs.statSync(op.path)
          if (stat.isDirectory()) {
            log.info?.(`fs: rmdir ${op.path}`)
            this.fs.rmSync(op.path, { recursive: true, force: true })
          } else {
            log.info?.(`fs: delete ${op.path}`)
            this.fs.unlinkSync(op.path)
          }
          this.onDelete?.(op.path)
        }
        break
      case "rename":
        if (this.fs.existsSync(op.path)) {
          log.info?.(`fs: rename ${op.path} → ${op.newPath}`)
          const newDir = dirname(op.newPath)
          if (!this.fs.existsSync(newDir)) {
            this.fs.mkdirSync(newDir, { recursive: true })
          }
          this.fs.renameSync(op.path, op.newPath)
        }
        break
      case "write": {
        log.info?.(`fs: write ${op.path} (${op.content.length} bytes)`)
        const dir = dirname(op.path)
        if (!this.fs.existsSync(dir)) {
          this.fs.mkdirSync(dir, { recursive: true })
        }
        // Direct write — preserves inode identity so the reconciler
        // doesn't see a spurious inode change on every save.
        this.fs.writeFileSync(op.path, op.content, "utf-8")
        this.onWrite?.(op.path, op.content)
        break
      }
    }
  }

  /**
   * Check for conflict before writing
   */
  private checkForConflict(op: WriteTreeOp): ConflictInfo | null {
    if (op.type !== "write" || op.baseMtime === undefined) {
      return null
    }

    // Get current file mtime
    let currentMtime: number
    try {
      if (!this.fs.statSync) return null
      const stat = this.fs.statSync(op.path)
      currentMtime = stat.mtimeMs
    } catch {
      // File doesn't exist - no conflict
      return null
    }

    // Check if file changed since we queued the write
    if (currentMtime !== op.baseMtime) {
      const resolution = this.conflictStrategy === "fs_wins" ? "discarded" : "written"

      log.debug?.(
        `conflict detected path=${op.path} baseMtime=${op.baseMtime} currentMtime=${currentMtime} strategy=${this.conflictStrategy} resolution=${resolution}`,
      )

      return {
        path: op.path,
        baseMtime: op.baseMtime,
        currentMtime,
        strategy: this.conflictStrategy,
        resolution,
      }
    }

    return null
  }

  /**
   * Execute operation with retry logic for transient failures
   */
  private async executeWithRetry(op: WriteTreeOp): Promise<TreeOpResult> {
    let lastError: (Error & { code?: string }) | undefined
    let attempts = 0

    // Check for conflict before attempting write
    const conflict = this.checkForConflict(op)
    if (conflict) {
      if (conflict.resolution === "discarded") {
        // fs_wins: don't write, return success with conflict info
        return { op, success: true, attempts: 0, conflict }
      }
      // db_wins or last_write_wins: proceed with write but attach conflict info
    }

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      attempts = attempt + 1

      try {
        this.executeOp(op)
        return { op, success: true, attempts, conflict: conflict ?? undefined }
      } catch (err) {
        lastError = err as Error & { code?: string }
        const errorClass = classifyError(lastError)

        // Don't retry permanent errors
        if (errorClass === "permanent") {
          log.debug?.(
            `permanent error path=${op.path} attempts=${attempts} error=${lastError.code || lastError.message}`,
          )
          return { op, success: false, attempts, error: lastError, errorClass }
        }

        // Last attempt - don't sleep, just fail
        if (attempt === this.retryConfig.maxRetries) {
          log.debug?.(
            `max retries reached path=${op.path} attempts=${attempts} error=${lastError.code || lastError.message}`,
          )
          return {
            op,
            success: false,
            attempts,
            error: lastError,
            errorClass: "transient",
          }
        }

        // Calculate backoff delay and wait
        const delay = calculateBackoffDelay(attempt, this.retryConfig)
        log.debug?.(
          `transient error, retrying path=${op.path} attempts=${attempts} delayMs=${delay} error=${lastError.code || lastError.message}`,
        )
        await sleep(delay)
      }
    }

    // Should never reach here, but TypeScript needs this
    return {
      op,
      success: false,
      attempts,
      error: lastError,
      errorClass: lastError ? classifyError(lastError) : undefined,
    }
  }

  /**
   * Flush all pending writes — mutex ensures only one flush runs at a time.
   * Concurrent callers wait for the active flush, then re-check for pending work.
   */
  async flush(): Promise<void> {
    if (this.flushPromise) {
      await this.flushPromise
      // After waiting, re-check if new work accumulated during the flush
      if (this.pending.size > 0) return this.flush()
      return
    }
    this.flushPromise = this.doFlush()
    try {
      await this.flushPromise
    } finally {
      this.flushPromise = null
    }
    // If new items were queued during the flush (e.g., queue() called while
    // doFlush was running), flush them now rather than relying on the debounce
    // timer. This ensures forceFlush() drains all work before returning.
    if (this.pending.size > 0) {
      return this.flush()
    }
  }

  /**
   * Internal flush implementation — must only be called via flush() mutex
   */
  private async doFlush(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = undefined
    }

    const writes = [...this.pending.values()]
    this.pending.clear()

    if (writes.length === 0) {
      log.debug?.("flush: nothing pending")
      return
    }

    log.debug?.(`flushing ${writes.length} operations`)
    const start = Date.now()

    // Mark paths as in-flight to prevent watch triggering re-sync.
    // Track generation so clearInFlight from an older flush doesn't
    // clear protection set by a newer flush (race condition fix).
    const gen = ++this.currentGeneration

    // Safety cap: if flushGeneration grows beyond 10k entries (indicates
    // cleanup timers were delayed or lost), prune entries older than 10
    // generations back. This prevents unbounded memory growth in long sessions.
    if (this.flushGeneration.size > 10_000) {
      const pruneThreshold = gen - 10
      for (const [path, pathGen] of this.flushGeneration) {
        if (pathGen < pruneThreshold) {
          this.flushGeneration.delete(path)
        }
      }
    }
    for (const write of writes) {
      if (this.watcher) {
        this.watcher.markInFlight(write.path)
        this.flushGeneration.set(write.path, gen)
        // For renames, also mark the destination so the watcher
        // doesn't treat the new file as an external addition.
        if (write.type === "rename" && write.newPath) {
          this.watcher.markInFlight(write.newPath)
          this.flushGeneration.set(write.newPath, gen)
        }
      }
    }

    // Process writes with retry logic
    const results: TreeOpResult[] = []
    let totalRetries = 0

    for (const op of writes) {
      const result = await this.executeWithRetry(op)
      results.push(result)
      if (result.attempts > 1) {
        totalRetries += result.attempts - 1
      }
    }

    // Clear in-flight status after a delay — only if no newer flush
    // has re-marked the same path (prevents race condition where flush N's
    // clear timer fires after flush N+1 has already marked the path)
    setTimeout(() => {
      for (const op of writes) {
        if (this.watcher && this.flushGeneration.get(op.path) === gen) {
          this.watcher.clearInFlight(op.path, 0)
          this.flushGeneration.delete(op.path)
        }
        if (this.watcher && op.type === "rename" && op.newPath && this.flushGeneration.get(op.newPath) === gen) {
          this.watcher.clearInFlight(op.newPath, 0)
          this.flushGeneration.delete(op.newPath)
        }
      }
    }, this.clearInFlightDelayMs)

    // Collect failures for error reporting (filter guarantees error exists)
    const failures = results.filter(
      (r): r is TreeOpResult & { error: Error & { code?: string } } => !r.success && r.error !== undefined,
    )
    const errors = failures.map((f) => ({
      path: f.op.path,
      error: f.error,
      errorClass: f.errorClass,
      attempts: f.attempts,
    }))

    // Collect conflicts
    const conflicts = results.map((r) => r.conflict).filter((c): c is ConflictInfo => c !== undefined)

    // Collect permission errors specifically (user can act on these)
    const permissionErrors: PermissionError[] = failures
      .filter((f) => {
        const code = f.error.code
        return code === "EACCES" || code === "EPERM" || code === "EROFS"
      })
      .map((f) => ({
        path: f.op.path,
        operation: f.op.type as "read" | "write" | "delete" | "rename",
        code: f.error.code ?? "UNKNOWN",
        message: f.error.message,
        suggestion: getPermissionSuggestion(f.op.path, f.error.code ?? ""),
      }))

    // Emit events
    if (errors.length > 0) {
      log.debug?.(
        `flush errors: ${JSON.stringify(errors.map((e) => ({ path: e.path, error: e.error.message, code: e.error.code, class: e.errorClass, attempts: e.attempts })))}`,
      )
      this.emit("errors", errors)
    }

    // Emit specific event for permission errors (actionable by user)
    if (permissionErrors.length > 0) {
      log.debug?.(
        `permission denied: ${JSON.stringify(permissionErrors.map((p) => ({ path: p.path, operation: p.treeop, code: p.code })))}`,
      )
      this.emit("permission-denied", permissionErrors)
    }

    if (conflicts.length > 0) {
      log.debug?.(
        `flush conflicts: ${JSON.stringify(conflicts.map((c) => ({ path: c.path, baseMtime: c.baseMtime, currentMtime: c.currentMtime, strategy: c.strategy, resolution: c.resolution })))}`,
      )
      this.emit("conflicts", conflicts)
    }

    log.debug?.(
      `flushed ${writes.length} ops in ${Date.now() - start}ms (${errors.length} errors, ${totalRetries} retries, ${conflicts.length} conflicts, ${permissionErrors.length} permission)`,
    )
    this.emit("flushed", {
      count: writes.length,
      errors: errors.length,
      retries: totalRetries,
      conflicts: conflicts.length,
      permissionErrors: permissionErrors.length,
      results,
    })
  }

  /**
   * Force immediate flush
   */
  forceFlush(): Promise<void> {
    return this.flush()
  }

  /**
   * Get pending write count
   */
  getPendingCount(): number {
    return this.pending.size
  }

  /**
   * Get the set of paths with pending writes.
   * Used by reconciliation to skip files with queued but not-yet-flushed writes.
   */
  getPendingPaths(): Set<string> {
    return new Set(this.pending.keys())
  }

  /**
   * Rewrite a pending write's path when the target file is renamed.
   * Must be called BEFORE the actual renameSync so the queued write
   * flushes to the new path instead of recreating the old file.
   */
  renamePending(oldPath: string, newPath: string): boolean {
    const op = this.pending.get(oldPath)
    if (!op) return false
    this.pending.delete(oldPath)
    op.path = newPath
    this.pending.set(newPath, op)
    log.debug?.(`renamePending: ${oldPath} → ${newPath}`)
    return true
  }

  /**
   * Cancel a pending write for a deleted file.
   */
  dropPending(path: string): boolean {
    const dropped = this.pending.delete(path)
    if (dropped) {
      log.debug?.(`dropPending: ${path}`)
    }
    return dropped
  }

  /**
   * Rewrite all pending writes under a renamed directory.
   * Must be called BEFORE the actual renameSync.
   */
  renamePendingSubtree(oldPrefix: string, newPrefix: string): number {
    let count = 0
    for (const [path, op] of this.pending) {
      if (path.startsWith(oldPrefix + "/") || path === oldPrefix) {
        this.pending.delete(path)
        const newPath = newPrefix + path.slice(oldPrefix.length)
        op.path = newPath
        this.pending.set(newPath, op)
        count++
      }
    }
    if (count > 0) {
      log.debug?.(`renamePendingSubtree: ${oldPrefix} → ${newPrefix} (${count} ops)`)
    }
    return count
  }

  /**
   * Clear all pending writes and flush-tracking state
   */
  clear(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = undefined
    }
    this.pending.clear()
    this.flushGeneration.clear()
  }
}
