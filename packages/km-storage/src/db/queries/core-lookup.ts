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
 * Get a node by (fs_dev, fs_ino). Used by the inode-primary reconciliation
 * cascade (Step 1 of hub/km/storage-architecture.md §3.2).
 *
 * When `dev` is provided, matches strictly on (fs_dev, fs_ino) — cross-device
 * inode collisions (same inode on different volumes, e.g., /home vs /Volumes/X)
 * cannot accidentally associate. When `dev` is undefined (FakeFileSystem,
 * stat backends without dev, pre-v5 rows), the lookup falls back to
 * fs_ino alone, matching any DB row with that ino regardless of dev.
 *
 * Returns at most one row; if multiple rows share the same (dev, ino) — which
 * shouldn't happen in a consistent DB but can during mid-migration — returns
 * the first.
 */
export function getNodeByInode(db: Database, dev: number | undefined, ino: number): KNode | null {
  const row =
    dev !== undefined
      ? (db.query("SELECT * FROM nodes WHERE fs_dev = ? AND fs_ino = ? LIMIT 1").get(dev, ino) as Record<
          string,
          unknown
        > | null)
      : (db.query("SELECT * FROM nodes WHERE fs_ino = ? LIMIT 1").get(ino) as Record<string, unknown> | null)

  if (!row) return null
  return rowToNode(row)
}

/**
 * Get a node by (fs_content_hash, parent path prefix). Used by the Step 3
 * cascade fallback (hub/km/storage-architecture.md §3.3) — recovers identity
 * for cross-FS renames + post-git-restore where inode is reassigned and path
 * differs, but content bytes are identical.
 *
 * `parentDirPath` is the repo-relative parent directory of the scanned entry
 * (e.g., `"notes"` for `notes/alpha.md`, or `"."` for repo-root files). The
 * match is restricted to the same parent so a byte-identical file elsewhere
 * in the vault doesn't steal identity.
 *
 * Returns null when no match, or when the single match doesn't satisfy the
 * parent constraint.
 */
export function getNodeByContentHashUnderParent(
  db: Database,
  contentHash: string,
  parentDirPath: string,
): KNode | null {
  const rows = db
    .query(
      `SELECT * FROM nodes
       WHERE fs_content_hash = ?
         AND type = 'h' AND item = 1
         AND fs_path IS NOT NULL
       LIMIT 16`,
    )
    .all(contentHash) as Record<string, unknown>[]

  for (const row of rows) {
    const node = rowToNode(row)
    if (!node.fs_path) continue
    // Match when the DB node's parent directory matches the scanned entry's parent.
    const slash = node.fs_path.lastIndexOf("/")
    const nodeParentDir = slash === -1 ? "." : node.fs_path.slice(0, slash)
    if (nodeParentDir === parentDirPath) return node
  }
  return null
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
