/**
 * Sync Manager
 *
 * Coordinates bidirectional sync between filesystem and database
 */

import createDebug from "debug";
import { mkdirSync } from "fs";

const debug = createDebug("km:storage:watch:sync");
import { dirname, join } from "path";
import { EventEmitter } from "events";
import { FileSystemWatcher, scanDirectoryRecursive } from "./watcher.ts";
import { WorkerWatcher } from "./worker-bridge.ts";
import type { WatcherStatus } from "./worker-thread.ts";
import { reconcileDirectory, applyReconcileOps } from "./reconcile.ts";
import { WriteQueue, shouldApplyToFs } from "./writequeue.ts";
import { getIgnorePatterns } from "./ignore.ts";
import type { Event, KNode } from "@km/core";
import { setDatabase, setKmDir } from "../emit.ts";
import {
  getAllNodes,
  getNode,
  getSubtree,
  applyEvent,
  dbApplyEvent,
  readEvents,
  nodesToMarkdown,
} from "../index.ts";

export interface SyncConfig {
  vaultPath: string;
  debounceFs: number;
  debounceApply: number;
  conflictStrategy: "last_write_wins" | "fs_wins" | "db_wins";
  /** Use worker thread for file watching (default: true). Prevents UI blocking on large vaults. */
  useWorker?: boolean;
}

const DEFAULT_CONFIG: Partial<SyncConfig> = {
  debounceFs: 5000,
  debounceApply: 3000,
  conflictStrategy: "last_write_wins",
  useWorker: true,
};

export type SyncState =
  | "idle"
  | "fs_debouncing"
  | "db_debouncing"
  | "reconciling"
  | "applying"
  | "emitting"
  | "writing";

/** Common interface for both watcher types */
type WatcherInterface = FileSystemWatcher | WorkerWatcher;

export class SyncManager extends EventEmitter {
  private config: SyncConfig;
  private watcher: WatcherInterface;
  private writeQueue: WriteQueue;
  private state: SyncState = "idle";
  private ignorePatterns: string[] = [];

