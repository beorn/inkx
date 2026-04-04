/**
 * Test Environment Utilities
 *
 * Provides helpers for isolated test environments with explicit dependency injection.
 * Each test gets its own database, file system, and emitter - no global state.
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
import { SCHEMA } from "../db/schema.ts"
import type { Emitter } from "../emitter.ts"
import { getNode, getNodeByPath } from "../db/queries/core-lookup.ts"
import { getChildren, getChildCountsBatch, getAncestors } from "../db/queries/tree-traversal.ts"
import { getAllNodes } from "../db/queries/utils.ts"
import { getLinksTo } from "../db/queries/task-queries.ts"
import { getBacklinks, type Link } from "../db/links.ts"
import type { DataStore, HasDatabase } from "../data-store.ts"
import { createTestEnvRepo } from "../repo/repo.ts"

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
 * Check if running in real infrastructure mode.
 *
 * NOTE: Currently unused in the test suite. Reserved for future optimization
 * where tests could run only in real mode via:
 * `test.skipIf(!isRealMode())("disk-specific test", ...)`
 */
export function isRealMode(): boolean {
  return getTestMode() === "real"
}

/**
 * Check if running in mock (memory-only) mode.
 *
 * NOTE: Currently unused in the test suite. Reserved for future optimization
 * where slow tests could be skipped in mock mode via:
 * `test.skipIf(isMockMode())("slow integration test", ...)`
 *
 * @see docs/dev/test-fakes.md for behavioral fakes that work independently of TEST_MODE
 */
export function isMockMode(): boolean {
  return getTestMode() === "mock"
}

/**
 * Repo-like object for tests - wraps db functions with db pre-bound
 */
interface TestRepo {
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
  addNode: (parentId: string | null, nodeData: Partial<KNode> & { type: string; content: string }) => string
  rawQuery: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => T[]
}

/**
 * Isolated test environment paths
 */
export interface TestEnv {
  /** Unique test ID */
  testId: string
  /** Root test directory (deleted on cleanup) */
  testDir: string
  /** .km directory for state.db and changes.jsonl */
  kmDir: string
  /** Repo directory for markdown files */
  repoDir: string
  /** Database for this test (memory or disk based on mode) */
  db: Database
  /** Current test mode */
  mode: TestMode
  /** Repo-like object wrapping db functions with db pre-bound */
  repo: TestRepo
  /**
   * DataStore interface for ergonomic test access.
   * Preferred API - use data.getAllNodes() instead of getAllNodes(db).
   * Access raw db via data.database when needed.
   */
  data: DataStore & HasDatabase
  /** Emitter domain object for change emission */
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
 *   await withTestEnv(async ({ repoDir, db, emitter }) => {
 *     writeFileSync(join(repoDir, "test.md"), "# Hello");
 *     // Use db, emitter explicitly - no global singletons
 *     const nodes = getAllNodes(db);
 *   });
 * });
 *
 * // Skip tests that need real infrastructure:
 * test.skipIf(isMockMode())("watcher test", async () => { ... });
 */
export async function withTestEnv<T>(fn: (env: TestEnv) => T | Promise<T>, options?: { mode?: TestMode }): Promise<T> {
  const env = setupTestEnv(options)

  try {
    return await fn(env)
  } finally {
    cleanupTestEnv(env)
  }
}

/**
 * Synchronous version of withTestEnv for non-async tests.
 * Same TEST_MODE behavior as withTestEnv.
 */
export function withTestEnvSync<T>(fn: (env: TestEnv) => T, options?: { mode?: TestMode }): T {
  const env = setupTestEnv(options)

  try {
    return fn(env)
  } finally {
    cleanupTestEnv(env)
  }
}

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Setup a test environment with all dependencies wired.
 */
function setupTestEnv(options?: { mode?: TestMode }): TestEnv {
  const mode = options?.mode ?? getTestMode()
  const testId = ulid()
  const testDir = join("/tmp", `kmtest-${testId}`)
  const repoDir = join(testDir, "repo")
  const kmDir = join(repoDir, ".km")

  // Create repo directory
  mkdirSync(repoDir, { recursive: true })

  // In real mode, also create .km for disk DB
  if (mode === "real") {
    mkdirSync(kmDir, { recursive: true })
  }

  // Create database: disk for real mode, memory otherwise
  const dbPath = mode === "real" ? join(kmDir, "state.db") : ":memory:"
  const db = new Database(dbPath)
  db.run(SCHEMA)

  // Use createTestEnvRepo to wire everything together
  // skipPersist: true for non-real mode avoids writing changes.jsonl to /tmp
  const isDiskMode = mode === "real"
  const { emitter, data } = createTestEnvRepo({
    db,
    repoPath: repoDir,
    skipPersist: !isDiskMode,
  })

  // Create TestRepo wrapper for backward compatibility
  // This provides the same interface tests expect
  const repo: TestRepo = {
    getNode: (id) => getNode(db, id),
    getNodeByPath: (fsPath) => getNodeByPath(db, fsPath),
    getAllNodes: () => getAllNodes(db),
    getChildren: (parentId) => getChildren(db, parentId),
    getChildCountsBatch: (parentIds) => getChildCountsBatch(db, parentIds),
    getBacklinks: (nodeId) => getBacklinks(db, nodeId),
    getAncestors: (nodeId) => getAncestors(db, nodeId),
    getLinksTo: (targetId) => getLinksTo(db, targetId),
    moveNode: (id, newParentId, position) => data.moveNode(id, newParentId, position),
    updateNode: (id, changes) => data.updateNode(id, changes),
    deleteNode: (id) => data.deleteNode(id),
    addNode: (parentId, nodeData) => data.addNode(parentId, nodeData),
    rawQuery: <T = Record<string, unknown>>(sql: string, params?: unknown[]): T[] => {
      return db.query(sql).all(...((params ?? []) as never)) as T[]
    },
  }

  return {
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
}

/**
 * Cleanup a test environment.
 */
function cleanupTestEnv(env: TestEnv): void {
  env.db.close()
  if (existsSync(env.testDir)) {
    rmSync(env.testDir, { recursive: true })
  }
}
