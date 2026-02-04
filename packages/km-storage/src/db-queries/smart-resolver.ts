/**
 * Smart Resolver Queries
 *
 * Intelligent node resolution with path-first semantics and ambiguity detection.
 *
 * Key distinction:
 * - Paths (contain '/') → resolve uniquely by filesystem path
 * - Names (bare, no '/') → search by name field, may be ambiguous
 */

import { createConditionalLogger } from "@beorn/logger"
import type { Database } from "bun:sqlite"
import type { KNode } from "@km/core"
import { resolve } from "path"
import { realpathSync, existsSync } from "fs"
import { isExplicitPath } from "../path-utils.ts"
import { rowToNode } from "./utils.ts"

const log = createConditionalLogger("km:storage:db:queries")

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

  // Normalize trailing slashes - "docs/" clearly means the docs directory
  const q = query.endsWith("/") ? query.slice(0, -1) : query
  const ctx = createQueryContext(db, q, options)

  log.debug?.(
    `resolveNode: ${q} (type=${options.type ?? "any"}, taskOnly=${options.taskOnly ?? false})`,
  )

  // Try each resolution strategy in order
  if (isExplicitPath(q)) return resolveExplicitPath(ctx)
  if (q.includes("/")) return resolveRelativePath(ctx)

  return (
    resolveBareName(ctx) ??
    resolveIdFuzzy(ctx) ??
    resolveContent(ctx)
  )
}

// =============================================================================
// Query Context - shared state for all resolution strategies
// =============================================================================

interface QueryContext {
  /** Normalized query string */
  q: string
  /** SQL filter clause (e.g., " AND type = ?") */
  filterClause: string
  /** Parameters for the filter clause */
  params: (string | number)[]
  /** Get a single row matching the SQL query */
  getOne(sql: string, ...p: (string | number)[]): KNode | null
  /** Get all rows matching the SQL query */
  getAll(sql: string, ...p: (string | number)[]): KNode[]
  /** Check for ambiguous matches and return the best one */
  checkAmbiguity(matches: KNode[], matchType: string): KNode | null
}

function createQueryContext(
  db: Database,
  q: string,
  options: ResolveOptions,
): QueryContext {
  const filters: string[] = []
  const params: (string | number)[] = []

  if (options.type) {
    filters.push("type = ?")
    params.push(options.type)
  }
  if (options.taskOnly) {
    filters.push("task_status IS NOT NULL")
  }

  const filterClause =
    filters.length > 0 ? " AND " + filters.join(" AND ") : ""

  return {
    q,
    filterClause,
    params,

    getOne(sql, ...p) {
      const row = db.query(sql).get(...p) as Record<string, unknown> | null
      return row ? rowToNode(row) : null
    },

    getAll(sql, ...p) {
      const rows = db.query(sql).all(...p) as Record<string, unknown>[]
      return rows.map(rowToNode)
    },

    checkAmbiguity: (matches, matchType) =>
      checkAmbiguity(matches, matchType, q),
  }
}

// =============================================================================
// Resolution Strategies
// =============================================================================

/** Strategy 1: Explicit filesystem paths (/, ./, ../) */
function resolveExplicitPath(ctx: QueryContext): KNode | null {
  const { q, filterClause, params, getOne } = ctx

  // Resolve to absolute path, then normalize with realpath if file exists
  // This handles symlinks like /tmp -> /private/tmp on macOS
  let absolutePath = resolve(process.cwd(), q)
  if (existsSync(absolutePath)) {
    try {
      absolutePath = realpathSync(absolutePath)
    } catch {
      // Keep original path if realpath fails
    }
  }
  log.debug?.(`resolveNode: explicit path -> ${absolutePath}`)

  // Exact absolute path match
  const node = getOne(
    `SELECT * FROM nodes WHERE fs_path = ?${filterClause}`,
    absolutePath,
    ...params,
  )
  if (node) return node

  // Try .md extension and index.md variants
  if (!absolutePath.endsWith(".md")) {
    return (
      getOne(
        `SELECT * FROM nodes WHERE fs_path = ?${filterClause}`,
        `${absolutePath}.md`,
        ...params,
      ) ??
      getOne(
        `SELECT * FROM nodes WHERE fs_path = ?${filterClause}`,
        `${absolutePath}/index.md`,
        ...params,
      )
    )
  }

  // Don't fall through for explicit paths
  log.debug?.("resolveNode: explicit path not found")
  return null
}

