/**
 * Smart Resolver Queries
 *
 * Intelligent node resolution with path-first semantics and ambiguity detection.
 *
 * Key distinction:
 * - Paths (contain '/') → resolve uniquely by filesystem path
 * - Names (bare, no '/') → search by name field, may be ambiguous
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
 * Resolution strategy:
 * 1. Explicit paths (/, ./, ../) → absolute fs_path match
 * 2. Relative paths (contains /) → fs_path suffix match (unique)
 * 3. Bare names (no /) → name-based search (may warn on ambiguity)
 * 4. Fallback: ID match, content match
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
  const options: ResolveOptions =
    typeof typeOrOptions === "string"
      ? { type: typeOrOptions }
      : (typeOrOptions ?? {})

  const { type, taskOnly } = options

  // Normalize trailing slashes - "docs/" clearly means the docs directory
  const q = query.endsWith("/") ? query.slice(0, -1) : query

  debug(
    "resolveNode: %s (type=%s, taskOnly=%s)",
    q,
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

  // Helper to get single result
  const getOne = (sql: string, ...p: (string | number)[]): KNode | null => {
    const row = db.query(sql).get(...p) as Record<string, unknown> | null
    return row ? rowToNode(row) : null
  }

  // Helper to get all results (for ambiguity detection)
  const getAll = (sql: string, ...p: (string | number)[]): KNode[] => {
    const rows = db.query(sql).all(...p) as Record<string, unknown>[]
    return rows.map(rowToNode)
  }

  // Helper to check ambiguity and return best match
  // When multiple matches exist, prefer:
  // 1. Folders over files (directory named X beats file X.md inside it)
  // 2. Parent paths over children (inbox/ beats inbox/inbox.md)
  const checkAmbiguity = (
    matches: KNode[],
    matchType: string,
  ): KNode | null => {
    if (matches.length === 0) return null
    if (matches.length === 1) return matches[0] ?? null

    // Sort matches: folders first, then by path length (shorter = closer to root)
    const sorted = [...matches].sort((a, b) => {
      // Folders before files
      if (a.type === "folder" && b.type !== "folder") return -1
      if (b.type === "folder" && a.type !== "folder") return 1
      // Shorter paths first (parent directories)
      const aPath = a.fs_path ?? ""
      const bPath = b.fs_path ?? ""
      return aPath.length - bPath.length
    })

    const best = sorted[0]
    if (!best) return null

    // Check if the best match is a parent of all others - no ambiguity in that case
    const bestPath = best.fs_path
    if (bestPath) {
      const isParentOfAll = sorted.slice(1).every((m) => {
        const mPath = m.fs_path
        return mPath?.startsWith(bestPath + "/")
      })
      if (isParentOfAll) {
        debug(
          "resolveNode: resolved '%s' to parent %s (children: %s)",
          q,
          best.id,
          sorted
            .slice(1)
            .map((n) => n.id)
            .join(", "),
        )
        return best
      }
    }

    // Truly ambiguous - warn the user
    debug(
      "resolveNode: AMBIGUOUS - %d matches for '%s' by %s: %s",
      matches.length,
      q,
      matchType,
      matches.map((n) => n.id).join(", "),
    )
    console.warn(
      `Warning: Ambiguous resolution for '${q}' - ${matches.length} matches found (using first)`,
    )
    return best
  }

  // ==========================================================================
  // 1. Explicit filesystem paths (/, ./, ../)
  // ==========================================================================
  if (isExplicitPath(q)) {
    const absolutePath = resolve(process.cwd(), q)
    debug("resolveNode: explicit path → %s", absolutePath)

    // Exact absolute path match
    let node = getOne(
      `SELECT * FROM nodes WHERE fs_path = ?${filterClause}`,
      absolutePath,
      ...params,
    )
    if (node) return node

    // Try .md extension
    if (!absolutePath.endsWith(".md")) {
      node = getOne(
        `SELECT * FROM nodes WHERE fs_path = ?${filterClause}`,
        `${absolutePath}.md`,
        ...params,
      )
      if (node) return node

      // Try index.md inside directory
      node = getOne(
        `SELECT * FROM nodes WHERE fs_path = ?${filterClause}`,
        `${absolutePath}/index.md`,
        ...params,
      )
      if (node) return node
    }

    // Don't fall through for explicit paths
    debug("resolveNode: explicit path not found")
    return null
  }

  // ==========================================================================
  // 2. Relative paths (contains /) → unique path resolution
  // ==========================================================================
  if (q.includes("/")) {
    debug("resolveNode: relative path")

    // Try exact fs_path suffix match
    let node = getOne(
      `SELECT * FROM nodes WHERE fs_path LIKE ?${filterClause}`,
      `%/${q}`,
      ...params,
    )
    if (node) return node

    // Try with .md extension
    if (!q.endsWith(".md")) {
      node = getOne(
        `SELECT * FROM nodes WHERE fs_path LIKE ?${filterClause}`,
        `%/${q}.md`,
        ...params,
      )
      if (node) return node
    }

    // Try exact ID match (IDs can contain / like "docs/readme.md")
    node = getOne(
      `SELECT * FROM nodes WHERE id = ?${filterClause}`,
      q,
      ...params,
    )
    if (node) return node

    debug("resolveNode: relative path not found")
    return null
  }

  // ==========================================================================
  // 3. Bare names (no /) → name-based search, may be ambiguous
  // ==========================================================================
  debug("resolveNode: bare name search")

  // 3a. Try exact ID match first (unambiguous)
  let node = getOne(
    `SELECT * FROM nodes WHERE id = ?${filterClause}`,
    q,
    ...params,
  )
  if (node) {
    debug("resolveNode: exact ID match")
    return node
  }

  // 3b. Try by name field (file/folder names)
  const nameMatches = getAll(
    `SELECT * FROM nodes WHERE name = ?${filterClause}`,
    q,
    ...params,
  )
  node = checkAmbiguity(nameMatches, "name")
  if (node) return node

  // 3c. Try by name with .md extension stripped
  const nameMdMatches = getAll(
    `SELECT * FROM nodes WHERE name = ?${filterClause}`,
    `${q}.md`,
    ...params,
  )
  node = checkAmbiguity(nameMdMatches, "name+.md")
  if (node) return node

  // 3d. Try fs_path suffix (filename match)
  const pathSuffixMatches = getAll(
    `SELECT * FROM nodes WHERE fs_path LIKE ?${filterClause}`,
    `%/${q}`,
    ...params,
  )
  node = checkAmbiguity(pathSuffixMatches, "fs_path suffix")
  if (node) return node

  // 3e. Try fs_path suffix with .md extension
  if (!q.endsWith(".md")) {
    const pathSuffixMdMatches = getAll(
      `SELECT * FROM nodes WHERE fs_path LIKE ?${filterClause}`,
      `%/${q}.md`,
      ...params,
    )
    node = checkAmbiguity(pathSuffixMdMatches, "fs_path suffix+.md")
    if (node) return node
  }

  // ==========================================================================
  // 4. Fallback: ID prefix/suffix match (for short IDs)
  // ==========================================================================

  // ID prefix match
  const prefixMatches = getAll(
    `SELECT * FROM nodes WHERE id LIKE ?${filterClause}`,
    `${q}%`,
    ...params,
  )
  node = checkAmbiguity(prefixMatches, "ID prefix")
  if (node) return node

  // ID suffix match
  const suffixMatches = getAll(
    `SELECT * FROM nodes WHERE id LIKE ?${filterClause}`,
    `%${q}`,
    ...params,
  )
  node = checkAmbiguity(suffixMatches, "ID suffix")
  if (node) return node

  // ==========================================================================
  // 5. Content/title match
  // ==========================================================================
  const contentMatches = getAll(
    `SELECT * FROM nodes WHERE content = ?${filterClause}`,
    q,
    ...params,
  )
  node = checkAmbiguity(contentMatches, "content")
  if (node) return node

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
  return resolveNode(db, query, { taskOnly: true })
}
