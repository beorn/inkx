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
 * See: docs/00-principles.md
 */

import { Database } from "bun:sqlite"
import createDebug from "debug"
import { existsSync, mkdirSync, readFileSync } from "fs"
import { basename, dirname, join } from "path"

import type { KNode, TaskStatus } from "@km/core"
import type { Config } from "./config-object.ts"
import { loadConfigObject } from "./config-object.ts"
import type { DataStore, HasDatabase } from "./data-store.ts"
import { createDBDataStore } from "./data-store.ts"
import {
  getBacklinks as dbGetBacklinks,
  getOutgoingLinks as dbGetOutgoingLinks,
  type Link,
} from "./db-links.ts"
import { resolveNode as dbResolveNode } from "./db-queries/smart-resolver.ts"
import {
  getAllTasks as dbGetAllTasks,
  getLinksTo as dbGetLinksTo,
  getTasksByStatus as dbGetTasksByStatus,
} from "./db-queries/task-queries.ts"
import {
  getAncestors as dbGetAncestors,
  getChildCountsBatch as dbGetChildCountsBatch,
  getSubtree as dbGetSubtree,
} from "./db-queries/tree-traversal.ts"
import { createEmitter, type Emitter } from "./emitter.ts"
import type { FileTree } from "./file-tree.ts"
import { createDiskFileTree } from "./file-tree.ts"
import { executeQuery, parseQuery } from "./query.ts"
import { type MutationContext, type RepoHooks } from "./repo-hooks.ts"
import {
  loadRepo,
  type DeferredFile,
  type LoadError,
  type StepYield,
} from "./repo-loader.ts"
import { SCHEMA } from "./schema.ts"
import { createWatcher, type Watcher, type WatcherOptions } from "./watcher.ts"

const debug = createDebug("km:storage:repo")

// =============================================================================
// Shared Method Factories
// =============================================================================

/** Dependencies for creating repo methods */
interface RepoMethodDeps {
  db: Database
  dataStore: DataStore
  hooks?: RepoHooks
  ensureOpen: () => void
}

/** Context for building a Repo object */
interface RepoBuildContext {
  rootPath: string
  mode: "memory" | "disk"
  db: Database
  dataStore: DataStore & HasDatabase
  emitter: Emitter
  fileTree: FileTree | null
  config: Config
  hooks?: RepoHooks
  loadErrors: LoadError[]
  stats: RepoStats
  deferredFiles: DeferredFile[]
}

/** Create query methods shared by createRepo and createBareRepo */
function createQueryMethods(deps: RepoMethodDeps) {
  const { db, dataStore, ensureOpen } = deps
  return {
    getNode(id: string) {
      ensureOpen()
      return dataStore.getNode(id)
    },
    getChildren(parentId: string | null) {
      ensureOpen()
      return dataStore.getChildren(parentId)
    },
    getSubtree(nodeId: string) {
      ensureOpen()
      return dbGetSubtree(db, nodeId)
    },
    getAncestors(nodeId: string) {
      ensureOpen()
      return dbGetAncestors(db, nodeId)
    },
    getAllTasks() {
      ensureOpen()
      return dbGetAllTasks(db)
    },
    getTasksByStatus(status: TaskStatus) {
      ensureOpen()
      return dbGetTasksByStatus(db, status)
    },
    search(queryStr: string) {
      ensureOpen()
      return dataStore.search(queryStr)
    },
    query(expression: string) {
      ensureOpen()
      const ast = parseQuery(expression)
      return executeQuery(db, ast)
    },
    getLinksTo(targetId: string) {
      ensureOpen()
      return dbGetLinksTo(db, targetId)
    },
    getOutgoingLinks(sourceId: string): Link[] {
      ensureOpen()
      return dbGetOutgoingLinks(db, sourceId)
    },
    getBacklinks(nodeId: string): Link[] {
      ensureOpen()
      return dbGetBacklinks(db, nodeId)
    },
    resolveNode(
      queryStr: string,
      typeOrOptions?: string | { type?: string; taskOnly?: boolean },
    ) {
      ensureOpen()
      return dbResolveNode(db, queryStr, typeOrOptions)
    },
    getChildCounts(parentIds: string[]) {
      ensureOpen()
      return dbGetChildCountsBatch(db, parentIds)
    },
    rawQuery<T = Record<string, unknown>>(
      sql: string,
      params?: unknown[],
    ): T[] {
      ensureOpen()
      const stmt = db.prepare(sql)
      return (
        params
          ? stmt.all(...(params as Parameters<typeof stmt.all>))
          : stmt.all()
      ) as T[]
    },
  }
}

