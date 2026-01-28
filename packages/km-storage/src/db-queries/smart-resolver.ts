/**
 * Smart Resolver Queries
 *
 * Intelligent node resolution that tries multiple strategies:
 * ID matching, path matching, filename matching, content matching.
 */

import createDebug from "debug"
import type { Database } from "bun:sqlite"
import type { KNode } from "@km/core"
import { resolve } from "path"
import { isExplicitPath } from "../path-utils.ts"
import { rowToNode } from "./utils.ts"

const debug = createDebug("km:storage:db:queries")

// =============================================================================
// Smart Node Resolution
// =============================================================================

interface ResolveOptions {
  /** Filter by node type (e.g., "task", "file") */
  type?: string
  /** Only return nodes with task_status set */
  taskOnly?: boolean
}

/**
 * Smart node resolver - finds a node by various identifiers.
 *
 * Resolution order:
 * 1. Exact ID match
 * 2. ID prefix match (e.g., "abc" matches "abc123...")
 * 3. ID suffix match (e.g., "xyz" matches "...xyz")
 * 4. Exact filesystem path match
 * 5. Filename match (fs_path ends with query)
 * 6. Filename without extension (e.g., "@inbox" matches "@inbox.md")
 * 7. Content/title match (for nodes without fs_path)
 *
 * @param db - Database instance
 * @param query - ID, path, or filename to search for
 * @param typeOrOptions - Optional type filter string or options object
 * @returns The matching node, or null if not found
 */
export function resolveNode(
  db: Database,
  query: string,
  typeOrOptions?: string | ResolveOptions,
): KNode | null {
  // Support both old signature (type string) and new signature (options object)
  const options: ResolveOptions =
    typeof typeOrOptions === "string"
      ? { type: typeOrOptions }
      : (typeOrOptions ?? {})

  const { type, taskOnly } = options
  debug(
    "resolveNode: %s (type=%s, taskOnly=%s)",
    query,
    type ?? "any",
    taskOnly ?? false,
  )

  // Build filter conditions
  const filters: string[] = []
  const params: (string | number)[] = []

  if (type) {
    filters.push("type = ?")
    params.push(type)
  }
  if (taskOnly) {
    filters.push("task_status IS NOT NULL")
  }

  const filterClause = filters.length > 0 ? " AND " + filters.join(" AND ") : ""

  // 0. Handle explicit filesystem paths (/, ./, ../)
  // Note: ~ is expanded by the shell before reaching this code
  if (isExplicitPath(query)) {
    const absolutePath = resolve(process.cwd(), query)
    // Try exact absolute path match first
    let row = db
      .query(`SELECT * FROM nodes WHERE fs_path = ?${filterClause}`)
      .get(absolutePath, ...params) as Record<string, unknown> | null
    if (row) return rowToNode(row)

    // For directory paths, try finding the corresponding .md file
    // e.g., /repo/Projects → /repo/Projects.md or /repo/Projects/index.md
    if (!absolutePath.endsWith(".md")) {
      // Try sibling .md file (Projects → Projects.md)
      row = db
        .query(`SELECT * FROM nodes WHERE fs_path = ?${filterClause}`)
        .get(`${absolutePath}.md`, ...params) as Record<string, unknown> | null
      if (row) return rowToNode(row)

      // Try index.md inside the directory
      row = db
        .query(`SELECT * FROM nodes WHERE fs_path = ?${filterClause}`)
        .get(`${absolutePath}/index.md`, ...params) as Record<
        string,
        unknown
      > | null
      if (row) return rowToNode(row)
    }

    // Also try matching by filename suffix (handles relative paths in DB)
    // When DB stores "board.md" but query is "/tmp/repo/board.md"
    row = db
      .query(`SELECT * FROM nodes WHERE fs_path LIKE ?${filterClause}`)
      .get(`%${absolutePath.split("/").pop()}`, ...params) as Record<
      string,
      unknown
    > | null
    if (row) return rowToNode(row)

    // Check if this path is the repo root folder node
    // Repo root is identified by: parent_id IS NULL AND type = 'folder'
    row = db
      .query(
        `SELECT * FROM nodes WHERE fs_path = ? AND parent_id IS NULL AND type = 'folder'${filterClause}`,
      )
      .get(absolutePath, ...params) as Record<string, unknown> | null
    if (row) return rowToNode(row)

    // Don't fall through for explicit paths - they should match exactly or not at all
    // This prevents /some/path from accidentally matching an ID suffix
    return null
  }

  // 1. Exact ID match
  let row = db
    .query(`SELECT * FROM nodes WHERE id = ?${filterClause}`)
    .get(query, ...params) as Record<string, unknown> | null
  if (row) return rowToNode(row)

  // 2. ID prefix match
  row = db
    .query(`SELECT * FROM nodes WHERE id LIKE ?${filterClause}`)
    .get(`${query}%`, ...params) as Record<string, unknown> | null
  if (row) return rowToNode(row)

  // 3. ID suffix match (for short IDs like the last 8 chars)
  row = db
    .query(`SELECT * FROM nodes WHERE id LIKE ?${filterClause}`)
    .get(`%${query}`, ...params) as Record<string, unknown> | null
  if (row) return rowToNode(row)

  // 4. Exact filesystem path match
  row = db
    .query(`SELECT * FROM nodes WHERE fs_path = ?${filterClause}`)
    .get(query, ...params) as Record<string, unknown> | null
  if (row) return rowToNode(row)

  // 5. Filename match (fs_path ends with the query)
  // This handles cases like "@inbox.md" when full path is "/path/to/@inbox.md"
  row = db
    .query(`SELECT * FROM nodes WHERE fs_path LIKE ?${filterClause}`)
    .get(`%/${query}`, ...params) as Record<string, unknown> | null
  if (row) return rowToNode(row)

  // Also try without leading slash (handles bare filenames)
  row = db
    .query(`SELECT * FROM nodes WHERE fs_path LIKE ?${filterClause}`)
    .get(`%${query}`, ...params) as Record<string, unknown> | null
  if (row) return rowToNode(row)

  // 6. Filename without extension (e.g., "@inbox" matches "@inbox.md")
  if (!query.includes(".")) {
    row = db
      .query(`SELECT * FROM nodes WHERE fs_path LIKE ?${filterClause}`)
      .get(`%/${query}.md`, ...params) as Record<string, unknown> | null
    if (row) return rowToNode(row)

    row = db
      .query(`SELECT * FROM nodes WHERE fs_path LIKE ?${filterClause}`)
      .get(`%${query}.md`, ...params) as Record<string, unknown> | null
    if (row) return rowToNode(row)
  }

  // 7. Content/title match (exact match on content field)
  row = db
    .query(`SELECT * FROM nodes WHERE content = ?${filterClause}`)
    .get(query, ...params) as Record<string, unknown> | null
  if (row) {
    debug("resolveNode: matched by content")
    return rowToNode(row)
  }

  debug("resolveNode: no match found")
  return null
}

/**
 * Smart task resolver - like resolveNode but only returns nodes with task_status.
 * A "task" is any node with task_status set, regardless of structural type.
 *
 * @param db - Database instance
 * @param query - ID, path, or filename to search for
 * @returns The matching task node, or null if not found
 */
export function resolveTask(db: Database, query: string): KNode | null {
  // Use resolveNode with taskOnly filter to ensure we match nodes with task_status
  return resolveNode(db, query, { taskOnly: true })
}
