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
import { updateNode } from "./db-ops.ts";
import { findChildByContent } from "./db-queries.ts";

const debug = createDebug("km:storage:db:links");

// =============================================================================
// Types
// =============================================================================

/**
 * Link record for wikilinks and property-based links
 */
export interface Link {
  source_id: string;
  target_name: string;
  target_id: string | null;
  section: string | null;
  block_id: string | null;
  alias: string | null;
  embedded: boolean;
  /** Property name for property-based links (e.g., "blocked-by"), null for wikilinks */
  relationship: string | null;
  created_at: number;
}

// =============================================================================
// Write Operations
// =============================================================================

/**
 * Add a link from source to target
 */
export function addLink(link: Omit<Link, "created_at">): void {
  debug("addLink", {
    source: link.source_id,
    target: link.target_name,
    relationship: link.relationship ?? "wikilink",
  });
  const db = getDb();
  db.run(
    `
    INSERT OR REPLACE INTO links (source_id, target_name, target_id, section, block_id, alias, embedded, relationship, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [
      link.source_id,
      link.target_name,
      link.target_id,
      link.section,
      link.block_id,
      link.alias,
      link.embedded ? 1 : 0,
      link.relationship,
      Date.now(),
    ],
  );

  // For embedded links, update the source node's link_to field for transclusion
  if (link.embedded && link.target_id) {
    debug("addLink: updating source node link_to for embedding", {
      source: link.source_id,
      target: link.target_id,
    });
    updateNode(link.source_id, {
      link_to: link.target_id,
      link_alias: link.alias ?? undefined,
    });
  }
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
 * Remove links from a source node with a specific relationship type.
 * Used to clear computed links before re-evaluation.
 */
export function removeLinksFromSourceByRelationship(
  sourceId: string,
  relationship: string,
): void {
  debug("removeLinksFromSourceByRelationship", { sourceId, relationship });
  const db = getDb();
  db.run("DELETE FROM links WHERE source_id = ? AND relationship = ?", [
    sourceId,
    relationship,
  ]);
}

/**
 * Resolve unresolved links to a target node
 * Call this when a new node is created that might match pending links
 */
export function resolveLinks(targetId: string, targetName: string): number {
  const db = getDb();
  const normalizedName = targetName.toLowerCase().replace(/\.md$/, "");

  // Find all unresolved links that match this target name
  const unresolvedLinks = db
    .query(
      `
    SELECT source_id, section, alias, embedded FROM links
    WHERE target_id IS NULL
    AND LOWER(REPLACE(target_name, '.md', '')) = ?
  `,
    )
    .all(normalizedName) as Array<{
    source_id: string;
    section: string | null;
    alias: string | null;
    embedded: number;
  }>;

  let resolvedCount = 0;

  for (const link of unresolvedLinks) {
    // Determine the actual target: if there's a section, try to find the child
    let actualTargetId = targetId;
    if (link.section) {
      const childNode = findChildByContent(targetId, link.section);
      if (childNode) {
        actualTargetId = childNode.id;
        debug("resolveLinks: resolved section to child", {
          section: link.section,
          childId: childNode.id,
        });
      }
    }

    // Update this specific link
    db.run(
      `
      UPDATE links
      SET target_id = ?
      WHERE source_id = ?
      AND target_id IS NULL
      AND LOWER(REPLACE(target_name, '.md', '')) = ?
    `,
      [actualTargetId, link.source_id, normalizedName],
    );
    resolvedCount++;

    // For embedded links, update the source node's link_to
    if (link.embedded) {
      debug("resolveLinks: updating source node link_to for embedding", {
        source: link.source_id,
        target: actualTargetId,
      });
      updateNode(link.source_id, {
        link_to: actualTargetId,
        link_alias: link.alias ?? undefined,
      });
    }
  }

  debug("resolveLinks", { targetName, targetId, resolved: resolvedCount });
  return resolvedCount;
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
    relationship: (row.relationship as string | null) ?? null,
    created_at: row.created_at as number,
  };
}
