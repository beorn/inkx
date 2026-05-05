/* eslint-disable @typescript-eslint/no-non-null-assertion -- codebase idiom: arr[i]! / map.get(k)! / stack.pop()! after surrounding length/has/bounds check; TS noUncheckedIndexedAccess requires the assertion even when invariant is obvious */
/**
 * Database Rules - Evaluate and store computed rule results
 *
 * Node rules (like `km.add::`) define dynamic relationships.
 * This module evaluates those rules and stores results in the links table,
 * ensuring a single source of truth at the storage layer.
 *
 * Rules evaluated here:
 * - add: Query to auto-pull matching nodes as virtual children
 * - sync: Bidirectional field sync (future)
 *
 * Rules NOT evaluated here (display-time only):
 * - collapse: Start collapsed
 * - limit: WIP limit
 * - default: Default column for new items
 * - color: Board/section color
 */

import { createLogger } from "loggily"
import type { Database } from "bun:sqlite"
import { queryNodes, materializeEffectivePaths, dropEffectivePaths } from "../query.ts"
import { rowToNode, getChildren, getNode, getEmbedPathsOnBoard } from "./queries/index.ts"
import { createDbOps, buildEmbedChild } from "./ops.ts"
import { parseQuery, KNode, type NodeRules } from "@km/core"

const log = createLogger("km:storage:db:rules")

// =============================================================================
// Rule Context - Replaces global state with explicit context passing
// =============================================================================

/**
 * Context for rule evaluation operations.
 * Replaces global singletons (bulkMode, fileAncestorCache) with explicit DI.
 *
 * Usage:
 *   const ctx = createRuleContext()
 *   evaluateAllRules(db, ctx)
 *   const filesToWrite = ctx.pendingWriteBack
 */
export interface RuleContext {
  /** Cache for file ancestors - populated during evaluateAllRules for O(1) lookup */
  fileAncestorCache: Map<string, KNode | null> | null
  /** Files pending write-back after materialization */
  pendingWriteBack: Set<string>
  /** Cache for nodes with add rules — avoids repeated json_extract queries */
  nodesWithAddRuleCache?: KNode[] | null
  /**
   * Per-batch memoization for `queryNodes` results. The user's vault has
   * 1021 rule nodes but only ~19 distinct `add` query strings — same query
   * runs ~50x. Each run was a 200-2000 ms full-table scan. Caching the
   * result by query text drops the total queryNodes cost from minutes to
   * seconds. Keyed by the literal query string; same query → identical
   * matchSet. Cleared at end of `evaluateAllRules`.
   */
  queryResultCache?: Map<string, KNode[]>
  /**
   * Per-batch memoization for `getEmbedPathsOnBoard` results. Each rule
   * runs a recursive descendant walk from the board root; multiple rule
   * sections under the same board re-scan the same subtree. Keyed by
   * boardRootId; cleared at end of `evaluateAllRules`.
   */
  embedPathsByBoardCache?: Map<string, { exactPaths: Set<string>; filePaths: Set<string> }>
}

/**
 * Create a new RuleContext for rule evaluation operations.
 */
export function createRuleContext(): RuleContext {
  return {
    fileAncestorCache: null,
    pendingWriteBack: new Set(),
  }
}

// =============================================================================
// Rule Evaluation
// =============================================================================

/**
 * Evaluate a single node's rules and update links accordingly.
 * Call this after a node with rules is created or updated.
 *
 * @param db - Database instance
 * @param nodeId - ID of node to evaluate
 * @param ctx - Rule context for caching and tracking pending writes
 */
export function evaluateNodeRules(db: Database, nodeId: string, ctx: RuleContext): void {
  const row = db.query("SELECT * FROM nodes WHERE id = ?").get(nodeId) as Record<string, unknown> | null
  if (!row) {
    log.debug?.(`evaluateNodeRules: node ${nodeId} not found`)
    return
  }

  const node = rowToNode(row)
  if (!node.rules) {
    log.debug?.(`evaluateNodeRules: node ${nodeId} has no rules`)
    return
  }

  evaluateRulesForNode(db, node, ctx)
}

/**
 * Evaluate rules for a node object (internal helper).
 */
