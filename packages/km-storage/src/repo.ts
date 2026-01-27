/**
 * Repo - Composed Domain Object
 *
 * Repo is the composed whole, analogous to git's repository concept.
 * It combines:
 * - DataStore: Indexed tree of nodes (fast queries)
 * - FileTree: Human-editable files (optional, for sync)
 * - Config: Repo configuration
 *
 * Key insight from ADR-002: FileTree and DataStore are NOT peers.
 * FileTree is a human-editable representation that syncs with DataStore.
 * Sync is translation between formats, not a generic store-to-store operation.
 *
 * See: docs/adr/002-domain-objects-refactor.md
 */

import createDebug from "debug"
import { Database } from "bun:sqlite"
import { existsSync, mkdirSync, readFileSync } from "fs"
import { join, dirname, basename } from "path"

import type { KNode, TaskStatus } from "@km/core"
import type { DataStore, HasDatabase } from "./data-store.ts"
import { createMemDataStore, createDBDataStore } from "./data-store.ts"
import type { FileTree } from "./file-tree.ts"
import { createDiskFileTree } from "./file-tree.ts"
import type { Config } from "./config-object.ts"
import { loadConfigObject } from "./config-object.ts"
import { createWatcher, type Watcher, type WatcherOptions } from "./watcher.ts"
import { SCHEMA } from "./schema.ts"
import {
  loadRepo,
  type StepYield,
  type LoadError,
  type DeferredFile,
} from "./repo-loader.ts"
// Repo-compatible query functions (for proxy methods)
import {
  getSubtree as dbGetSubtree,
  getAncestors as dbGetAncestors,
  getChildCountsBatch as dbGetChildCountsBatch,
} from "./db-queries/tree-traversal.ts"
import {
  getAllTasks as dbGetAllTasks,
  getTasksByStatus as dbGetTasksByStatus,
  getLinksTo as dbGetLinksTo,
} from "./db-queries/task-queries.ts"
import { resolveNode as dbResolveNode } from "./db-queries/smart-resolver.ts"
import { getOutgoingLinks as dbGetOutgoingLinks, getBacklinks as dbGetBacklinks, type Link } from "./db-links.ts"
import { parseQuery, executeQuery } from "./query.ts"

const debug = createDebug("km:storage:repo")

// =============================================================================
// Core Interface
// =============================================================================

/**
 * Stats from loading a Repo.
 */
export interface RepoStats {
  /** Number of nodes loaded */
  nodeCount: number
  /** Number of links resolved */
  linkCount: number
  /** Time to load in milliseconds */
  duration: number
}

/**
 * SyncResult from one-shot sync operation.
 */
export interface SyncResult {
  /** Number of changes applied from files to data */
  fromFiles: number
  /** Number of changes applied from data to files */
  fromData: number
  /** Conflicts encountered during sync */
  conflicts: SyncConflict[]
}

/**
 * Conflict during sync.
 */
export interface SyncConflict {
  /** Node ID involved in conflict */
  nodeId: string
  /** Path of conflicting file */
  path: string
  /** How the conflict was resolved */
  resolution: "files_wins" | "data_wins" | "manual"
}

/**
 * Repo - the composed domain object.
 *
 * Combines DataStore (indexed storage) + optional FileTree (human-editable files)
 * + Config. Provides sync operations when files are present.
 *
 * @example
 * ```typescript
 * // Full repo with files (most common)
 * using repo = createRepo("/path/to/repo")
 * const tasks = repo.data.getAllNodes().filter(n => n.type === "task")
 *
 * // Bare repo - no files (daemon, API server)
 * const data = createMemDataStore()
 * using repo = createBareRepo(data)
 * ```
 */
export interface Repo extends Disposable {
  /** Root path of the repository */
  readonly path: string

  /** Storage mode: 'memory' (ephemeral) or 'disk' (persistent) */
  readonly mode: "memory" | "disk"

  /** Indexed storage - always present */
  readonly data: DataStore

  /** Human-editable files - optional (null for bare repos) */
  readonly files: FileTree | null

  /** Configuration */
  readonly config: Config

