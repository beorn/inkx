/**
 * Write Queue
 *
 * Manages pending filesystem writes with debouncing and retry logic
 */

import createDebug from "debug";
import * as fs from "fs";
import { dirname } from "path";
import { EventEmitter } from "events";

const debug = createDebug("km:storage:watch:writequeue");

// ─────────────────────────────────────────────────────────────────────────────
// Error Classification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Error classification for retry decisions
 */
export type ErrorClass = "transient" | "permanent";

/**
 * Detailed error type for user-facing messages
 */
export type ErrorType =
  | "transient" // Temporary, will retry
  | "permission" // EACCES, EPERM - user can fix
  | "not_found" // ENOENT - file missing
  | "read_only" // EROFS - filesystem read-only
  | "disk_full" // ENOSPC after retries exhausted
  | "other"; // Other permanent errors

/**
 * Permission error information for user notification
 */
export interface PermissionError {
  path: string;
  operation: "read" | "write" | "delete" | "rename";
  code: string;
  message: string;
  suggestion: string;
}

/**
 * Classify an error as transient (should retry) or permanent (don't retry)
 */
export function classifyError(error: Error & { code?: string }): ErrorClass {
  const code = error.code;

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
  ];

  if (code && transientCodes.includes(code)) {
    return "transient";
  }

  // Permanent errors - don't retry
  // ENOENT, EACCES, EPERM, EEXIST, EISDIR, ENOTDIR, EROFS, etc.
  return "permanent";
}

/**
 * Get detailed error type for user-facing messages
 */
export function getErrorType(error: Error & { code?: string }): ErrorType {
  const code = error.code;

  if (!code) return "other";

  // Permission errors - user can potentially fix
  if (code === "EACCES" || code === "EPERM") {
    return "permission";
  }

  // Not found - often expected
  if (code === "ENOENT") {
    return "not_found";
  }

  // Read-only filesystem
  if (code === "EROFS") {
    return "read_only";
  }

  // Disk full (after retries exhausted)
  if (code === "ENOSPC") {
    return "disk_full";
  }

  // Check if transient
  if (classifyError(error) === "transient") {
    return "transient";
  }

  return "other";
}

/**
 * Get a user-friendly suggestion for fixing a permission error
 */
