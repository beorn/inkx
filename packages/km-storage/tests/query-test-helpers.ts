/**
 * Test helpers for query executor tests
 *
 * Provides factory functions for test databases and data seeding
 * to reduce boilerplate in query-executor.test.ts
 */

import { Database } from "bun:sqlite"
import { SCHEMA } from "../src/db/schema.ts"
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
 *
 * priority dropped as a column at SCHEMA_VERSION=11 — the helper mirrors
 * any `priority` field into `data.tags` as the canonical `#P[0-4]`
 * hashtag so getNodePriority() can resolve it.
 *
 * As of `@km/all/L5-deprecation-purge` Phase 1, ref filters
 * (`@person` / `#tag` / `+project` / `priority:Px`) execute via the
 * `links` table — not `data.{mentions,tags,projects}` JSON. The helper
 * therefore also derives link rows from the seeded JSON sidecars
 * (`data.mentions[]` → `km:@<v>`, `data.tags[]` → `km:%23<v>`,
 * `data.projects[]` → `km:+<v>`) plus from any `priority` field, so
 * existing tests that seed via `data: { ... }` continue to find rows.
 */
export function seedTestData(db: Database, nodes: TestNode[]): void {
  const now = Date.now()
  const stmt = db.prepare(`
    INSERT INTO nodes (
      id, type, item, fstype, name, task_status, task_marker, content,
      fs_path, due_at, start_at, data,
      created_at, updated_at, version, parent_idx
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const linkStmt = db.prepare(`INSERT INTO links (host_id, href, rel) VALUES (?, ?, ?)`)

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!
    // Mirror priority into data.tags so getNodePriority() resolves it.
    let dataStr = n.data ?? "{}"
    if (n.priority) {
      const dataObj = JSON.parse(dataStr) as Record<string, unknown>
      const tags = (dataObj.tags as string[] | undefined) ?? []
      if (!tags.some((t) => /^P[0-4]$/i.test(t))) {
        dataObj.tags = [...tags, n.priority]
        dataStr = JSON.stringify(dataObj)
      }
    }
    stmt.run(
      n.id,
      n.type,
      n.item ? 1 : 0,
      n.fstype ?? null,
      n.name ?? null,
      n.item?.task?.status ?? null,
      n.item?.task?.marker ?? null,
      n.content,
      n.fs_path ?? null,
      n.due_at ?? null,
      n.start_at ?? null,
      dataStr,
      now,
      now,
      `v${i + 1}`,
      i,
    )

    // Derive link rows from the canonicalized data JSON so ref-filter
    // queries (which now read the `links` table) match the seeded refs.
    const dataObj = JSON.parse(dataStr) as Record<string, unknown>
    const seen = new Set<string>()
    const emit = (href: string): void => {
      if (seen.has(href)) return
      seen.add(href)
      linkStmt.run(n.id, href, "link")
    }
    const mentions = dataObj.mentions
    if (Array.isArray(mentions)) for (const v of mentions) if (typeof v === "string") emit(`km:@${v}`)
    const tags = dataObj.tags
    if (Array.isArray(tags)) for (const v of tags) if (typeof v === "string") emit(`km:%23${v}`)
    const projects = dataObj.projects
    if (Array.isArray(projects)) for (const v of projects) if (typeof v === "string") emit(`km:+${v}`)
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