  /** Raw database access (for infrastructure code) */
  readonly database: Database

  /** Errors encountered during file loading (empty if loadFiles was false) */
  readonly loadErrors: LoadError[]

  /** Loading statistics (zeroed if loadFiles was false) */
  readonly stats: RepoStats

  /** Files pending deferred parsing (for discoverOnly mode) */
  readonly deferredFiles: DeferredFile[]

  // ===========================================================================
  // Repo-compatible query methods (proxies to data store)
  // ===========================================================================

  /** Get a single node by ID */
  getNode(id: string): KNode | null

  /** Get children of a node (null for root) */
  getChildren(parentId: string | null): KNode[]

  /** Get full subtree under a node */
  getSubtree(nodeId: string): KNode[]

  /** Get ancestors of a node (from root to parent) */
  getAncestors(nodeId: string): KNode[]

  /** Get all tasks */
  getAllTasks(): KNode[]

  /** Get tasks by status */
  getTasksByStatus(status: TaskStatus): KNode[]

  /** Full-text search */
  search(query: string): KNode[]

  /** Execute query language expression */
  query(expression: string): KNode[]

  /** Get nodes linking to a target */
  getLinksTo(targetId: string): KNode[]

  /** Get outgoing links from a node */
  getOutgoingLinks(sourceId: string): Link[]

  /** Get backlinks (link records pointing to this node) */
  getBacklinks(nodeId: string): Link[]

  /**
   * Smart node resolver - finds a node by various identifiers.
   * @param query - ID, path, or filename to search for
   * @param typeOrOptions - Optional type filter
   */
  resolveNode(
    query: string,
    typeOrOptions?: string | { type?: string; taskOnly?: boolean },
  ): KNode | null

  /** Batch get child counts for multiple parent IDs */
  getChildCounts(parentIds: string[]): Map<string, number>

  // ===========================================================================
  // Repo-compatible mutation methods (proxies to data store)
  // ===========================================================================

  /** Update a node's properties */
  updateNode(id: string, changes: Partial<KNode>): void

  /** Move a node to a new parent with new sort order */
  moveNode(id: string, newParentId: string, position: number): void

  /** Delete a node */
  deleteNode(id: string): void

  /** Add a new node */
  addNode(parentId: string | null, node: Partial<KNode>): string

  /**
   * Clone a task with modifications (e.g., for recurring tasks).
   * @param sourceId - ID of the task to clone
   * @param changes - Changes to apply to the clone
   * @returns ID of the new task, or null if source not found
   */
  cloneTask(sourceId: string, changes: Partial<KNode>): string | null

  /**
   * Append a task line to a markdown file.
   * @param filePath - Relative or absolute path to the file
   * @param content - Content to append
   * @param options.ensure - Create file/directory if not exists
   * @throws Error if repo has no files (bare repo)
   */
  appendTaskToFile(
    filePath: string,
    content: string,
    options?: { ensure?: boolean },
  ): void

  /**
   * Check if a path exists relative to repo root.
   * @param relativePath - Path relative to repo root
   */
  pathExists(relativePath: string): boolean

  /**
   * Execute a raw SQL query on the database.
   * @param sql - SQL query string
   * @param params - Query parameters
   * @returns Query results as array of objects
   */
  rawQuery<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[]

  // ===========================================================================
  // Sync and lifecycle
  // ===========================================================================

  /**
   * One-shot sync between files and data.
   *
   * Reconciles the current state of files with the current state of data.
   * Only meaningful when files is present.
   *
   * @throws Error if repo has no files (bare repo)
   */
  sync(): Promise<SyncResult>

  /**
   * Create a Watcher for continuous sync.
   *
   * The watcher implements the Service interface with start/stop lifecycle.
   * Only available when files is present.
   *
   * @throws Error if repo has no files (bare repo)
   */
  watch(options?: Partial<WatcherOptions>): Watcher

  /**
   * Close and release all resources.
   */
  close(): void

  // ===========================================================================
  // Rebuild helpers
  // ===========================================================================

