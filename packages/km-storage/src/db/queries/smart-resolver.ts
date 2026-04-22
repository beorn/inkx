/**
 * Smart Resolver Queries
 *
 * Intelligent node resolution with path-first semantics and ambiguity detection.
 *
 * Key distinction:
 * - Paths (contain '/') → resolve uniquely by filesystem path
 * - Names (bare, no '/') → search by name field, may be ambiguous
 */

import { createLogger } from "loggily"
import type { Database } from "bun:sqlite"
import type { KNode } from "@km/core"
import { resolve } from "path"
import { realpathSync, existsSync } from "fs"
import { isExplicitPath, toRelativeFsPath } from "@km/fs-mount"
import { rowToNode } from "./utils.ts"

const log = createLogger("km:storage:db:queries")

// =============================================================================
// Name Index — in-memory map for O(1) name-based lookups
// =============================================================================

/** Pre-built name → nodeId index for fast wikilink resolution during rendering.
 * Maps lowercase basename (without .md) → nodeId. Ambiguous names (multiple nodes)
 * are stored as null to prevent incorrect resolution. */
let nameIndex: Map<string, string | null> | null = null
let nameIndexDb: WeakRef<Database> | null = null

/** Build or retrieve the name index for the given database. Lazy — built on first access. */
export function getNameIndex(db: Database): Map<string, string | null> {
  // Rebuild if db changed (different instance)
  if (nameIndex && nameIndexDb?.deref() === db) return nameIndex

  const t0 = performance.now()
  const map = new Map<string, string | null>()
  const rows = db
    .query("SELECT id, name, fs_path FROM nodes WHERE name IS NOT NULL OR fs_path IS NOT NULL")
    .all() as Array<{ id: string; name: string | null; fs_path: string | null }>

  for (const row of rows) {
    // Index by name field (lowercased, without .md)
    if (row.name) {
      const key = row.name.toLowerCase().replace(/\.md$/i, "")
      if (map.has(key)) {
        map.set(key, null) // ambiguous — multiple nodes share this name
      } else {
        map.set(key, row.id)
      }
    }
    // Also index by basename from fs_path
    if (row.fs_path) {
      const basename = row.fs_path.split("/").pop()?.replace(/\.md$/i, "")?.toLowerCase()
      if (basename && !map.has(basename)) {
        map.set(basename, row.id)
      }
    }
  }

  log.debug?.(
    `buildNameIndex: ${map.size} entries from ${rows.length} nodes in ${(performance.now() - t0).toFixed(0)}ms`,
  )
  nameIndex = map
  nameIndexDb = new WeakRef(db)
  return map
}

/** Clear the name index (call when DB is mutated) */
export function clearNameIndex(): void {
  nameIndex = null
  nameIndexDb = null
}

/** Fast name-based resolution using pre-built index. O(1) lookup.
 * Returns the node if found by name, null if not found or ambiguous. */
export function resolveByName(db: Database, name: string): KNode | null {
  if (!name?.trim()) return null
  const index = getNameIndex(db)
  const key = name.toLowerCase().replace(/\.md$/i, "")
  const nodeId = index.get(key)
  if (!nodeId) return null // not found or ambiguous
  const row = db.query("SELECT * FROM nodes WHERE id = ?").get(nodeId) as Record<string, unknown> | null
  return row ? rowToNode(row) : null
}

// =============================================================================
// Smart Node Resolution
// =============================================================================