/** Create mutation methods shared by createRepo and createBareRepo */
function createMutationMethods(deps: RepoMethodDeps) {
  const { dataStore, hooks, ensureOpen } = deps
  return {
    updateNode(id: string, changes: Partial<KNode>) {
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
    moveNode(id: string, newParentId: string, position: number) {
      ensureOpen()
      let ctx: MutationContext = {
        type: "move",
        nodeId: id,
        newParentId,
        position,
      }
      if (hooks?.beforeMutation) {
        const result = hooks.beforeMutation(ctx)
        if (result?.cancel) throw new Error("Mutation cancelled by hook")
        if (result?.context) ctx = result.context
      }
      dataStore.moveNode(
        ctx.nodeId,
        ctx.newParentId ?? newParentId,
        ctx.position ?? position,
      )
      hooks?.afterMutation?.(ctx)
    },
    deleteNode(id: string) {
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
    addNode(parentId: string | null, node: Partial<KNode>) {
      ensureOpen()
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
    cloneTask(sourceId: string, changes: Partial<KNode>) {
      ensureOpen()
      const source = dataStore.getNode(sourceId)
      if (source?.type !== "task") return null

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
  }
}

/** Dependencies for creating file operation methods */
interface FileMethodDeps {
  rootPath: string
  fileTree: FileTree | null
  ensureOpen: () => void
}

/** Create file operation methods for full repos */
function createFileOperationMethods(deps: FileMethodDeps) {
  const { rootPath, fileTree, ensureOpen } = deps
  return {
    appendTaskToFile(
      filePath: string,
      content: string,
      opts?: { ensure?: boolean },
    ) {
      ensureOpen()
      if (!fileTree) {
        throw new Error("Cannot appendTaskToFile: repo has no files")
      }
      const relativePath = filePath.startsWith("/")
        ? filePath.slice(rootPath.length + 1)
        : filePath

      if (opts?.ensure) {
        ensureFileExists(fileTree, relativePath)
      }

      const existing = fileTree.read(relativePath)
      fileTree.write(relativePath, existing + content)
    },
    pathExists(relativePath: string) {
      ensureOpen()
      return (
        fileTree?.exists(relativePath) ??
        existsSync(join(rootPath, relativePath))
      )
    },
  }
}

/** Ensure a file exists, creating it with frontmatter if needed */
function ensureFileExists(fileTree: FileTree, relativePath: string) {
  const dir = dirname(relativePath)
  if (dir && dir !== "." && !fileTree.exists(dir)) {
    const baseName = basename(relativePath).replace(/\.md$/, "")
    fileTree.write(relativePath, `---\ntitle: ${baseName}\n---\n\n`)
  }
  if (!fileTree.exists(relativePath)) {
    const baseName = basename(relativePath).replace(/\.md$/, "")
    fileTree.write(relativePath, `---\ntitle: ${baseName}\n---\n\n`)
  }
}

/** Dependencies for creating lifecycle methods */
interface LifecycleMethodDeps {
  rootPath: string
  mode: "memory" | "disk"
  db: Database
  dataStore: DataStore
  emitter: Emitter
  fileTree: FileTree | null
  hooks?: RepoHooks
  ensureOpen: () => void
  setClosed: () => void
}

/** Create lifecycle methods for full repos */
function createLifecycleMethods(deps: LifecycleMethodDeps) {
  const {
    rootPath,
    mode,
    db,
    dataStore,
    emitter,
    fileTree,
    hooks,
    ensureOpen,
    setClosed,
  } = deps
  return {
    sync() {
      ensureOpen()
      debug("sync() called - not yet implemented")
      return Promise.resolve({ fromFiles: 0, fromData: 0, conflicts: [] })
    },
    watch(watchOptions: Partial<WatcherOptions> = {}) {
      ensureOpen()
      return createWatcher(rootPath, { db, ...watchOptions })
    },
    needsRebuild() {
      ensureOpen()
      if (mode === "memory") {
        debug("needsRebuild: no (memory mode)")
        return false
      }
      return checkNeedsRebuild(rootPath, db)
    },
    *refresh(): Generator<StepYield, void, unknown> {
      ensureOpen()
      debug("refresh not yet implemented")
      yield "Refreshing"
    },
    close() {
      setClosed()
      debug("closing repo")
      hooks?.onClose?.()
      emitter.close()
      fileTree?.close()
      dataStore.close()
      db.close()
    },
  }
}

/** Create lifecycle methods for bare repos (throws on file operations) */
function createBareLifecycleMethods(deps: {
  rootPath: string
  emitter: Emitter
  hooks?: RepoHooks
  ensureOpen: () => void
  setClosed: () => void
}) {
  const { rootPath, emitter, hooks, ensureOpen, setClosed } = deps
  return {
    appendTaskToFile(): void {
      throw new Error("Cannot appendTaskToFile: bare repo has no files")
    },
    pathExists(relativePath: string) {
      ensureOpen()
      return existsSync(join(rootPath, relativePath))
    },
    sync(): Promise<SyncResult> {
      return Promise.reject(new Error("Cannot sync: bare repo has no files"))
    },
    watch(): Watcher {
      throw new Error("Cannot watch: bare repo has no files")
    },
    needsRebuild(): boolean {
      throw new Error("Cannot check needsRebuild: bare repo has no files")
    },
    *refresh(): Generator<StepYield, void, unknown> {
      throw new Error("Cannot refresh: bare repo has no files")
    },
    close() {
      setClosed()
      debug("closing bare repo")
      hooks?.onClose?.()
      emitter.close()
      // Note: caller manages DataStore lifecycle for bare repos
    },
  }
}

/** Create property getters for repo */
function createRepoGetters(ctx: {
  rootPath: string
  mode: "memory" | "disk"
  db: Database
  dataStore: DataStore & HasDatabase
  emitter: Emitter
  fileTree: FileTree | null
  config: Config
  loadErrors: LoadError[]
  stats: RepoStats
  deferredFiles: DeferredFile[]
  ensureOpen: () => void
}) {
  const {
    rootPath,
    mode,
    db,
    dataStore,
    emitter,
    fileTree,
    config,
    loadErrors,
    stats,
    deferredFiles,
    ensureOpen,
  } = ctx
  return {
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
    get emitter() {
      ensureOpen()
      return emitter
    },
  }
}

/** Create property getters for bare repo */
function createBareRepoGetters(ctx: {
  rootPath: string
  mode: "memory" | "disk"
  db: Database
  dataStore: DataStore & HasDatabase
  emitter: Emitter
  config: Config
  ensureOpen: () => void
}) {
  const { rootPath, mode, db, dataStore, emitter, config, ensureOpen } = ctx
  return {
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
    get files(): FileTree | null {
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
    get loadErrors(): LoadError[] {
      return []
    },
    get stats(): RepoStats {
      return { nodeCount: 0, linkCount: 0, duration: 0 }
    },
    get deferredFiles(): DeferredFile[] {
      return []
    },
    get emitter() {
      ensureOpen()
      return emitter
    },
  }
}

/** Build a full Repo object from initialized components */
function buildFullRepo(ctx: RepoBuildContext): Repo {
  let closed = false
  const ensureOpen = () => {
    if (closed) throw new Error("Repo is closed")
  }
  const setClosed = () => {
    if (closed) return
    closed = true
  }

  const methodDeps: RepoMethodDeps = {
    db: ctx.db,
    dataStore: ctx.dataStore,
    hooks: ctx.hooks,
    ensureOpen,
  }

  const queryMethods = createQueryMethods(methodDeps)
  const mutationMethods = createMutationMethods(methodDeps)
  const fileMethods = createFileOperationMethods({
    rootPath: ctx.rootPath,
    fileTree: ctx.fileTree,
    ensureOpen,
  })
  const lifecycleMethods = createLifecycleMethods({
    ...ctx,
    ensureOpen,
    setClosed,
  })

  // Combine methods, then define getters as true accessors
  const repo = {
    ...queryMethods,
    ...mutationMethods,
    ...fileMethods,
    ...lifecycleMethods,
    [Symbol.dispose]() {
      this.close()
    },
  } as Repo

  // Define getters as true accessors (spread would convert them to values)
  Object.defineProperties(repo, {
    path: { get: () => ctx.rootPath, enumerable: true },
    mode: { get: () => ctx.mode, enumerable: true },
    data: {
      get: () => {
        ensureOpen()
        return ctx.dataStore
      },
      enumerable: true,
    },
    files: {
      get: () => {
        ensureOpen()
        return ctx.fileTree
      },
      enumerable: true,
    },
    config: {
      get: () => {
        ensureOpen()
        return ctx.config
      },
      enumerable: true,
    },
    database: {
      get: () => {
        ensureOpen()
        return ctx.db
      },
      enumerable: true,
    },
    loadErrors: { get: () => ctx.loadErrors, enumerable: true },
    stats: { get: () => ctx.stats, enumerable: true },
    deferredFiles: { get: () => ctx.deferredFiles, enumerable: true },
    emitter: {
      get: () => {
        ensureOpen()
        return ctx.emitter
      },
      enumerable: true,
    },
  })

  return repo
}

/** Build a bare Repo object (no files) from initialized components */
function buildBareRepo(
  ctx: Omit<
    RepoBuildContext,
    "fileTree" | "loadErrors" | "stats" | "deferredFiles"
  >,
): Repo {
  let closed = false
  const ensureOpen = () => {
    if (closed) throw new Error("Repo is closed")
  }
  const setClosed = () => {
    if (closed) return
    closed = true
  }

  const methodDeps: RepoMethodDeps = {
    db: ctx.db,
    dataStore: ctx.dataStore,
    hooks: ctx.hooks,
    ensureOpen,
  }

  const getters = createBareRepoGetters({ ...ctx, ensureOpen })
  const queryMethods = createQueryMethods(methodDeps)
  const mutationMethods = createMutationMethods(methodDeps)
  const bareMethods = createBareLifecycleMethods({
    rootPath: ctx.rootPath,
    emitter: ctx.emitter,
    hooks: ctx.hooks,
    ensureOpen,
    setClosed,
  })

  return {
    ...getters,
    ...queryMethods,
    ...mutationMethods,
    ...bareMethods,
    [Symbol.dispose]() {
      this.close()
    },
  }
}

/** Initialize database and data store for a given mode */
function initializeDatabase(
  kmDir: string,
  mode: "memory" | "disk",
  emitter: Emitter,
): { db: Database; dataStore: DataStore & HasDatabase } {
  if (mode === "disk") {
    if (!existsSync(kmDir)) {
      mkdirSync(kmDir, { recursive: true })
    }
    const dbPath = join(kmDir, "state.db")
    const db = new Database(dbPath)
    db.run(SCHEMA)
    const dataStore = createDBDataStore(db, { emitter })
    return { db, dataStore }
  }
  // Memory mode - ephemeral (no emitter = direct SQL)
  const db = new Database(":memory:")
  db.run(SCHEMA)
  const dataStore = createDBDataStore(db)
  return { db, dataStore }
}

/** Detect storage mode based on .km directory existence */
function detectMode(kmDir: string, forceMemory?: boolean): "memory" | "disk" {
  const hasKmDir = existsSync(kmDir) && !forceMemory
  return hasKmDir ? "disk" : "memory"
}

/** Check if a repo at rootPath needs rebuild (disk mode helper) */
function checkNeedsRebuild(rootPath: string, db: Database): boolean {
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

  // Check if events file has newer events
  const content = readFileSync(eventsPath, "utf-8")
  const lines = content.split("\n").filter((l: string) => l.trim())
  if (lines.length === 0) {
    debug("needsRebuild: no (no events)")
    return false
  }

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
    debug("needsRebuild: yes (malformed events)")
    return true
  }
}

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

  /** Event emitter for this repo (owns kmDir, eventHub, fsSync) */
  readonly emitter: Emitter

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

  const kmDir = join(rootPath, ".km")
  const result = options.loadFiles
    ? yield* createRepoWithFiles(rootPath, kmDir, options)
    : yield* createRepoEmpty(rootPath, kmDir, options)

  return buildFullRepo({
    rootPath,
    mode: result.mode,
    db: result.db,
    dataStore: result.dataStore,
    emitter: result.emitter,
    fileTree: createDiskFileTree(rootPath),
    config: loadConfigObject(rootPath),
    hooks: options.hooks,
    loadErrors: result.loadErrors,
    stats: result.stats,
    deferredFiles: result.deferredFiles,
  })
}

/** Initialize repo with file loading */
function* createRepoWithFiles(
  rootPath: string,
  kmDir: string,
  options: CreateRepoOptions,
): Generator<
  StepYield,
  {
    mode: "memory" | "disk"
    db: Database
    dataStore: DataStore & HasDatabase
    emitter: Emitter
    loadErrors: LoadError[]
    stats: RepoStats
    deferredFiles: DeferredFile[]
  },
  unknown
> {
  // Detect mode and create database BEFORE calling loadRepo
  const mode = detectMode(kmDir, options.forceMemory)
  const emitter = createEmitter({ kmDir })

  // Create database based on mode
  const db =
    mode === "disk" ? createDiskDatabase(kmDir) : createMemoryDatabase()

  // Load files using loadRepo
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- Internal use of loadRepo is acceptable here
  const loadResult = yield* loadRepo(rootPath, {
    searchAncestors: false,
    skipLinkResolution: options.skipLinkResolution,
    discoverOnly: options.discoverOnly,
    db,
  })

  // Create DataStore - pass emitter for disk mode only
  const dataStore = createDBDataStore(
    db,
    mode === "disk" ? { emitter } : undefined,
  )

  debug(
    "loaded files: %d nodes, %d links, %d errors",
    loadResult.nodeCount,
    loadResult.linkCount,
    loadResult.errors.length,
  )

  return {
    mode,
    db,
    dataStore,
    emitter,
    loadErrors: loadResult.errors,
    stats: {
      nodeCount: loadResult.nodeCount,
      linkCount: loadResult.linkCount,
      duration: loadResult.duration,
    },
    deferredFiles: loadResult.deferredFiles ?? [],
  }
}

/** Initialize repo without file loading (empty database) */
function* createRepoEmpty(
  _rootPath: string,
  kmDir: string,
  options: CreateRepoOptions,
): Generator<
  StepYield,
  {
    mode: "memory" | "disk"
    db: Database
    dataStore: DataStore & HasDatabase
    emitter: Emitter
    loadErrors: LoadError[]
    stats: RepoStats
    deferredFiles: DeferredFile[]
  },
  unknown
> {
  yield {
    declare: ["Detecting mode", "Initializing database", "Scanning files"],
  }

  yield "Detecting mode"
  const mode = detectMode(kmDir, options.forceMemory)
  const emitter = createEmitter({ kmDir })
  debug("detected mode: %s", mode)

  yield "Initializing database"
  const { db, dataStore } = initializeDatabase(kmDir, mode, emitter)

  yield "Scanning files"

  return {
    mode,
    db,
    dataStore,
    emitter,
    loadErrors: [],
    stats: { nodeCount: 0, linkCount: 0, duration: 0 },
    deferredFiles: [],
  }
}

/** Create a disk-backed database */
function createDiskDatabase(kmDir: string): Database {
  if (!existsSync(kmDir)) {
    mkdirSync(kmDir, { recursive: true })
  }
  const dbPath = join(kmDir, "state.db")
  const db = new Database(dbPath)
  db.run(SCHEMA)
  return db
}

/** Create an in-memory database */
function createMemoryDatabase(): Database {
  const db = new Database(":memory:")
  db.run(SCHEMA)
  return db
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
  /** Pre-created emitter (if not provided, one is created) */
  emitter?: Emitter
  /** Skip persisting events to events.jsonl (useful for tests) */
  skipPersist?: boolean
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
  dataStore: DataStore & HasDatabase,
  options: CreateBareRepoOptions = {},
): Repo {
  debug("createBareRepo", { options })

  const config = options.config ?? loadConfigObject(options.configPath)
  const repoPath = options.configPath ?? process.cwd()
  const kmDir = join(repoPath, ".km")
  const emitter =
    options.emitter ??
    createEmitter({
      kmDir,
      db: dataStore.database,
      skipPersist: options.skipPersist,
    })

  return buildBareRepo({
    rootPath: repoPath,
    mode: "memory",
    db: dataStore.database,
    dataStore,
    emitter,
    config,
    hooks: options.hooks,
  })
}

// =============================================================================
// Re-export test factories from repo-test.ts
// =============================================================================

export {
  createTestEnvRepo,
  createTestRepo,
  type CreateTestEnvRepoOptions,
  type TestEnvRepoResult,
} from "./repo-test.ts"

// =============================================================================
// Re-export hook types from repo-hooks.ts
// =============================================================================

export {
  type BeforeMutationResult,
  type MutationContext,
  type MutationType,
  type RepoHooks,
} from "./repo-hooks.ts"
