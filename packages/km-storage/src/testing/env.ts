/**
 * Test Environment Utilities
 *
 * Provides helpers for isolated test environments using AsyncLocalStorage.
 * This enables parallel test execution without shared state conflicts.
 *
 * ## Test Modes
 *
 * Set via TEST_MODE environment variable:
 *
 * - `mock`: Memory DB + /tmp filesystem. Use test.skipIf(isMockMode()) for
 *   tests that need real infrastructure (file watcher, sync, etc).
 * - `standard` (default): Memory DB + /tmp filesystem. Current behavior.
 * - `real`: Disk DB + /tmp filesystem. For drift detection, CI.
 *
 * All modes create filesystem for compatibility. The mock/standard speedup
 * comes from memory DB (no disk I/O for database operations).
 *
 * ```bash
 * TEST_MODE=mock bun test       # Fastest iteration (skip watcher tests)
 * TEST_MODE=real bun test       # Full infrastructure
 * bun test                      # Standard (default)
 * ```
 */

import { Database } from "bun:sqlite"
import { existsSync, mkdirSync, rmSync } from "fs"
import { join } from "path"
import { ulid } from "ulid"
import type { KNode } from "@km/core"
import { SCHEMA } from "../schema.ts"
import { runWithDb } from "../db-instance.ts"
import { runWithKmDir } from "../emit.ts"
import { createEmitter, type Emitter } from "../emitter.ts"
import { getNode, getNodeByPath } from "../db-queries/core-lookup.ts"
import {
  getChildren,
  getChildCountsBatch,
  getAncestors,
} from "../db-queries/tree-traversal.ts"
import { getAllNodes } from "../db-queries/utils.ts"
import { getLinksTo } from "../db-queries/task-queries.ts"
import { getBacklinks, type Link } from "../db-links.ts"
import {
  moveNode,
  updateNode,
  deleteNode,
  addNode,
  type StorageMode,
} from "../db-ops.ts"
import {
  createDBDataStore,
  type DataStore,
  type HasDatabase,
} from "../data-store.ts"

// =============================================================================
// Types
// =============================================================================

/**
 * Test infrastructure modes
 */
export type TestMode = "mock" | "standard" | "real"

/**
 * Get the current test mode from environment
 */
export function getTestMode(): TestMode {
  const mode = process.env.TEST_MODE?.toLowerCase()
  if (mode === "mock" || mode === "real") return mode
  return "standard"
}

/**
 * Check if running in real infrastructure mode
 */
export function isRealMode(): boolean {
  return getTestMode() === "real"
}

/**
 * Check if running in mock (memory-only) mode
 */
export function isMockMode(): boolean {
  return getTestMode() === "mock"
}

/**
 * Repo-like object for tests - wraps db functions with db pre-bound
 */
export interface TestRepo {
  getNode: (id: string) => KNode | null
  getNodeByPath: (fsPath: string) => KNode | null
  getAllNodes: () => KNode[]
  getChildren: (parentId: string | null) => KNode[]
  getChildCountsBatch: (parentIds: string[]) => Map<string, number>
  getBacklinks: (nodeId: string) => Link[]
  getAncestors: (nodeId: string) => KNode[]
  getLinksTo: (targetId: string) => KNode[]
  moveNode: (id: string, newParentId: string, position: number) => void
  updateNode: (id: string, changes: Partial<KNode>) => void
  deleteNode: (id: string) => void
  addNode: (
    parentId: string | null,
    nodeData: Partial<KNode> & { type: string; content: string },
  ) => string
  rawQuery: <T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ) => T[]
}

/**
 * Isolated test environment paths
 */
export interface TestEnv {
  /** Unique test ID */
  testId: string
  /** Root test directory (deleted on cleanup) */
  testDir: string
  /** .km directory for state.db and events.jsonl */
  kmDir: string
  /** Repo directory for markdown files */
  repoDir: string
  /** Database for this test (memory or disk based on mode) */
  db: Database
  /** Current test mode */
  mode: TestMode
  /** Repo-like object wrapping singleton functions bound to test DB */
  repo: TestRepo
  /**
   * DataStore interface for ergonomic test access.
   * Preferred API - use data.getAllNodes() instead of getAllNodes(db).
   * Access raw db via data.database when needed.
   */
  data: DataStore & HasDatabase
  /** Emitter domain object for event emission */
  emitter: Emitter
}

/**
 * Run a test with an isolated environment.
 *
 * Infrastructure depends on TEST_MODE:
 * - `mock`: Memory DB + /tmp filesystem (skip watcher tests with isMockMode())
 * - `standard` (default): Memory DB + /tmp filesystem
 * - `real`: Disk DB + /tmp filesystem
 *
 * All modes create filesystem for compatibility. Speed difference comes from
 * memory vs disk database operations.
 *
 * Cleans up all resources after the test completes.
 *
 * @example
 * test("my test", async () => {
 *   await withTestEnv(async ({ repoDir, kmDir }) => {
 *     writeFileSync(join(repoDir, "test.md"), "# Hello");
 *     // All getDb() calls return the isolated db
 *     // All getKmDir() calls return the isolated kmDir
 *   });
 * });
 *
 * // Skip tests that need real infrastructure:
 * test.skipIf(isMockMode())("watcher test", async () => { ... });
 */
