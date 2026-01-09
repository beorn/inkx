/**
 * Write Queue
 *
 * Manages pending filesystem writes with debouncing
 */

import { writeFileSync, mkdirSync, unlinkSync, renameSync, existsSync } from "fs";
import { dirname } from "path";
import { EventEmitter } from "events";
import { FileSystemWatcher } from "./watcher.ts";

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
  private pending: Map<string, PendingWrite> = new Map();
  private debounceTimer: NodeJS.Timeout | null = null;
  private config: WriteQueueConfig;
  private watcher: FileSystemWatcher | null = null;

  constructor(config: Partial<WriteQueueConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set the watcher for in-flight tracking
   */
  setWatcher(watcher: FileSystemWatcher): void {
    this.watcher = watcher;
  }

  /**
   * Queue a write operation
   */
  queue(write: PendingWrite): void {
    // Coalesce writes to same file
    this.pending.set(write.path, write);
    this.scheduleFlush();
  }

  /**
   * Queue a delete operation
   */
  queueDelete(path: string, sourceEventId: string): void {
    // Use null content to signal delete
    this.pending.set(path, {
      path,
      content: "__DELETE__",
      sourceEventId,
    });
    this.scheduleFlush();
  }

  /**
   * Queue a rename operation
   */
  queueRename(oldPath: string, newPath: string, sourceEventId: string): void {
    // Queue as special rename operation
    this.pending.set(oldPath, {
      path: oldPath,
      content: `__RENAME__:${newPath}`,
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
      this.flush();
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
      return;
    }

    // Mark paths as in-flight to prevent watch triggering re-sync
    for (const write of writes) {
      if (this.watcher) {
        this.watcher.markInFlight(write.path);
      }
    }

    // Process writes
    const errors: Array<{ path: string; error: Error }> = [];

    for (const write of writes) {
      try {
        if (write.content === "__DELETE__") {
          // Delete operation
          if (existsSync(write.path)) {
            unlinkSync(write.path);
          }
        } else if (write.content.startsWith("__RENAME__:")) {
          // Rename operation
          const newPath = write.content.slice("__RENAME__:".length);
          if (existsSync(write.path)) {
            const newDir = dirname(newPath);
            if (!existsSync(newDir)) {
              mkdirSync(newDir, { recursive: true });
            }
            renameSync(write.path, newPath);
          }
        } else {
          // Regular write
          const dir = dirname(write.path);
          if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
          }
          writeFileSync(write.path, write.content, "utf-8");
        }
      } catch (error) {
        errors.push({ path: write.path, error: error as Error });
      }
    }

    // Clear in-flight status after a delay
    setTimeout(() => {
      for (const write of writes) {
        if (this.watcher) {
          this.watcher.clearInFlight(write.path, 0);
        }
      }
    }, 1000);

    // Emit events
    if (errors.length > 0) {
      this.emit("errors", errors);
    }

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
