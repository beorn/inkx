/**
 * Vault - Storage Domain Object
 *
 * The central domain object for accessing vault data.
 * Created via createVault() factory function.
 *
 * Features:
 * - Encapsulates all storage layer operations
 * - Manages database lifecycle
 * - Provides query and mutation methods
 * - Creates Watcher via watch() method
 */

import createDebug from "debug";
import { Database } from "bun:sqlite";
import type { KNode, TaskStatus } from "@km/core";
import type { ProgressInfo } from "@beorn/inkx-ui";
import { loadVault, type LoadOptions, type LoadResult } from "./vault-loader.ts";
import {
  getNode as dbGetNode,
  getChildren as dbGetChildren,
  getAllTasks as dbGetAllTasks,
  getTasksByStatus as dbGetTasksByStatus,
  search as dbSearch,
  updateNode as dbUpdateNode,
  moveNode as dbMoveNode,
  deleteNode as dbDeleteNode,
  addNode as dbAddNode,
  getSubtree as dbGetSubtree,
  getAncestors as dbGetAncestors,
  getLinksTo as dbGetLinksTo,
  getBacklinks as dbGetBacklinks,
  closeDb,
} from "./db.ts";
import { executeQuery } from "./query.ts";
import type { FileChange } from "./watch/index.ts";

const debug = createDebug("km:storage:vault");

// --- Interfaces ---

/**
 * Vault interface - the main domain object for storage operations.
 * Implements Disposable for automatic cleanup with `using`.
 */
export interface Vault extends Disposable {
  /** Vault root path */
  readonly path: string;

  /** Storage mode: 'memory' (ephemeral) or 'disk' (persistent) */
  readonly mode: "memory" | "disk";

  /** Errors from loading (non-fatal parse errors, etc.) */
  readonly loadErrors: LoadError[];

  /** Stats from loading */
  readonly stats: VaultStats;

  // --- Query operations ---

  /** Get a single node by ID */
  getNode(id: string): KNode | null;

  /** Get children of a node (null for root) */
  getChildren(parentId: string | null): KNode[];

  /** Get full subtree under a node */
  getSubtree(nodeId: string): KNode[];

  /** Get ancestors of a node (from root to parent) */
  getAncestors(nodeId: string): KNode[];

  /** Get all tasks */
  getAllTasks(): KNode[];

  /** Get tasks by status */
  getTasksByStatus(status: TaskStatus): KNode[];

  /** Full-text search */
  search(query: string): KNode[];

  /** Execute query language expression */
  query(expression: string): KNode[];

  /** Get nodes linking to a target */
  getLinksTo(targetId: string): KNode[];

  /** Get backlinks (nodes referencing this node by name) */
  getBacklinks(nodeId: string): KNode[];

  // --- Mutation operations ---

  /** Update a node's properties */
  updateNode(id: string, changes: Partial<KNode>): void;

  /** Move a node to a new parent */
  moveNode(id: string, newParentId: string, position: number): void;

  /** Delete a node */
  deleteNode(id: string): void;

  /** Add a new node under a parent */
  addNode(
    parentId: string | null,
    node: Partial<KNode> & { type: KNode["type"]; content: string },
  ): string;

  // --- Lifecycle ---

  /**
   * Create a Watcher for this vault.
   * Only available in disk mode.
   * @throws Error if vault is in memory mode
   */
  watch(): Watcher;

  /**
   * Refresh the vault state.
   * - Memory mode: re-scan filesystem
   * - Disk mode: re-apply unapplied events
   */
  refresh(): void;

  /**
   * Close the vault and release resources.
   * Called automatically when using `using vault = ...`
   */
  close(): void;
}

/** Load error from vault initialization */
export interface LoadError {
  phase: "discover" | "parse" | "apply" | "resolve" | "materialize";
  path?: string;
  message: string;
}

/** Stats from vault loading */
export interface VaultStats {
  nodeCount: number;
  linkCount: number;
  duration: number;
}

/** Options for createVault */
export interface VaultOptions extends LoadOptions {
  /** Dependency injection for testing */
  inject?: {
    database?: Database;
  };
}

