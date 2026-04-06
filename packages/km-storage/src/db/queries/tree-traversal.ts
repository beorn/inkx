/**
 * Tree Traversal Queries
 *
 * Operations for traversing the node tree: children, subtrees, ancestors.
 */

import type { Database } from "bun:sqlite"
import type { KNode } from "@km/core"
import { rowToNode } from "./utils.ts"

// =============================================================================
// Tree Queries
// =============================================================================

/**
 * Get count of children for a node (cheap COUNT query for lazy loading)
 */
export function getChildCount(db: Database, parentId: string | null): number {
  const pid = parentId ?? "."
  const result = db.query("SELECT COUNT(*) as count FROM nodes WHERE parent_id = ?").get(pid) as {
    count: number
  } | null
  return result?.count ?? 0
}

/**
 * Get child counts for multiple nodes in a single query.
 * Returns a Map of parentId → count.
 * This is much more efficient than calling getChildCount() N times.
 */
export function getChildCountsBatch(db: Database, parentIds: string[]): Map<string, number> {
  const counts = new Map<string, number>()
  if (parentIds.length === 0) return counts

  // SQLite doesn't have native array parameters, so we build a query with placeholders
  const placeholders = parentIds.map(() => "?").join(",")
  const rows = db
    .query(`SELECT parent_id, COUNT(*) as count FROM nodes WHERE parent_id IN (${placeholders}) GROUP BY parent_id`)
    .all(...parentIds) as Array<{ parent_id: string; count: number }>

  for (const row of rows) {
    counts.set(row.parent_id, row.count)
  }

  // Set 0 for any parentIds not in results (nodes with no children)
  for (const id of parentIds) {
    if (!counts.has(id)) {
      counts.set(id, 0)
    }
  }

  return counts
}

/**
 * Get children of a node
 */
export function getChildren(db: Database, parentId: string | null): KNode[] {
  const pid = parentId ?? "."
  const rows = db
    .query(
      `
      SELECT * FROM nodes
      WHERE parent_id = ?
      ORDER BY parent_idx, created_at
    `,
    )
    .all(pid) as Record<string, unknown>[]

  return rows.map(rowToNode)
}

/**
 * Get shallow subtree (depth-limited recursive CTE).
 * Returns all nodes within `maxDepth` levels below `rootId`.
 * Depth 0 = root node itself, depth 1 = children, etc.
 * Results are grouped by parent_id for efficient cache warming.
 */
export function getSubtreeShallow(db: Database, rootId: string | null, maxDepth: number): KNode[] {
  const pid = rootId ?? "."
  const rows = db
    .query(
      `
    WITH RECURSIVE subtree AS (
      SELECT *, 0 as depth FROM nodes WHERE ${rootId ? "id = ?" : "parent_id = '.'"}
      UNION ALL
      SELECT n.*, s.depth + 1 FROM nodes n
      JOIN subtree s ON n.parent_id = s.id
      WHERE s.depth < ?
    )
    SELECT * FROM subtree
    ORDER BY parent_id, parent_idx, created_at
  `,
    )
    .all(...(rootId ? [pid, maxDepth] : [maxDepth])) as Record<string, unknown>[]

  return rows.map(rowToNode)
}

/**
 * Get subtree (recursive)
 */
export function getSubtree(db: Database, rootId: string): KNode[] {
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
    .all(rootId) as Record<string, unknown>[]

  return rows.map(rowToNode)
}

/**
 * Get all symlink targets that exist anywhere on a board (for deduplication).
 * Returns a Set of node IDs that are already symlinked somewhere on the board.
 */
export function getSymlinkTargetsOnBoard(db: Database, boardRootId: string | null): Set<string> {
  if (!boardRootId) return new Set()

  const result = db
    .query(
      `
    WITH RECURSIVE descendants AS (
      SELECT id FROM nodes WHERE parent_id = ?
      UNION ALL
      SELECT n.id FROM nodes n
      JOIN descendants d ON n.parent_id = d.id
    )
    SELECT symlink_to AS target FROM nodes
    WHERE id IN (SELECT id FROM descendants)
    AND symlink_to IS NOT NULL
  `,
    )
    .all(boardRootId) as { target: string }[]

  return new Set(result.map((r) => r.target))
}