function evaluateRulesForNode(db: Database, node: KNode, ctx: RuleContext): void {
  const rules = node.rules
  if (!rules) return

  // Evaluate km.add:: rule(s) — may be a single string or array of queries
  if (rules.add) {
    const queries = Array.isArray(rules.add) ? rules.add : [rules.add]
    evaluateAddRule(db, node.id, queries, ctx)
  }

  // Future: evaluate km.sync:: rule
  // if (rules.sync) {
  //   evaluateSyncRule(db, node.id, rules.sync, ctx);
  // }
}

/**
 * Evaluate km.add:: rule(s) and materialize results as outline items with embed_of.
 * Creates outline items (type: "h", item: {}) as children of the section.
 * embed_of on each item enables transclusion (resolveEmbed renders the target's content).
 * Removes items that no longer match any query (e.g., after status change).
 * Multiple queries are unioned — a node matching any query is included.
 */
function evaluateAddRule(db: Database, sectionId: string, queries: string[], ctx: RuleContext): void {
  using ruleSpan = log.span("evaluate-add-rule", { sectionId, queryCount: queries.length })
  log.debug?.(`evaluateAddRule: section=${sectionId} queries=${queries.join(" | ")}`)

  const section = getNode(db, sectionId)
  if (!section) {
    log.debug?.("evaluateAddRule: section not found")
    return
  }

  // Guard: rules must be on outline items (type: "h", item: {}).
  // Rule-created children are outline items, which can only nest inside outline parents.
  if (!KNode.isOutline(section)) {
    throw new Error(
      `km.add:: rule on non-outline node (type=${section.type}, item=${String(section.item)}). Rules are only supported on section headings.`,
    )
  }

  // Warn about path patterns that escape the repo root
  for (const query of queries) {
    const ast = parseQuery(query)
    for (const pathFilter of ast.paths) {
      const p = pathFilter.pattern
      if (p.startsWith("../") || p === ".." || p.includes("/../")) {
        log.warn?.(
          `km.add:: rule path "${query}" resolves outside the repo root — it will match no nodes. Section: ${section.content ?? sectionId}`,
        )
      }
    }
  }

  // km.add:: rule materialization went from link-rows to embed child nodes
  // (buildEmbedChild + ops.addNode below) in the pre-v4 refactor. The v4
  // links schema has no `relationship` column to target, so the legacy
  // "clear add-rule link rows" cleanup is a no-op: stale embed nodes are
  // removed below via the `sectionChildren` filter.

  // Evaluate all queries and union results (deduplicate by node ID).
  // Reuse `ctx.queryResultCache` when present — same query text → same
  // matches across rules in this batch.
  const matchingMap = new Map<string, KNode>()
  for (const query of queries) {
    let matches = ctx.queryResultCache?.get(query)
    if (matches === undefined) {
      matches = queryNodes(db, query)
      ctx.queryResultCache?.set(query, matches)
    }
    for (const node of matches) {
      matchingMap.set(node.id, node)
    }
  }
  const matchingNodes = [...matchingMap.values()]
  log.debug?.(`evaluateAddRule: found ${matchingNodes.length} matches across ${queries.length} queries`)

  // Reuse ctx.fileAncestorCache when present (built once at the top of
  // evaluateAllRules over the whole tree). Falling back to the per-rule
  // builder is only correct under bulk mode (>=10 matches) — its
  // legacy fast-path scans `SELECT id, parent_id, fs_path FROM nodes`
  // (740k rows on the user's vault) for every rule that hit it,
  // turning the rule-eval pass into N×N. With the global cache the
  // same lookup is O(1) per match.
  const matchFileAncestorCache = ctx.fileAncestorCache ?? buildFileAncestorCacheForNodes(db, matchingNodes)

  // Fetch section children once — used for stale embed removal and next parent_idx
  const sectionChildren = getChildren(db, sectionId)

  // Remove rule-created items that no longer match any query
  // Identify by embed_of (set on all rule-materialized nodes)
  const matchingEmbedPaths = new Set(matchingNodes.map((n) => getEmbedPath(n, db, matchFileAncestorCache)))
  const existingEmbedNodes = sectionChildren.filter((n) => KNode.isEmbed(n))
  let removedCount = 0
  for (const embed of existingEmbedNodes) {
    const embedData = typeof embed.data === "object" && embed.data ? (embed.data as Record<string, unknown>) : {}
    const embedPath = (embedData.targetPath as string) ?? embed.content?.match(/!\[\[([^\]]+)\]\]/)?.[1]
    if (embedPath && !matchingEmbedPaths.has(embedPath)) {
      db.run("DELETE FROM nodes WHERE id = ?", [embed.id])
      removedCount++
    }
  }
  if (removedCount > 0) {
    log.debug?.(`evaluateAddRule: removed ${removedCount} stale embeds`)
  }

  // Get the board root (parent of section) to check board-wide deduplication
  // Dedup by embed target path (stable across re-parses) instead of node ID (ULID, changes every parse)
  // Embed paths: "filename" for file nodes, "filename#^name" for intra-file nodes
  // (post-v6, anchor literals live in `.name` — see storage-architecture §2.3)
  const boardRootId = section.parent_id
  // Memoize the embed-paths-on-board lookup. Multiple rule sections under
  // the same board cause N rules × recursive-descendant CTE in the no-cache
  // path; the result is the same shape per board, so cache by boardRootId.
  const boardKey = boardRootId ?? "<no-board>"
  let embedPathSets = ctx.embedPathsByBoardCache?.get(boardKey)
  if (embedPathSets === undefined) {
    embedPathSets = getEmbedPathsOnBoard(db, boardRootId)
    ctx.embedPathsByBoardCache?.set(boardKey, embedPathSets)
  }
  const { exactPaths: existingEmbedPathsOnBoard, filePaths: existingEmbedFilesOnBoard } = embedPathSets
  log.debug?.(
    `evaluateAddRule: existing embed paths on board: ${existingEmbedPathsOnBoard.size} (${existingEmbedFilesOnBoard.size} files)`,
  )

  // Get next parent_idx for new embeds (reuse sectionChildren from above)
  let nextIdx = sectionChildren.length

  const ops = createDbOps(db)
  let addedCount = 0
  let skippedCount = 0
  for (const match of matchingNodes) {
    // Skip self-reference and direct children (they're already children)
    if (match.id === sectionId || match.parent_id === sectionId) {
      continue
    }

    // Compute the embed path for this match (stable identifier, uses pre-built cache)
    const candidatePath = getEmbedPath(match, db, matchFileAncestorCache)

    // Skip if this embed path already exists anywhere on the board (exact or file-level match)
    const candidateFile = candidatePath.split("#")[0]!
    if (existingEmbedPathsOnBoard.has(candidatePath) || existingEmbedFilesOnBoard.has(candidateFile)) {
      skippedCount++
      continue
    }

    // Create outline item with embed_of pointing to the matched node.
    // type: "h", item: {} makes it a structural sub-item (card) on the board,
    // not body content. embed_of enables transclusion (resolveEmbed).
    const embedNode = buildEmbedChild({ source: match, parentIdx: nextIdx++, type: "h", targetPath: candidatePath })
    ops.addNode(sectionId, embedNode)

    addedCount++
    existingEmbedPathsOnBoard.add(candidatePath)
    existingEmbedFilesOnBoard.add(candidatePath.split("#")[0]!)
  }

  ruleSpan.spanData.added = addedCount
  ruleSpan.spanData.removed = removedCount
  ruleSpan.spanData.skipped = skippedCount
  ruleSpan.spanData.matches = matchingNodes.length

  // Mark the file for write-back if we added or removed any embeds
  if (addedCount > 0 || removedCount > 0) {
    const fileNode = findFileAncestor(db, sectionId, ctx)
    if (fileNode?.fs_path) {
      ctx.pendingWriteBack.add(fileNode.fs_path)
      log.debug?.(`evaluateAddRule: marked ${fileNode.fs_path} for write-back`)
    }
  }
}