  constructor(config: SyncConfig) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config } as SyncConfig;

    // Use worker-based watcher by default (non-blocking)
    // Fall back to direct watcher if useWorker is explicitly false
    if (this.config.useWorker !== false) {
      debug("using WorkerWatcher (non-blocking)");
      this.watcher = new WorkerWatcher({
        debounceMs: this.config.debounceFs,
      });
    } else {
      debug("using FileSystemWatcher (direct)");
      this.watcher = new FileSystemWatcher({
        debounceMs: this.config.debounceFs,
      });
    }

    this.writeQueue = new WriteQueue({
      debounceMs: this.config.debounceApply,
    });

    this.writeQueue.setWatcher(this.watcher);

    // Wire up events
    this.watcher.on("sync", (data) => void this.handleFsSync(data));
    this.watcher.on("error", (error) => this.emit("error", error));
    this.watcher.on("ready", () => this.emit("ready"));

    // Forward watcher status events (WorkerWatcher only)
    if (this.watcher instanceof WorkerWatcher) {
      this.watcher.on("status", (status: WatcherStatus) => {
        this.emit("watcher-status", status);
      });
    }

    this.writeQueue.on("flushed", (data) => this.emit("write-complete", data));
    this.writeQueue.on("errors", (errors) => this.emit("write-errors", errors));
  }

  /**
   * Start watching and syncing
   */
  start(): void {
    debug("starting sync manager for %s", this.config.vaultPath);
    // Load ignore patterns for reconciliation
    this.ignorePatterns = getIgnorePatterns(this.config.vaultPath);
    this.watcher.start(this.config.vaultPath);
    this.emit("started");
  }

  /**
   * Stop watching and syncing
   */
  async stop(): Promise<void> {
    debug("stopping sync manager");
    await this.watcher.stop();
    this.writeQueue.clear();
    this.emit("stopped");
  }

  /**
   * Get current sync state
   */
  getState(): SyncState {
    return this.state;
  }

  /**
   * Handle filesystem sync event
   */
  private async handleFsSync(data: {
    paths: string[];
    directories: string[];
  }): Promise<void> {
    debug("fs sync triggered: %d paths, %d directories", data.paths.length, data.directories.length);
    this.setState("reconciling");

    try {
      for (const dir of data.directories) {
        const ops = reconcileDirectory(dir, this.config.vaultPath, this.ignorePatterns);
        debug("reconciled %s: %d ops", dir, ops.length);

        if (ops.length > 0) {
          this.setState("emitting");
          await applyReconcileOps(ops, this.config.vaultPath);
        }
      }
    } catch (error) {
      debug("fs sync error: %O", error);
      this.emit("error", error);
    }

    this.setState("idle");
  }

  private setState(newState: SyncState): void {
    if (this.state !== newState) {
      debug("state: %s → %s", this.state, newState);
      this.state = newState;
      this.emit("state-change", this.state);
    }
  }

  /**
   * Apply a database event to filesystem
   */
  applyEventToFs(event: Event): void {
    if (!shouldApplyToFs(event.actor)) {
      debug("skipping fs apply for actor=%s event=%s", event.actor, event.type);
      return;
    }

    debug("applying %s to fs: %s", event.type, event.target ?? "no-target");

    switch (event.type) {
      case "node_updated":
        this.handleNodeUpdated(event);
        break;
      case "node_created":
        this.handleNodeCreated(event);
        break;
      case "node_deleted":
        this.handleNodeDeleted(event);
        break;
      case "node_moved":
        this.handleNodeMoved(event);
        break;
    }
  }

  /**
   * Handle node updated event - regenerate file
   */
  private handleNodeUpdated(event: Event): void {
    if (!event.target) return;

    const node = getNode(event.target);
    if (!node) return;

    // Find the file this node belongs to
    const fileNode = findFileNode(node);
    if (!fileNode?.fs_path) return;

    // Regenerate the file
    const allNodes = getSubtree(fileNode.id);
    const content = nodesToMarkdown(allNodes);

    this.writeQueue.queue({
      path: fileNode.fs_path,
      content,
      sourceEventId: event.id,
    });
  }

  /**
   * Handle node created event
   */
  private handleNodeCreated(event: Event): void {
    const data = event.data as Partial<KNode>;

    if (data.type === "folder" && data.fs_path) {
      // Create directory
      try {
        mkdirSync(data.fs_path, { recursive: true });
      } catch {
        // Ignore errors
      }
    } else if (data.type === "file" && data.fs_path) {
      // Create file
      this.writeQueue.queue({
        path: data.fs_path,
        content: "",
        sourceEventId: event.id,
      });
    }
  }

  /**
   * Handle node deleted event
   */
  private handleNodeDeleted(event: Event): void {
    if (!event.target) return;

    // Get node before deletion (using km-storage abstraction)
    const node = getNode(event.target);

    if (node?.fs_path && (node.type === "file" || node.type === "folder")) {
      this.writeQueue.queueDelete(node.fs_path, event.id);
    }
  }

  /**
   * Handle node moved event
   */
  private handleNodeMoved(event: Event): void {
    // Movement might require file regeneration
    if (!event.target) return;

    const node = getNode(event.target);
    if (!node) return;

    // Regenerate affected files
    const fileNode = findFileNode(node);
    if (fileNode?.fs_path) {
      const allNodes = getSubtree(fileNode.id);
      const content = nodesToMarkdown(allNodes);

      this.writeQueue.queue({
        path: fileNode.fs_path,
        content,
        sourceEventId: event.id,
      });
    }
  }

  /**
   * Force sync from filesystem
   */
  async syncFromFs(): Promise<{ processed: number }> {
    debug("syncFromFs: scanning %s", this.config.vaultPath);
    const start = Date.now();

    // Set kmDir to vault's .km directory so database operations use correct path
    setKmDir(join(this.config.vaultPath, ".km"));

    // Enable immediate event application so folder nodes are visible during sync
    setDatabase(dbApplyEvent);

    // Load ignore patterns for this vault
    const ignorePatterns = getIgnorePatterns(this.config.vaultPath);

    const entries = scanDirectoryRecursive(
      this.config.vaultPath,
      (path) => path.endsWith(".md"),
      ignorePatterns,
    );

    debug("syncFromFs: found %d entries", entries.length);

    // Group by directory
    const dirs = new Set<string>();

    for (const entry of entries) {
      dirs.add(dirname(entry.path));
    }

    let processed = 0;
    for (const dir of dirs) {
      const ops = reconcileDirectory(dir, this.config.vaultPath, ignorePatterns);
      await applyReconcileOps(ops, this.config.vaultPath);
      processed += ops.length;
    }

    debug("syncFromFs: processed %d ops in %dms", processed, Date.now() - start);
    return { processed };
  }

  /**
   * Force sync to filesystem
   */
  async syncToFs(): Promise<{ written: number }> {
    debug("syncToFs: starting");
    const start = Date.now();

    // Set kmDir to vault's .km directory so database operations use correct path
    setKmDir(join(this.config.vaultPath, ".km"));

    const nodes = getAllNodes();
    const fileNodes = nodes.filter((n) => n.type === "file" && n.fs_path);

    debug("syncToFs: writing %d files", fileNodes.length);

    for (const fileNode of fileNodes) {
      if (!fileNode.fs_path) continue;
      const subtree = getSubtree(fileNode.id);
      const content = nodesToMarkdown(subtree);

      this.writeQueue.queue({
        path: fileNode.fs_path,
        content,
        sourceEventId: "sync-to-fs",
      });
    }

    await this.writeQueue.forceFlush();

    debug("syncToFs: wrote %d files in %dms", fileNodes.length, Date.now() - start);
    return { written: fileNodes.length };
  }

  /**
   * Get sync status
   */
  getStatus(): {
    state: SyncState;
    pendingWrites: number;
    vaultPath: string;
    watcher?: WatcherStatus;
  } {
    const status: {
      state: SyncState;
      pendingWrites: number;
      vaultPath: string;
      watcher?: WatcherStatus;
    } = {
      state: this.state,
      pendingWrites: this.writeQueue.getPendingCount(),
      vaultPath: this.config.vaultPath,
    };

    // Include watcher status if using WorkerWatcher
    if (this.watcher instanceof WorkerWatcher) {
      status.watcher = this.watcher.getStatus();
    }

    return status;
  }

  /**
   * Get watcher status (WorkerWatcher only)
   */
  getWatcherStatus(): WatcherStatus | null {
    if (this.watcher instanceof WorkerWatcher) {
      return this.watcher.getStatus();
    }
    return null;
  }
}

/**
 * Find the file node that contains a given node
 */
function findFileNode(node: KNode): KNode | null {
  if (node.type === "file") {
    return node;
  }

  if (!node.parent_id) {
    return null;
  }

  const parent = getNode(node.parent_id);
  if (!parent) {
    return null;
  }

  return findFileNode(parent);
}

/**
 * One-time sync from filesystem to database
 */
export async function syncOnce(vaultPath: string): Promise<{
  created: number;
  updated: number;
  deleted: number;
}> {
  const manager = new SyncManager({
    vaultPath,
    debounceFs: 0,
    debounceApply: 0,
    conflictStrategy: "fs_wins",
  });

  const result = await manager.syncFromFs();

  return {
    created: result.processed,
    updated: 0,
    deleted: 0,
  };
}
