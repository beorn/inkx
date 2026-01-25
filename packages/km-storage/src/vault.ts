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
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  appendFileSync,
  readFileSync,
} from "fs";
import { join, dirname, basename } from "path";
import type { KNode, TaskStatus } from "@km/core";
import {
  loadVault,
  type LoadOptions,
  type LoadResult,
  type DeferredFile,
  type StepYield,
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
  getDb,
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

  /**
   * Files deferred for background parsing (when discoverOnly: true).
   * Empty array if full parsing was done upfront.
   */
  readonly deferredFiles: DeferredFile[];

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

  /**
   * Batch get child counts for multiple parent IDs.
   * Returns a Map from parentId to count of direct children.
   * More efficient than calling getChildren().length for each.
   */
  getChildCounts(parentIds: string[]): Map<string, number>;

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

  /**
   * Clone a task with modifications (e.g., for recurring tasks).
   * @param sourceId - ID of the task to clone
   * @param changes - Changes to apply to the clone
   * @returns ID of the new task, or null if source not found
   */
  cloneTask(sourceId: string, changes: Partial<KNode>): string | null;

  /**
   * Append a task line to a markdown file.
   * @param filePath - Relative or absolute path to the file
   * @param content - Content to append
   * @param options.ensure - Create file/directory if not exists
   */
  appendTaskToFile(
    filePath: string,
    content: string,
    options?: { ensure?: boolean },
  ): void;

  // --- Filesystem helpers ---

  /**
   * Check if a path exists relative to vault root.
   * @param relativePath - Path relative to vault root
   */
  pathExists(relativePath: string): boolean;

  // --- Advanced ---

  /**
   * Execute a raw SQL query on the database.
   * Use for advanced queries not covered by the standard API.
   * @param sql - SQL query string
   * @param params - Query parameters
   * @returns Query results as array of objects
   */
  rawQuery<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[];

  // --- Rebuild helpers ---

  /**
   * Check if state.db needs rebuild.
   * Returns true if:
   * - Disk mode: state.db doesn't exist or has unapplied events
   * - Memory mode: always returns false (ephemeral, no persistence)
   */
  needsRebuild(): boolean;

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
  /** Factory for creating watcher (for test injection) */
  watcherFactory?: (vaultPath: string) => Watcher;
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
): Generator<StepYield, Vault, unknown> {
  debug("createVault rootPath=%s options=%o", rootPath, options);

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

  debug("vault loaded path=%s mode=%s stats=%o", path, mode, stats);

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
    get deferredFiles() {
      return result.deferredFiles ?? [];
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

    getChildCounts(parentIds) {
      ensureNotClosed();
      const counts = new Map<string, number>();
      if (parentIds.length === 0) return counts;

      const db = getDb();
      const placeholders = parentIds.map(() => "?").join(",");
      const rows = db
        .query<
          { parent_id: string; count: number },
          string[]
        >(`SELECT parent_id, COUNT(*) as count FROM nodes WHERE parent_id IN (${placeholders}) GROUP BY parent_id`)
        .all(...parentIds);

      for (const row of rows) {
        counts.set(row.parent_id, row.count);
      }
      hooks?.afterQuery?.("getChildCounts", counts);
      return counts;
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
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- ctx.changes is set by caller
        dbUpdateNode(ctx.nodeId, ctx.changes!);
      });
    },

    moveNode(id, newParentId, position) {
      ensureNotClosed();
      runMutation(
        { type: "move", nodeId: id, newParentId, position },
        (ctx) => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- ctx fields set by caller
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
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- ctx.node set by caller
        (ctx) => dbAddNode(parentId, ctx.node!),
      );
    },

    cloneTask(sourceId, changes) {
      ensureNotClosed();
      const source = dbGetNode(sourceId);
      if (!source || source.type !== "task") return null;

      // Build cloned node with changes
      const clonedNode: Partial<KNode> & { type: "task"; content: string } = {
        type: "task",
        content: changes.content ?? source.content ?? "",
        parent_id: changes.parent_id ?? source.parent_id,
        parent_idx: changes.parent_idx ?? (source.parent_idx ?? 0) + 0.001,
        task_status: changes.task_status ?? "todo",
        task_mark: changes.task_mark ?? " ",
        assigned_to: changes.assigned_to ?? source.assigned_to,
        due_date: changes.due_date ?? source.due_date,
        scheduled_date: changes.scheduled_date ?? source.scheduled_date,
        priority: changes.priority ?? source.priority,
        data: {
          ...source.data,
          ...changes.data,
          recur_prev: sourceId, // Link back to source
        },
      };

      // Use addNode mutation to insert
      return runMutation(
        {
          type: "add",
          nodeId: clonedNode.parent_id ?? "root",
          node: clonedNode,
        },
        () => dbAddNode(clonedNode.parent_id ?? null, clonedNode),
      );
    },

    appendTaskToFile(filePath, content, options) {
      ensureNotClosed();
      const fullPath = filePath.startsWith("/")
        ? filePath
        : join(path, filePath);

      // Ensure directory exists if requested
      if (options?.ensure) {
        const dir = dirname(fullPath);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        if (!existsSync(fullPath)) {
          writeFileSync(
            fullPath,
            `---\ntitle: ${basename(fullPath).replace(/\.md$/, "")}\n---\n\n`,
          );
        }
      }

      appendFileSync(fullPath, content);
    },

    pathExists(relativePath) {
      ensureNotClosed();
      return existsSync(join(path, relativePath));
    },

    rawQuery<T = Record<string, unknown>>(
      sql: string,
      params?: unknown[],
    ): T[] {
      ensureNotClosed();
      const db = getDb();
      const stmt = db.prepare(sql);
      return (
        params
          ? stmt.all(...(params as Parameters<typeof stmt.all>))
          : stmt.all()
      ) as T[];
    },

    // Lifecycle
    watch() {
      ensureNotClosed();
      if (mode === "memory") {
        throw new Error("Cannot watch a memory vault - no .km directory");
      }
      // Use injected factory if provided (for testing)
      if (options?.watcherFactory) {
        return options.watcherFactory(path);
      }
      const kmDir = getKmDir();
      return createWatcher(kmDir ? kmDir.replace(/\/.km$/, "") : path);
    },

    refresh() {
      ensureNotClosed();
      // TODO: Re-scan or re-apply events
      debug("refresh not yet implemented");
    },

    needsRebuild() {
      ensureNotClosed();

      // Memory mode never needs rebuild (ephemeral)
      if (mode === "memory") {
        debug("needsRebuild: no (memory mode)");
        return false;
      }

      // Disk mode: check state.db and events.jsonl
      const kmDir = join(path, ".km");
      const dbPath = join(kmDir, "state.db");
      const eventsPath = join(kmDir, "events.jsonl");

      if (!existsSync(dbPath)) {
        debug("needsRebuild: yes (no state.db)");
        return true;
      }

      if (!existsSync(eventsPath)) {
        debug("needsRebuild: no (no events.jsonl)");
        return false;
      }

      // Check if there are unapplied events
      const db = getDb();
      const lastApplied = db
        .prepare("SELECT value FROM meta WHERE key = ?")
        .get("last_event") as { value: string } | undefined;

      const lastAppliedId = lastApplied?.value;
      if (!lastAppliedId) {
        // DB exists but hasn't applied any events - check if events exist
        const content = existsSync(eventsPath)
          ? readFileSync(eventsPath, "utf-8")
          : "";
        const hasEvents = content.trim().length > 0;
        debug("needsRebuild", {
          result: hasEvents ? "yes" : "no",
          reason: "no last_event",
        });
        return hasEvents;
      }

      // Check if events file has newer events (read last line)
      const content = readFileSync(eventsPath, "utf-8");
      const lines = content.split("\n").filter((l: string) => l.trim());
      if (lines.length === 0) {
        debug("needsRebuild: no (no events)");
        return false;
      }

      // Parse last event to get its ID
      const lastLine = lines.at(-1);
      if (!lastLine) {
        debug("needsRebuild: no (empty last line)");
        return false;
      }
      try {
        const lastEvent = JSON.parse(lastLine) as {
          id: string;
        };
        const needs = lastEvent.id > lastAppliedId;
        debug("needsRebuild", {
          result: needs ? "yes" : "no",
          last: lastEvent.id.slice(-8),
          // lastAppliedId is string here (early return above if undefined)
          applied: (lastAppliedId as string).slice(-8),
        });
        return needs;
      } catch {
        // Malformed last line, assume rebuild needed
        debug("needsRebuild: yes (malformed events)");
        return true;
      }
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