/**
 * Find the file ancestor of a node (the nearest ancestor with type='file')
 * Uses cached lookup during bulk evaluation for O(1) access.
 */
function findFileAncestor(db: Database, nodeId: string, ctx: RuleContext): KNode | null {
  // km-load-perf.3: Use cache if available (during evaluateAllRules)
  if (ctx.fileAncestorCache) {
    return ctx.fileAncestorCache.get(nodeId) ?? null
  }

  // Fallback to tree walk for incremental updates
  let current = getNode(db, nodeId)
  while (current) {
    if (current.type === "h" && current.item && (current.fstype === "file" || current.fstype === "mdfile")) {
      return current
    }
    if (!current.parent_id) {
      return null
    }
    current = getNode(db, current.parent_id)
  }
  return null
}

/**
 * Get the embed path for a node.
 * - File nodes: filename without .md extension (stable across re-parses)
 * - Intra-file nodes with anchor name: filename#^name (stable — name carries the anchor literal per §2.3)
 * - Intra-file nodes without a name: filename#^short_id (unstable — last resort)
 *
 * @param fileAncestorCache - Optional pre-built cache to avoid per-node tree walks
 */
function getEmbedPath(node: KNode, db?: Database, fileAncestorCache?: Map<string, KNode | null>): string {
  // For file nodes, extract the relative path (filename without .md)
  if (node.fs_path) {
    const parts = node.fs_path.split("/")
    const filename = parts[parts.length - 1] || ""
    return filename.replace(/\.md$/, "")
  }

  // For intra-file nodes, find the parent file and use file#^name
  if (db && node.parent_id) {
    const fileNode = fileAncestorCache ? (fileAncestorCache.get(node.id) ?? null) : findFileAncestorSimple(db, node.id)
    if (fileNode?.fs_path) {
      const parts = fileNode.fs_path.split("/")
      const filename = (parts[parts.length - 1] || "").replace(/\.md$/, "")
      if (node.name) {
        return `${filename}#^${node.name}`
      }
    }
  }

  // Fallback: use name if available, otherwise short ID (unstable)
  if (node.name) return `#^${node.name}`
  return node.id.slice(-8)
}

