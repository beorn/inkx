/**
 * Sync Manager
 *
 * Coordinates bidirectional sync between filesystem and database
 */

import { mkdirSync } from "fs";
import { dirname } from "path";
import { EventEmitter } from "events";
import { FileSystemWatcher, scanDirectoryRecursive } from "./watcher.ts";
import { reconcileDirectory, applyReconcileOps } from "./reconcile.ts";
import { WriteQueue, shouldApplyToFs } from "./writequeue.ts";
import { getIgnorePatterns } from "./ignore.ts";
import type { Event, KNode } from "@km/core";
import { setDatabase } from "../emit.ts";
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
}

const DEFAULT_CONFIG: Partial<SyncConfig> = {
  debounceFs: 5000,
  debounceApply: 3000,
  conflictStrategy: "last_write_wins",
};

export type SyncState =
  | "idle"
  | "fs_debouncing"
  | "db_debouncing"
  | "reconciling"
  | "applying"
  | "emitting"
  | "writing";

export class SyncManager extends EventEmitter {
  private config: SyncConfig;
  private watcher: FileSystemWatcher;
  private writeQueue: WriteQueue;
  private state: SyncState = "idle";

  constructor(config: SyncConfig) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config } as SyncConfig;

    this.watcher = new FileSystemWatcher({
      debounceMs: this.config.debounceFs,
    });

    this.writeQueue = new WriteQueue({
      debounceMs: this.config.debounceApply,
    });

    this.writeQueue.setWatcher(this.watcher);

    // Wire up events
    this.watcher.on("sync", (data) => void this.handleFsSync(data));
    this.watcher.on("error", (error) => this.emit("error", error));
    this.watcher.on("ready", () => this.emit("ready"));

    this.writeQueue.on("flushed", (data) => this.emit("write-complete", data));
    this.writeQueue.on("errors", (errors) => this.emit("write-errors", errors));
  }

  /**
   * Start watching and syncing
   */
  start(): void {
    this.watcher.start(this.config.vaultPath);
    this.emit("started");
  }

  /**
   * Stop watching and syncing
   */
  async stop(): Promise<void> {
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
    this.state = "reconciling";
    this.emit("state-change", this.state);

    try {
      for (const dir of data.directories) {
        const ops = reconcileDirectory(dir, this.config.vaultPath);

        if (ops.length > 0) {
          this.state = "emitting";
          this.emit("state-change", this.state);
          await applyReconcileOps(ops, this.config.vaultPath);
        }
      }
    } catch (error) {
      this.emit("error", error);
    }

    this.state = "idle";
    this.emit("state-change", this.state);
  }

  /**
   * Apply a database event to filesystem
   */
  applyEventToFs(event: Event): void {
    if (!shouldApplyToFs(event.actor)) {
      return;
    }

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
    // Enable immediate event application so folder nodes are visible during sync
    setDatabase(dbApplyEvent);

    // Load ignore patterns for this vault
    const ignorePatterns = getIgnorePatterns(this.config.vaultPath);

    const entries = scanDirectoryRecursive(
      this.config.vaultPath,
      (path) => path.endsWith(".md"),
      ignorePatterns,
    );

    // Group by directory
    const dirs = new Set<string>();

    for (const entry of entries) {
      dirs.add(dirname(entry.path));
    }

    let processed = 0;
    for (const dir of dirs) {
      const ops = reconcileDirectory(dir, this.config.vaultPath);
      await applyReconcileOps(ops, this.config.vaultPath);
      processed += ops.length;
    }

    return { processed };
  }

  /**
   * Force sync to filesystem
   */
  async syncToFs(): Promise<{ written: number }> {
    const nodes = getAllNodes();
    const fileNodes = nodes.filter((n) => n.type === "file" && n.fs_path);

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

    return { written: fileNodes.length };
  }

  /**
   * Get sync status
   */
  getStatus(): {
    state: SyncState;
    pendingWrites: number;
    vaultPath: string;
  } {
    return {
      state: this.state,
      pendingWrites: this.writeQueue.getPendingCount(),
      vaultPath: this.config.vaultPath,
    };
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
