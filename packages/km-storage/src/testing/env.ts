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

import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { ulid } from "ulid";
import { SCHEMA } from "../schema.ts";
import { runWithDb } from "../db-instance.ts";
import { runWithKmDir } from "../emit.ts";

// =============================================================================
// Types
// =============================================================================

/**
 * Test infrastructure modes
 */
export type TestMode = "mock" | "standard" | "real";

/**
 * Get the current test mode from environment
 */
export function getTestMode(): TestMode {
  const mode = process.env.TEST_MODE?.toLowerCase();
  if (mode === "mock" || mode === "real") return mode;
  return "standard";
}

/**
 * Check if running in real infrastructure mode
 */
export function isRealMode(): boolean {
  return getTestMode() === "real";
}

/**
 * Check if running in mock (memory-only) mode
 */
export function isMockMode(): boolean {
  return getTestMode() === "mock";
}

/**
 * Isolated test environment paths
 */
export interface TestEnv {
  /** Unique test ID */
  testId: string;
  /** Root test directory (deleted on cleanup) */
  testDir: string;
  /** .km directory for state.db and events.jsonl */
  kmDir: string;
  /** Vault directory for markdown files */
  vaultDir: string;
  /** Database for this test (memory or disk based on mode) */
  db: Database;
  /** Current test mode */
  mode: TestMode;
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
 *   await withTestEnv(async ({ vaultDir, kmDir }) => {
 *     writeFileSync(join(vaultDir, "test.md"), "# Hello");
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
): Promise<T> {
  const mode = getTestMode();
  const testId = ulid();
  const testDir = join("/tmp", `kmtest-${testId}`);
  const vaultDir = join(testDir, "vault");
  const kmDir = join(vaultDir, ".km");

  // Create vault directory (but NOT .km - let tests control that)
  // Tests that need disk mode should mkdirSync(kmDir) themselves
  mkdirSync(vaultDir, { recursive: true });

  // In real mode, also create .km for disk DB
  if (mode === "real") {
    mkdirSync(kmDir, { recursive: true });
  }

  // Create database: disk for real mode, memory otherwise
  const dbPath = mode === "real" ? join(kmDir, "state.db") : ":memory:";
  const db = new Database(dbPath);
  db.exec(SCHEMA);

  const env: TestEnv = { testId, testDir, kmDir, vaultDir, db, mode };

  try {
    // Run with both context-local db and kmDir
    return await runWithKmDir(kmDir, () => runWithDb(db, () => fn(env)));
  } finally {
    // Cleanup
    db.close();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  }
}

/**
 * Synchronous version of withTestEnv for non-async tests.
 * Same TEST_MODE behavior as withTestEnv.
 */
export function withTestEnvSync<T>(fn: (env: TestEnv) => T): T {
  const mode = getTestMode();
  const testId = ulid();
  const testDir = join("/tmp", `kmtest-${testId}`);
  const vaultDir = join(testDir, "vault");
  const kmDir = join(vaultDir, ".km");

  // Create vault directory (but NOT .km - let tests control that)
  // Tests that need disk mode should mkdirSync(kmDir) themselves
  mkdirSync(vaultDir, { recursive: true });

  // In real mode, also create .km for disk DB
  if (mode === "real") {
    mkdirSync(kmDir, { recursive: true });
  }

  // Create database: disk for real mode, memory otherwise
  const dbPath = mode === "real" ? join(kmDir, "state.db") : ":memory:";
  const db = new Database(dbPath);
  db.exec(SCHEMA);

  const env: TestEnv = { testId, testDir, kmDir, vaultDir, db, mode };

  try {
    // Run with both context-local db and kmDir
    return runWithKmDir(kmDir, () => runWithDb(db, () => fn(env)));
  } finally {
    // Cleanup
    db.close();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  }
}