/**
 * Build a file ancestor cache for a set of nodes.
 * For small sets (<10 intra-file nodes), walks up per-node.
 * For larger sets, fetches all parent chains in one query.
 */
function buildFileAncestorCacheForNodes(db: Database, nodes: KNode[]): Map<string, KNode | null> {
  const cache = new Map<string, KNode | null>()

  // File nodes are their own ancestor
  for (const node of nodes) {
    if (node.fs_path) {
      cache.set(node.id, node)
    }
  }

  const needLookup = nodes.filter((n) => !n.fs_path && n.parent_id)
  if (needLookup.length === 0) return cache

  // Small set: walk up per-node (fewer queries than a full table scan)
  if (needLookup.length < 10) {
    for (const node of needLookup) {
      if (!cache.has(node.id)) {
        const fileNode = findFileAncestorSimple(db, node.id)
        cache.set(node.id, fileNode)
      }
    }
    return cache
  }

  // Large set: bulk-load parent chain in one query
  const parentRows = db.query("SELECT id, parent_id, fs_path FROM nodes").all() as Array<{
    id: string
    parent_id: string | null
    fs_path: string | null
  }>

  const parentMap = new Map<string, { parent_id: string | null; fs_path: string | null }>()
  const fileNodesByid = new Map<string, KNode>()

  for (const row of parentRows) {
    parentMap.set(row.id, { parent_id: row.parent_id, fs_path: row.fs_path })
  }

  // Walk up from each node that needs lookup
  for (const node of needLookup) {
    if (cache.has(node.id)) continue

    let currentId: string | null = node.parent_id
    const visited = [node.id]

    while (currentId) {
      if (cache.has(currentId)) {
        const result = cache.get(currentId) ?? null
        for (const id of visited) cache.set(id, result)
        break
      }

      const info = parentMap.get(currentId)
      if (!info) {
        for (const id of visited) cache.set(id, null)
        break
      }

      if (info.fs_path) {
        // Found a file ancestor — get full KNode
        let fileNode = fileNodesByid.get(currentId)
        if (!fileNode) {
          fileNode = getNode(db, currentId) ?? undefined
          if (fileNode) fileNodesByid.set(currentId, fileNode)
        }
        const result = fileNode ?? null
        cache.set(currentId, result)
        for (const id of visited) cache.set(id, result)
        break
      }

      visited.push(currentId)
      currentId = info.parent_id
    }
  }

  return cache
}

/** Walk up to find the file ancestor (simple version without cache) */
function findFileAncestorSimple(db: Database, nodeId: string): KNode | null {
  let current = getNode(db, nodeId)
  while (current) {
    if (current.fs_path) return current
    if (!current.parent_id) return null
    current = getNode(db, current.parent_id)
  }
  return null
}

