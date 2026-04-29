/**
 * Beads Query Functions
 *
 * Query issues from the km database.
 */

import type { Repo } from "@km/storage"
import type { KNode } from "@km/core"
import type { Issue, IssueFilter } from "./types.ts"
import { resolveShortId } from "./short-ids.ts"

/** Options for beads query functions */
export interface BeadsQueryOptions {
  /** Repo to use for queries. Required for functions that access storage. */
  repo?: Repo
  /**
   * Pre-built dependent-count map (shortId → count of issues blocked by it).
   * If provided, nodeToIssue uses this map instead of querying per-issue.
   * Built via buildDependentCountMap(repo).
   */
  dependentCountMap?: Map<string, number>
}

/**
 * Build a dependent-count map in a single pass.
 *
 * Replaces the per-issue countDependents() N+1 scan. The data shape is
 * `data.props["blocked-by"]` with type "link" (single target) or "list"
 * (multiple targets in `values[].target`). Each target is a canonical
 * short-id of the issue being blocked.
 *
 * @returns Map of shortId → count of issues that block-by this id.
 */
export function buildDependentCountMap(repo: Repo): Map<string, number> {
  const map = new Map<string, number>()
  const sql = `
    SELECT data FROM nodes
    WHERE json_extract(data, '$.props."blocked-by"') IS NOT NULL
  `
  const rows = repo.rawQuery<{ data: string | Record<string, unknown> }>(sql)
  for (const row of rows) {
    const data = (typeof row.data === "string" ? JSON.parse(row.data) : row.data) as Record<string, unknown>
    const props = data?.props as Record<string, { type?: string; target?: string; values?: Array<{ target?: string }> }>
    const bb = props?.["blocked-by"]
    if (!bb) continue
    const targets: string[] = []
    if (bb.type === "link" && bb.target) targets.push(bb.target)
    if (bb.type === "list" && Array.isArray(bb.values)) {
      for (const v of bb.values) if (v?.target) targets.push(v.target)
    }
    for (const t of targets) map.set(t, (map.get(t) ?? 0) + 1)
  }
  return map
}

/**
 * Get the file path for a node (either direct fs_path or from ancestor)
 */
function getNodePath(node: KNode, repo?: Repo): string | undefined {
  if (node.fs_path) {
    return node.fs_path
  }
  // For embedded nodes, try to get parent's path
  if (node.parent_id && repo) {
    const parent = repo.getNode(node.parent_id)
    if (parent) {
      return getNodePath(parent, repo)
    }
  }
  return undefined
}

/**
 * Count how many issues are blocked by the given short ID.
 *
 * Slow path: scans all nodes once per call (unindexed JSON LIKE). Use
 * buildDependentCountMap(repo) once and pass via options.dependentCountMap
 * for batch queries — that turns 3463 × O(N) scans into 1 × O(N).
 */
function countDependents(shortId: string, repo?: Repo, dependentCountMap?: Map<string, number>): number {
  if (dependentCountMap) {
    return dependentCountMap.get(shortId) ?? 0
  }
  if (!repo) return 0

  const sql = `
    SELECT data FROM nodes
    WHERE json_extract(data, '$.props."blocked-by"') IS NOT NULL
  `
  const rows = repo.rawQuery<{ data: string | Record<string, unknown> }>(sql)
  let count = 0
  for (const row of rows) {
    const data = (typeof row.data === "string" ? JSON.parse(row.data) : row.data) as Record<string, unknown>
    const props = data?.props as Record<string, { type?: string; target?: string; values?: Array<{ target?: string }> }>
    const bb = props?.["blocked-by"]
    if (!bb) continue
    if (bb.type === "link" && bb.target === shortId) count++
    if (bb.type === "list" && Array.isArray(bb.values)) {
      for (const v of bb.values) if (v?.target === shortId) count++
    }
  }
  return count
}

/**
 * Get parent context for embedded nodes (section/file name)
 */
function getParentContext(node: KNode, repo?: Repo): string | undefined {
  if (!node.parent_id || !repo) {
    return undefined
  }
  const parent = repo.getNode(node.parent_id)
  if (!parent) {
    return undefined
  }
  // Return parent's name or title
  return parent.name || parent.title || undefined
}

/**
 * Convert a KNode to an Issue
 */