export async function withTestEnv<T>(
  fn: (env: TestEnv) => T | Promise<T>,
  options?: { mode?: TestMode },
): Promise<T> {
  const mode = options?.mode ?? getTestMode()
  const testId = ulid()
  const testDir = join("/tmp", `kmtest-${testId}`)
  const repoDir = join(testDir, "repo")
  const kmDir = join(repoDir, ".km")

  // Create repo directory (but NOT .km - let tests control that)
  // Tests that need disk mode should mkdirSync(kmDir) themselves
  mkdirSync(repoDir, { recursive: true })

  // In real mode, also create .km for disk DB
  if (mode === "real") {
    mkdirSync(kmDir, { recursive: true })
  }

  // Create database: disk for real mode, memory otherwise
  const dbPath = mode === "real" ? join(kmDir, "state.db") : ":memory:"
  const db = new Database(dbPath)
  db.exec(SCHEMA)

  // Derive StorageMode from TestMode (real → disk, otherwise → memory)
  const storageMode: StorageMode = mode === "real" ? "disk" : "memory"

  // Create repo wrapping singleton functions (bound to test DB via AsyncLocalStorage)
  const repo: TestRepo = {
    getNode: (id) => getNode(db, id),
    getNodeByPath: (fsPath) => getNodeByPath(db, fsPath),
    getAllNodes: () => getAllNodes(db),
    getChildren: (parentId) => getChildren(db, parentId),
    getChildCountsBatch: (parentIds) => getChildCountsBatch(db, parentIds),
    getBacklinks: (nodeId) => getBacklinks(db, nodeId),
    getAncestors: (nodeId) => getAncestors(db, nodeId),
    getLinksTo: (targetId) => getLinksTo(db, targetId),
    moveNode: (id, newParentId, position) =>
      moveNode(db, id, newParentId, position, storageMode),
    updateNode: (id, changes) => updateNode(db, id, changes, storageMode),
    deleteNode: (id) => deleteNode(db, id, storageMode),
    addNode: (parentId, nodeData) =>
      addNode(db, parentId, nodeData, storageMode),
    rawQuery: <T = Record<string, unknown>>(
      sql: string,
      params?: unknown[],
    ): T[] => {
      return db.query(sql).all(...((params ?? []) as never)) as T[]
    },
  }

  // Create DataStore wrapping the test db for ergonomic access
  // Use storageMode so DB→FS sync events fire when appropriate
  const data = createDBDataStore(db, storageMode)

  // Create emitter for event emission (with db for applying events)
  const emitter = createEmitter({ kmDir, db })

  const env: TestEnv = {
    testId,
    testDir,
    kmDir,
    repoDir,
    db,
    mode,
    repo,
    data,
    emitter,
  }

  try {
    // Run with both context-local db and kmDir
    return await runWithKmDir(kmDir, () => runWithDb(db, () => fn(env)))
  } finally {
    // Cleanup
    db.close()
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true })
    }
  }
}

/**
 * Synchronous version of withTestEnv for non-async tests.
 * Same TEST_MODE behavior as withTestEnv.
 */
export function withTestEnvSync<T>(
  fn: (env: TestEnv) => T,
  options?: { mode?: TestMode },
): T {
  const mode = options?.mode ?? getTestMode()
  const testId = ulid()
  const testDir = join("/tmp", `kmtest-${testId}`)
  const repoDir = join(testDir, "repo")
  const kmDir = join(repoDir, ".km")

  // Create repo directory (but NOT .km - let tests control that)
  // Tests that need disk mode should mkdirSync(kmDir) themselves
  mkdirSync(repoDir, { recursive: true })

  // In real mode, also create .km for disk DB
  if (mode === "real") {
    mkdirSync(kmDir, { recursive: true })
  }

  // Create database: disk for real mode, memory otherwise
  const dbPath = mode === "real" ? join(kmDir, "state.db") : ":memory:"
  const db = new Database(dbPath)
  db.exec(SCHEMA)

  // Derive StorageMode from TestMode (real → disk, otherwise → memory)
  const storageMode: StorageMode = mode === "real" ? "disk" : "memory"

  // Create repo wrapping singleton functions (bound to test DB via AsyncLocalStorage)
  const repo: TestRepo = {
    getNode: (id) => getNode(db, id),
    getNodeByPath: (fsPath) => getNodeByPath(db, fsPath),
    getAllNodes: () => getAllNodes(db),
    getChildren: (parentId) => getChildren(db, parentId),
    getChildCountsBatch: (parentIds) => getChildCountsBatch(db, parentIds),
    getBacklinks: (nodeId) => getBacklinks(db, nodeId),
    getAncestors: (nodeId) => getAncestors(db, nodeId),
    getLinksTo: (targetId) => getLinksTo(db, targetId),
    moveNode: (id, newParentId, position) =>
      moveNode(db, id, newParentId, position, storageMode),
    updateNode: (id, changes) => updateNode(db, id, changes, storageMode),
    deleteNode: (id) => deleteNode(db, id, storageMode),
    addNode: (parentId, nodeData) =>
      addNode(db, parentId, nodeData, storageMode),
    rawQuery: <T = Record<string, unknown>>(
      sql: string,
      params?: unknown[],
    ): T[] => {
      return db.query(sql).all(...((params ?? []) as never)) as T[]
    },
  }

  // Create DataStore wrapping the test db for ergonomic access
  // Use storageMode so DB→FS sync events fire when appropriate
  const data = createDBDataStore(db, storageMode)

  // Create emitter for event emission (with db for applying events)
  const emitter = createEmitter({ kmDir, db })

  const env: TestEnv = {
    testId,
    testDir,
    kmDir,
    repoDir,
    db,
    mode,
    repo,
    data,
    emitter,
  }

  try {
    // Run with both context-local db and kmDir
    return runWithKmDir(kmDir, () => runWithDb(db, () => fn(env)))
  } finally {
    // Cleanup
    db.close()
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true })
    }
  }
}