/**
 * Get all nodes that have rules defined.
 */
export function getNodesWithRules(db: Database): KNode[] {
  // Query nodes where data contains rules
  // SQLite JSON: check if data.rules exists and has content
  const rows = db
    .query(
      `
      SELECT * FROM nodes
      WHERE json_extract(data, '$.rules') IS NOT NULL
      AND json_extract(data, '$.rules') != '{}'
    `,
    )
    .all() as Record<string, unknown>[]

  return rows.map(rowToNode)
}

/**
 * Get all nodes that have a specific rule type defined.
 */
export function getNodesWithRule(db: Database, ruleType: keyof NodeRules): KNode[] {
  const rows = db
    .query(
      `
      SELECT * FROM nodes
      WHERE json_extract(data, '$.rules.${String(ruleType)}') IS NOT NULL
    `,
    )
    .all() as Record<string, unknown>[]

  return rows.map(rowToNode)
}

export interface RulesProgress {
  current: number
  total: number
}

/**
 * Build a cache mapping all nodes to their file ancestor.
 * This avoids O(depth) tree walks per rule evaluation.
 */
function buildFileAncestorCache(db: Database): Map<string, KNode | null> {
  const cache = new Map<string, KNode | null>()

  // Get all file nodes first
  const fileRows = db
    .query("SELECT * FROM nodes WHERE type = 'h' AND item = 1 AND fstype IN ('file', 'mdfile')")
    .all() as Record<string, unknown>[]
  const fileNodes = new Map<string, KNode>()
  for (const row of fileRows) {
    const node = rowToNode(row)
    fileNodes.set(node.id, node)
    cache.set(node.id, node) // Files are their own ancestor
  }

  // Get all non-file nodes and build parent chain
  const nodeRows = db.query("SELECT id, parent_id FROM nodes WHERE type != 'file'").all() as {
    id: string
    parent_id: string | null
  }[]

  // Build parent lookup
  const parentMap = new Map<string, string | null>()
  for (const row of nodeRows) {
    parentMap.set(row.id, row.parent_id)
  }

  // For each non-file node, walk up to find file ancestor
  for (const row of nodeRows) {
    let currentId: string | null = row.id
    const visited = new Set<string>()

    while (currentId && !cache.has(currentId)) {
      if (visited.has(currentId)) break // Prevent cycles
      visited.add(currentId)

      const parentId = parentMap.get(currentId)
      if (!parentId) {
        cache.set(row.id, null)
        break
      }

      // Check if parent is a file
      const fileNode = fileNodes.get(parentId)
      if (fileNode) {
        // Found file ancestor - cache for all visited nodes
        for (const id of visited) {
          cache.set(id, fileNode)
        }
        break
      }

      currentId = parentId
    }

    // If we found a cached result during walk, propagate it
    if (currentId && cache.has(currentId) && !cache.has(row.id)) {
      const result = cache.get(currentId)
      if (result !== undefined) {
        for (const id of visited) {
          cache.set(id, result)
        }
      }
    }
  }

  return cache
}

/**
 * Evaluate all rules in the database.
 * Call this on startup/migration to ensure all computed links are current.
 * Yields progress updates as each rule is evaluated.
 *
 * @param db - Database instance
 * @param ctx - Rule context for caching and tracking pending writes
 */