export function nodeToIssue(node: KNode, options?: BeadsQueryOptions): Issue {
  const repo = options?.repo
  const data = node.data as Record<string, unknown> | undefined
  const props = data?.props as
    | Record<
        string,
        {
          type: string
          target?: string
          value?: unknown
          values?: Array<{ target: string }>
        }
      >
    | undefined

  // Extract blocked-by from props
  let blockedBy: string[] | undefined
  if (props?.["blocked-by"]) {
    const blockedByProp = props["blocked-by"]
    if (blockedByProp.type === "link" && blockedByProp.target) {
      blockedBy = [blockedByProp.target]
    } else if (blockedByProp.type === "list" && blockedByProp.values) {
      blockedBy = blockedByProp.values.map((v) => v.target)
    }
  }

  // Determine status from task_status
  let status: Issue["status"] = "todo"
  switch (node.item?.task?.status) {
    case "done":
      status = "done"
      break
    case "wip":
      status = "wip"
      break
    case "blocked":
      status = "blocked"
      break
    case "dropped":
      status = "dropped"
      break
    default:
      status = blockedBy && blockedBy.length > 0 ? "blocked" : "todo"
  }

  // Priority resolution: node.priority (authoritative — matches the
  // serialized `priority::` property) > data.tags (content sigils) >
  // default. Always returns canonical `P0`..`P4`: the column may carry
  // legacy bare-numeric (`1`) or lowercase (`p1`) values from older
  // imports, and we normalize at this boundary so consumers never need
  // to.
  const tags = data?.tags as string[] | undefined
  let priority = "P2" // Default to P2 (medium)
  const normalize = (v: string): string | null => {
    const m = v.match(/^P?([0-4])$/i)
    return m?.[1] ? `P${m[1]}` : null
  }
  if (node.priority) {
    priority = normalize(node.priority) ?? node.priority
  } else if (tags) {
    for (const tag of tags) {
      const n = normalize(tag)
      if (n) {
        priority = n
        break
      }
    }
  }

  // Extract type from tags
  let type: string | undefined
  const typeKeywords = ["bug", "feature", "epic", "task", "docs", "question"]
  if (tags) {
    for (const tag of tags) {
      if (typeKeywords.includes(tag.toLowerCase())) {
        type = tag.toLowerCase()
        break
      }
    }
  }

  // Assignee is the structural `assigned_to` column on KNode — set by
  // `bd update <id> --claim` and persisted as a first-class field. Don't
  // derive from data.mentions: that conflates person references with
  // board sigils like `@issue`.
  const assignee = node.assigned_to

  // Get path and context
  const path = getNodePath(node, repo)
  const parentContext = getParentContext(node, repo)

  // Count dependencies
  const dependencyCount = blockedBy?.length || 0

  // Calculate the short ID for this issue (needed for dependent count lookup).
  // Priority: frontmatter `id:` (canonical path-form, e.g. "silvercode/acp/rename")
  // > legacy `data.short_id` (bd-form like "km-a1b2")
  // > ULID-suffix fallback for nodes that ship neither.
  const shortId = (data?.id as string) || (data?.short_id as string) || `km-${node.id.slice(-4).toLowerCase()}`

  // Count dependents (issues that are blocked by this one).
  // Prefer pre-built map for batch queries (avoids N+1 scan).
  const dependentCount = countDependents(shortId, repo, options?.dependentCountMap)

  return {
    id: node.id,
    shortId,
    title: node.content || node.title || "",
    description: node.content || undefined,
    status,
    priority,
    type,
    assignee,
    blockedBy,
    createdAt: node.created_at,
    updatedAt: node.updated_at,
    path,
    parentContext,
    dependencyCount,
    dependentCount,
  }
}

/**
 * Check if an issue is blocked (has unresolved blockers)
 * @param issue - The issue to check
 * @param options - Optional query options (repo for DI)
 */
export function isBlocked(issue: Issue, options?: BeadsQueryOptions): boolean {
  const repo = options?.repo
  if (!issue.blockedBy || issue.blockedBy.length === 0) {
    return false
  }

  // Check if any blocker is not done
  for (const blockerId of issue.blockedBy) {
    if (!repo) {
      // Without repo, we can't check if blockers are done - assume blocked
      return true
    }
    const blockers = repo.query(`short_id:${blockerId}`)
    const [firstBlocker] = blockers
    if (firstBlocker) {
      const blocker = nodeToIssue(firstBlocker, { repo })
      if (blocker.status !== "done" && blocker.status !== "dropped") {
        return true
      }
    }
  }

  return false
}

/**
 * Query ready issues (unblocked, todo status, sorted by priority)
 * @param filter - Optional filters for type, assignee, priority
 * @param scopePath - Optional path to scope results to (e.g., "/repo/Projects")
 * @param boardTag - Optional board node name to filter by, sigil included (e.g., "@issues" or "#bug").
 *                   In km, the sigil is part of the node identity — pass the literal node name.
 * @param options - Optional query options (repo for DI)
 */
