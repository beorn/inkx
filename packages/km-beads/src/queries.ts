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
 * Replaces the per-issue countDependents() N+1 scan. Reads from the
 * indexed `deps` table (schema v7) — one row per (host_id, target, kind)
 * tuple, populated by triggers from `nodes.data.props["blocked-by"]`.
 * Each target is the canonical short-id of the issue being blocked.
 *
 * Pre-v7 the same shape was JSON-scanned out of `nodes.data` on every
 * call; the migration backfills the table so this query stays correct
 * across upgrades.
 *
 * @returns Map of shortId → count of issues that block-by this id.
 */
export function buildDependentCountMap(repo: Repo): Map<string, number> {
  const map = new Map<string, number>()
  const sql = `
    SELECT target, COUNT(*) AS n
    FROM deps
    WHERE kind = 'blocked-by'
    GROUP BY target
  `
  const rows = repo.rawQuery<{ target: string; n: number }>(sql)
  for (const row of rows) {
    map.set(row.target, row.n)
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
 * Trailing-slash anchored prefix check: a path is under one of the
 * configured roots iff it equals a root or starts with `root + "/"`.
 *
 * Anchoring matters — `beads-archive/` must NOT match `beads`. See
 * queryReady.fuzz.ts for the property-based regression suite.
 */
function isUnderRoots(path: string | undefined, roots: string[]): boolean {
  if (!path) return false
  for (const root of roots) {
    if (path === root) return true
    if (path.startsWith(`${root}/`)) return true
  }
  return false
}

/**
 * Compute the path's depth relative to the longest matching root, in
 * number of `/`-separated segments past the root prefix.
 *
 *   path = "@km/beads/aliases-resolver.md", root = "@km"
 *   subpath = "beads/aliases-resolver.md" → 2 segments
 *
 *   path = "beads/@km/scope/slug.md", root = "beads"
 *   subpath = "@km/scope/slug.md" → 3 segments
 *
 * Returns -1 when no root matches. The longest-match preference
 * disambiguates overlapping roots (e.g. `["beads", "beads/@km"]`).
 */
function depthUnderRoots(path: string | undefined, roots: string[]): number {
  if (!path) return -1
  let bestMatch: string | undefined
  for (const root of roots) {
    if (path === root || path.startsWith(`${root}/`)) {
      if (bestMatch === undefined || root.length > bestMatch.length) bestMatch = root
    }
  }
  if (bestMatch === undefined) return -1
  if (path === bestMatch) return 0
  const subpath = path.slice(bestMatch.length + 1)
  return subpath.split("/").length
}

/**
 * Bead-membership predicate: a node is a "bead" iff
 *   1. it lives under a configured boards root, AND
 *   2. its on-disk shape matches one of:
 *      a) Structural (default) — depth-2 file under the root, i.e. the
 *         canonical `<root>/<scope>/<slug>.md` layout. The bead file is
 *         the second segment past the root.
 *      b) Declarative (escape hatch) — `node.name` starts with `+`,
 *         the elevated-sub-bead sigil. This lets a sub-checkbox at any
 *         depth opt into bead status without disturbing the default.
 *
 * Sub-checkbox content (`- [ ] X` nested under a bead file) is NOT a
 * bead under either branch — it has no `+` and lives at depth ≥ 3 — so
 * it falls out of `bd ready` / `bd list` results, eliminating the
 * sub-item noise that previously required a ULID-suffix synthesis in
 * `nodeToIssue` (since retired in km-beads.purge-fallback-id-l5 / -l4).
 *
 * See km-beads.bead-sigil-elevation for the design rationale.
 */
function isBead(node: KNode, roots: string[], repo: Repo | undefined): boolean {
  const path = getNodePath(node, repo)
  if (!isUnderRoots(path, roots)) return false
  // Structural: the node IS the bead file at depth-2 under the root.
  // `node.fs_path` is the gate — only file nodes carry it; embedded
  // children resolve their path via parent walk in getNodePath, so the
  // depth check would otherwise admit any sub-checkbox sitting in a
  // depth-2 file. Requiring `node.fs_path` ensures we only count the
  // file node itself, not its descendants.
  if (node.fs_path && depthUnderRoots(node.fs_path, roots) === 2) return true
  // Declarative: explicit elevation via `+` sigil prefix on node.name.
  if (node.name?.startsWith("+")) return true
  return false
}

/**
 * Count how many issues are blocked by the given short ID.
 *
 * Indexed path: hits idx_deps_target_kind on the deps table (schema v7).
 * Pre-v7 this was an O(N) JSON LIKE scan over every node; the migration
 * backfills the table so this query stays correct across upgrades.
 *
 * Callers doing batch queries should still prefer
 * `buildDependentCountMap(repo)` to fetch every count in one round-trip.
 */
function countDependents(shortId: string | undefined, repo?: Repo, dependentCountMap?: Map<string, number>): number {
  // Non-beads (no shortId) can't be the target of a `blocked-by` edge —
  // the dependent count is trivially zero.
  if (!shortId) return 0
  if (dependentCountMap) {
    return dependentCountMap.get(shortId) ?? 0
  }
  if (!repo) return 0

  const row = repo.rawQuery<{ n: number }>(
    "SELECT COUNT(*) AS n FROM deps WHERE target = ? AND kind = 'blocked-by'",
    [shortId],
  )[0]
  return row?.n ?? 0
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
 * Display id for an Issue.
 *
 * Real beads carry `data.id` (canonical path-form, e.g. `@km/scope/slug`)
 * or legacy `data.short_id` (bd-form, e.g. `km-a1b2`); `nodeToIssue`
 * surfaces both as `Issue.shortId`. Bypass-path nodes (sub-checkboxes via
 * `bd children`, raw `bd query` hits, path-resolved nodes via
 * `resolveTaskNode`) have no bead identity, so `Issue.shortId` is
 * `undefined` and we fall back to the full node `Issue.id` (a ULID).
 *
 * This is the ONE reader of the `shortId ?? id` chain — every CLI
 * formatter, JSON emitter, and log line goes through here so the display
 * rule lives in one place.
 */
export function displayId(issue: Issue): string {
  return issue.shortId ?? issue.id
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
  // > undefined (not a real bead).
  //
  // Invariant: any node reaching `nodeToIssue` from queryReady / queryIssues
  // is a bead (km-beads.bead-sigil-elevation: depth-2 file under boardRoots OR
  // `+` sigil prefix on `name`) and therefore carries `data.id` or
  // `data.short_id`. Bypass paths — `bd children` (in-file paragraphs),
  // `bd query` (raw DSL), path-resolved nodes via `resolveTaskNode`, and
  // `getDependencies` (parents of `blocks::` paragraphs) — may pass a non-
  // bead node; for those, `shortId` is honestly `undefined`.
  //
  // Display sites use `displayId(issue)` (which falls back to `issue.id`)
  // to render non-beads.
  const shortId = (data?.id as string | undefined) ?? (data?.short_id as string | undefined)

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
    // Use resolveShortId so blockers stored as canonical path-form (data.id),
    // legacy bd-form (data.short_id), or aliases all resolve. The previous
    // `repo.query("short_id:...")` raw form only matched data.short_id and
    // silently treated path-form blockers as not-found (= unblocked), which
    // would mark items ready when they aren't.
    const blockerNodeId = resolveShortId(blockerId, { repo })
    if (blockerNodeId) {
      const firstBlocker = repo.getNode(blockerNodeId)
      if (firstBlocker) {
        const blocker = nodeToIssue(firstBlocker, { repo })
        if (blocker.status !== "done" && blocker.status !== "dropped") {
          return true
        }
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
 * @param options - Optional query options (repo for DI, boardRoots for ancestor-chain
 *                   membership filter; pass `resolveBeadsRoots(config, cliOverride)` —
 *                   when set, only issues whose `fs_path` lives under one of the listed
 *                   repo-relative root directories pass through. Without this filter,
 *                   `bd ready` returns every checkbox in the vault — including markdown
 *                   fixtures, archived notes, and any other todo-shaped node.)
 */
export function queryReady(
  filter?: Partial<IssueFilter>,
  scopePath?: string,
  boardTag?: string,
  options?: BeadsQueryOptions & { boardRoots?: string[] },
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
  const allNodes = repo.query(query)
  // Bead-membership predicate (km-beads.bead-sigil-elevation):
  // Default = file at depth-2 under boardRoots (the canonical
  // `<root>/<scope>/<slug>.md` shape). Declarative escape hatch =
  // `node.name?.startsWith("+")`, the elevated-sub-bead sigil. Sub-
  // checkboxes inside bead files (depth ≥ 3, no sigil) are correctly
  // excluded — these now produce `Issue.shortId === undefined`
  // (post km-beads.purge-fallback-id-l5) so callers can distinguish
  // real beads from generic nodes.
  const boardRoots = options?.boardRoots
  const nodes = boardRoots && boardRoots.length > 0 ? allNodes.filter((n) => isBead(n, boardRoots, repo)) : allNodes
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
  options?: BeadsQueryOptions & { boardRoots?: string[] },
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
  // Empty query string → executeQuery selects all nodes (SELECT * WHERE 1=1).
  // Do NOT fall back to "*" here: the DSL parses "*" as a text term, which
  // becomes `content LIKE '%*%'` — matching only nodes whose content
  // happens to contain a literal asterisk. That's the info-stats-mismatch
  // bug: `bd info` ran "*" and got a content-incidental subset, while
  // `bd list --status X` ran a real status filter.
  const allNodes = repo.query(query.trim())
  // Bead-membership predicate — see queryReady for the rationale and
  // km-beads.bead-sigil-elevation for the design.
  const boardRoots = options?.boardRoots
  const nodes = boardRoots && boardRoots.length > 0 ? allNodes.filter((n) => isBead(n, boardRoots, repo)) : allNodes
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
 * Get a single issue by short ID.
 *
 * Resolves via the canonical chain: frontmatter `data.id` (canonical
 * path-form), legacy `data.short_id` (bd-form), or any entry in
 * `data.aliases`. Handles `scope/slug`, `@km/scope/slug`, and
 * `km-scope.slug` inputs.
 *
 * Historical note (km-beads.retire-short-id-l4): a ULID-tail fallback
 * (`km-<4chars>` matching the trailing 4 chars of `node.id`) used to live
 * here as a last resort. It was load-bearing only while `nodeToIssue`
 * synthesized `km-XXXX` display ids for non-beads (since retired in
 * km-beads.purge-fallback-id-l5). Post-purge, no caller produces those
 * ids, and the chain above is sufficient.
 *
 * @param idRef - canonical id, sigil-prefixed path-form, legacy bd-form,
 *                or alias.
 * @param options - Optional query options (repo for DI)
 */
export function getIssue(idRef: string, options?: BeadsQueryOptions): Issue | null {
  const repo = options?.repo
  if (!repo) return null

  const nodeId = resolveShortId(idRef, { repo })
  if (nodeId) {
    const node = repo.getNode(nodeId)
    if (node) return nodeToIssue(node, { repo })
  }

  return null
}