  /**
   * Check if state.db needs rebuild.
   * Returns true if:
   * - Disk mode: state.db doesn't exist or has unapplied events
   * - Memory mode: always returns false (ephemeral, no persistence)
   *
   * @throws Error if called on bare repo
   */
  needsRebuild(): boolean

  /**
   * Refresh the repo state.
   * - Memory mode: re-scan filesystem
   * - Disk mode: re-apply unapplied events
   *
   * This is a generator that yields progress info during refresh.
   * Use runGenerator() for silent refresh, or iterate for progress.
   *
   * @throws Error if called on bare repo
   */
  refresh(): Generator<StepYield, void, unknown>
}

// =============================================================================
// Mutation Hooks
// =============================================================================

/** Type of mutation operation */
export type MutationType = "add" | "update" | "delete" | "move"

/** Context passed to mutation hooks */
export interface MutationContext {
  type: MutationType
  nodeId: string
  changes?: Partial<KNode>
  newParentId?: string
  position?: number
  node?: Partial<KNode>
}

/** Result from beforeMutation hook */
export interface BeforeMutationResult {
  /** Cancel the mutation */
  cancel?: boolean
  /** Modified context to use instead */
  context?: MutationContext
}

/** Lifecycle hooks for repo operations */
export interface RepoHooks {
  /** Called before a mutation. Can cancel or modify the mutation. */
  beforeMutation?(ctx: MutationContext): BeforeMutationResult | void
  /** Called after a successful mutation. */
  afterMutation?(ctx: MutationContext): void
  /** Called after a query operation. */
  afterQuery?(operation: string, result: unknown): void
  /** Called when repo is closed. */
  onClose?(): void
}

// =============================================================================
// Factory: createRepo
// =============================================================================

/** Options for createRepo */
export interface CreateRepoOptions {
  /** Force memory mode even if .km/ exists */
  forceMemory?: boolean
  /** Skip initial file scan (for faster startup) */
  lazy?: boolean
  /** Custom config path */
  configPath?: string
  /**
   * Load and parse markdown files into the database.
   * When true, discovers files, parses markdown, and populates the database.
   * Default: false (database starts empty, use sync() to populate)
   */
  loadFiles?: boolean
  /** Skip link resolution for faster startup (only when loadFiles is true) */
  skipLinkResolution?: boolean
  /**
   * Discover-only mode for instant render (only when loadFiles is true).
   * Creates stub nodes without parsing - call parseDeferredAsync() afterward.
   */
  discoverOnly?: boolean
  /** Lifecycle hooks for mutation interception */
  hooks?: RepoHooks
}

/**
 * Create a full Repo with DataStore + FileTree + Config.
 *
 * This is the most common way to create a Repo. It:
 * - Detects .km/ directory to determine persistence mode
 * - Creates DataStore (disk or memory based on mode)
 * - Creates FileTree for the repo root
 * - Loads config from cosmiconfig
 *
 * This is a generator that yields progress info during loading.
 * Use runGenerator() for silent loading, or iterate for progress.
 *
 * @example
 * ```typescript
 * // Silent loading
 * using repo = runGenerator(createRepo("/path/to/repo"))
 *
 * // With progress
 * for (const progress of createRepo(path)) {
 *   spinner.update(`${progress}`);
 * }
 *
 * // Query nodes
 * const node = repo.data.getNode("abc123")
 *
 * // Read/write files
 * const content = repo.files?.read("inbox.md")
 *
 * // Start watching for changes
 * const watcher = repo.watch()
 * await watcher.start()
 * ```
 *
 * @param rootPath - Path to the repo root directory
 * @param options - Creation options
 * @yields Progress info for each loading phase
 * @returns Repo domain object
 */
