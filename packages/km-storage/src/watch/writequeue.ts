/**
 * Write Queue
 *
 * Manages pending filesystem writes with debouncing
 */

import createDebug from "debug";
import {
  writeFileSync,
  mkdirSync,
  unlinkSync,
  renameSync,
  existsSync,
} from "fs";

const debug = createDebug("km:storage:watch:writequeue");
import { dirname } from "path";
import { EventEmitter } from "events";

/**
 * Interface for watcher in-flight tracking
 * Both FileSystemWatcher and WorkerWatcher implement this
 */
export interface InFlightTracker {
  markInFlight(path: string): void;
  clearInFlight(path: string, delayMs?: number): void;
}

/**
 * Write operation types using discriminated union
 */
export type WriteOperation =
  | { type: "write"; path: string; content: string; sourceEventId: string }
  | { type: "delete"; path: string; sourceEventId: string }
  | { type: "rename"; path: string; newPath: string; sourceEventId: string };

// Legacy interface for backwards compatibility
export interface PendingWrite {
  path: string;
  content: string;
  sourceEventId: string;
}

export interface WriteQueueConfig {
  debounceMs: number;
}

const DEFAULT_CONFIG: WriteQueueConfig = {
  debounceMs: 3000,
};

export class WriteQueue extends EventEmitter {
  private pending: Map<string, WriteOperation> = new Map();
  private debounceTimer: NodeJS.Timeout | null = null;
  private config: WriteQueueConfig;
  private watcher: InFlightTracker | null = null;

  constructor(config: Partial<WriteQueueConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
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
    // Coalesce writes to same file
    this.pending.set(write.path, {
      type: "write",
      path: write.path,
      content: write.content,
      sourceEventId: write.sourceEventId,
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
   * Flush all pending writes
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

    // Process writes
    const errors: Array<{ path: string; error: Error }> = [];

    for (const op of writes) {
      try {
        switch (op.type) {
          case "delete":
            if (existsSync(op.path)) {
              unlinkSync(op.path);
            }
            break;
          case "rename":
            if (existsSync(op.path)) {
              const newDir = dirname(op.newPath);
              if (!existsSync(newDir)) {
                mkdirSync(newDir, { recursive: true });
              }
              renameSync(op.path, op.newPath);
            }
            break;
          case "write":
            const dir = dirname(op.path);
            if (!existsSync(dir)) {
              mkdirSync(dir, { recursive: true });
            }
            writeFileSync(op.path, op.content, "utf-8");
            break;
        }
      } catch (error) {
        errors.push({ path: op.path, error: error as Error });
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

    // Emit events
    if (errors.length > 0) {
      debug("flush errors: %O", errors.map(e => ({ path: e.path, error: e.error.message })));
      this.emit("errors", errors);
    }

    debug("flushed %d ops in %dms (%d errors)", writes.length, Date.now() - start, errors.length);
    this.emit("flushed", { count: writes.length, errors: errors.length });
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
