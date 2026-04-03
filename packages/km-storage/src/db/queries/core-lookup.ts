/**
 * Core Lookup Queries
 *
 * Basic node lookup operations by ID, path, and content hash.
 */

import type { Database } from "bun:sqlite"
import type { KNode } from "@km/core"
import { rowToNode } from "./utils.ts"

// =============================================================================
// Core Queries
// =============================================================================

/**
 * Get a node by ID
 */
export function getNode(db: Database, id: string): KNode | null {
  const row = db.query("SELECT * FROM nodes WHERE id = ?").get(id) as Record<string, unknown> | null

  if (!row) return null
  return rowToNode(row)
}

interface LookupOptions {
  /** Filter by node type (e.g., 'p', 'h') */
  type?: string
  /** Only return nodes with task_status set */
  taskOnly?: boolean
}

/**
 * Get a node by ID prefix or suffix with optional filters.
 *
 * Supports both prefix matching (start of ID) and suffix matching (end of ID).
 * The CLI displays short IDs using the last 8 chars (suffix), so we try both.
 *
 * Returns null when a prefix/suffix matches multiple nodes (ambiguous).
 *
 * @param idPrefix - The ID or partial ID to search for
 * @param options - Optional filters (type or taskOnly)
 */
function getNodeByIdPrefixWithOptions(db: Database, idPrefix: string, options?: LookupOptions): KNode | null {
  const { type, taskOnly } = options ?? {}

  // Build filter clause
  const filters: string[] = []
  const filterParams: string[] = []

  if (type) {
    filters.push("type = ?")
    filterParams.push(type)
  }
  if (taskOnly) {
    filters.push("task_status IS NOT NULL")
  }

  const filterClause = filters.length > 0 ? " AND " + filters.join(" AND ") : ""

  // Try exact match first (unambiguous by definition)
  const exactRow = db.query(`SELECT * FROM nodes WHERE id = ?${filterClause}`).get(idPrefix, ...filterParams) as Record<
    string,
    unknown
  > | null

  if (exactRow) return rowToNode(exactRow)

  // Try prefix match (ID starts with input) — return null if ambiguous
  const prefixRows = db
    .query(`SELECT * FROM nodes WHERE id LIKE ?${filterClause} LIMIT 2`)
    .all(`${idPrefix}%`, ...filterParams) as Record<string, unknown>[]

  if (prefixRows.length === 1 && prefixRows[0]) return rowToNode(prefixRows[0])

  // Try suffix match (ID ends with input) — return null if ambiguous
  // Used for short IDs displayed as last 8 chars
  const suffixRows = db
    .query(`SELECT * FROM nodes WHERE id LIKE ?${filterClause} LIMIT 2`)
    .all(`%${idPrefix}`, ...filterParams) as Record<string, unknown>[]

  if (suffixRows.length === 1 && suffixRows[0]) return rowToNode(suffixRows[0])

  return null
}

/**
 * Get a node by ID prefix or suffix (for CLI convenience)
 */
export function getNodeByIdPrefix(db: Database, idPrefix: string): KNode | null {
  return getNodeByIdPrefixWithOptions(db, idPrefix)
}

/**
 * Get a task by ID prefix or suffix (for CLI convenience)
 * A "task" is any node with task_status set, regardless of structural type.
 */
export function getTaskByIdPrefix(db: Database, idPrefix: string): KNode | null {
  return getNodeByIdPrefixWithOptions(db, idPrefix, { taskOnly: true })
}

/**
 * Get multiple nodes by ID in a single query. Returns a Map keyed by node ID.
 * Missing IDs are not included in the result (no null entries).
 */
export function getNodesBatch(db: Database, ids: string[]): Map<string, KNode> {
  const result = new Map<string, KNode>()
  if (ids.length === 0) return result

  const placeholders = ids.map(() => "?").join(",")
  const rows = db.query(`SELECT * FROM nodes WHERE id IN (${placeholders})`).all(...ids) as Record<string, unknown>[]

  for (const row of rows) {
    const node = rowToNode(row)
    result.set(node.id, node)
  }

  return result
}

/**
 * Get a node by filesystem path
 */
export function getNodeByPath(db: Database, fsPath: string): KNode | null {
  const row = db.query("SELECT * FROM nodes WHERE fs_path = ?").get(fsPath) as Record<string, unknown> | null

  if (!row) return null
  return rowToNode(row)
}

/**
 * Get all folder/file nodes under a directory path (for reconciliation)
 */
export function getNodesUnderPath(db: Database, dirPath: string): KNode[] {
  // For repo root ("."), match all file/folder nodes except the root node itself.
  // For subdirectories, use prefix match (e.g., "sub" matches "sub/file.md").
  const query =
    dirPath === "."
      ? `SELECT * FROM nodes WHERE fs_path IS NOT NULL AND id != '.' AND type = 'h' AND item = 1`
      : `SELECT * FROM nodes WHERE (fs_path LIKE ? || '/%' OR fs_path = ?) AND type = 'h' AND item = 1`

  const rows =
    dirPath === "."
      ? (db.query(query).all() as Record<string, unknown>[])
      : (db.query(query).all(dirPath, dirPath) as Record<string, unknown>[])

  return rows.map(rowToNode)
}

/**
 * Get a file node and ALL its descendants (sections, tasks, nested items, etc.)
 * Uses recursive CTE to get the complete subtree.
 */
export function getFileWithChildren(db: Database, fsPath: string): KNode[] {
  const rows = db
    .query(
      `
      WITH RECURSIVE subtree AS (
        -- Base case: the file node
        SELECT * FROM nodes WHERE fs_path = ?
        UNION ALL
        -- Recursive case: children of nodes in subtree
        SELECT n.* FROM nodes n
        INNER JOIN subtree s ON n.parent_id = s.id
      )
      SELECT * FROM subtree
    `,
    )
    .all(fsPath) as Record<string, unknown>[]

  return rows.map(rowToNode)
}

/**
 * Get content hash for a node (for change detection)
 */
export function getNodeContentHash(db: Database, nodeId: string): string | null {
  const row = db.query("SELECT content_hash FROM nodes WHERE id = ?").get(nodeId) as
    | { content_hash: string | null }
    | undefined

  return row?.content_hash ?? null
}