export function queryReady(
  filter?: Partial<IssueFilter>,
  scopePath?: string,
  boardTag?: string,
  options?: BeadsQueryOptions,
): Issue[] {
  const repo = options?.repo
  // Build query for open tasks
  let query = "status:todo"

  // Filter to nodes mentioning the board tag (caller passes the full node name)
  if (boardTag) {
    query += ` ${boardTag}`
  }

  if (filter?.type) {
    query += ` #${filter.type}`
  }
  if (filter?.assignee) {
    query += ` @${filter.assignee}`
  }
  if (filter?.priority !== undefined) {
    query += ` #${filter.priority}`
  }

  // Don't filter by type='task' - issues can be file nodes with task_status
  if (!repo) {
    return [] // Cannot query without repo
  }
  const nodes = repo.query(query)
  // Build the dependent-count map ONCE, not per-issue. Eliminates 3463 × O(N)
  // unindexed scans on large vaults — see km-beads.list-status-perf.
  const dependentCountMap = buildDependentCountMap(repo)
  let issues = nodes.map((n) => nodeToIssue(n, { repo, dependentCountMap }))

  // Apply path scope filter after query (since path: syntax not supported)
  if (scopePath) {
    issues = issues.filter((issue) => issue.path?.startsWith(scopePath))
  }

  // Filter out blocked issues
  const ready = issues.filter((issue) => {
    // Quick sync check - if has blockedBy, consider blocked
    // Full async check would require isBlocked() call
    return !issue.blockedBy || issue.blockedBy.length === 0
  })

  // Sort by priority (lexicographic — P0 < P1 < P2 < P3 < P4)
  ready.sort((a, b) => (a.priority ?? "").localeCompare(b.priority ?? ""))

  return ready
}

/**
 * Query issues with filters
 * @param filter - Optional filters for status, type, assignee, priority, blocked
 * @param scopePath - Optional path to scope results to (e.g., "/repo/Projects")
 * @param boardTag - Optional board node name to filter by, sigil included (e.g., "@issues" or "#bug").
 *                   In km, the sigil is part of the node identity — pass the literal node name.
 * @param options - Optional query options (repo for DI)
 */
export function queryIssues(
  filter?: IssueFilter,
  scopePath?: string,
  boardTag?: string,
  options?: BeadsQueryOptions,
): Issue[] {
  const repo = options?.repo
  let query = ""

  // Filter to nodes mentioning the board tag (caller passes the full node name)
  if (boardTag) {
    query += ` ${boardTag}`
  }

  if (filter?.status) {
    const statuses = Array.isArray(filter.status) ? filter.status : [filter.status]
    query += ` status:${statuses.join(",")}`
  }
  if (filter?.type) {
    query += ` #${filter.type}`
  }
  if (filter?.assignee) {
    query += ` @${filter.assignee}`
  }
  if (filter?.priority !== undefined) {
    query += ` #${filter.priority}`
  }

  // Don't filter by type='task' - issues can be file nodes with task_status
  if (!repo) {
    return [] // Cannot query without repo
  }
  const nodes = repo.query(query.trim() || "*")
  // Build the dependent-count map ONCE — see queryReady for context.
  const dependentCountMap = buildDependentCountMap(repo)
  let issues = nodes.map((n) => nodeToIssue(n, { repo, dependentCountMap }))

  // Apply path scope filter after query (since path: syntax not supported)
  if (scopePath) {
    issues = issues.filter((issue) => issue.path?.startsWith(scopePath))
  }

  // Apply blocked filter
  if (filter?.blocked !== undefined) {
    if (filter.blocked) {
      issues = issues.filter((i) => i.blockedBy && i.blockedBy.length > 0)
    } else {
      issues = issues.filter((i) => !i.blockedBy || i.blockedBy.length === 0)
    }
  }

  return issues
}

/**
 * Get a single issue by short ID
 * @param shortId - The short ID to look up
 * @param options - Optional query options (repo for DI)
 */
export function getIssue(idRef: string, options?: BeadsQueryOptions): Issue | null {
  const repo = options?.repo
  if (!repo) return null

  // First, the canonical resolver path: frontmatter id, legacy short_id, or
  // any entry in the aliases list. Handles `silvercode/acp/rename`,
  // `@km/silvercode/acp/rename`, and `km-silvercode.acp-rename`.
  const nodeId = resolveShortId(idRef, { repo })
  if (nodeId) {
    const node = repo.getNode(nodeId)
    if (node) return nodeToIssue(node, { repo })
  }

  // Last-resort: ULID-suffix fallback for nodes that ship neither
  // frontmatter id nor data.short_id (e.g., bd-form ids derived purely from
  // the trailing 4 chars of the node's ULID).
  const tail = idRef.match(/^km-([a-z0-9]{4})$/i)?.[1]?.toLowerCase()
  if (tail) {
    const rows = repo.rawQuery<{ id: string }>(
      `SELECT id FROM nodes WHERE lower(substr(id, length(id) - 3, 4)) = ? LIMIT 1`,
      [tail],
    )
    if (rows[0]) {
      const node = repo.getNode(rows[0].id)
      if (node) return nodeToIssue(node, { repo })
    }
  }

  return null
}