interface ResolveOptions {
  /** Filter by node type (e.g., "h", "p", "code") */
  type?: string
  /** Only return nodes with task_status set */
  taskOnly?: boolean
  /** Repo root path — needed for explicit path resolution (DB stores relative paths) */
  repoRoot?: string
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
// Global resolution cache — automatically invalidated when DB instance changes
let resolveCache = new Map<string, KNode | null>()
let resolveCacheDb: WeakRef<Database> | null = null
export function clearResolveCache(): void {
  resolveCache.clear()
  resolveCacheDb = null
}

export function resolveNode(db: Database, query: string, typeOrOptions?: string | ResolveOptions): KNode | null {
  const options: ResolveOptions = typeof typeOrOptions === "string" ? { type: typeOrOptions } : (typeOrOptions ?? {})

  // Normalize trailing slashes - "docs/" clearly means the docs directory
  let q = query.endsWith("/") ? query.slice(0, -1) : query

  // Strip leaked wikilink syntax (e.g., "target]]" from malformed [[target]])
  q = q.replace(/\]{2,}$/, "").replace(/^\[{2,}/, "")

  // Guard: empty/whitespace queries would match everything via LIKE '%' — bail early
  if (!q?.trim()) return null

  // Invalidate cache if DB instance changed (e.g., different repo in tests)
  if (resolveCacheDb?.deref() !== db) {
    resolveCache = new Map()
    resolveCacheDb = new WeakRef(db)
  }

  // Check global cache (keyed by normalized query + options)
  const cacheKey = options.type || options.taskOnly ? `${q}\0${options.type ?? ""}\0${options.taskOnly ? "1" : ""}` : q
  const cached = resolveCache.get(cacheKey)
  if (cached !== undefined) return cached

  const ctx = createQueryContext(db, q, options)

  const t0 = log.debug ? performance.now() : 0
  log.debug?.(`resolveNode: ${q} (type=${options.type ?? "any"}, taskOnly=${options.taskOnly ?? false})`)

  // Try each resolution strategy in order
  let result: KNode | null = null
  if (isExplicitPath(q)) result = resolveExplicitPath(ctx)
  else if (q.includes("/")) result = resolveRelativePath(ctx)
  else result = resolveBareName(ctx) ?? resolveBlockId(ctx) ?? resolveIdFuzzy(ctx) ?? resolveContent(ctx)

  if (t0) {
    const elapsed = performance.now() - t0
    if (elapsed > 5) log.debug?.(`resolveNode: ${q} took ${elapsed.toFixed(0)}ms ${result ? "→ found" : "→ null"}`)
  }

  resolveCache.set(cacheKey, result)
  return result
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
  /** Repo root path for path conversion (optional) */
  repoRoot?: string
  /** Get a single row matching the SQL query */
  getOne(sql: string, ...p: (string | number)[]): KNode | null
  /** Get all rows matching the SQL query */
  getAll(sql: string, ...p: (string | number)[]): KNode[]
  /** Check for ambiguous matches and return the best one */
  checkAmbiguity(matches: KNode[], matchType: string): KNode | null
}

function createQueryContext(db: Database, q: string, options: ResolveOptions): QueryContext {
  const filters: string[] = []
  const params: (string | number)[] = []

  if (options.type) {
    filters.push("type = ?")
    params.push(options.type)
  }
  if (options.taskOnly) {
    filters.push("task_status IS NOT NULL")
  }

  const filterClause = filters.length > 0 ? " AND " + filters.join(" AND ") : ""

  return {
    q,
    filterClause,
    params,
    repoRoot: options.repoRoot,

    getOne(sql, ...p) {
      const t = log.debug ? performance.now() : 0
      const row = db.query(sql).get(...p) as Record<string, unknown> | null
      if (t) {
        const ms = performance.now() - t
        if (ms > 5) log.debug?.(`  SQL ${ms.toFixed(0)}ms: ${sql.slice(0, 60)}… [${p.slice(0, 2).join(", ")}]`)
      }
      return row ? rowToNode(row) : null
    },

    getAll(sql, ...p) {
      const t = log.debug ? performance.now() : 0
      const rows = db.query(sql).all(...p) as Record<string, unknown>[]
      if (t) {
        const ms = performance.now() - t
        if (ms > 5) {
          log.debug?.(
            `  SQL ${ms.toFixed(0)}ms (${rows.length} rows): ${sql.slice(0, 60)}… [${p.slice(0, 2).join(", ")}]`,
          )
        }
      }
      return rows.map(rowToNode)
    },

    checkAmbiguity: (matches, matchType) => checkAmbiguity(matches, matchType, q),
  }
}

// =============================================================================
// Resolution Strategies
// =============================================================================

/** Try to resolve symlinks via realpathSync. Returns original path on failure. */
function tryRealpath(p: string): string {
  if (!existsSync(p)) return p
  try {
    return realpathSync(p)
  } catch {
    return p
  }
}

/** Strategy 1: Explicit filesystem paths (/, ./, ../) */
function resolveExplicitPath(ctx: QueryContext): KNode | null {
  const { q, filterClause, params, getOne, repoRoot } = ctx

  // Resolve to absolute path, normalizing symlinks (e.g., /tmp → /private/tmp on macOS)
  const absolutePath = tryRealpath(resolve(process.cwd(), q))
  log.debug?.(`resolveNode: explicit path -> ${absolutePath}`)

  // Convert to relative path for DB lookup (DB stores relative paths)
  const resolvedRepoRoot = repoRoot ? tryRealpath(repoRoot) : undefined
  const queryPath = resolvedRepoRoot ? toRelativeFsPath(resolvedRepoRoot, absolutePath) : absolutePath

  // Exact path match
  const node = getOne(`SELECT * FROM nodes WHERE fs_path = ?${filterClause}`, queryPath, ...params)
  if (node) return node

  // Try .md extension and index.md variants
  if (!queryPath.endsWith(".md")) {
    return (
      getOne(`SELECT * FROM nodes WHERE fs_path = ?${filterClause}`, `${queryPath}.md`, ...params) ??
      getOne(`SELECT * FROM nodes WHERE fs_path = ?${filterClause}`, `${queryPath}/index.md`, ...params)
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

  // Try exact fs_path match (relative paths are stored without leading /)
  const exactNode = getOne(`SELECT * FROM nodes WHERE fs_path = ?${filterClause}`, q, ...params)
  if (exactNode) return exactNode

  // Try fs_path suffix match (for nested paths)
  const node = getOne(`SELECT * FROM nodes WHERE fs_path LIKE ?${filterClause}`, `%/${q}`, ...params)
  if (node) return node

  // Try with .md extension
  if (!q.endsWith(".md")) {
    const exactMdNode = getOne(`SELECT * FROM nodes WHERE fs_path = ?${filterClause}`, `${q}.md`, ...params)
    if (exactMdNode) return exactMdNode

    const mdNode = getOne(`SELECT * FROM nodes WHERE fs_path LIKE ?${filterClause}`, `%/${q}.md`, ...params)
    if (mdNode) return mdNode
  }

  // Try exact ID match (IDs can contain / like "docs/readme.md")
  const idNode = getOne(`SELECT * FROM nodes WHERE id = ?${filterClause}`, q, ...params)
  if (idNode) return idNode

  log.debug?.("resolveNode: relative path not found")
  return null
}

/** Strategy 3: Bare names (no /) - name-based search, may be ambiguous */
function resolveBareName(ctx: QueryContext): KNode | null {
  const { q, filterClause, params, getOne, getAll, checkAmbiguity } = ctx
  log.debug?.("resolveNode: bare name search")

  // Exact ID match first (unambiguous)
  const idNode = getOne(`SELECT * FROM nodes WHERE id = ?${filterClause}`, q, ...params)
  if (idNode) {
    log.debug?.("resolveNode: exact ID match")
    return idNode
  }

  // By name field (file/folder names)
  const nameMatch = checkAmbiguity(getAll(`SELECT * FROM nodes WHERE name = ?${filterClause}`, q, ...params), "name")
  if (nameMatch) return nameMatch

  // By name with .md extension
  const nameMdMatch = checkAmbiguity(
    getAll(`SELECT * FROM nodes WHERE name = ?${filterClause}`, `${q}.md`, ...params),
    "name+.md",
  )
  if (nameMdMatch) return nameMdMatch

  // Exact fs_path match (relative paths stored without leading /)
  const exactFsMatch = checkAmbiguity(
    getAll(`SELECT * FROM nodes WHERE fs_path = ?${filterClause}`, q, ...params),
    "fs_path exact",
  )
  if (exactFsMatch) return exactFsMatch

  // fs_path suffix (filename match for nested paths) — expensive LIKE '%/...' full table scan
  const suffixMatch = checkAmbiguity(
    getAll(`SELECT * FROM nodes WHERE fs_path LIKE ?${filterClause}`, `%/${q}`, ...params),
    "fs_path suffix",
  )
  if (suffixMatch) return suffixMatch

  // fs_path with .md extension
  if (!q.endsWith(".md")) {
    const exactFsMdMatch = checkAmbiguity(
      getAll(`SELECT * FROM nodes WHERE fs_path = ?${filterClause}`, `${q}.md`, ...params),
      "fs_path exact+.md",
    )
    if (exactFsMdMatch) return exactFsMdMatch

    const suffixMdMatch = checkAmbiguity(
      getAll(`SELECT * FROM nodes WHERE fs_path LIKE ?${filterClause}`, `%/${q}.md`, ...params),
      "fs_path suffix+.md",
    )
    if (suffixMdMatch) return suffixMdMatch
  }

  return null
}

/** Strategy 3b: Anchor lookup (^id or bare numeric id).
 *
 * Pre-v6 this hit a separate `block_id` column; post-v6 anchor literals are
 * folded into `.name` (storage-architecture §2.3), so lookups target `name`
 * instead. The ^-prefix heuristic and numeric-bare fallback remain — they
 * disambiguate anchor intent from a free-form name query. */
function resolveBlockId(ctx: QueryContext): KNode | null {
  const { q, filterClause, params, getOne } = ctx

  // Explicit `^id` form (e.g. `^testid`, `^apr15-ca-ftb`): the caret is an
  // unambiguous anchor marker — match the exact stripped string against
  // the indexed name column, regardless of shape.
  if (q.startsWith("^")) {
    const anchor = q.slice(1)
    if (!anchor) return null
    return getOne(`SELECT * FROM nodes WHERE name = ?${filterClause}`, anchor, ...params)
  }

  // Bare form: only opportunistically match numeric strings (Asana GIDs,
  // etc.) to avoid false positives when a user types a plain name. With
  // non-numeric anchors this would swallow name-based searches.
  if (!/^\d{5,}$/.test(q)) return null
  return getOne(`SELECT * FROM nodes WHERE name = ?${filterClause}`, q, ...params)
}

/** Strategy 4: Fuzzy ID matching (prefix/suffix) */
function resolveIdFuzzy(ctx: QueryContext): KNode | null {
  const { q, filterClause, params, getAll, checkAmbiguity } = ctx

  // Short queries produce expensive full-table scans via LIKE — require minimum length
  if (q.length < 8) return null

  // ID prefix match
  const prefixMatch = checkAmbiguity(
    getAll(`SELECT * FROM nodes WHERE id LIKE ?${filterClause}`, `${q}%`, ...params),
    "ID prefix",
  )
  if (prefixMatch) return prefixMatch

  // ID suffix match
  return checkAmbiguity(getAll(`SELECT * FROM nodes WHERE id LIKE ?${filterClause}`, `%${q}`, ...params), "ID suffix")
}

/** Strategy 5: Content/title exact match */
function resolveContent(ctx: QueryContext): KNode | null {
  const { q, filterClause, params, getAll, checkAmbiguity } = ctx

  const node = checkAmbiguity(getAll(`SELECT * FROM nodes WHERE content = ?${filterClause}`, q, ...params), "content")
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
function checkAmbiguity(matches: KNode[], matchType: string, q: string): KNode | null {
  if (matches.length === 0) return null
  if (matches.length === 1) return matches[0] ?? null

  // Sort matches: folders first, then by path length (shorter = closer to root)
  const sorted = [...matches].sort((a, b) => {
    // Folders before files
    if (a.fstype === "folder" && b.fstype !== "folder") return -1
    if (b.fstype === "folder" && a.fstype !== "folder") return 1
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

  // Truly ambiguous - return null instead of silently picking one
  log.debug?.(`Ambiguous resolution for '${q}' - ${matches.length} ${matchType} matches, returning null`, {
    query: q,
    matchType,
    matches: matches.map((n) => n.id),
  })
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
