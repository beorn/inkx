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
import {
  loadVault,
  type LoadOptions,
  type LoadResult,
} from "./vault-loader.ts";
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
  type Link,
} from "./db.ts";
import { parseQuery, executeQuery } from "./query.ts";
import { createWatcher, type Watcher } from "./watcher.ts";
import { getKmDir } from "./emit.ts";

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

  /** Get backlinks (link records pointing to this node) */
  getBacklinks(nodeId: string): Link[];

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

// --- Hooks ---

/** Mutation types for beforeMutation/afterMutation hooks */
export type MutationType = "update" | "move" | "delete" | "add";

/** Context passed to mutation hooks */
export interface MutationContext {
  type: MutationType;
  nodeId: string;
  changes?: Partial<KNode>;
  newParentId?: string;
  position?: number;
  node?: Partial<KNode> & { type: KNode["type"]; content: string };
}

/** Result from beforeMutation hook */
export interface BeforeMutationResult {
  /** Set to true to cancel the mutation */
  cancel?: boolean;
  /** Modified context (optional) */
  context?: MutationContext;
}

/** Vault lifecycle hooks for extending behavior */
export interface VaultHooks {
  /**
   * Called before each mutation (update, move, delete, add).
   * Return { cancel: true } to prevent the mutation.
   * Return { context: modified } to transform the mutation.
   */
  beforeMutation?: (ctx: MutationContext) => BeforeMutationResult | void;

  /**
   * Called after each mutation completes.
   */
  afterMutation?: (ctx: MutationContext) => void;

  /**
   * Called after query operations complete.
   * Can be used to augment results or log queries.
   */
  afterQuery?: (operation: string, result: unknown) => void;

  /**
   * Called when vault is closed.
   */
  onClose?: () => void;
}

/** Options for createVault */
export interface VaultOptions extends LoadOptions {
  /** Dependency injection for testing */
  inject?: {
    database?: Database;
  };
  /** Lifecycle hooks for extending vault behavior */
  hooks?: VaultHooks;
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

  // Capture hooks
  const hooks = options?.hooks;

  // Helper to run mutation with hooks
  function runMutation<T>(
    ctx: MutationContext,
    execute: (ctx: MutationContext) => T,
  ): T {
    // beforeMutation hook
    if (hooks?.beforeMutation) {
      const result = hooks.beforeMutation(ctx);
      if (result?.cancel) {
        throw new Error(
          `Mutation cancelled by hook: ${ctx.type} ${ctx.nodeId}`,
        );
      }
      if (result?.context) {
        ctx = result.context;
      }
    }

    // Execute mutation
    const value = execute(ctx);

    // afterMutation hook
    if (hooks?.afterMutation) {
      hooks.afterMutation(ctx);
    }

    return value;
  }

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

    // Query operations (with afterQuery hook)
    getNode(id) {
      ensureNotClosed();
      const result = dbGetNode(id);
      hooks?.afterQuery?.("getNode", result);
      return result;
    },

    getChildren(parentId) {
      ensureNotClosed();
      const result = dbGetChildren(parentId);
      hooks?.afterQuery?.("getChildren", result);
      return result;
    },

    getSubtree(nodeId) {
      ensureNotClosed();
      const result = dbGetSubtree(nodeId);
      hooks?.afterQuery?.("getSubtree", result);
      return result;
    },

    getAncestors(nodeId) {
      ensureNotClosed();
      const result = dbGetAncestors(nodeId);
      hooks?.afterQuery?.("getAncestors", result);
      return result;
    },

    getAllTasks() {
      ensureNotClosed();
      const result = dbGetAllTasks();
      hooks?.afterQuery?.("getAllTasks", result);
      return result;
    },

    getTasksByStatus(status) {
      ensureNotClosed();
      const result = dbGetTasksByStatus(status);
      hooks?.afterQuery?.("getTasksByStatus", result);
      return result;
    },

    search(query) {
      ensureNotClosed();
      const result = dbSearch(query);
      hooks?.afterQuery?.("search", result);
      return result;
    },

    query(expression) {
      ensureNotClosed();
      const ast = parseQuery(expression);
      const result = executeQuery(ast);
      hooks?.afterQuery?.("query", result);
      return result;
    },

    getLinksTo(targetId) {
      ensureNotClosed();
      const result = dbGetLinksTo(targetId);
      hooks?.afterQuery?.("getLinksTo", result);
      return result;
    },

    getBacklinks(nodeId) {
      ensureNotClosed();
      const result = dbGetBacklinks(nodeId);
      hooks?.afterQuery?.("getBacklinks", result);
      return result;
    },

    // Mutation operations (with hooks)
    updateNode(id, changes) {
      ensureNotClosed();
      runMutation({ type: "update", nodeId: id, changes }, (ctx) => {
        dbUpdateNode(ctx.nodeId, ctx.changes!);
      });
    },

    moveNode(id, newParentId, position) {
      ensureNotClosed();
      runMutation(
        { type: "move", nodeId: id, newParentId, position },
        (ctx) => {
          dbMoveNode(ctx.nodeId, ctx.newParentId!, ctx.position!);
        },
      );
    },

    deleteNode(id) {
      ensureNotClosed();
      runMutation({ type: "delete", nodeId: id }, (ctx) => {
        dbDeleteNode(ctx.nodeId);
      });
    },

    addNode(parentId, node) {
      ensureNotClosed();
      return runMutation(
        { type: "add", nodeId: parentId ?? "root", node },
        (ctx) => dbAddNode(parentId, ctx.node!),
      );
    },

    // Lifecycle
    watch() {
      ensureNotClosed();
      if (mode === "memory") {
        throw new Error("Cannot watch a memory vault - no .km directory");
      }
      const kmDir = getKmDir();
      return createWatcher(kmDir ? kmDir.replace(/\/.km$/, "") : path);
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
      hooks?.onClose?.();
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
