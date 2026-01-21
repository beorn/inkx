/**
 * Filesystem Watcher
 *
 * Watches for filesystem changes and triggers reconciliation
 */

import createDebug from "debug";
import { watch, type FSWatcher } from "chokidar";

const debug = createDebug("km:storage:watch:watcher");
import { dirname, basename, relative, join } from "path";
import { statSync, existsSync, readdirSync } from "fs";
import { EventEmitter } from "events";
import {
  DEFAULT_IGNORE_PATTERNS,
  getIgnorePatterns,
  shouldIgnore,
  isHiddenFile,
} from "./ignore.ts";

export interface WatcherConfig {
  debounceMs: number;
  ignored: string[];
}

const DEFAULT_CONFIG: WatcherConfig = {
  debounceMs: 5000,
  ignored: DEFAULT_IGNORE_PATTERNS,
};

export interface FileChange {
  type: "add" | "change" | "unlink" | "addDir" | "unlinkDir";
  path: string;
  ino?: number;
}

export class FileSystemWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private pendingPaths: Set<string> = new Set();
  private debounceTimer: NodeJS.Timeout | null = null;
  private config: WatcherConfig;
  private vaultPath: string = "";
  private inFlightWrites: Set<string> = new Set();

  constructor(config: Partial<WatcherConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start watching a directory
   */
  start(vaultPath: string): void {
    this.vaultPath = vaultPath;
    debug("starting watcher for %s", vaultPath);

    // Load ignore patterns from vault's ignore files
    const ignorePatterns = getIgnorePatterns(vaultPath);
    debug("ignore patterns: %O", ignorePatterns);

    this.watcher = watch(vaultPath, {
      persistent: true,
      ignoreInitial: true,
      ignored: ignorePatterns,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    });

    this.watcher.on("all", (event, path) => {
      // Skip in-flight writes (our own writes)
      if (this.inFlightWrites.has(path)) {
        debug("skipping in-flight: %s %s", event, path);
        return;
      }

      debug("fs event: %s %s", event, path);
      this.pendingPaths.add(path);
      this.scheduleSync();
    });

    this.watcher.on("error", (error) => {
      debug("watcher error: %O", error);
      this.emit("error", error);
    });

    this.watcher.on("ready", () => {
      debug("watcher ready");
      this.emit("ready");
    });
  }

  /**
   * Stop watching
   */
  async stop(): Promise<void> {
    debug("stopping watcher");
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  /**
   * Mark a path as in-flight (being written by us)
   */
  markInFlight(path: string): void {
    debug("marking in-flight: %s", path);
    this.inFlightWrites.add(path);
  }

  /**
   * Clear in-flight status after write settles
   */
  clearInFlight(path: string, delayMs: number = 1000): void {
    setTimeout(() => {
      this.inFlightWrites.delete(path);
    }, delayMs);
  }

  /**
   * Check if a path is in-flight
   */
  isInFlight(path: string): boolean {
    return this.inFlightWrites.has(path);
  }

  /**
   * Schedule a sync after debounce period
   */
  private scheduleSync(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    debug("scheduling sync in %dms (%d pending)", this.config.debounceMs, this.pendingPaths.size);
    this.debounceTimer = setTimeout(() => {
      this.sync();
    }, this.config.debounceMs);
  }

  /**
   * Process pending changes
   */
  private sync(): void {
    const paths = [...this.pendingPaths];
    this.pendingPaths.clear();

    if (paths.length === 0) {
      debug("sync: no pending paths");
      return;
    }

    // Group by directory for efficient scanning
    const dirs = new Set<string>();
    for (const path of paths) {
      dirs.add(dirname(path));
    }

    debug("sync: emitting %d paths, %d directories", paths.length, dirs.size);

    // Emit sync event with affected directories
    this.emit("sync", {
      paths,
      directories: [...dirs],
    });
  }

  /**
   * Force immediate sync (bypass debounce)
   */
  forceSync(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.sync();
  }

  /**
   * Get file identity (for rename detection)
   */
  static getFileIdentity(
    path: string,
  ): { ino: number; path: string; mtime: number; size: number } | null {
    try {
      const stat = statSync(path);
      return {
        ino: stat.ino,
        path,
        mtime: stat.mtimeMs,
        size: stat.size,
      };
    } catch {
      return null;
    }
  }
}

/**
 * Scan a directory for files, applying ignore patterns
 */
export function scanDirectory(
  dirPath: string,
  ignorePatterns?: string[],
): Array<{ path: string; ino: number; mtime: number; isDirectory: boolean }> {
  const results: Array<{
    path: string;
    ino: number;
    mtime: number;
    isDirectory: boolean;
  }> = [];

  if (!existsSync(dirPath)) {
    return results;
  }

  const entries = readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);

    // Skip hidden files (files starting with .)
    if (isHiddenFile(fullPath)) {
      continue;
    }

    // Skip files matching ignore patterns
    if (ignorePatterns && shouldIgnore(fullPath, ignorePatterns)) {
      continue;
    }

    try {
      const stat = statSync(fullPath);
      results.push({
        path: fullPath,
        ino: stat.ino,
        mtime: stat.mtimeMs,
        isDirectory: entry.isDirectory(),
      });
    } catch {
      // Skip inaccessible files
    }
  }

  return results;
}

/**
 * Recursively scan directory tree
 */
export function scanDirectoryRecursive(
  dirPath: string,
  filter?: (path: string) => boolean,
  ignorePatterns?: string[],
): Array<{ path: string; ino: number; mtime: number; isDirectory: boolean }> {
  const results: Array<{
    path: string;
    ino: number;
    mtime: number;
    isDirectory: boolean;
  }> = [];

  function scan(dir: string) {
    const entries = scanDirectory(dir, ignorePatterns);

    for (const entry of entries) {
      // Always recurse into directories, but only add to results if filter passes
      if (entry.isDirectory) {
        scan(entry.path);
      }

      // Apply filter to determine if entry should be in results
      if (filter && !filter(entry.path)) {
        continue;
      }

      results.push(entry);
    }
  }

  scan(dirPath);
  return results;
}
