/**
 * Repo - Composed Domain Object
 *
 * Repo is the composed whole, analogous to git's repository concept.
 * It combines:
 * - DataStore: Indexed tree of nodes (fast queries)
 * - FileTree: Human-editable files (optional, for sync)
 * - Config: Vault configuration
 *
 * Key insight from ADR-002: FileTree and DataStore are NOT peers.
 * FileTree is a human-editable representation that syncs with DataStore.
 * Sync is translation between formats, not a generic store-to-store operation.
 *
 * See: docs/adr/002-domain-objects-refactor.md
 */

import createDebug from "debug"
import { Database } from "bun:sqlite"
import { existsSync, mkdirSync } from "fs"
import { join } from "path"

import type { DataStore, HasDatabase } from "./data-store.ts"
import { createMemDataStore, createDBDataStore } from "./data-store.ts"
import type { FileTree } from "./file-tree.ts"
import { createDiskFileTree } from "./file-tree.ts"
import type { Config } from "./config-object.ts"
import { loadConfigObject } from "./config-object.ts"
import { createWatcher, type Watcher, type WatcherOptions } from "./watcher.ts"
import { SCHEMA } from "./schema.ts"

const debug = createDebug("km:storage:repo")

// =============================================================================
// Core Interface
// =============================================================================

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
 * using repo = createRepo("/path/to/vault")
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

  /** Indexed storage - always present */
  readonly data: DataStore

  /** Human-editable files - optional (null for bare repos) */
  readonly files: FileTree | null

  /** Configuration */
  readonly config: Config

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
}

/**
 * Create a full Repo with DataStore + FileTree + Config.
 *
 * This is the most common way to create a Repo. It:
 * - Detects .km/ directory to determine persistence mode
 * - Creates DataStore (disk or memory based on mode)
 * - Creates FileTree for the vault root
 * - Loads config from cosmiconfig
 *
 * @example
 * ```typescript
 * // Standard usage
 * using repo = createRepo("/path/to/vault")
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
 * @param rootPath - Path to the vault root directory
 * @param options - Creation options
 * @returns Repo domain object
 */
export function createRepo(
  rootPath: string = process.cwd(),
  options: CreateRepoOptions = {},
): Repo {
  debug("createRepo", { rootPath, options })

  const kmDir = join(rootPath, ".km")
  const hasKmDir = existsSync(kmDir) && !options.forceMemory
  const mode = hasKmDir ? "disk" : "memory"

  debug("detected mode: %s (hasKmDir=%s)", mode, hasKmDir)

  // Create DataStore based on mode
  let dataStore: DataStore & HasDatabase
  let db: Database

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

  // Create FileTree for the vault root
  const fileTree = createDiskFileTree(rootPath)

  // Load config
  const config = loadConfigObject(rootPath)

  let closed = false

  const repo: Repo = {
    get path() {
      return rootPath
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

    close() {
      if (closed) return
      closed = true
      debug("closing repo")

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
  data: DataStore,
  options: CreateBareRepoOptions = {},
): Repo {
  debug("createBareRepo", { options })

  // Load or use provided config
  const config = options.config ?? loadConfigObject(options.configPath)

  let closed = false

  const repo: Repo = {
    get path() {
      return options.configPath ?? process.cwd()
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

    async sync() {
      throw new Error("Cannot sync: bare repo has no files")
    },

    watch() {
      throw new Error("Cannot watch: bare repo has no files")
    },

    close() {
      if (closed) return
      closed = true
      debug("closing bare repo")
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
