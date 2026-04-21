/**
 * Collapsed-File Link Edges
 *
 * Reads + writes for the `collapsed_file_links` table. Mirrors the `links`
 * table's (host_id, href, rel) shape so backlink queries can UNION both.
 *
 * See schema comment in db/schema.ts and the bead km-storage.collapsed-file-links
 * for the design rationale.
 */

import type { Database } from "bun:sqlite"
import type { ExtractedLink } from "../markdown/extract-links.ts"

// ============================================================================
// TYPES
// ============================================================================

export interface CollapsedFileLinkRow {
  host_id: string
  href: string
  rel: "link" | "embed"
  target_path: string
  target_heading: string | null
  link_text: string | null
  link_type: "wiki" | "md" | "mention" | "tag"
  source_offset: number | null
  created_at: number
}

// ============================================================================
// WRITES
// ============================================================================

/**
 * Insert extracted link edges for a collapsed file.
 * Delete-then-insert is the write protocol — callers must call
 * `removeCollapsedFileLinks(db, hostId)` first if replacing existing rows.
 */
export function addCollapsedFileLinks(
  db: Database,
  hostId: string,
  extracted: readonly ExtractedLink[],
  now: number = Date.now(),
): void {
  if (extracted.length === 0) return
  const stmt = db.prepare(
    `INSERT INTO collapsed_file_links
       (host_id, href, rel, target_path, target_heading, link_text, link_type, source_offset, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  for (const link of extracted) {
    stmt.run(
      hostId,
      link.href,
      link.rel,
      link.target,
      link.heading ?? null,
      link.text ?? null,
      link.type,
      link.offset ?? null,
      now,
    )
  }
}

/**
 * Remove all rows for a collapsed file. Called before re-extracting on
 * content change, and called unconditionally when a file is promoted out
 * of collapse-parse (so the parsed-node `links` table becomes the only
 * source of edges for that host).
 */
export function removeCollapsedFileLinks(db: Database, hostId: string): void {
  db.run("DELETE FROM collapsed_file_links WHERE host_id = ?", [hostId])
}

// ============================================================================
// READS
// ============================================================================

/**
 * Fetch rows matching any of the supplied hrefs. Used by the backlink
 * UNION in repo.ts. Returns [] when called with no hrefs.
 */
export function getCollapsedFileBacklinks(db: Database, hrefs: readonly string[]): CollapsedFileLinkRow[] {
  if (hrefs.length === 0) return []
  const placeholders = hrefs.map(() => "?").join(",")
  const rows = db.query(`SELECT * FROM collapsed_file_links WHERE href IN (${placeholders})`).all(...hrefs) as Array<
    Record<string, unknown>
  >
  return rows.map(rowToLink)
}

function rowToLink(row: Record<string, unknown>): CollapsedFileLinkRow {
  return {
    host_id: row.host_id as string,
    href: row.href as string,
    rel: row.rel as "link" | "embed",
    target_path: row.target_path as string,
    target_heading: (row.target_heading as string | null) ?? null,
    link_text: (row.link_text as string | null) ?? null,
    link_type: row.link_type as CollapsedFileLinkRow["link_type"],
    source_offset: (row.source_offset as number | null) ?? null,
    created_at: row.created_at as number,
  }
}
