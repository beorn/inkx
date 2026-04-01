/**
 * Test helpers for query executor tests
 *
 * Provides factory functions for test databases and data seeding
 * to reduce boilerplate in query-executor.test.ts
 */

import { Database } from "bun:sqlite"
import { SCHEMA } from "../src/schema.ts"
import type { ItemData } from "@km/core"

/** Node data for seeding test databases */
export interface TestNode {
  id: string
  type: string
  item?: ItemData
  fstype?: string | null
  priority?: string | null
  content: string
  fs_path?: string | null
  due_at?: string | null
  start_at?: string | null
  name?: string | null
  data?: string
}

/**
 * Create an in-memory test database with the full schema.
 * Use `db.close()` in afterEach to clean up.
 */
export function createTestDatabase(): Database {
  const db = new Database(":memory:")
  db.run(SCHEMA)
  return db
}

/**
 * Insert test nodes into the database.
 * Handles default values and timestamps automatically.
 */
export function seedTestData(db: Database, nodes: TestNode[]): void {
  const now = Date.now()
  const stmt = db.prepare(`
    INSERT INTO nodes (
      id, type, item, fstype, name, task_status, task_marker, priority, content,
      fs_path, due_at, start_at, data,
      created_at, updated_at, version, parent_idx
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!
    stmt.run(
      n.id,
      n.type,
      n.item ? 1 : 0,
      n.fstype ?? null,
      n.name ?? null,
      n.item?.task?.status ?? null,
      n.item?.task?.marker ?? null,
      n.priority ?? null,
      n.content,
      n.fs_path ?? null,
      n.due_at ?? null,
      n.start_at ?? null,
      n.data ?? "{}",
      now,
      now,
      `v${i + 1}`,
      i,
    )
  }
}

/**
 * Format date in local timezone (YYYY-MM-DD).
 * Matches the format used by the query executor.
 */
export function formatDate(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/** Get today's date at midnight */
export function today(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/** Get date offset from today */
export function offsetDate(days: number): Date {
  const d = today()
  d.setDate(d.getDate() + days)
  return d
}
