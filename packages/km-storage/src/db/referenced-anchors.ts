/**
 * Referenced Anchors (inbound) — DB Reads + Writes
 *
 * The INBOUND counterpart to `collapsed-file-links.ts`. Stores the subset of
 * anchors INSIDE collapsed files that are actually referenced by some other
 * file in the vault, so links like `[[chat-X#turn-5]]` can be resolved
 * without fully parsing chat-X.
 *
 * See schema comment in db/schema.ts and the bead
 * km-storage.collapsed-file-anchors for design rationale.
 */

import type { Database } from "bun:sqlite"
import type { ExtractedAnchor } from "../markdown/extract-anchors.ts"

// ============================================================================
// TYPES
// ============================================================================

export interface ReferencedAnchorRow {
  id: number
  file_id: string
  anchor: string
  source_offset: number
  heading_level: number | null
  ref_count: number
  created_at: number
}

/**
 * One extracted+counted anchor, ready to be inserted. The `ref_count` is
 * the caller-supplied multiplicity — i.e. how many inbound references hit
 * this exact (file_id, anchor) tuple at the time of extraction.
 */
export interface ReferencedAnchorInsert {
  anchor: string
  source_offset: number
  heading_level: number | null
  ref_count: number
}

// ============================================================================
// WRITES
// ============================================================================

/**
 * Insert a set of referenced anchors for a single collapsed file.
 *
 * Delete-then-insert is the write protocol — callers must call
 * `removeReferencedAnchors(db, fileId)` first when replacing existing rows
 * for a file. The UNIQUE (file_id, anchor) index would otherwise conflict.
 */
export function addReferencedAnchors(
  db: Database,
  fileId: string,
  anchors: readonly ReferencedAnchorInsert[],
  now: number = Date.now(),
): void {
  if (anchors.length === 0) return
  const stmt = db.prepare(
    `INSERT INTO referenced_anchors
       (file_id, anchor, source_offset, heading_level, ref_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
  for (const a of anchors) {
    stmt.run(fileId, a.anchor, a.source_offset, a.heading_level, a.ref_count, now)
  }
}

/**
 * Remove all referenced-anchor rows for a file. Called before re-extracting
 * on file-content change, and called unconditionally when a file is promoted
 * out of collapse-parse (so the parsed-node lookup becomes the sole source
 * of anchor resolution for that host).
 */
export function removeReferencedAnchors(db: Database, fileId: string): void {
  db.run("DELETE FROM referenced_anchors WHERE file_id = ?", [fileId])
}

// ============================================================================
// READS
// ============================================================================

/**
 * Look up one specific `(file_id, anchor)` row, or null if absent. Used by
 * `resolveAnchor` during link resolution.
 */
export function getReferencedAnchor(db: Database, fileId: string, anchor: string): ReferencedAnchorRow | null {
  const row = db
    .query(
      "SELECT id, file_id, anchor, source_offset, heading_level, ref_count, created_at " +
        "FROM referenced_anchors WHERE file_id = ? AND anchor = ?",
    )
    .get(fileId, anchor) as Record<string, unknown> | null
  return row ? rowToAnchor(row) : null
}

/**
 * All referenced anchors for a file (useful for tests and diagnostic tools).
 */
export function getReferencedAnchorsForFile(db: Database, fileId: string): ReferencedAnchorRow[] {
  const rows = db
    .query(
      "SELECT id, file_id, anchor, source_offset, heading_level, ref_count, created_at " +
        "FROM referenced_anchors WHERE file_id = ? ORDER BY source_offset",
    )
    .all(fileId) as Array<Record<string, unknown>>
  return rows.map(rowToAnchor)
}

/**
 * Count of referenced-anchor rows across the DB. Used by diagnostic scripts
 * (hub/km/vault-diagnostic-*) to report the pruning ratio vs total headings.
 */
export function countReferencedAnchors(db: Database): number {
  const row = db.query("SELECT COUNT(*) AS cnt FROM referenced_anchors").get() as { cnt: number } | null
  return row?.cnt ?? 0
}

// ============================================================================
// HELPERS
// ============================================================================

function rowToAnchor(row: Record<string, unknown>): ReferencedAnchorRow {
  return {
    id: row.id as number,
    file_id: row.file_id as string,
    anchor: row.anchor as string,
    source_offset: row.source_offset as number,
    heading_level: (row.heading_level as number | null) ?? null,
    ref_count: row.ref_count as number,
    created_at: row.created_at as number,
  }
}

/**
 * Coordinate an `ExtractedAnchor` (from extract-anchors.ts) with a ref_count
 * supplied by the caller (the two-pass discovery aggregates inbound
 * references first, then calls the extractor on each collapsed file).
 */
export function toReferencedAnchorInsert(extracted: ExtractedAnchor, refCount: number): ReferencedAnchorInsert {
  return {
    anchor: extracted.anchor,
    source_offset: extracted.offset,
    heading_level: extracted.headingLevel ?? null,
    ref_count: refCount,
  }
}
