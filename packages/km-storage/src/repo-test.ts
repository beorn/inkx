/**
 * Test Repo Factories
 *
 * Factory functions for creating test repos with various configurations.
 * Extracted from repo.ts for better organization.
 */

import { Database } from "bun:sqlite"
import { createLogger } from "loggily"
import { join } from "path"

import type { DataStore, HasDatabase } from "./data-store.ts"
import { createDBDataStore, createMemDataStore } from "./data-store.ts"
import { createEmitter, type Emitter } from "./emitter.ts"
import type { Repo } from "./repo.ts"
import { createBareRepo } from "./repo.ts"
import { SCHEMA } from "./schema.ts"

const log = createLogger("km:storage:repo:test")

/**
 * Create a test Repo with in-memory DataStore and optional in-memory FileTree.
 *
 * This is the fastest way to create a Repo for testing.
 * No disk I/O, no persistence, no file watching.
 *
 * @example
 * ```typescript
 * using repo = createTestRepo()
 * repo.data.addNode(null, { type: "p", item: { list: "-", task: { marker: "[ ]", status: "todo" } }, content: "Test" })
 * ```
 *
 * @returns Test Repo with in-memory storage
 */
export function createTestRepo(): Repo {
  log.debug?.("createTestRepo")

  const data = createMemDataStore()
  return createBareRepo(data)
}

/** Options for createTestEnvRepo */
export interface CreateTestEnvRepoOptions {
  /** Database to use (creates in-memory if not provided) */
  db?: Database
  /** Path to repo directory (required for kmDir calculation) */
  repoPath: string
  /** Skip persisting events to events.jsonl (default: true for tests) */
  skipPersist?: boolean
}

/** Result from createTestEnvRepo - all pieces for test access */
export interface TestEnvRepoResult {
  /** Full Repo domain object */
  repo: Repo
  /** Database instance (same as repo.database) */
  db: Database
  /** Emitter instance (same as repo.emitter) */
  emitter: Emitter
  /** DataStore instance (same as repo.data) */
  data: DataStore & HasDatabase
}

/**
 * Create a test environment with Repo and all dependencies properly wired.
 *
 * This factory handles the chicken-and-egg problem where:
 * - DataStore needs emitter for mutations to emit events
 * - Repo creates emitter internally
 *
 * By creating emitter first and sharing it with both DataStore and Repo,
 * all components are properly connected.
 *
 * @example
 * ```typescript
 * const { repo, db, emitter, data } = createTestEnvRepo({
 *   repoPath: testDir,
 *   skipPersist: true,
 * })
 *
 * // Use emitter for sync wiring — withSync wraps emitter.apply()
 * // const syncManager = createTestSync(db, repoDir, { emitter })
 *
 * // Use data for mutations (events flow to emitter)
 * data.addNode(null, { type: "p", item: { list: "-", task: { marker: "[ ]", status: "todo" } }, content: "Test" })
 *
 * // Cleanup
 * repo.close()
 * ```
 */
export function createTestEnvRepo(options: CreateTestEnvRepoOptions): TestEnvRepoResult {
  log.debug?.(`createTestEnvRepo repoPath=${options.repoPath}`)

  const skipPersist = options.skipPersist ?? true
  const kmDir = join(options.repoPath, ".km")

  // Create or use provided database
  const db = options.db ?? new Database(":memory:")
  if (!options.db) {
    db.run(SCHEMA)
  }

  // Create emitter with db wired for event application
  const emitter = createEmitter({ kmDir, db, skipPersist })

  // Create DataStore with emitter for mutation events
  const data = createDBDataStore(db, { emitter })

  // Create Repo with shared emitter
  const repo = createBareRepo(data, {
    emitter,
    configPath: options.repoPath,
  })

  return { repo, db, emitter, data }
}
