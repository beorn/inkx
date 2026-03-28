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
import { queryNodes } from "./query.ts"
import { removeLinksFromSourceByRelationship } from "./db-links.ts"
import { rowToNode, getChildren, getNode } from "./db-queries/index.ts"
import { createDbOps, buildEmbedChild } from "./db-ops.ts"
import { parseQuery, isOutline, isEmbed, type KNode, type NodeRules } from "@km/core"

const log = createLogger("km:storage:db:rules")

/** Relationship type for km.add:: rule results */
const ADD_RULE_RELATIONSHIP = "query:add"

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
 * Evaluate km.add:: rule(s) and materialize results as outline items with embed_source.
 * Creates outline items (type: "h", item: true) as children of the section.
 * embed_source on each item enables transclusion (resolveEmbed renders the target's content).
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

  // Guard: rules must be on outline items (type: "h", item: true).
  // Rule-created children are outline items, which can only nest inside outline parents.
  if (!isOutline(section.type, section.item)) {
    throw new Error(
      `km.add:: rule on non-outline node (type=${section.type}, item=${section.item}). Rules are only supported on section headings.`,
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

  // Clear existing add-rule links from this section (for backward compat)
  removeLinksFromSourceByRelationship(db, sectionId, ADD_RULE_RELATIONSHIP)

  // Evaluate all queries and union results (deduplicate by node ID)
  const matchingMap = new Map<string, KNode>()
  for (const query of queries) {
    for (const node of queryNodes(db, query)) {
      matchingMap.set(node.id, node)
    }
  }
  const matchingNodes = [...matchingMap.values()]
  const matchingIds = new Set(matchingMap.keys())
  log.debug?.(`evaluateAddRule: found ${matchingNodes.length} matches across ${queries.length} queries`)

  // Remove rule-created items that no longer match any query
  // Identify by embed_source (set on all rule-materialized nodes)
  const matchingEmbedPaths = new Set(matchingNodes.map((n) => getEmbedPath(n, db)))
  const existingEmbedNodes = getChildren(db, sectionId).filter((n) => isEmbed(n))
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
  // Embed paths: "filename" for file nodes, "filename#^block_id" for intra-file nodes
  const boardRootId = section.parent_id
  // Collect existing embed paths on the board for deduplication
  // Both exact paths ("file#^ref") and file-level paths ("file") are tracked
  // so a file-level embed is deduped against a block-level embed of the same file
  const existingEmbedPathsOnBoard = new Set<string>()
  const existingEmbedFilesOnBoard = new Set<string>()
  if (boardRootId) {
    const boardDescendants = getChildren(db, boardRootId)
    for (const section_node of boardDescendants) {
      for (const child of getChildren(db, section_node.id)) {
        if (isEmbed(child)) {
          const childData = typeof child.data === "object" && child.data ? (child.data as Record<string, unknown>) : {}
          const path = (childData.targetPath as string) ?? child.content?.match(/!\[\[([^\]]+)\]\]/)?.[1]
          if (path) {
            existingEmbedPathsOnBoard.add(path)
            // Also track the file part (before #) for cross-level dedup
            const filePart = path.split("#")[0]!
            existingEmbedFilesOnBoard.add(filePart)
          }
        }
      }
    }
  }
  log.debug?.(
    `evaluateAddRule: existing embed paths on board: ${existingEmbedPathsOnBoard.size} (${existingEmbedFilesOnBoard.size} files)`,
  )

  // Get next parent_idx for new embeds
  const existingChildren = getChildren(db, sectionId)
  let nextIdx = existingChildren.length

  const ops = createDbOps(db)
  let addedCount = 0
  let skippedCount = 0
  for (const match of matchingNodes) {
    // Skip self-reference and direct children (they're already children)
    if (match.id === sectionId || match.parent_id === sectionId) {
      continue
    }

    // Compute the embed path for this match (stable identifier)
    const candidatePath = getEmbedPath(match, db)

    // Skip if this embed path already exists anywhere on the board (exact or file-level match)
    const candidateFile = candidatePath.split("#")[0]!
    if (existingEmbedPathsOnBoard.has(candidatePath) || existingEmbedFilesOnBoard.has(candidateFile)) {
      skippedCount++
      continue
    }

    // Create outline item with embed_source pointing to the matched node.
    // type: "h", item: true makes it a structural sub-item (card) on the board,
    // not body content. embed_source enables transclusion (resolveEmbed).
    const targetPath = getEmbedPath(match, db)
    const embedNode = buildEmbedChild({ source: match, parentIdx: nextIdx++, type: "h", targetPath })
    ops.addNode(sectionId, embedNode)

    addedCount++
    existingEmbedPathsOnBoard.add(targetPath)
    existingEmbedFilesOnBoard.add(targetPath.split("#")[0]!)
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
 * - Intra-file nodes with block_id: filename#^block_id (stable)
 * - Intra-file nodes without block_id: filename#^short_id (unstable — last resort)
 */
function getEmbedPath(node: KNode, db?: Database): string {
  // For file nodes, extract the relative path (filename without .md)
  if (node.fs_path) {
    const parts = node.fs_path.split("/")
    const filename = parts[parts.length - 1] || ""
    return filename.replace(/\.md$/, "")
  }

  // For intra-file nodes, find the parent file and use file#^block_id
  if (db && node.parent_id) {
    const fileNode = findFileAncestorSimple(db, node.id)
    if (fileNode?.fs_path) {
      const parts = fileNode.fs_path.split("/")
      const filename = (parts[parts.length - 1] || "").replace(/\.md$/, "")
      if (node.block_id) {
        return `${filename}#^${node.block_id}`
      }
    }
  }

  // Fallback: use block_id if available, otherwise short ID (unstable)
  if (node.block_id) return `#^${node.block_id}`
  return node.id.slice(-8)
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

  try {
    for (let i = 0; i < nodesWithRules.length; i++) {
      const node = nodesWithRules[i]
      if (node) {
        evaluateRulesForNode(db, node, ctx)
      }
      yield { current: i + 1, total: nodesWithRules.length }
    }
  } finally {
    // Clear cache after evaluation completes
    ctx.fileAncestorCache = null
  }

  log.debug?.(`evaluateAllRules: completed in ${Date.now() - start}ms`)
}

/**
 * Called when any node changes to re-evaluate rules that might be affected.
 * This is the incremental update path - more efficient than evaluateAllRules.
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

  const nodesWithAddRule = getNodesWithRule(db, "add")

  for (const node of nodesWithAddRule) {
    if (node.rules?.add) {
      const queries = Array.isArray(node.rules.add) ? node.rules.add : [node.rules.add]
      evaluateAddRule(db, node.id, queries, ctx)
    }
  }
}

/**
 * Called when a node is deleted to clean up any links pointing to it.
 */
export function onNodeDeleted(db: Database, deletedNodeId: string): void {
  log.debug?.(`onNodeDeleted: ${deletedNodeId}`)

  // Remove any computed links that point TO this node
  db.run("DELETE FROM links WHERE target_id = ? AND relationship = ?", [deletedNodeId, ADD_RULE_RELATIONSHIP])

  // If this node had rules, its outgoing links are already deleted
  // by the node deletion cascade (if FK is set) or we need to clean up
  removeLinksFromSourceByRelationship(db, deletedNodeId, ADD_RULE_RELATIONSHIP)
}
