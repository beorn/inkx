/**
 * Beads Query Functions
 *
 * Query issues from the km database.
 */

import type { Repo } from "@km/storage"
import type { KNode } from "@km/core"
import type { Issue, IssueFilter } from "./types.ts"

/** Options for beads query functions */
export interface BeadsQueryOptions {
  /** Repo to use for queries. Required for functions that access storage. */
  repo?: Repo
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
 * Count how many issues are blocked by the given short ID
 * This performs a reverse dependency lookup
 */
function countDependents(shortId: string, repo?: Repo): number {
  if (!repo) {
    return 0 // Can't count without repo access
  }

  const sql = `
    SELECT COUNT(*) as count FROM nodes
    WHERE json_extract(data, '$.blocked_by') LIKE ?
  `
  const params = [`%"${shortId}"%`]
  const result = repo.rawQuery<{ count: number }>(sql, params)
  return result[0]?.count ?? 0
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

  // Extract priority from tags or data
  let priority = "P2" // Default to P2 (medium)
  const tags = data?.tags as string[] | undefined
  if (tags) {
    for (const tag of tags) {
      const pMatch = tag.match(/^P([0-4])$/i)
      if (pMatch?.[1]) {
        priority = `P${pMatch[1]}`
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

  // Extract assignee from mentions
  const mentions = data?.mentions as string[] | undefined
  const assignee = mentions?.[0]

  // Get path and context
  const path = getNodePath(node, repo)
  const parentContext = getParentContext(node, repo)

  // Count dependencies
  const dependencyCount = blockedBy?.length || 0

  // Calculate the short ID for this issue (needed for dependent count lookup)
  const shortId = (data?.short_id as string) || `km-${node.id.slice(-4).toLowerCase()}`

  // Count dependents (issues that are blocked by this one)
  const dependentCount = countDependents(shortId, repo)

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
 * @param boardTag - Optional board tag to filter by (e.g., "issues" for @issues)
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

  // Add board tag filter if provided (tasks tagged with @board)
  if (boardTag) {
    // Strip @ prefix if present
    const tag = boardTag.startsWith("@") ? boardTag.slice(1) : boardTag
    query += ` @${tag}`
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
  let issues = nodes.map((n) => nodeToIssue(n, { repo }))

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
 * @param boardTag - Optional board tag to filter by (e.g., "issues" for @issues)
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

  // Add board tag filter if provided (tasks tagged with @board)
  if (boardTag) {
    // Strip @ prefix if present
    const tag = boardTag.startsWith("@") ? boardTag.slice(1) : boardTag
    query += ` @${tag}`
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
  let issues = nodes.map((n) => nodeToIssue(n, { repo }))

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
export function getIssue(shortId: string, options?: BeadsQueryOptions): Issue | null {
  const repo = options?.repo
  // Try to find by short_id in data
  // Don't filter by type='task' - issues can be file nodes with task_status
  if (!repo) {
    return null // Cannot query without repo
  }
  const nodes = repo.query(`@issue`)

  for (const node of nodes) {
    const data = node.data as Record<string, unknown> | undefined
    const nodeShortId = data?.short_id as string | undefined
    const derivedShortId = `km-${node.id.slice(-4).toLowerCase()}`

    if (nodeShortId === shortId || derivedShortId === shortId) {
      return nodeToIssue(node, { repo })
    }
  }

  return null
}
