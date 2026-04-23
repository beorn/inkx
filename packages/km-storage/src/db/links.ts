/**
 * Database Links - Link cache (3-column canonical schema).
 *
 * Flipped schema per docs/design/model/klink.md:
 *
 *   (host_id, href, rel)
 *
 * `href` is the canonical parsed locator computed by normalizeLinkHref()
 * from the authored notation. Resolution to a target NodeId happens at
 * runtime via the name index (Map<name, nodeId[]>). There is no target_id
 * column — resolution state is not persisted.
 *
 * See docs/design/model/klink.md for the full model.
 */

import type { Database } from "bun:sqlite"
import { normalizeLinkHref } from "@km/markdown"

// =============================================================================
// Types
// =============================================================================

/** Relation kind — closed enum for v1. */
export type KLinkRel = "link" | "embed"

/**
 * A single link occurrence row in the cache.
 *
 * `host_id` identifies the node that hosts this link in its content.
 * `href` is the canonical target locator (km:Note, km:Note#Section,
 * #Section for self-ref, https://…, mailto:…). Always produced by
 * normalizeLinkHref() — every writer routes through it.
 * `rel` is 'link' for references and 'embed' for transclusions (![[…]]).
 */
export interface KLink {
  host_id: string
  href: string
  rel: KLinkRel
}

// =============================================================================
// Write Operations
// =============================================================================

/**
 * Insert a link-occurrence row.
 *
 * Multiple occurrences of the same href inside the same host are stored as
 * separate rows (see invariant 2 in docs/design/model/klink.md). The partial
 * UNIQUE index `idx_links_embed_one` enforces at most one rel='embed' row
 * per host.
 */
export function addLink(db: Database, link: KLink): void {
  db.run(`INSERT INTO links (host_id, href, rel) VALUES (?, ?, ?)`, [link.host_id, link.href, link.rel])
}

/**
 * Remove all links from a host node. Used during content updates — the
 * write protocol is delete-then-insert inside a transaction, never diff.
 */
export function removeLinksFromSource(db: Database, hostId: string): void {
  db.run("DELETE FROM links WHERE host_id = ?", [hostId])
}

// =============================================================================
// Read Operations
// =============================================================================

/**
 * Get outgoing links from a node (forward links).
 */
export function getOutgoingLinks(db: Database, hostId: string): KLink[] {
  const rows = db.query("SELECT * FROM links WHERE host_id = ?").all(hostId) as Array<Record<string, unknown>>
  return rows.map(rowToLink)
}

/**
 * Get backlinks by canonical href.
 *
 * With runtime resolution, backlinks are found by matching the canonical
 * href of each link row (e.g. `km:Project/Alpha`) rather than a cached
 * `target_id`. Callers responsible for computing the target's href
 * (typically via normalizeLinkHref("wiki", node.name)) before calling.
 *
 * UNIONs parsed-node edges (`links`) with collapsed-file edges
 * (`collapsed_file_links`) so callers get a single unified view. A file
 * matched by the `inactive:` glob list stays opaque but its outgoing
 * edges still surface here via the second leg of the UNION.
 */
export function getBacklinksByHref(db: Database, href: string): KLink[] {
  const rows = db
    .query(
      "SELECT host_id, href, rel FROM links WHERE href = ? " +
        "UNION ALL " +
        "SELECT host_id, href, rel FROM collapsed_file_links WHERE href = ?",
    )
    .all(href, href) as Array<Record<string, unknown>>
  return rows.map(rowToLink)
}

// =============================================================================
// Row Conversion
// =============================================================================

function rowToLink(row: Record<string, unknown>): KLink {
  return {
    host_id: row.host_id as string,
    href: row.href as string,
    rel: row.rel as KLinkRel,
  }
}

// =============================================================================
// Backlink resolution (SQL-only, no DataStore required)
// =============================================================================

/**
 * Compute all plausible target hrefs for a node (used for backlink queries).
 *
 * A node can be reached under multiple hrefs — its primary `name` and, for
 * files, a path-style `km:Project/Alpha` variant. Callers query the links
 * table with all of them so either authored notation surfaces as a backlink.
 */
export function computeHrefsForNode(node: { name?: string | null; fs_path?: string | null }): string[] {
  const hrefs = new Set<string>()
  if (node.name) hrefs.add(normalizeLinkHref("wiki", node.name))
  if (node.fs_path) {
    const stem = node.fs_path.replace(/^\.\//, "").replace(/\.md$/, "")
    if (stem) hrefs.add(normalizeLinkHref("wiki", stem))
  }
  return [...hrefs]
}

/**
 * Lookup a node's (name, fs_path) with a single indexed query. Used by
 * backlink resolution paths that don't have a full DataStore handle —
 * e.g. the reactive layer's `backlinksState`.
 */
function getNodeNameAndPath(db: Database, nodeId: string): { name: string | null; fs_path: string | null } | null {
  const row = db.query("SELECT name, fs_path FROM nodes WHERE id = ?").get(nodeId) as {
    name: string | null
    fs_path: string | null
  } | null
  return row
}

/**
 * Find backlink rows that target the given node (SQL-only version).
 *
 * UNIONs parsed-node edges (`links`) with collapsed-file edges
 * (`collapsed_file_links`) so a single call returns the unified view.
 * Returns an empty array when the node is unknown or has no href-able
 * identity (no name, no fs_path).
 */
export function getBacklinksForNode(db: Database, nodeId: string): KLink[] {
  const node = getNodeNameAndPath(db, nodeId)
  if (!node) return []
  const hrefs = computeHrefsForNode(node)
  if (hrefs.length === 0) return []

  const placeholders = hrefs.map(() => "?").join(",")
  const sql =
    `SELECT host_id, href, rel FROM links WHERE href IN (${placeholders}) ` +
    `UNION ALL ` +
    `SELECT host_id, href, rel FROM collapsed_file_links WHERE href IN (${placeholders})`
  const rows = db.query(sql).all(...hrefs, ...hrefs) as Array<Record<string, unknown>>
  return rows.map(rowToLink)
}