export function getPermissionSuggestion(path: string, code: string): string {
  if (code === "EACCES") {
    return `Check file permissions for "${path}". You may need to run: chmod u+rw "${path}"`;
  }
  if (code === "EPERM") {
    return `Operation not permitted on "${path}". The file may be owned by another user or have special attributes.`;
  }
  if (code === "EROFS") {
    return `The filesystem containing "${path}" is mounted read-only.`;
  }
  return `Unable to access "${path}". Check file and directory permissions.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Retry Configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries: number;
  /** Base delay in ms for exponential backoff (default: 100) */
  baseDelayMs: number;
  /** Maximum delay in ms (default: 5000) */
  maxDelayMs: number;
  /** Jitter factor 0-1 to randomize delays (default: 0.1) */
  jitterFactor: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 100,
  maxDelayMs: 5000,
  jitterFactor: 0.1,
};

/**
 * Calculate delay for a given attempt using exponential backoff with jitter
 */
export function calculateBackoffDelay(
  attempt: number,
  config: RetryConfig,
): number {
  // Exponential: baseDelay * 2^attempt
  const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt);
  const clampedDelay = Math.min(exponentialDelay, config.maxDelayMs);

  // Add jitter: ±jitterFactor of the delay
  const jitter = clampedDelay * config.jitterFactor * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(clampedDelay + jitter));
}

/**
 * Sleep helper for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Filesystem Operations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stat result interface compatible with Node's fs.Stats
 */
export interface StatResult {
  ino: number;
  mtimeMs: number;
  size: number;
  isDirectory(): boolean;
  isFile(): boolean;
}

/**
 * Filesystem operations interface for dependency injection
 */
export interface FileSystemOps {
  writeFileSync(path: string, content: string, encoding?: BufferEncoding): void;
  unlinkSync(path: string): void;
  mkdirSync(path: string, options?: { recursive?: boolean }): void;
  existsSync(path: string): boolean;
  renameSync(oldPath: string, newPath: string): void;
  readFileSync(path: string, encoding?: BufferEncoding): string;
  statSync(path: string): StatResult;
}

/**
 * Default real filesystem implementation
 */
export const realFs: FileSystemOps = {
  writeFileSync: (p, c, e) => fs.writeFileSync(p, c, e ?? "utf-8"),
  unlinkSync: fs.unlinkSync,
  mkdirSync: fs.mkdirSync,
  existsSync: fs.existsSync,
  renameSync: fs.renameSync,
  readFileSync: (p, e) => fs.readFileSync(p, e ?? "utf-8"),
  statSync: (p) => fs.statSync(p),
};

/**
 * Interface for watcher in-flight tracking
 * Both FileSystemWatcher and WorkerWatcher implement this
 */
export interface InFlightTracker {
  markInFlight(path: string): void;
  clearInFlight(path: string, delayMs?: number): void;
}

/**
 * Conflict resolution strategies
 */
export type ConflictStrategy =
  | "last_write_wins" // Always write (current behavior)
  | "fs_wins" // If file changed, discard pending write
  | "db_wins"; // If file changed, still write but emit warning

/**
 * Write operation types using discriminated union
 */
export type WriteOperation =
  | {
      type: "write";
      path: string;
      content: string;
      sourceEventId: string;
      /** mtime when the write was queued (for conflict detection) */
      baseMtime?: number;
    }
  | { type: "delete"; path: string; sourceEventId: string }
  | {
      type: "rename";
      path: string;
      newPath: string;
      sourceEventId: string;
    };

// Legacy interface for backwards compatibility
export interface PendingWrite {
  path: string;
  content: string;
  sourceEventId: string;
  /** mtime when the write was queued (for conflict detection) */
  baseMtime?: number;
}

/**
 * Conflict information when detected
 */
export interface ConflictInfo {
  path: string;
  baseMtime: number;
  currentMtime: number;
  strategy: ConflictStrategy;
  resolution: "written" | "discarded";
}

export interface WriteQueueConfig {
  debounceMs: number;
  fs?: FileSystemOps;
  /** Retry configuration for transient failures */
  retry?: Partial<RetryConfig>;
  /** Conflict resolution strategy (default: last_write_wins) */
  conflictStrategy?: ConflictStrategy;
}

const DEFAULT_CONFIG: WriteQueueConfig = {
  debounceMs: 3000,
  conflictStrategy: "last_write_wins",
};

/**
 * Result of a single operation execution with retry
 */
export interface OperationResult {
  op: WriteOperation;
  success: boolean;
  attempts: number;
  error?: Error & { code?: string };
  errorClass?: ErrorClass;
  /** Conflict detected during execution */
  conflict?: ConflictInfo;
}

export class WriteQueue extends EventEmitter {
  private pending: Map<string, WriteOperation> = new Map();
  private debounceTimer: NodeJS.Timeout | null = null;
  private config: WriteQueueConfig;
  private retryConfig: RetryConfig;
  private conflictStrategy: ConflictStrategy;
  private watcher: InFlightTracker | null = null;
  private fs: FileSystemOps;

  constructor(config: Partial<WriteQueueConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config.retry };
    this.conflictStrategy = config.conflictStrategy ?? "last_write_wins";
    this.fs = config.fs ?? realFs;
  }

  /**
   * Set the watcher for in-flight tracking
   * Accepts any object implementing InFlightTracker (FileSystemWatcher or WorkerWatcher)
   */
  setWatcher(watcher: InFlightTracker): void {
    this.watcher = watcher;
  }

  /**
   * Queue a write operation
   */
  queue(write: PendingWrite): void {
    debug("queuing write: %s (%d bytes)", write.path, write.content.length);

    // Get current mtime for conflict detection (if file exists)
    let baseMtime = write.baseMtime;
    if (baseMtime === undefined && this.fs.statSync) {
      try {
        const stat = this.fs.statSync(write.path);
        baseMtime = stat.mtimeMs;
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
    });
    this.scheduleFlush();
  }

  /**
   * Queue a delete operation
   */
  queueDelete(path: string, sourceEventId: string): void {
    debug("queuing delete: %s", path);
    this.pending.set(path, {
      type: "delete",
      path,
      sourceEventId,
    });
    this.scheduleFlush();
  }

  /**
   * Queue a rename operation
   */
  queueRename(oldPath: string, newPath: string, sourceEventId: string): void {
    debug("queuing rename: %s → %s", oldPath, newPath);
    this.pending.set(oldPath, {
      type: "rename",
      path: oldPath,
      newPath,
      sourceEventId,
    });
    this.scheduleFlush();
  }

  /**
   * Schedule a flush after debounce period
   */
  private scheduleFlush(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      void this.flush();
    }, this.config.debounceMs);
  }

  /**
   * Execute a single filesystem operation (no retry)
   */
  private executeOp(op: WriteOperation): void {
    switch (op.type) {
      case "delete":
        if (this.fs.existsSync(op.path)) {
          this.fs.unlinkSync(op.path);
        }
        break;
      case "rename":
        if (this.fs.existsSync(op.path)) {
          const newDir = dirname(op.newPath);
          if (!this.fs.existsSync(newDir)) {
            this.fs.mkdirSync(newDir, { recursive: true });
          }
          this.fs.renameSync(op.path, op.newPath);
        }
        break;
      case "write": {
        const dir = dirname(op.path);
        if (!this.fs.existsSync(dir)) {
          this.fs.mkdirSync(dir, { recursive: true });
        }
        this.fs.writeFileSync(op.path, op.content, "utf-8");
        break;
      }
    }
  }

  /**
   * Check for conflict before writing
   */
  private checkForConflict(op: WriteOperation): ConflictInfo | null {
    if (op.type !== "write" || op.baseMtime === undefined) {
      return null;
    }

    // Get current file mtime
    let currentMtime: number;
    try {
      if (!this.fs.statSync) return null;
      const stat = this.fs.statSync(op.path);
      currentMtime = stat.mtimeMs;
    } catch {
      // File doesn't exist - no conflict
      return null;
    }

    // Check if file changed since we queued the write
    if (currentMtime !== op.baseMtime) {
      const resolution =
        this.conflictStrategy === "fs_wins" ? "discarded" : "written";

      debug(
        "conflict detected on %s: baseMtime=%d, currentMtime=%d, strategy=%s, resolution=%s",
        op.path,
        op.baseMtime,
        currentMtime,
        this.conflictStrategy,
        resolution,
      );

      return {
        path: op.path,
        baseMtime: op.baseMtime,
        currentMtime,
        strategy: this.conflictStrategy,
        resolution,
      };
    }

    return null;
  }

  /**
   * Execute operation with retry logic for transient failures
   */
  private async executeWithRetry(op: WriteOperation): Promise<OperationResult> {
    let lastError: (Error & { code?: string }) | undefined;
    let attempts = 0;

    // Check for conflict before attempting write
    const conflict = this.checkForConflict(op);
    if (conflict) {
      if (conflict.resolution === "discarded") {
        // fs_wins: don't write, return success with conflict info
        return { op, success: true, attempts: 0, conflict };
      }
      // db_wins or last_write_wins: proceed with write but attach conflict info
    }

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      attempts = attempt + 1;

      try {
        this.executeOp(op);
        return { op, success: true, attempts, conflict: conflict ?? undefined };
      } catch (err) {
        lastError = err as Error & { code?: string };
        const errorClass = classifyError(lastError);

        // Don't retry permanent errors
        if (errorClass === "permanent") {
          debug(
            "permanent error on %s (attempt %d): %s",
            op.path,
            attempts,
            lastError.code || lastError.message,
          );
          return { op, success: false, attempts, error: lastError, errorClass };
        }

        // Last attempt - don't sleep, just fail
        if (attempt === this.retryConfig.maxRetries) {
          debug(
            "max retries reached for %s after %d attempts: %s",
            op.path,
            attempts,
            lastError.code || lastError.message,
          );
          return {
            op,
            success: false,
            attempts,
            error: lastError,
            errorClass: "transient",
          };
        }

        // Calculate backoff delay and wait
        const delay = calculateBackoffDelay(attempt, this.retryConfig);
        debug(
          "transient error on %s (attempt %d), retrying in %dms: %s",
          op.path,
          attempts,
          delay,
          lastError.code || lastError.message,
        );
        await sleep(delay);
      }
    }

    // Should never reach here, but TypeScript needs this
    return {
      op,
      success: false,
      attempts,
      error: lastError,
      errorClass: lastError ? classifyError(lastError) : undefined,
    };
  }

  /**
   * Flush all pending writes with retry logic for transient failures
   */
  async flush(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    const writes = [...this.pending.values()];
    this.pending.clear();

    if (writes.length === 0) {
      debug("flush: nothing pending");
      return;
    }

    debug("flushing %d operations", writes.length);
    const start = Date.now();

    // Mark paths as in-flight to prevent watch triggering re-sync
    for (const write of writes) {
      if (this.watcher) {
        this.watcher.markInFlight(write.path);
      }
    }

    // Process writes with retry logic
    const results: OperationResult[] = [];
    let totalRetries = 0;

    for (const op of writes) {
      const result = await this.executeWithRetry(op);
      results.push(result);
      if (result.attempts > 1) {
        totalRetries += result.attempts - 1;
      }
    }

    // Clear in-flight status after a delay
    setTimeout(() => {
      for (const op of writes) {
        if (this.watcher) {
          this.watcher.clearInFlight(op.path, 0);
        }
      }
    }, 1000);

    // Collect failures for error reporting (filter guarantees error exists)
    const failures = results.filter(
      (r): r is OperationResult & { error: Error & { code?: string } } =>
        !r.success && r.error !== undefined,
    );
    const errors = failures.map((f) => ({
      path: f.op.path,
      error: f.error,
      errorClass: f.errorClass,
      attempts: f.attempts,
    }));

    // Collect conflicts
    const conflicts = results
      .map((r) => r.conflict)
      .filter((c): c is ConflictInfo => c !== undefined);

    // Collect permission errors specifically (user can act on these)
    const permissionErrors: PermissionError[] = failures
      .filter((f) => {
        const code = f.error.code;
        return code === "EACCES" || code === "EPERM" || code === "EROFS";
      })
      .map((f) => ({
        path: f.op.path,
        operation: f.op.type as "read" | "write" | "delete" | "rename",
        code: f.error.code ?? "UNKNOWN",
        message: f.error.message,
        suggestion: getPermissionSuggestion(f.op.path, f.error.code ?? ""),
      }));

    // Emit events
    if (errors.length > 0) {
      debug(
        "flush errors: %O",
        errors.map((e) => ({
          path: e.path,
          error: e.error.message,
          code: e.error.code,
          class: e.errorClass,
          attempts: e.attempts,
        })),
      );
      this.emit("errors", errors);
    }

    // Emit specific event for permission errors (actionable by user)
    if (permissionErrors.length > 0) {
      debug(
        "permission denied: %O",
        permissionErrors.map((p) => ({
          path: p.path,
          operation: p.operation,
          code: p.code,
        })),
      );
      this.emit("permission-denied", permissionErrors);
    }

    if (conflicts.length > 0) {
      debug(
        "flush conflicts: %O",
        conflicts.map((c) => ({
          path: c.path,
          baseMtime: c.baseMtime,
          currentMtime: c.currentMtime,
          strategy: c.strategy,
          resolution: c.resolution,
        })),
      );
      this.emit("conflicts", conflicts);
    }

    debug(
      "flushed %d ops in %dms (%d errors, %d retries, %d conflicts, %d permission)",
      writes.length,
      Date.now() - start,
      errors.length,
      totalRetries,
      conflicts.length,
      permissionErrors.length,
    );
    this.emit("flushed", {
      count: writes.length,
      errors: errors.length,
      retries: totalRetries,
      conflicts: conflicts.length,
      permissionErrors: permissionErrors.length,
      results,
    });
  }

  /**
   * Force immediate flush
   */
  forceFlush(): Promise<void> {
    return this.flush();
  }

  /**
   * Get pending write count
   */
  getPendingCount(): number {
    return this.pending.size;
  }

  /**
   * Clear all pending writes
   */
  clear(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.pending.clear();
  }
}

/**
 * Check if an event should be applied to filesystem
 */
export function shouldApplyToFs(actor: string): boolean {
  // Don't apply events that came from filesystem watching
  return actor !== "fs-watch";
}
