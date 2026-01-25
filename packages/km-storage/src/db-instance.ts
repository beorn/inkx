/**
 * Database Instance - Singleton database management
 *
 * This module manages the database connection lifecycle:
 * - Singleton instance management
 * - Memory mode for testing
 * - Database initialization and reset
 * - AsyncLocalStorage for parallel test isolation
 */

import createDebug from "debug"
import { Database } from "bun:sqlite"
import { AsyncLocalStorage } from "async_hooks"

const debug = createDebug("km:storage:db:instance")
import { join } from "path"
import { existsSync, mkdirSync } from "fs"
import { getKmDir } from "./emit.ts"
import { SCHEMA } from "./schema.ts"

// Singleton database instance
let dbInstance: Database | null = null

// Flag to track if db was injected externally (e.g., from MemoryStore)
let dbInjected = false

// AsyncLocalStorage for context-local database (enables parallel test isolation)
const dbContext = new AsyncLocalStorage<Database>()

/**
 * Get the database path
 */
export function getDbPath(): string {
  return join(getKmDir(), "state.db")
}

/**
 * Initialize or get the database instance
 * @deprecated Use Vault.rawQuery() for raw SQL, or Vault query methods for typed queries.
 * This singleton will be removed in a future version.
 */
export function getDb(): Database {
  // Check async context first (enables parallel test isolation)
  const contextDb = dbContext.getStore()
  if (contextDb) {
    return contextDb
  }

  if (dbInstance) {
    return dbInstance
  }

  const kmPath = getKmDir()
  if (!existsSync(kmPath)) {
    mkdirSync(kmPath, { recursive: true })
  }

  const dbPath = getDbPath()
  debug("opening database: %s", dbPath)
  dbInstance = new Database(dbPath)

  // Initialize schema
  dbInstance.exec(SCHEMA)
  debug("database initialized")

  return dbInstance
}

/**
 * Close the database
 */
export function closeDb(): void {
  if (dbInstance) {
    debug("closing database (injected=%s)", dbInjected)
    // Only close if we own it (not injected from external store)
    if (!dbInjected) {
      dbInstance.close()
    }
    dbInstance = null
    dbInjected = false
  }
}

/**
 * Inject an external database instance (e.g., from MemoryStore)
 * This allows memory mode to work with existing db.ts functions
 * @deprecated Internal use only. Use createVault() factory instead.
 */
export function setDb(db: Database): void {
  if (dbInstance && !dbInjected) {
    dbInstance.close()
  }
  dbInstance = db
  dbInjected = true
}

/**
 * Check if database is using memory mode
 */
export function isMemoryMode(): boolean {
  return dbInjected
}

/**
 * Reset the database (drop all tables and recreate)
 */
export function resetDb(): void {
  const db = getDb()
  db.exec(`
    DROP TABLE IF EXISTS nodes_fts;
    DROP TABLE IF EXISTS nodes;
    DROP TABLE IF EXISTS meta;
  `)
  db.exec(SCHEMA)
}

/**
 * Run a function with a context-local database.
 * This enables parallel test isolation - each test can have its own in-memory
 * database without affecting other concurrent tests.
 *
 * @example
 * const db = new Database(":memory:");
 * db.exec(SCHEMA);
 * runWithDb(db, () => {
 *   // All getDb() calls within this function return the context database
 *   resetDb();
 *   // ... test logic ...
 * }).finally(() => {
 *   db.close();
 * });
 */
export function runWithDb<T>(db: Database, fn: () => T): T {
  return dbContext.run(db, fn)
}

/**
 * Get the context-local database if running within runWithDb, otherwise undefined.
 * Unlike getDb(), this does NOT create a database if none exists.
 * Use this when you want to check for a context without side effects.
 */
export function tryGetContextDb(): Database | undefined {
  return dbContext.getStore()
}