export function* evaluateAllRules(db: Database, ctx: RuleContext): Generator<RulesProgress, void, unknown> {
  log.debug?.("evaluateAllRules: starting")
  const start = Date.now()

  const nodesWithRules = getNodesWithRules(db)
  log.debug?.(`evaluateAllRules: found ${nodesWithRules.length} nodes with rules`)

  yield { current: 0, total: nodesWithRules.length }

  // km-load-perf.3: Build file ancestor cache before evaluation
  ctx.fileAncestorCache = buildFileAncestorCache(db)

  // Materialize the (node_id → effective_path) map ONCE so the per-rule
  // queryNodes calls with `-path:archive/` etc. skip the recursive CTE.
  // The CTE was 1.5 s on a 740k-node DB; with 1000+ rules in the user's
  // vault that turned `km sync` Phase 3 into ~140s. Sharing the
  // materialized table drops it dramatically.
  const tMaterialize = Date.now()
  materializeEffectivePaths(db)
  log.debug?.(`evaluateAllRules: materialized effective_paths in ${Date.now() - tMaterialize}ms`)

  // Per-batch query-result memoization — many rule nodes share the same
  // `add` query string (the user's vault has 1021 rule nodes but only
  // ~19 distinct query texts). Same query → identical match set in this
  // pass; cache by literal query text.
  ctx.queryResultCache = new Map<string, KNode[]>()
  ctx.embedPathsByBoardCache = new Map()

  try {
    for (let i = 0; i < nodesWithRules.length; i++) {
      const node = nodesWithRules[i]
      if (node) {
        evaluateRulesForNode(db, node, ctx)
      }
      yield { current: i + 1, total: nodesWithRules.length }
    }
  } finally {
    // Clear caches after evaluation completes
    ctx.fileAncestorCache = null
    ctx.queryResultCache = undefined
    ctx.embedPathsByBoardCache = undefined
    dropEffectivePaths(db)
  }

  log.debug?.(`evaluateAllRules: completed in ${Date.now() - start}ms`)
}

/**
 * Called when any node changes to re-evaluate rules that might be affected.
 * This is the incremental update path - more efficient than evaluateAllRules.
 *
 * When calling in a loop (e.g., batch date changes), reuse the same RuleContext
 * to avoid repeated json_extract queries for nodes with add rules.
 *
 * @param db - Database instance
 * @param changedNodeId - The ID of the node that changed
 * @param ctx - Rule context for caching and tracking pending writes
 * @param changes - What changed on the node (for optimization)
 */
export function onNodeChanged(
  db: Database,
  changedNodeId: string,
  ctx: RuleContext,
  changes?: Record<string, unknown>,
): void {
  log.debug?.(`onNodeChanged: ${changedNodeId} changes=${JSON.stringify(changes)}`)

  // For simplicity, re-evaluate all km.add:: rules when any node changes.
  // This is O(rules * matches) but rules count is typically small (<20).
  //
  // Future optimization: index queries by terms and only re-evaluate
  // rules whose terms match the changed fields (e.g., if task_status
  // changed, only re-evaluate rules containing "status:").

  // Cache the add-rule nodes on the context to avoid repeated json_extract queries
  // when onNodeChanged is called in a loop (e.g., batch date changes on N nodes)
  if (ctx.nodesWithAddRuleCache === undefined) {
    ctx.nodesWithAddRuleCache = getNodesWithRule(db, "add")
  }
  const nodesWithAddRule = ctx.nodesWithAddRuleCache ?? []

  for (const node of nodesWithAddRule) {
    if (node.rules?.add) {
      const queries = Array.isArray(node.rules.add) ? node.rules.add : [node.rules.add]
      evaluateAddRule(db, node.id, queries, ctx)
    }
  }
}

/**
 * Called when a node is deleted to clean up any rule-materialized state.
 *
 * In the v4 links schema, add-rule results are represented as embed child
 * nodes (not link rows with a relationship column), and broken backlinks
 * surface through the runtime resolver rather than a persisted target_id.
 * So there's nothing to clean up here beyond what ops.deleteSubtree
 * already does (it drops links rows where host_id is in the deleted
 * subtree). Kept as a no-op hook for symmetry with onNodeChanged.
 */
export function onNodeDeleted(db: Database, deletedNodeId: string): void {
  log.debug?.(`onNodeDeleted: ${deletedNodeId} (no-op under links v4 schema)`)
  void db
}

// =============================================================================
// Incremental rule evaluation
//
// `evaluateAllRules` re-runs every rule on every sync. The user's vault has
// 1021 rule nodes; even with the materialized-effective-paths cache + per-
// query memoization, that's ~9 s of work for a sync that touched one file.
//
// The fix: skip rules whose query domain demonstrably can't be affected by
// the changes that just landed. We compute:
//
//   - per-rule **signature** — what tags/mentions/projects + paths the
//     query references. Cached on the RuleContext for the duration of one
//     evaluateAllRules call.
//   - per-sync **changed-attr signature** — derived from `allOps`, the
//     reconcile output. Tracks which sigil-prefixed paths got touched and
//     which tag/mention/project literals appear in changed nodes.
//
// A rule is "potentially affected" when its signature has any non-empty
// intersection with the changed signature, OR when it has no positive
// selectors (catch-all queries like `-path:archive/`) which match
// everything-not-archived. Catch-alls always re-eval (correctness), but
// the common case in big vaults — many rules with explicit ref filters
// (`@inbox`, `#bug`, etc.) — gets the skip.
//
// See bead `@km/storage/incremental-rule-eval`.
// =============================================================================