/**
 * Get all symlink paths on a board in a single query (for deduplication).
 * Returns both exact paths and file-level paths.
 * Replaces the N+1 pattern of getChildren(boardRoot) + getChildren(section) loops.
 */
export function getSymlinkPathsOnBoard(
  db: Database,
  boardRootId: string | null,
): { exactPaths: Set<string>; filePaths: Set<string> } {
  const exactPaths = new Set<string>()
  const filePaths = new Set<string>()
  if (!boardRootId) return { exactPaths, filePaths }

  // Single CTE query: get all symlink nodes under the board root (depth 2: sections + their children)
  const rows = db
    .query(
      `
    SELECT data, content FROM nodes
    WHERE parent_id IN (SELECT id FROM nodes WHERE parent_id = ?)
    AND symlink_to IS NOT NULL
  `,
    )
    .all(boardRootId) as Array<{ data: string | null; content: string | null }>

  for (const row of rows) {
    let path: string | undefined
    if (row.data) {
      try {
        const parsed = JSON.parse(row.data) as Record<string, unknown>
        path = parsed.targetPath as string | undefined
      } catch {
        // ignore malformed JSON
      }
    }
    if (!path && row.content) {
      const match = row.content.match(/!\[\[([^\]]+)\]\]/)
      if (match) path = match[1]
    }
    if (path) {
      exactPaths.add(path)
      const filePart = path.split("#")[0] ?? path
      filePaths.add(filePart)
    }
  }

  return { exactPaths, filePaths }
}

/**
 * Get ancestors of a node (from root to parent).
 * Returns array from root down to immediate parent (excludes the node itself).
 * Filters out the repo root node (is_repo_root) since it's a virtual container.
 */
export function getAncestors(db: Database, nodeId: string): KNode[] {
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
    WHERE json_extract(data, '$.is_repo_root') IS NOT 1
  `,
    )
    .all(nodeId) as Record<string, unknown>[]

  // Results come in child-to-root order, reverse to get root-to-parent
  return rows.map(rowToNode).reverse()
}

// =============================================================================
// Filtered Child Queries
// =============================================================================

/** Block types: content leaf nodes */
const BLOCK_TYPES: ReadonlySet<string> = new Set(["p", "code", "quote", "table", "hr", "html", "math"])

// Items are identified by item=1 trait, not by type (v2 trait-based model)

/**
 * Get children of a node filtered by type.
 * Returns only children whose type is in the given set.
 */
export function getChildrenByType(db: Database, parentId: string | null, types: string[]): KNode[] {
  if (types.length === 0) return []
  const pid = parentId ?? "."
  const placeholders = types.map(() => "?").join(",")
  const rows = db
    .query(
      `
      SELECT * FROM nodes
      WHERE parent_id = ? AND type IN (${placeholders})
      ORDER BY parent_idx, created_at
    `,
    )
    .all(pid, ...types) as Record<string, unknown>[]

  return rows.map(rowToNode)
}

/**
 * Get body children of a node (block-type nodes: p, h, code, quote, table, hr, html, math).
 * Convenience wrapper around getChildrenByType for the common "get body content" pattern.
 */
export function getBodyChildren(db: Database, parentId: string | null): KNode[] {
  return getChildrenByType(db, parentId, [...BLOCK_TYPES])
}

/**
 * Get subitem children of a node (nodes with item=true trait).
 * In v2 trait-based model, items are identified by item=1, not by type.
 */
export function getSubitems(db: Database, parentId: string | null): KNode[] {
  const pid = parentId ?? "."
  const rows = db
    .query(
      `
      SELECT * FROM nodes
      WHERE parent_id = ? AND item = 1
      ORDER BY parent_idx, created_at
    `,
    )
    .all(pid) as Record<string, unknown>[]

  return rows.map(rowToNode)
}