/** Strategy 2: Relative paths (contains /) - unique path resolution */
function resolveRelativePath(ctx: QueryContext): KNode | null {
  const { q, filterClause, params, getOne } = ctx
  log.debug?.("resolveNode: relative path")

  // Try exact fs_path suffix match
  const node = getOne(
    `SELECT * FROM nodes WHERE fs_path LIKE ?${filterClause}`,
    `%/${q}`,
    ...params,
  )
  if (node) return node

  // Try with .md extension
  if (!q.endsWith(".md")) {
    const mdNode = getOne(
      `SELECT * FROM nodes WHERE fs_path LIKE ?${filterClause}`,
      `%/${q}.md`,
      ...params,
    )
    if (mdNode) return mdNode
  }

  // Try exact ID match (IDs can contain / like "docs/readme.md")
  const idNode = getOne(
    `SELECT * FROM nodes WHERE id = ?${filterClause}`,
    q,
    ...params,
  )
  if (idNode) return idNode

  log.debug?.("resolveNode: relative path not found")
  return null
}

/** Strategy 3: Bare names (no /) - name-based search, may be ambiguous */
function resolveBareName(ctx: QueryContext): KNode | null {
  const { q, filterClause, params, getOne, getAll, checkAmbiguity } = ctx
  log.debug?.("resolveNode: bare name search")

  // Exact ID match first (unambiguous)
  const idNode = getOne(
    `SELECT * FROM nodes WHERE id = ?${filterClause}`,
    q,
    ...params,
  )
  if (idNode) {
    log.debug?.("resolveNode: exact ID match")
    return idNode
  }

  // By name field (file/folder names)
  const nameMatch = checkAmbiguity(
    getAll(`SELECT * FROM nodes WHERE name = ?${filterClause}`, q, ...params),
    "name",
  )
  if (nameMatch) return nameMatch

  // By name with .md extension
  const nameMdMatch = checkAmbiguity(
    getAll(
      `SELECT * FROM nodes WHERE name = ?${filterClause}`,
      `${q}.md`,
      ...params,
    ),
    "name+.md",
  )
  if (nameMdMatch) return nameMdMatch

  // fs_path suffix (filename match)
  const suffixMatch = checkAmbiguity(
    getAll(
      `SELECT * FROM nodes WHERE fs_path LIKE ?${filterClause}`,
      `%/${q}`,
      ...params,
    ),
    "fs_path suffix",
  )
  if (suffixMatch) return suffixMatch

  // fs_path suffix with .md extension
  if (!q.endsWith(".md")) {
    const suffixMdMatch = checkAmbiguity(
      getAll(
        `SELECT * FROM nodes WHERE fs_path LIKE ?${filterClause}`,
        `%/${q}.md`,
        ...params,
      ),
      "fs_path suffix+.md",
    )
    if (suffixMdMatch) return suffixMdMatch
  }

  return null
}

/** Strategy 4: Fuzzy ID matching (prefix/suffix) */
function resolveIdFuzzy(ctx: QueryContext): KNode | null {
  const { q, filterClause, params, getAll, checkAmbiguity } = ctx

  // ID prefix match
  const prefixMatch = checkAmbiguity(
    getAll(
      `SELECT * FROM nodes WHERE id LIKE ?${filterClause}`,
      `${q}%`,
      ...params,
    ),
    "ID prefix",
  )
  if (prefixMatch) return prefixMatch

  // ID suffix match
  return checkAmbiguity(
    getAll(
      `SELECT * FROM nodes WHERE id LIKE ?${filterClause}`,
      `%${q}`,
      ...params,
    ),
    "ID suffix",
  )
}

/** Strategy 5: Content/title exact match */
function resolveContent(ctx: QueryContext): KNode | null {
  const { q, filterClause, params, getAll, checkAmbiguity } = ctx

  const node = checkAmbiguity(
    getAll(
      `SELECT * FROM nodes WHERE content = ?${filterClause}`,
      q,
      ...params,
    ),
    "content",
  )
  if (node) return node

  log.debug?.("resolveNode: no match found")
  return null
}

// =============================================================================
// Ambiguity Detection
// =============================================================================

/**
 * Check for ambiguous matches and return the best one.
 *
 * When multiple matches exist, prefer:
 * 1. Folders over files (directory named X beats file X.md inside it)
 * 2. Parent paths over children (inbox/ beats inbox/inbox.md)
 */
function checkAmbiguity(
  matches: KNode[],
  matchType: string,
  q: string,
): KNode | null {
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
      log.debug?.(
        `resolveNode: resolved '${q}' to parent ${best.id} (children: ${sorted
          .slice(1)
          .map((n) => n.id)
          .join(", ")})`,
      )
      return best
    }
  }

  // Truly ambiguous - warn the user
  log.warn?.(
    `Ambiguous resolution for '${q}' - ${matches.length} matches found (using first)`,
    {
      query: q,
      matchType,
      matches: matches.map((n) => n.id),
    },
  )
  return best
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
