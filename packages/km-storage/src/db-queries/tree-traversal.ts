/**
 * Tree Traversal Queries
 *
 * Operations for traversing the node tree: children, subtrees, ancestors.
 */

import type { KNode } from "@km/core";
import { getDb } from "../db-instance.ts";
import { rowToNode } from "./utils.ts";

// =============================================================================
// Tree Queries
// =============================================================================

/**
 * Get count of children for a node (cheap COUNT query for lazy loading)
 */
export function getChildCount(parentId: string | null): number {
  const db = getDb();

  if (parentId === null) {
    const result = db
      .query("SELECT COUNT(*) as count FROM nodes WHERE parent_id IS NULL")
      .get() as { count: number } | null;
    return result?.count ?? 0;
  }

  const result = db
    .query("SELECT COUNT(*) as count FROM nodes WHERE parent_id = ?")
    .get(parentId) as { count: number } | null;
  return result?.count ?? 0;
}

/**
 * Get child counts for multiple nodes in a single query.
 * Returns a Map of parentId → count.
 * This is much more efficient than calling getChildCount() N times.
 */
export function getChildCountsBatch(parentIds: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  if (parentIds.length === 0) return counts;

  const db = getDb();

  // SQLite doesn't have native array parameters, so we build a query with placeholders
  const placeholders = parentIds.map(() => "?").join(",");
  const rows = db
    .query(
      `SELECT parent_id, COUNT(*) as count FROM nodes WHERE parent_id IN (${placeholders}) GROUP BY parent_id`,
    )
    .all(...parentIds) as Array<{ parent_id: string; count: number }>;

  for (const row of rows) {
    counts.set(row.parent_id, row.count);
  }

  // Set 0 for any parentIds not in results (nodes with no children)
  for (const id of parentIds) {
    if (!counts.has(id)) {
      counts.set(id, 0);
    }
  }

  return counts;
}

/**
 * Get children of a node
 */
export function getChildren(parentId: string | null): KNode[] {
  const db = getDb();

  let rows: Record<string, unknown>[];
  if (parentId === null) {
    rows = db
      .query(
        `
      SELECT * FROM nodes
      WHERE parent_id IS NULL
      ORDER BY parent_idx, created_at
    `,
      )
      .all() as Record<string, unknown>[];
  } else {
    rows = db
      .query(
        `
      SELECT * FROM nodes
      WHERE parent_id = ?
      ORDER BY parent_idx, created_at
    `,
      )
      .all(parentId) as Record<string, unknown>[];
  }

  return rows.map(rowToNode);
}

/**
 * Get subtree (recursive)
 */
export function getSubtree(rootId: string): KNode[] {
  const db = getDb();
  const rows = db
    .query(
      `
    WITH RECURSIVE subtree AS (
      SELECT * FROM nodes WHERE id = ?
      UNION ALL
      SELECT n.* FROM nodes n
      JOIN subtree s ON n.parent_id = s.id
    )
    SELECT * FROM subtree
    ORDER BY parent_idx, created_at
  `,
    )
    .all(rootId) as Record<string, unknown>[];

  return rows.map(rowToNode);
}

/**
 * Get all embed targets that exist anywhere on a board (for deduplication).
 * Returns a Set of node IDs that are already embedded somewhere on the board.
 */
export function getEmbedTargetsOnBoard(
  boardRootId: string | null,
): Set<string> {
  if (!boardRootId) return new Set();

  const db = getDb();
  const result = db
    .query(
      `
    WITH RECURSIVE descendants AS (
      SELECT id FROM nodes WHERE parent_id = ?
      UNION ALL
      SELECT n.id FROM nodes n
      JOIN descendants d ON n.parent_id = d.id
    )
    SELECT link_to FROM nodes
    WHERE id IN (SELECT id FROM descendants)
    AND type = 'embed' AND link_to IS NOT NULL
  `,
    )
    .all(boardRootId) as { link_to: string }[];

  return new Set(result.map((r) => r.link_to));
}

/**
 * Get ancestors of a node (from root to parent)
 * Returns array from root down to immediate parent (excludes the node itself)
 */
export function getAncestors(nodeId: string): KNode[] {
  const db = getDb();
  const rows = db
    .query(
      `
    WITH RECURSIVE ancestors AS (
      SELECT * FROM nodes WHERE id = (SELECT parent_id FROM nodes WHERE id = ?)
      UNION ALL
      SELECT n.* FROM nodes n
      JOIN ancestors a ON n.id = a.parent_id
    )
    SELECT * FROM ancestors
  `,
    )
    .all(nodeId) as Record<string, unknown>[];

  // Results come in child-to-root order, reverse to get root-to-parent
  return rows.map(rowToNode).reverse();
}
