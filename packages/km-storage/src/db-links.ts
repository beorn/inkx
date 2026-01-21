/**
 * Database Links - Link management for wikilinks
 *
 * This module handles all link-related operations:
 * - Adding/removing links
 * - Querying outgoing links (forward links)
 * - Querying incoming links (backlinks)
 * - Resolving unresolved links
 */

import createDebug from "debug";
import { getDb } from "./db-instance.ts";

const debug = createDebug("km:storage:db:links");

// =============================================================================
// Types
// =============================================================================

/**
 * Link record for wikilinks
 */
export interface Link {
  source_id: string;
  target_name: string;
  target_id: string | null;
  section: string | null;
  block_id: string | null;
  alias: string | null;
  embedded: boolean;
  created_at: number;
}

// =============================================================================
// Write Operations
// =============================================================================

/**
 * Add a link from source to target
 */
export function addLink(link: Omit<Link, "created_at">): void {
  debug("addLink: %s → %s", link.source_id, link.target_name);
  const db = getDb();
  db.run(
    `
    INSERT OR REPLACE INTO links (source_id, target_name, target_id, section, block_id, alias, embedded, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [
      link.source_id,
      link.target_name,
      link.target_id,
      link.section,
      link.block_id,
      link.alias,
      link.embedded ? 1 : 0,
      Date.now(),
    ],
  );
}

/**
 * Remove all links from a source node
 */
export function removeLinksFromSource(sourceId: string): void {
  debug("removeLinksFromSource: %s", sourceId);
  const db = getDb();
  db.run("DELETE FROM links WHERE source_id = ?", [sourceId]);
}

/**
 * Resolve unresolved links to a target node
 * Call this when a new node is created that might match pending links
 */
export function resolveLinks(targetId: string, targetName: string): number {
  const db = getDb();
  const normalizedName = targetName.toLowerCase().replace(/\.md$/, "");
  const result = db.run(
    `
    UPDATE links
    SET target_id = ?
    WHERE target_id IS NULL
    AND LOWER(REPLACE(target_name, '.md', '')) = ?
  `,
    [targetId, normalizedName],
  );
  debug("resolveLinks: %s (%s) → %d resolved", targetName, targetId, result.changes);
  return result.changes;
}

// =============================================================================
// Read Operations
// =============================================================================

/**
 * Get outgoing links from a node (forward links)
 */
export function getOutgoingLinks(sourceId: string): Link[] {
  const db = getDb();
  const rows = db
    .query("SELECT * FROM links WHERE source_id = ?")
    .all(sourceId) as Array<Record<string, unknown>>;

  return rows.map(rowToLink);
}

/**
 * Get incoming links to a node (backlinks)
 */
export function getBacklinks(targetId: string): Link[] {
  const db = getDb();
  const rows = db
    .query("SELECT * FROM links WHERE target_id = ?")
    .all(targetId) as Array<Record<string, unknown>>;

  return rows.map(rowToLink);
}

/**
 * Get backlinks by target name (for unresolved links)
 */
export function getBacklinksByName(targetName: string): Link[] {
  const db = getDb();
  // Match by name (case-insensitive, with or without .md extension)
  const normalizedName = targetName.toLowerCase().replace(/\.md$/, "");
  const rows = db
    .query(
      `
    SELECT * FROM links
    WHERE LOWER(REPLACE(target_name, '.md', '')) = ?
  `,
    )
    .all(normalizedName) as Array<Record<string, unknown>>;

  return rows.map(rowToLink);
}

// =============================================================================
// Row Conversion
// =============================================================================

/**
 * Convert database row to Link object
 */
function rowToLink(row: Record<string, unknown>): Link {
  return {
    source_id: row.source_id as string,
    target_name: row.target_name as string,
    target_id: row.target_id as string | null,
    section: row.section as string | null,
    block_id: row.block_id as string | null,
    alias: row.alias as string | null,
    embedded: Boolean(row.embedded),
    created_at: row.created_at as number,
  };
}