/** Watch set for one rule node — what categories of change can affect it. */
export interface RuleSignature {
  /** Tag literals the query positively requires (`#bug`, `#urgent`). */
  tags: Set<string>
  /** Mention literals the query positively requires (`@inbox`, `@next`). */
  mentions: Set<string>
  /** Project literals the query positively requires (`+roadmap`). */
  projects: Set<string>
  /** Positive path filters (rare — `path:src/`). */
  positivePaths: string[]
  /** True when the query has at least one positive selector. False for
   *  pure-negation queries (`-path:archive/`) which match everything not
   *  excluded — correctness-required to always re-eval. */
  hasPositiveSelector: boolean
}

/** Aggregate of attributes that changed in a sync — used to filter rules. */
export interface ChangedAttrSet {
  /** Tag literals that appeared in changed nodes' content. */
  tags: Set<string>
  /** Mention literals that appeared in changed nodes' content. */
  mentions: Set<string>
  /** Project literals that appeared in changed nodes' content. */
  projects: Set<string>
  /** File-system paths that changed (relative to repo root, sigil-prefixed). */
  paths: Set<string>
}

/**
 * Parse an `add` rule's query strings into a watch signature. The result
 * captures the categories of attribute that, if changed in a sync, could
 * cause the rule's match set to differ.
 */
export function extractRuleSignature(queries: string[]): RuleSignature {
  const tags = new Set<string>()
  const mentions = new Set<string>()
  const projects = new Set<string>()
  const positivePaths: string[] = []
  let hasPositiveSelector = false

  for (const query of queries) {
    const ast = parseQuery(query)

    for (const ref of ast.refs) {
      if (ref.negated) continue
      hasPositiveSelector = true
      if (ref.type === "tag") tags.add(ref.value)
      else if (ref.type === "person") mentions.add(ref.value)
      else if (ref.type === "project") projects.add(ref.value)
    }

    for (const path of ast.paths) {
      if (path.negated) continue
      hasPositiveSelector = true
      // The query parser stores the raw term — for `path:src/` that's
      // literally `"path:src/"`. Strip the `path:` / `./` prefix so the
      // intersection logic compares against an actual repo-relative
      // path.
      let pattern = path.pattern
      if (pattern.startsWith("path:")) pattern = pattern.slice("path:".length)
      else if (pattern.startsWith("./")) pattern = pattern.slice(2)
      else if (pattern.startsWith("/")) pattern = pattern.slice(1)
      positivePaths.push(pattern)
    }

    // Positive field conditions (status:open, type:bug, due:>2026-01-01,
    // etc.) count as positive selectors — but the changed-attr set we
    // derive in `extractChangedAttrs` doesn't yet track these per-field,
    // so any rule with such a condition forces a re-eval.
    for (const cond of ast.conditions) {
      if (cond.negated) continue
      hasPositiveSelector = true
    }
    for (const prop of ast.propConditions) {
      if (prop.negated) continue
      hasPositiveSelector = true
    }
    if (ast.text.length > 0 || ast.phrases.length > 0) {
      hasPositiveSelector = true
    }
  }

  return { tags, mentions, projects, positivePaths, hasPositiveSelector }
}

/**
 * Compute the changed-attribute signature from an iterable of node IDs that
 * changed in this sync. For each changed node we read its content/title,
 * extract tag/mention/project literals, and union them. Path is
 * pulled from `fs_path` directly.
 */