/**
 * Watcher interface - file sync service.
 * Implements Service for start/stop lifecycle.
 * TODO: Will be fully implemented in Phase 4
 */
export interface Watcher extends AsyncDisposable {
  readonly status: "stopped" | "starting" | "running" | "stopping";
  start(): Promise<void>;
  stop(): Promise<void>;
  on(event: "change", handler: (changes: FileChange[]) => void): void;
  off(event: "change", handler: (changes: FileChange[]) => void): void;
}


// --- Factory ---

/**
 * Create a Vault domain object.
 *
 * This is a generator that yields progress info during loading.
 * Use runGenerator() for silent loading, or iterate for progress.
 *
 * @example
 * // Silent loading
 * using vault = runGenerator(createVault("/path/to/vault"));
 *
 * // With progress
 * for (const progress of createVault(path)) {
 *   spinner.update(`${progress.phase}: ${progress.current}/${progress.total}`);
 * }
 *
 * @param rootPath - Path to vault root (default: cwd)
 * @param options - Loading options
 * @yields Progress info for each loading phase
 * @returns Vault domain object
 */
export function* createVault(
  rootPath?: string,
  options?: VaultOptions,
): Generator<ProgressInfo, Vault, unknown> {
  debug("createVault", { rootPath, options });

  // Load vault using existing infrastructure
  const result: LoadResult = yield* loadVault(rootPath, options);

  // Capture state from globals (will be encapsulated in the vault object)
  const path = rootPath ?? process.cwd();
  const mode = result.mode;
  const loadErrors = result.errors;
  const stats: VaultStats = {
    nodeCount: result.nodeCount,
    linkCount: result.linkCount,
    duration: result.duration,
  };

  let closed = false;

  debug("vault loaded", { path, mode, stats });

  // Return vault object
  const vault: Vault = {
    get path() {
      return path;
    },
    get mode() {
      return mode;
    },
    get loadErrors() {
      return loadErrors;
    },
    get stats() {
      return stats;
    },

    // Query operations
    getNode(id) {
      ensureNotClosed();
      return dbGetNode(id);
    },

    getChildren(parentId) {
      ensureNotClosed();
      return dbGetChildren(parentId);
    },

    getSubtree(nodeId) {
      ensureNotClosed();
      return dbGetSubtree(nodeId);
    },

    getAncestors(nodeId) {
      ensureNotClosed();
      return dbGetAncestors(nodeId);
    },

    getAllTasks() {
      ensureNotClosed();
      return dbGetAllTasks();
    },

    getTasksByStatus(status) {
      ensureNotClosed();
      return dbGetTasksByStatus(status);
    },

    search(query) {
      ensureNotClosed();
      return dbSearch(query);
    },

    query(expression) {
      ensureNotClosed();
      return executeQuery(expression);
    },

    getLinksTo(targetId) {
      ensureNotClosed();
      return dbGetLinksTo(targetId);
    },

    getBacklinks(nodeId) {
      ensureNotClosed();
      return dbGetBacklinks(nodeId);
    },

    // Mutation operations
    updateNode(id, changes) {
      ensureNotClosed();
      dbUpdateNode(id, changes);
    },

    moveNode(id, newParentId, position) {
      ensureNotClosed();
      dbMoveNode(id, newParentId, position);
    },

    deleteNode(id) {
      ensureNotClosed();
      dbDeleteNode(id);
    },

    addNode(parentId, node) {
      ensureNotClosed();
      return dbAddNode(parentId, node);
    },

    // Lifecycle
    watch() {
      ensureNotClosed();
      if (mode === "memory") {
        throw new Error("Cannot watch a memory vault - no .km directory");
      }
      // TODO: Implement createWatcher in Phase 4
      throw new Error("Watcher not yet implemented");
    },

    refresh() {
      ensureNotClosed();
      // TODO: Re-scan or re-apply events
      debug("refresh not yet implemented");
    },

    close() {
      if (closed) return;
      closed = true;
      debug("closing vault");
      closeDb();
    },

    [Symbol.dispose]() {
      this.close();
    },
  };

  return vault;

  function ensureNotClosed() {
    if (closed) {
      throw new Error("Vault is closed");
    }
  }
}
