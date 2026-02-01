/**
 * Database Instance Utilities
 *
 * @deprecated This module previously contained global singletons which have been removed.
 * Use Repo domain object instead:
 *   const repo = createRepo(rootPath)
 *   repo.rawQuery(sql, params)  // For raw SQL
 *   repo.data.getNode(id)       // For typed queries
 *
 * This module is kept for backward compatibility but all functions that relied on
 * the singleton have been removed. Use createRepo() for all new code.
 */

import createDebug from "debug"
import { Database } from "bun:sqlite"
import { join } from "path"
import { existsSync, mkdirSync } from "fs"
import { SCHEMA } from "../schema.ts"

const debug = createDebug("km:storage:db:instance")

// =============================================================================
// DATABASE CREATION HELPERS (no singletons)
// =============================================================================

/**
 * Create a new in-memory database with schema.
 * Use this for tests that need isolated databases.
 *
 * @example
 * const db = createMemoryDb()
 * try {
 *   // ... use db ...
 * } finally {
 *   db.close()
 * }
 */
export function createMemoryDb(): Database {
  const db = new Database(":memory:")
  db.run(SCHEMA)
  debug("created in-memory database")
  return db
}

/**
 * Create a new disk-backed database at the specified path.
 *
 * @param dbPath - Full path to the database file
 * @param options - Creation options
 * @returns Database instance (caller must close)
 */
export function createDiskDb(
  dbPath: string,
  options: { ensureDir?: boolean } = {},
): Database {
  if (options.ensureDir) {
    const dir = join(dbPath, "..")
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
  }

  debug("opening database: %s", dbPath)
  const db = new Database(dbPath)
  db.run(SCHEMA)
  debug("database initialized")
  return db
}

/**
 * Reset a database (drop all tables and recreate schema).
 *
 * @param db - Database to reset
 */
export function resetDatabase(db: Database): void {
  db.run(`
    DROP TABLE IF EXISTS nodes_fts;
    DROP TABLE IF EXISTS nodes;
    DROP TABLE IF EXISTS links;
    DROP TABLE IF EXISTS meta;
  `)
  db.run(SCHEMA)
  debug("database reset")
}