export function extractChangedAttrs(db: Database, changedNodeIds: Iterable<string>): ChangedAttrSet {
  const result: ChangedAttrSet = {
    tags: new Set(),
    mentions: new Set(),
    projects: new Set(),
    paths: new Set(),
  }

  // Single regex pass mirrors `extractRefs` in km-markdown — cheaper than
  // 3 separate matchAll calls. Captures: 1=tag, 2=mention, 3=project.
  const refRegex = /#([a-zA-Z0-9_-]+)|@([a-zA-Z0-9_-]+)|\+([a-zA-Z0-9_-]+)/g

  const idList = Array.from(changedNodeIds)
  if (idList.length === 0) return result

  // Fetch content + title + fs_path in one batch. Skip nodes that no
  // longer exist (deletions) — their contributions can't be derived.
  const placeholders = idList.map(() => "?").join(",")
  const rows = db
    .query(`SELECT id, content, title, fs_path FROM nodes WHERE id IN (${placeholders})`)
    .all(...idList) as Array<{ id: string; content: string | null; title: string | null; fs_path: string | null }>

  for (const row of rows) {
    if (row.fs_path) result.paths.add(row.fs_path)
    const text = `${row.title ?? ""}\n${row.content ?? ""}`
    if (!text.trim()) continue
    refRegex.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = refRegex.exec(text)) !== null) {
      if (m[1]) result.tags.add(m[1])
      else if (m[2]) result.mentions.add(m[2])
      else if (m[3]) result.projects.add(m[3])
    }
  }

  return result
}

/**
 * True when a rule's signature could possibly intersect with the changed
 * attribute set. Pure-negation rules (no positive selector) always return
 * true to preserve correctness.
 */
export function ruleIsAffected(sig: RuleSignature, changed: ChangedAttrSet): boolean {
  if (!sig.hasPositiveSelector) return true

  for (const tag of sig.tags) {
    if (changed.tags.has(tag)) return true
  }
  for (const mention of sig.mentions) {
    if (changed.mentions.has(mention)) return true
  }
  for (const project of sig.projects) {
    if (changed.projects.has(project)) return true
  }
  for (const pattern of sig.positivePaths) {
    for (const path of changed.paths) {
      if (path.startsWith(pattern)) return true
    }
  }
  return false
}

/**
 * Incremental variant of `evaluateAllRules`: re-evaluates only the rules
 * whose query signature could be affected by `changedAttrs`. Falls back
 * to full eval when `changedAttrs` is `null` (e.g., on first run when we
 * can't derive a signature).
 *
 * Yields the same progress shape as `evaluateAllRules` so callers can
 * substitute one for the other. The total reflects the *evaluated* count,
 * not the all-rules count — a sync that touches one tag in a 1021-rule
 * vault yields total=N(affected) instead of total=1021.
 */
export function* evaluateAffectedRules(
  db: Database,
  ctx: RuleContext,
  changedAttrs: ChangedAttrSet | null,
): Generator<RulesProgress, void, unknown> {
  const start = Date.now()
  const nodesWithRules = getNodesWithRules(db)

  // No incremental info → fall back to the safe full path.
  if (!changedAttrs) {
    yield* evaluateAllRules(db, ctx)
    return
  }

  // Filter nodes whose rule signature can possibly intersect the change set.
  const affected: KNode[] = []
  for (const node of nodesWithRules) {
    const queries = node.rules?.add ? (Array.isArray(node.rules.add) ? node.rules.add : [node.rules.add]) : null
    if (!queries) continue
    const sig = extractRuleSignature(queries)
    if (ruleIsAffected(sig, changedAttrs)) affected.push(node)
  }

  log.debug?.(
    `evaluateAffectedRules: ${affected.length}/${nodesWithRules.length} rules potentially affected (${Date.now() - start}ms triage)`,
  )

  yield { current: 0, total: affected.length }
  if (affected.length === 0) return

  // Set up the same caches evaluateAllRules uses — these dramatically
  // reduce per-rule cost when multiple rules survive triage.
  ctx.fileAncestorCache = buildFileAncestorCache(db)
  materializeEffectivePaths(db)
  ctx.queryResultCache = new Map<string, KNode[]>()
  ctx.embedPathsByBoardCache = new Map()

  try {
    for (let i = 0; i < affected.length; i++) {
      const node = affected[i]
      if (node) evaluateRulesForNode(db, node, ctx)
      yield { current: i + 1, total: affected.length }
    }
  } finally {
    ctx.fileAncestorCache = null
    ctx.queryResultCache = undefined
    ctx.embedPathsByBoardCache = undefined
    dropEffectivePaths(db)
  }

  log.debug?.(`evaluateAffectedRules: completed in ${Date.now() - start}ms`)
}
