/**
 * Database Instance - Singleton database management
 *
 * This module manages the database connection lifecycle:
 * - Singleton instance management
 * - Memory mode for testing
 * - Database initialization and reset
 */

import createDebug from "debug";
import { Database } from "bun:sqlite";

const debug = createDebug("km:storage:db:instance");
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import { getKmDir } from "./emit.ts";
import { SCHEMA } from "./schema.ts";

// Singleton database instance
let dbInstance: Database | null = null;

// Flag to track if db was injected externally (e.g., from MemoryStore)
let dbInjected = false;

/**
 * Get the database path
 */
export function getDbPath(): string {
  return join(getKmDir(), "state.db");
}

/**
 * Initialize or get the database instance
 */
export function getDb(): Database {
  if (dbInstance) {
    return dbInstance;
  }

  const kmPath = getKmDir();
  if (!existsSync(kmPath)) {
    mkdirSync(kmPath, { recursive: true });
  }

  const dbPath = getDbPath();
  debug("opening database: %s", dbPath);
  dbInstance = new Database(dbPath);

  // Initialize schema
  dbInstance.exec(SCHEMA);
  debug("database initialized");

  return dbInstance;
}

/**
 * Close the database
 */
export function closeDb(): void {
  if (dbInstance) {
    debug("closing database (injected=%s)", dbInjected);
    // Only close if we own it (not injected from external store)
    if (!dbInjected) {
      dbInstance.close();
    }
    dbInstance = null;
    dbInjected = false;
  }
}

/**
 * Inject an external database instance (e.g., from MemoryStore)
 * This allows memory mode to work with existing db.ts functions
 */
export function setDb(db: Database): void {
  if (dbInstance && !dbInjected) {
    dbInstance.close();
  }
  dbInstance = db;
  dbInjected = true;
}

/**
 * Check if database is using memory mode
 */
export function isMemoryMode(): boolean {
  return dbInjected;
}

/**
 * Reset the database (drop all tables and recreate)
 */
export function resetDb(): void {
  const db = getDb();
  db.exec(`
    DROP TABLE IF EXISTS nodes_fts;
    DROP TABLE IF EXISTS nodes;
    DROP TABLE IF EXISTS meta;
  `);
  db.exec(SCHEMA);
}
