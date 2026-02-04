/**
 * Test helpers for query executor tests
 *
 * Provides factory functions for test databases and data seeding
 * to reduce boilerplate in query-executor.test.ts
 */

import { Database } from "bun:sqlite"
import { SCHEMA } from "../src/schema.ts"

/** Node data for seeding test databases */
export interface TestNode {
  id: string
  type: string
  task_status?: string | null
  task_mark?: string | null
  priority?: number | null
  content: string
  fs_path?: string | null
  due_date?: string | null
  scheduled_date?: string | null
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
      id, type, name, task_status, task_mark, priority, content,
      fs_path, due_date, scheduled_date, data,
      created_at, updated_at, version, parent_idx
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!
    stmt.run(
      n.id,
      n.type,
      n.name ?? null,
      n.task_status ?? null,
      n.task_mark ?? null,
      n.priority ?? null,
      n.content,
      n.fs_path ?? null,
      n.due_date ?? null,
      n.scheduled_date ?? null,
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
