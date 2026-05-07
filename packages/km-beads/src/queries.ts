/**
 * Beads Query Functions
 *
 * Query issues from the km database.
 */

import type { Repo } from "@km/storage"
import { type KNode, fsPathOf, getNodePriority } from "@km/core"
import { type Bead, type BeadFilter, type BeadTypeKeyword, BEAD_TYPE_KEYWORD_SET } from "./types.ts"
import { resolveShortId } from "./short-ids.ts"

/** Options for beads query functions */
export interface BeadsQueryOptions {
  /** Repo to use for queries. Required for functions that access storage. */
  repo?: Repo
  /**
   * Pre-built dependent-count map (shortId → count of issues blocked by it).
   * If provided, nodeToBead uses this map instead of querying per-issue.
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
  return repo.getDependencyCountsByTarget("blocked-by")
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
 * `nodeToBead` (since retired in km-beads.purge-fallback-id-l5 / -l4).
 *
 * See km-beads.bead-sigil-elevation for the design rationale.
 */
export function isBead(node: KNode, roots: string[], repo: Repo | undefined): boolean {
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

  return repo.countDependenciesByTarget(shortId, "blocked-by")
}

/**
 * Read hashtag link rows for a node and return the authored tag list.
 *
 * Tag rows have hrefs of the form `km:%23<tag>` (per
 * normalizeLinkHref("bare", "#tag")). Decode the percent-encoded `#`
 * sentinel back to the plain tag. Order is not load-bearing.
 *
 * @km/all/dissolve-data-tags-to-links — replaces the legacy `data.tags`
 * read path. Empty when the parser hasn't run / repo is unavailable.
 */
function extractTagsFromLinks(node: KNode, repo: Repo): string[] {
  const links = repo.getOutgoingLinks(node.id)
  const tags = new Set<string>()
  for (const link of links) {
    const m = link.href.match(/^km:%23(.+)$/)
    if (m?.[1]) tags.add(decodeURIComponent(m[1]))
  }
  return [...tags]
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
 * Display id for a Bead/Bead.
 *
 * Real beads carry `data.id` (canonical path-form, e.g. `@km/scope/slug`)
 * or legacy `data.short_id` (bd-form, e.g. `km-a1b2`); `nodeToBead`
 * surfaces both as `shortId`. Bypass-path nodes (sub-checkboxes via
 * `bd children`, raw `bd query` hits, path-resolved nodes via
 * `resolveTaskNode`) have no bead identity, so `shortId` is `undefined`
 * and we fall back to the full node `id` (a ULID).
 *
 * This is the ONE reader of the `shortId ?? id` chain — every CLI
 * formatter, JSON emitter, and log line goes through here so the display
 * rule lives in one place. New code should call `Bead.displayId`; the
 * fallback chain is harmless under `Bead.from`-filtered values (shortId
 * is always defined there) and load-bearing only for legacy callers that
 * still construct an `Bead` directly.
 *
 * Internal impl — exposed to `./bead.ts` only. External callers use
 * `Bead.displayId` from the Bead namespace.
 */
export function formatBeadId(bead: Bead): string {
  return bead.shortId ?? bead.id
}

// =============================================================================
// nodeToBead — pure resolvers, each independently testable
// =============================================================================
//
// `nodeToBead` decomposes into five named resolvers (extracted at L4 — see
// `@km/beads/queries-decompose-node-to-bead`). Each resolver is a pure
// function from `KNode` (and optionally `Repo`) to a single field on the
// resulting `Bead`. The orchestrating `nodeToBead` is then ~25 lines of
// straight-line wiring.

/**
 * Shape of a `data.props` entry — the materialized form of an inline
 * `key:: target` Logseq-style property. `kind: "link"` carries a single
 * target; `kind: "list"` carries an ordered list of targets. Other shapes
 * (text, number) carry `value`.
 *
 * Narrowly typed locally — the canonical schema lives in
 * `@km/storage`'s data-blob types.
 */
interface PropEntry {
  type: string
  target?: string
  value?: unknown
  values?: Array<{ target: string }>
}

/** Read the typed `data.props` map off a node, or undefined when absent. */
function readProps(node: KNode): Record<string, PropEntry> | undefined {
  const data = node.data as Record<string, unknown> | undefined
  return data?.props as Record<string, PropEntry> | undefined
}

/**
 * `blocked-by` extraction — surfaces the inline `blocked-by:: [[id]]` /
 * `blocked-by:: [[a]], [[b]]` props as a flat string[].
 *
 * Returns `undefined` (not `[]`) when no blockers are declared, so the
 * field round-trips through JSON without a phantom empty array. The
 * dependency count derives from this — a missing prop is "no blockers
 * known", which is structurally different from "empty list of blockers".
 */
function resolveBlockedBy(node: KNode): string[] | undefined {
  const props = readProps(node)
  const entry = props?.["blocked-by"]
  if (!entry) return undefined
  if (entry.type === "link" && entry.target) {
    return [entry.target]
  }
  if (entry.type === "list" && entry.values) {
    return entry.values.map((v) => v.target)
  }
  return undefined
}

/**
 * Status resolution — the on-disk `task.status` is authoritative; the
 * `blocked-by` fallback only fires when the markdown checkbox is the
 * default `[ ]` (status `"todo"` / unset). A user marking a task `wip`
 * with open blockers stays `wip` — explicit user intent wins over
 * derived state.
 *
 * Mirrors the bd CLI's status taxonomy: `todo | wip | blocked | done |
 * dropped`. Anything else (incl. unset) defaults to `todo`, then the
 * blocker fallback may override to `blocked`.
 */
function resolveStatus(node: KNode, blockedBy: string[] | undefined): Bead["status"] {
  switch (node.item?.task?.status) {
    case "done":
      return "done"
    case "wip":
      return "wip"
    case "blocked":
      return "blocked"
    case "dropped":
      return "dropped"
    default:
      return blockedBy && blockedBy.length > 0 ? "blocked" : "todo"
  }
}

/**
 * Type-tag resolution — scans the node's hashtag link rows (parser emits
 * H1 / list-item title hashtags into `links` as `km:%23<tag>` per
 * `@km/all/dissolve-data-tags-to-links`) for the first canonical bead
 * type keyword and returns it lowercased.
 *
 * The keyword whitelist is `BEAD_TYPE_KEYWORDS` (canonical list shared
 * with `tasks set <id> type:<value>` — see `types.ts`). User labels
 * (`#urgent`, `#frontend`, etc.) also land as link rows but are ignored
 * here because they're not in the keyword set.
 *
 * Returns `undefined` when:
 *   - no `repo` is supplied (no link rows to scan), OR
 *   - the node has no recognized type tag.
 *
 * Order: first match wins. Tags after the first canonical keyword are
 * ignored — beads carry exactly one type by convention.
 */
function resolveType(node: KNode, repo: Repo | undefined): BeadTypeKeyword | undefined {
  const tags = repo ? extractTagsFromLinks(node, repo) : []
  for (const tag of tags) {
    const lowered = tag.toLowerCase()
    if (BEAD_TYPE_KEYWORD_SET.has(lowered)) {
      return lowered as BeadTypeKeyword
    }
  }
  for (const tag of extractTagsFromContent(node.content)) {
    const lowered = tag.toLowerCase()
    if (BEAD_TYPE_KEYWORD_SET.has(lowered)) {
      return lowered as BeadTypeKeyword
    }
  }
  return undefined
}

function extractTagsFromContent(content: string | undefined): string[] {
  if (!content) return []
  const out: string[] = []
  for (const m of content.matchAll(/(?:^|\s|[([{.,;:!?])#([A-Za-z][A-Za-z0-9_-]*)\b/g)) {
    if (m[1] !== undefined) out.push(m[1])
  }
  return out
}

/**
 * Short-id resolution — the canonical sigil-prefixed path-form id, or
 * `undefined` when the node isn't a real bead.
 *
 * Resolution chain (priority order, first hit wins):
 *
 *   1. `data.id`       — legacy path-form fossil (rows pre
 *                        `@km/beads/data-id-stop-writing`). Canonical
 *                        sigil-prefixed form, e.g. `@km/scope/slug`.
 *
 *   2. `data.short_id` — legacy bd-form, e.g. `km-a1b2`. Maintained for
 *                        round-trip compatibility with imported beads.
 *
 *   3. fs-path-derived — canonical post-`data-id-stop-writing` shape: the
 *                        file's location IS the id. Gated on
 *                        `fstype === "mdfile"` so only real markdown
 *                        files qualify — paragraphs, sub-checkboxes, and
 *                        folder nodes (which may carry synthetic `fs_path`
 *                        in tests or as ancestor folders) keep
 *                        `shortId === undefined`.
 *
 *   4. undefined       — not a real bead (paragraph / non-bead via bypass
 *                        paths like `bd children`, `bd query`, paragraph-
 *                        pointing `resolveTaskNode`, or `getDependencies`).
 *
 * Without #3, file-materialized beads (the new canonical shape) had no
 * shortId and every subcommand using `resolveIssue` (close, update, drop,
 * claim, comment, mention) failed with "Bead not found" —
 * see `@km/beads/path-form-id-frontmatter-missing`.
 *
 * Pinned by `bead-invariants.property.test.ts` (invariant 2: query
 * results never have ULID-fallback shortIds) and
 * `nodeToBead.short-id.test.ts` (no ULID-tail synthesis).
 */
function resolveBeadShortId(node: KNode): string | undefined {
  const data = node.data as Record<string, unknown> | undefined
  const dataId = data?.id as string | undefined
  if (dataId) return dataId
  const dataShort = data?.short_id as string | undefined
  if (dataShort) return dataShort
  if (node.fstype === "mdfile") return fsPathOf(node) ?? undefined
  return undefined
}

/**
 * Convert a KNode to a Bead (the legacy never-null shape).
 *
 * Internal impl — exposed to `./bead.ts` only and to the one legacy
 * holdout in `apps/km-cli/src/commands/shared-show.ts` (which needs the
 * never-null shape so it can render synthesized non-beads). External
 * callers use `Bead.from` — it returns `Bead | null`, filtering out
 * nodes that aren't real beads (no `data.id` AND no `data.short_id`).
 *
 * Body is pure orchestration over the named resolvers above —
 * `resolveBlockedBy`, `resolveStatus`, `resolveType`, `resolveBeadShortId`,
 * plus structural readers (`getNodePath`, `getParentContext`,
 * `countDependents`) and the `getNodePriority` helper from `@km/core`.
 *
 * Each resolver is independently unit-tested in
 * `nodeToBead.resolvers.test.ts`. Keep this orchestrator thin — when a
 * branch grows, push it into a new resolver, not into the body.
 */
export function nodeToBead(node: KNode, options?: BeadsQueryOptions): Bead {
  const repo = options?.repo
  const blockedBy = resolveBlockedBy(node)
  const shortId = resolveBeadShortId(node)
  return {
    id: node.id,
    shortId,
    title: node.content || node.title || "",
    description: node.content || undefined,
    status: resolveStatus(node, blockedBy),
    priority: getNodePriority(node) ?? "P2",
    type: resolveType(node, repo),
    assignee: node.assigned_to,
    blockedBy,
    createdAt: node.created_at,
    updatedAt: node.updated_at,
    path: getNodePath(node, repo),
    parentContext: getParentContext(node, repo),
    dependencyCount: blockedBy?.length ?? 0,
    dependentCount: countDependents(shortId, repo, options?.dependentCountMap),
  }
}

/**
 * Child beads of a file-backed bead.
 *
 * A bead file can have ordinary in-file children (paragraphs/tasks) and
 * filesystem child beads in the sibling directory:
 *
 *   parent.md
 *   parent/child.md
 */
export function getChildBeads(repo: Repo, bead: Bead, options?: { dependentCountMap?: Map<string, number> }): Bead[] {
  const beadNode = repo.getNode(bead.id)
  if (!beadNode) return []

  const nodes = uniqueNodes([...repo.getChildren(bead.id), ...getSiblingDirectoryChildNodes(repo, beadNode)])
  return nodes
    .filter((node) => node.item?.task?.status != null || node.fs_path?.endsWith(".md"))
    .map((node) => nodeToBead(node, { repo, dependentCountMap: options?.dependentCountMap }))
    .filter((child): child is Bead => child.shortId !== undefined)
}

function getSiblingDirectoryChildNodes(repo: Repo, beadNode: KNode): KNode[] {
  const dirPath = beadNode.fs_path?.endsWith(".md") ? beadNode.fs_path.slice(0, -3) : null
  if (!dirPath) return []

  return repo.getNodesUnderPath(dirPath).filter((node) => isImmediateMarkdownChild(dirPath, node.fs_path))
}

function isImmediateMarkdownChild(dirPath: string, fsPath: string | undefined): boolean {
  if (!fsPath?.startsWith(`${dirPath}/`) || !fsPath.endsWith(".md")) return false
  const suffix = fsPath.slice(dirPath.length + 1)
  return suffix.length > 0 && !suffix.includes("/")
}

function uniqueNodes(nodes: KNode[]): KNode[] {
  return [...new Map(nodes.map((node) => [node.id, node])).values()]
}

// Re-export resolvers for unit testing — keep them internal to the module
// otherwise (callers should reach for `nodeToBead` / `Bead.from`).
export const __resolvers = {
  resolveBlockedBy,
  resolveStatus,
  resolveType,
  resolveBeadShortId,
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
  filter?: Partial<BeadFilter>,
  scopePath?: string,
  boardTag?: string,
  options?: BeadsQueryOptions & { boardRoots?: string[] },
): Bead[] {
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
  // excluded — these now produce `Bead.shortId === undefined`
  // (post km-beads.purge-fallback-id-l5) so callers can distinguish
  // real beads from generic nodes.
  const boardRoots = options?.boardRoots
  const nodes = boardRoots && boardRoots.length > 0 ? allNodes.filter((n) => isBead(n, boardRoots, repo)) : allNodes
  // Build the dependent-count map ONCE, not per-issue. Eliminates 3463 × O(N)
  // unindexed scans on large vaults — see km-beads.list-status-perf.
  const dependentCountMap = buildDependentCountMap(repo)
  let issues = nodes.map((n) => nodeToBead(n, { repo, dependentCountMap }))

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
  filter?: BeadFilter,
  scopePath?: string,
  boardTag?: string,
  options?: BeadsQueryOptions & { boardRoots?: string[] },
): Bead[] {
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
  let issues = nodes.map((n) => nodeToBead(n, { repo, dependentCountMap }))

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
 * Resolves via the canonical chain: `data.id` prop (canonical
 * path-form), legacy `data.short_id` (bd-form), or any entry in
 * `data.aliases`. Handles `scope/slug`, `@km/scope/slug`, and
 * `km-scope.slug` inputs.
 *
 * Historical note (km-beads.retire-short-id-l4): a ULID-tail fallback
 * (`km-<4chars>` matching the trailing 4 chars of `node.id`) used to live
 * here as a last resort. It was load-bearing only while `nodeToBead`
 * synthesized `km-XXXX` display ids for non-beads (since retired in
 * km-beads.purge-fallback-id-l5). Post-purge, no caller produces those
 * ids, and the chain above is sufficient.
 *
 * @param idRef - canonical id, sigil-prefixed path-form, legacy bd-form,
 *                or alias.
 * @param options - Optional query options (repo for DI)
 */
export function getIssue(idRef: string, options?: BeadsQueryOptions): Bead | null {
  const repo = options?.repo
  if (!repo) return null

  const nodeId = resolveShortId(idRef, repo)
  if (nodeId) {
    const node = repo.getNode(nodeId)
    if (node) return nodeToBead(node, { repo })
  }

  return null
}
