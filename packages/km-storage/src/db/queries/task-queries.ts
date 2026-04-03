/**
 * Task Queries
 *
 * Operations for querying tasks: by status, filtered, under nodes.
 */

import type { Database } from "bun:sqlite"
import type { KNode, TaskStatus } from "@km/core"
import { rowToNode } from "./utils.ts"

// =============================================================================
// Task Queries
// =============================================================================

/**
 * Get tasks by status
 * A "task" is any node with task_status set, regardless of structural type.
 */
export function getTasksByStatus(db: Database, status: TaskStatus | TaskStatus[]): KNode[] {
  const statuses = Array.isArray(status) ? status : [status]
  const placeholders = statuses.map(() => "?").join(", ")

  const rows = db
    .query(
      `
    SELECT * FROM nodes
    WHERE task_status IN (${placeholders})
    ORDER BY priority ASC, due_at ASC, created_at ASC
  `,
    )
    .all(...statuses) as Record<string, unknown>[]

  return rows.map(rowToNode)
}

/**
 * Get all tasks
 * A "task" is any node with task_status set, regardless of structural type.
 */
export function getAllTasks(db: Database): KNode[] {
  const rows = db
    .query(
      `
    SELECT * FROM nodes
    WHERE task_status IS NOT NULL
    ORDER BY task_status, priority ASC, due_at ASC, created_at ASC
  `,
    )
    .all() as Record<string, unknown>[]

  return rows.map(rowToNode)
}

/**
 * Get all links pointing to a given node
 * Used to find which boards/sections contain a task
 */
export function getLinksTo(db: Database, nodeId: string): KNode[] {
  const rows = db
    .query(
      `
    SELECT * FROM nodes
    WHERE embed_source = ?
    ORDER BY parent_idx ASC
  `,
    )
    .all(nodeId) as Record<string, unknown>[]

  return rows.map(rowToNode)
}

/**
 * Get tasks with optional status filter
 * A "task" is any node with task_status set, regardless of structural type.
 */
export function getTasksFiltered(
  db: Database,
  options: {
    status?: TaskStatus
    excludeDone?: boolean
  },
): KNode[] {
  let sql = "SELECT * FROM nodes WHERE task_status IS NOT NULL"
  const params: string[] = []

  if (options.status) {
    sql += " AND task_status = ?"
    params.push(options.status)
  } else if (options.excludeDone) {
    sql += " AND task_status IN ('todo', 'wip')"
  }

  sql += " ORDER BY priority ASC NULLS LAST, due_at ASC NULLS LAST, created_at DESC"

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[]
  return rows.map(rowToNode)
}

/**
 * Get all tasks under a node (recursive via descendants)
 * A "task" is any node with task_status set, regardless of structural type.
 */
export function getTasksUnderNode(db: Database, rootId: string): KNode[] {
  // Use recursive CTE to get all descendants
  const rows = db
    .query(
      `
    WITH RECURSIVE descendants(id) AS (
      SELECT id FROM nodes WHERE parent_id = ?
      UNION ALL
      SELECT n.id FROM nodes n
      JOIN descendants d ON n.parent_id = d.id
    )
    SELECT * FROM nodes
    WHERE id IN descendants AND task_status IS NOT NULL
    ORDER BY priority ASC NULLS LAST, due_at ASC NULLS LAST, created_at DESC
  `,
    )
    .all(rootId) as Record<string, unknown>[]

  return rows.map(rowToNode)
}

/**
 * Get filtered nodes by type and optional status
 */
export function getFilteredNodes(
  db: Database,
  options: {
    type?: string
    status?: string
    excludeDone?: boolean
  },
): KNode[] {
  let sql = "SELECT * FROM nodes WHERE 1=1"
  const params: string[] = []

  // Filter by type
  if (options.type) {
    sql += " AND type = ?"
    params.push(options.type)
  }

  // Filter by status (for tasks - when filtering by type with task_status)
  if (options.status || options.excludeDone) {
    if (options.status) {
      sql += " AND task_status = ?"
      params.push(options.status)
    } else if (options.excludeDone) {
      sql += " AND (task_status IS NULL OR task_status != 'done')"
    }
  }

  sql += " ORDER BY parent_idx ASC, created_at DESC"

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[]
  return rows.map(rowToNode)
}

/**
 * Find a project/container by name (searches folders, files, sections)
 */
export function findProject(db: Database, name: string): KNode | null {
  const normalizedName = name.toLowerCase()

  // Search by content or fs_path basename
  const rows = db
    .query(
      `
    SELECT * FROM nodes
    WHERE type = 'h' AND item = 1
    AND (
      LOWER(content) = ?
      OR LOWER(content) LIKE ?
      OR fs_path LIKE ?
      OR fs_path LIKE ?
    )
    LIMIT 10
  `,
    )
    .all(normalizedName, `%${normalizedName}%`, `${normalizedName}%`, `%/${normalizedName}%`) as Record<
    string,
    unknown
  >[]

  const nodes = rows.map(rowToNode)

  // Prefer exact match
  for (const node of nodes) {
    if (node.content?.toLowerCase() === normalizedName) {
      return node
    }
    if (node.fs_path?.split("/").pop()?.toLowerCase() === normalizedName) {
      return node
    }
  }

  // Otherwise return first match
  return nodes[0] ?? null
}