export function* createRepo(
  rootPath: string = process.cwd(),
  options: CreateRepoOptions = {},
): Generator<StepYield, Repo, unknown> {
  debug("createRepo", { rootPath, options })

  // Track loading results
  let loadErrors: LoadError[] = []
  let stats: RepoStats = { nodeCount: 0, linkCount: 0, duration: 0 }
  let deferredFiles: DeferredFile[] = []

  let dataStore: DataStore & HasDatabase
  let db: Database
  let mode: "memory" | "disk"

  if (options.loadFiles) {
    // =========================================================================
    // File loading mode - create db first, then use loadRepo to populate
    // ADR-002: Create our own db instead of relying on singleton
    // =========================================================================

    // Detect mode and create database BEFORE calling loadRepo
    const kmDir = join(rootPath, ".km")
    const hasKmDir = existsSync(kmDir) && !options.forceMemory
    mode = hasKmDir ? "disk" : "memory"

    if (mode === "disk") {
      if (!existsSync(kmDir)) {
        mkdirSync(kmDir, { recursive: true })
      }
      const dbPath = join(kmDir, "state.db")
      db = new Database(dbPath)
      db.exec(SCHEMA)
    } else {
      db = new Database(":memory:")
      db.exec(SCHEMA)
    }

    // Now call loadRepo with OUR db (avoids singleton)
    const loadResult = yield* loadRepo(rootPath, {
      searchAncestors: false, // rootPath is already the repo root
      skipLinkResolution: options.skipLinkResolution,
      discoverOnly: options.discoverOnly,
      db, // ADR-002: pass db to avoid singleton
    })

    dataStore = createDBDataStore(db, mode)

    // Capture loading results
    loadErrors = loadResult.errors
    stats = {
      nodeCount: loadResult.nodeCount,
      linkCount: loadResult.linkCount,
      duration: loadResult.duration,
    }
    deferredFiles = loadResult.deferredFiles ?? []

    debug("loaded files: %d nodes, %d links, %d errors",
      stats.nodeCount, stats.linkCount, loadErrors.length)
  } else {
    // =========================================================================
    // Empty database mode - no file loading
    // =========================================================================
    // Declare all sub-steps upfront so they appear as pending
    yield { declare: ["Detecting mode", "Initializing database", "Scanning files"] }

    // Step 1: Detect mode
    yield "Detecting mode"
    const kmDir = join(rootPath, ".km")
    const hasKmDir = existsSync(kmDir) && !options.forceMemory
    mode = hasKmDir ? "disk" : "memory"

    debug("detected mode: %s (hasKmDir=%s)", mode, hasKmDir)

    // Step 2: Initialize database
    yield "Initializing database"

    if (mode === "disk") {
      // Ensure .km directory exists
      if (!existsSync(kmDir)) {
        mkdirSync(kmDir, { recursive: true })
      }

      const dbPath = join(kmDir, "state.db")
      db = new Database(dbPath)
      db.exec(SCHEMA)
      dataStore = createDBDataStore(db, "disk")
    } else {
      // Memory mode - ephemeral
      db = new Database(":memory:")
      db.exec(SCHEMA)
      dataStore = createDBDataStore(db, "memory")
    }

    // Step 3: Scan files (for full repo)
    yield "Scanning files"
  }

  // Create FileTree for the repo root
  const fileTree = createDiskFileTree(rootPath)

  // Load config
  const config = loadConfigObject(rootPath)

  // Capture hooks from options
  const hooks = options.hooks

  let closed = false

  const repo: Repo = {
    get path() {
      return rootPath
    },

    get mode() {
      return mode
    },

    get data() {
      ensureOpen()
      return dataStore
    },

    get files() {
      ensureOpen()
      return fileTree
    },

    get config() {
      ensureOpen()
      return config
    },

    get database() {
      ensureOpen()
      return db
    },

    get loadErrors() {
      return loadErrors
    },

    get stats() {
      return stats
    },

    get deferredFiles() {
      return deferredFiles
    },

    // =========================================================================
    // Repo-compatible query methods
    // =========================================================================

    getNode(id) {
      ensureOpen()
      return dataStore.getNode(id)
    },

    getChildren(parentId) {
      ensureOpen()
      return dataStore.getChildren(parentId)
    },

    getSubtree(nodeId) {
      ensureOpen()
      return dbGetSubtree(db, nodeId)
    },

    getAncestors(nodeId) {
      ensureOpen()
      return dbGetAncestors(db, nodeId)
    },

    getAllTasks() {
      ensureOpen()
      return dbGetAllTasks(db)
    },

    getTasksByStatus(status) {
      ensureOpen()
      return dbGetTasksByStatus(db, status)
    },

    search(queryStr) {
      ensureOpen()
      return dataStore.search(queryStr)
    },

    query(expression) {
      ensureOpen()
      const ast = parseQuery(expression)
      return executeQuery(db, ast)
    },

    getLinksTo(targetId) {
      ensureOpen()
      return dbGetLinksTo(db, targetId)
    },

    getOutgoingLinks(sourceId) {
      ensureOpen()
      return dbGetOutgoingLinks(db, sourceId)
    },

    getBacklinks(nodeId) {
      ensureOpen()
      return dbGetBacklinks(db, nodeId)
    },

    resolveNode(queryStr, typeOrOptions) {
      ensureOpen()
      return dbResolveNode(db, queryStr, typeOrOptions)
    },

    getChildCounts(parentIds) {
      ensureOpen()
      return dbGetChildCountsBatch(db, parentIds)
    },

    // =========================================================================
    // Repo-compatible mutation methods
    // =========================================================================

    updateNode(id, changes) {
      ensureOpen()
      let ctx: MutationContext = { type: "update", nodeId: id, changes }
      if (hooks?.beforeMutation) {
        const result = hooks.beforeMutation(ctx)
        if (result?.cancel) throw new Error("Mutation cancelled by hook")
        if (result?.context) ctx = result.context
      }
      dataStore.updateNode(ctx.nodeId, ctx.changes ?? {})
      hooks?.afterMutation?.(ctx)
    },

    moveNode(id, newParentId, position) {
      ensureOpen()
      let ctx: MutationContext = { type: "move", nodeId: id, newParentId, position }
      if (hooks?.beforeMutation) {
        const result = hooks.beforeMutation(ctx)
        if (result?.cancel) throw new Error("Mutation cancelled by hook")
        if (result?.context) ctx = result.context
      }
      dataStore.moveNode(ctx.nodeId, ctx.newParentId ?? newParentId, ctx.position ?? position)
      hooks?.afterMutation?.(ctx)
    },

    deleteNode(id) {
      ensureOpen()
      let ctx: MutationContext = { type: "delete", nodeId: id }
      if (hooks?.beforeMutation) {
        const result = hooks.beforeMutation(ctx)
        if (result?.cancel) throw new Error("Mutation cancelled by hook")
        if (result?.context) ctx = result.context
      }
      dataStore.deleteNode(ctx.nodeId)
      hooks?.afterMutation?.(ctx)
    },

    addNode(parentId, node) {
      ensureOpen()
      // For add, nodeId is not known yet, use empty string as placeholder
      let ctx: MutationContext = { type: "add", nodeId: "", node }
      if (hooks?.beforeMutation) {
        const result = hooks.beforeMutation(ctx)
        if (result?.cancel) throw new Error("Mutation cancelled by hook")
        if (result?.context) ctx = result.context
      }
      const newId = dataStore.addNode(parentId, ctx.node ?? node)
      ctx.nodeId = newId
      hooks?.afterMutation?.(ctx)
      return newId
    },

    cloneTask(sourceId, changes) {
      ensureOpen()
      const source = dataStore.getNode(sourceId)
      if (!source || source.type !== "task") return null

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
          recur_prev: sourceId,
        },
      }

      return dataStore.addNode(clonedNode.parent_id ?? null, clonedNode)
    },

    appendTaskToFile(filePath, content, options) {
      ensureOpen()
      if (!fileTree) {
        throw new Error("Cannot appendTaskToFile: repo has no files (bare repo)")
      }

      const relativePath = filePath.startsWith("/")
        ? filePath.slice(rootPath.length + 1)
        : filePath

      if (options?.ensure) {
        const dir = dirname(relativePath)
        if (dir && dir !== "." && !fileTree.exists(dir)) {
          // Create directory by writing a placeholder file (FileTree auto-creates dirs)
          const baseName = basename(relativePath).replace(/\.md$/, "")
          const header = `---\ntitle: ${baseName}\n---\n\n`
          fileTree.write(relativePath, header)
        }
        if (!fileTree.exists(relativePath)) {
          const baseName = basename(relativePath).replace(/\.md$/, "")
          fileTree.write(relativePath, `---\ntitle: ${baseName}\n---\n\n`)
        }
      }

      const existing = fileTree.read(relativePath)
      fileTree.write(relativePath, existing + content)
    },

    pathExists(relativePath) {
      ensureOpen()
      if (!fileTree) {
        return existsSync(join(rootPath, relativePath))
      }
      return fileTree.exists(relativePath)
    },

    rawQuery<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[] {
      ensureOpen()
      const stmt = db.prepare(sql)
      return (
        params
          ? stmt.all(...(params as Parameters<typeof stmt.all>))
          : stmt.all()
      ) as T[]
    },

    // =========================================================================
    // Sync and lifecycle
    // =========================================================================

    async sync() {
      ensureOpen()
      if (!fileTree) {
        throw new Error("Cannot sync: repo has no files (bare repo)")
      }

      // TODO: Implement actual sync logic using reconcileDirectory
      // For now, return empty result
      debug("sync() called - not yet implemented")
      return {
        fromFiles: 0,
        fromData: 0,
        conflicts: [],
      }
    },

    watch(watchOptions = {}) {
      ensureOpen()
      if (!fileTree) {
        throw new Error("Cannot watch: repo has no files (bare repo)")
      }

      return createWatcher(rootPath, {
        db,
        ...watchOptions,
      })
    },

    // =========================================================================
    // Rebuild helpers
    // =========================================================================

    needsRebuild() {
      ensureOpen()

      // Memory mode never needs rebuild (ephemeral)
      if (mode === "memory") {
        debug("needsRebuild: no (memory mode)")
        return false
      }

      // Disk mode: check state.db and events.jsonl
      const kmDir = join(rootPath, ".km")
      const dbPath = join(kmDir, "state.db")
      const eventsPath = join(kmDir, "events.jsonl")

      if (!existsSync(dbPath)) {
        debug("needsRebuild: yes (no state.db)")
        return true
      }

      if (!existsSync(eventsPath)) {
        debug("needsRebuild: no (no events.jsonl)")
        return false
      }

      // Check if there are unapplied events
      const lastApplied = db
        .prepare("SELECT value FROM meta WHERE key = ?")
        .get("last_event") as { value: string } | undefined

      const lastAppliedId = lastApplied?.value
      if (!lastAppliedId) {
        // DB exists but hasn't applied any events - check if events exist
        const content = existsSync(eventsPath)
          ? readFileSync(eventsPath, "utf-8")
          : ""
        const hasEvents = content.trim().length > 0
        debug("needsRebuild", {
          result: hasEvents ? "yes" : "no",
          reason: "no last_event",
        })
        return hasEvents
      }

      // Check if events file has newer events (read last line)
      const content = readFileSync(eventsPath, "utf-8")
      const lines = content.split("\n").filter((l: string) => l.trim())
      if (lines.length === 0) {
        debug("needsRebuild: no (no events)")
        return false
      }

      // Parse last event to get its ID
      const lastLine = lines.at(-1)
      if (!lastLine) {
        debug("needsRebuild: no (empty last line)")
        return false
      }
      try {
        const lastEvent = JSON.parse(lastLine) as { id: string }
        const needs = lastEvent.id > lastAppliedId
        debug("needsRebuild", {
          result: needs ? "yes" : "no",
          last: lastEvent.id.slice(-8),
          applied: (lastAppliedId as string).slice(-8),
        })
        return needs
      } catch {
        // Malformed last line, assume rebuild needed
        debug("needsRebuild: yes (malformed events)")
        return true
      }
    },

    *refresh() {
      ensureOpen()
      // TODO: Re-scan or re-apply events
      debug("refresh not yet implemented")
      yield "Refreshing"
    },

    close() {
      if (closed) return
      closed = true
      debug("closing repo")

      // Call onClose hook
      hooks?.onClose?.()

      // Close in reverse order of creation
      fileTree.close()
      dataStore.close()
      db.close()
    },

    [Symbol.dispose]() {
      this.close()
    },
  }

  return repo

  function ensureOpen() {
    if (closed) throw new Error("Repo is closed")
  }
}

// =============================================================================
// Factory: createBareRepo
// =============================================================================

/** Options for createBareRepo */
export interface CreateBareRepoOptions {
  /** Configuration (uses defaults if not provided) */
  config?: Config
  /** Root path for config loading (default: cwd) */
  configPath?: string
  /** Lifecycle hooks for mutation interception */
  hooks?: RepoHooks
}

/**
 * Create a bare Repo with DataStore only (no files).
 *
 * Use this for:
 * - Daemon processes that only need database access
 * - API servers that don't need file sync
 * - Database-only operations (imports, exports, migrations)
 *
 * @example
 * ```typescript
 * // Bare repo with in-memory data
 * const data = createMemDataStore()
 * using repo = createBareRepo(data)
 *
 * // Query nodes
 * const node = repo.data.getNode("abc123")
 *
 * // files is null - no sync available
 * repo.sync()  // throws Error
 * ```
 *
 * @param data - DataStore instance (caller manages lifecycle)
 * @param options - Creation options
 * @returns Bare Repo domain object
 */
export function createBareRepo(
  data: DataStore & HasDatabase,
  options: CreateBareRepoOptions = {},
): Repo {
  debug("createBareRepo", { options })

  // Load or use provided config
  const config = options.config ?? loadConfigObject(options.configPath)
  const db = data.database

  // Capture hooks from options
  const hooks = options.hooks

  let closed = false

  const repo: Repo = {
    get path() {
      return options.configPath ?? process.cwd()
    },

    get mode() {
      return "memory" as const // Bare repos are always in-memory semantically
    },

    get data() {
      ensureOpen()
      return data
    },

    get files() {
      return null
    },

    get config() {
      ensureOpen()
      return config
    },

    get database() {
      ensureOpen()
      return db
    },

    // Bare repos don't load files, so these are always empty
    get loadErrors() {
      return []
    },

    get stats() {
      return { nodeCount: 0, linkCount: 0, duration: 0 }
    },

    get deferredFiles() {
      return []
    },

    // =========================================================================
    // Repo-compatible query methods
    // =========================================================================

    getNode(id) {
      ensureOpen()
      return data.getNode(id)
    },

    getChildren(parentId) {
      ensureOpen()
      return data.getChildren(parentId)
    },

    getSubtree(nodeId) {
      ensureOpen()
      return dbGetSubtree(db, nodeId)
    },

    getAncestors(nodeId) {
      ensureOpen()
      return dbGetAncestors(db, nodeId)
    },

    getAllTasks() {
      ensureOpen()
      return dbGetAllTasks(db)
    },

    getTasksByStatus(status) {
      ensureOpen()
      return dbGetTasksByStatus(db, status)
    },

    search(queryStr) {
      ensureOpen()
      return data.search(queryStr)
    },

    query(expression) {
      ensureOpen()
      const ast = parseQuery(expression)
      return executeQuery(db, ast)
    },

    getLinksTo(targetId) {
      ensureOpen()
      return dbGetLinksTo(db, targetId)
    },

    getOutgoingLinks(sourceId) {
      ensureOpen()
      return dbGetOutgoingLinks(db, sourceId)
    },

    getBacklinks(nodeId) {
      ensureOpen()
      return dbGetBacklinks(db, nodeId)
    },

    resolveNode(queryStr, typeOrOptions) {
      ensureOpen()
      return dbResolveNode(db, queryStr, typeOrOptions)
    },

    getChildCounts(parentIds) {
      ensureOpen()
      return dbGetChildCountsBatch(db, parentIds)
    },

    // =========================================================================
    // Repo-compatible mutation methods
    // =========================================================================

    updateNode(id, changes) {
      ensureOpen()
      let ctx: MutationContext = { type: "update", nodeId: id, changes }
      if (hooks?.beforeMutation) {
        const result = hooks.beforeMutation(ctx)
        if (result?.cancel) throw new Error("Mutation cancelled by hook")
        if (result?.context) ctx = result.context
      }
      data.updateNode(ctx.nodeId, ctx.changes ?? {})
      hooks?.afterMutation?.(ctx)
    },

    moveNode(id, newParentId, position) {
      ensureOpen()
      let ctx: MutationContext = { type: "move", nodeId: id, newParentId, position }
      if (hooks?.beforeMutation) {
        const result = hooks.beforeMutation(ctx)
        if (result?.cancel) throw new Error("Mutation cancelled by hook")
        if (result?.context) ctx = result.context
      }
      data.moveNode(ctx.nodeId, ctx.newParentId ?? newParentId, ctx.position ?? position)
      hooks?.afterMutation?.(ctx)
    },

    deleteNode(id) {
      ensureOpen()
      let ctx: MutationContext = { type: "delete", nodeId: id }
      if (hooks?.beforeMutation) {
        const result = hooks.beforeMutation(ctx)
        if (result?.cancel) throw new Error("Mutation cancelled by hook")
        if (result?.context) ctx = result.context
      }
      data.deleteNode(ctx.nodeId)
      hooks?.afterMutation?.(ctx)
    },

    addNode(parentId, node) {
      ensureOpen()
      // For add, nodeId is not known yet, use empty string as placeholder
      let ctx: MutationContext = { type: "add", nodeId: "", node }
      if (hooks?.beforeMutation) {
        const result = hooks.beforeMutation(ctx)
        if (result?.cancel) throw new Error("Mutation cancelled by hook")
        if (result?.context) ctx = result.context
      }
      const newId = data.addNode(parentId, ctx.node ?? node)
      ctx.nodeId = newId
      hooks?.afterMutation?.(ctx)
      return newId
    },

    cloneTask(sourceId, changes) {
      ensureOpen()
      const source = data.getNode(sourceId)
      if (!source || source.type !== "task") return null

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
          recur_prev: sourceId,
        },
      }

      return data.addNode(clonedNode.parent_id ?? null, clonedNode)
    },

    appendTaskToFile() {
      throw new Error("Cannot appendTaskToFile: bare repo has no files")
    },

    pathExists(relativePath) {
      ensureOpen()
      const repoPath = options.configPath ?? process.cwd()
      return existsSync(join(repoPath, relativePath))
    },

    rawQuery<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[] {
      ensureOpen()
      const stmt = db.prepare(sql)
      return (
        params
          ? stmt.all(...(params as Parameters<typeof stmt.all>))
          : stmt.all()
      ) as T[]
    },

    // =========================================================================
    // Sync and lifecycle
    // =========================================================================

    async sync() {
      throw new Error("Cannot sync: bare repo has no files")
    },

    watch() {
      throw new Error("Cannot watch: bare repo has no files")
    },

    // =========================================================================
    // Rebuild helpers
    // =========================================================================

    needsRebuild() {
      throw new Error("Cannot check needsRebuild: bare repo has no files")
    },

    *refresh() {
      throw new Error("Cannot refresh: bare repo has no files")
    },

    close() {
      if (closed) return
      closed = true
      debug("closing bare repo")

      // Call onClose hook
      hooks?.onClose?.()

      // Note: caller manages DataStore lifecycle for bare repos
    },

    [Symbol.dispose]() {
      this.close()
    },
  }

  return repo

  function ensureOpen() {
    if (closed) throw new Error("Repo is closed")
  }
}

// =============================================================================
// Factory: createTestRepo
// =============================================================================

/**
 * Create a test Repo with in-memory DataStore and optional in-memory FileTree.
 *
 * This is the fastest way to create a Repo for testing.
 * No disk I/O, no persistence, no file watching.
 *
 * @example
 * ```typescript
 * using repo = createTestRepo()
 * repo.data.addNode(null, { type: "task", content: "Test" })
 * ```
 *
 * @returns Test Repo with in-memory storage
 */
export function createTestRepo(): Repo {
  debug("createTestRepo")

  const data = createMemDataStore()
  return createBareRepo(data)
}
