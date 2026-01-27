/**
 * Database Rules - Evaluate and store computed rule results
 *
 * Node rules (like `add=`) define dynamic relationships.
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

import createDebug from "debug"
import { ulid } from "ulid"
import type { Database } from "bun:sqlite"
import { queryNodes } from "./query.ts"
import { removeLinksFromSourceByRelationship } from "./db-links.ts"
import {
  rowToNode,
  getChildren,
  getEmbedTargetsOnBoard,
  getNode,
} from "./db-queries/index.ts"
// Note: We insert embed nodes directly into DB rather than using emitNodeCreated
// because that would require the event system to be set up (which isn't always the case)
import type { KNode, NodeRules } from "@km/core"

const debug = createDebug("km:storage:db:rules")

/** Relationship type for add= rule results */
export const ADD_RULE_RELATIONSHIP = "query:add"

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
export function evaluateNodeRules(
  db: Database,
  nodeId: string,
  ctx: RuleContext,
): void {
  const row = db
    .query("SELECT * FROM nodes WHERE id = ?")
    .get(nodeId) as Record<string, unknown> | null
  if (!row) {
    debug("evaluateNodeRules: node %s not found", nodeId)
    return
  }

  const node = rowToNode(row)
  if (!node.rules) {
    debug("evaluateNodeRules: node %s has no rules", nodeId)
    return
  }

  evaluateRulesForNode(db, node, ctx)
}

/**
 * Evaluate rules for a node object (internal helper).
 */
function evaluateRulesForNode(
  db: Database,
  node: KNode,
  ctx: RuleContext,
): void {
  const rules = node.rules
  if (!rules) return

  // Evaluate add= rule
  if (rules.add) {
    evaluateAddRule(db, node.id, rules.add, ctx)
  }

  // Future: evaluate sync= rule
  // if (rules.sync) {
  //   evaluateSyncRule(db, node.id, rules.sync, ctx);
  // }
}

/**
 * Evaluate an add= rule and materialize results as embed nodes.
 * Creates embed nodes as children of the section, which get written back to markdown.
 * Removes embeds that no longer match the query (e.g., after status change).
 */
function evaluateAddRule(
  db: Database,
  sectionId: string,
  query: string,
  ctx: RuleContext,
): void {
  debug("evaluateAddRule: section=%s query=%s", sectionId, query)

  const section = getNode(db, sectionId)
  if (!section) {
    debug("evaluateAddRule: section not found")
    return
  }

  // Clear existing add-rule links from this section (for backward compat)
  removeLinksFromSourceByRelationship(db, sectionId, ADD_RULE_RELATIONSHIP)

  // Evaluate query
  const matchingNodes = queryNodes(db, query)
  const matchingIds = new Set(matchingNodes.map((n) => n.id))
  debug("evaluateAddRule: found %d matches", matchingNodes.length)

  // Remove embeds that no longer match the query
  const existingEmbedNodes = getChildren(db, sectionId).filter(
    (n) => n.type === "embed" && n.link_to,
  )
  let removedCount = 0
  for (const embed of existingEmbedNodes) {
    // link_to is guaranteed by the filter above, but TypeScript doesn't narrow through filter
    const linkTo = embed.link_to
    if (linkTo && !matchingIds.has(linkTo)) {
      db.run("DELETE FROM nodes WHERE id = ?", [embed.id])
      removedCount++
    }
  }
  if (removedCount > 0) {
    debug("evaluateAddRule: removed %d stale embeds", removedCount)
  }

  // Get the board root (parent of section) to check board-wide deduplication
  const boardRootId = section.parent_id
  const existingOnBoard = getEmbedTargetsOnBoard(db, boardRootId)
  debug("evaluateAddRule: existing embeds on board: %d", existingOnBoard.size)

  // Get existing embed children in this section (by link_to) - refresh after cleanup
  const existingEmbeds = getChildren(db, sectionId)
    .filter((n) => n.type === "embed" && n.link_to)
    .map((n) => n.link_to as string)

  // Get next parent_idx for new embeds
  const existingChildren = getChildren(db, sectionId)
  let nextIdx = existingChildren.length

  let addedCount = 0
  for (const match of matchingNodes) {
    // Skip self-reference and direct children (they're already children)
    if (match.id === sectionId || match.parent_id === sectionId) {
      continue
    }

    // Skip if already on board anywhere (deduplication)
    if (existingOnBoard.has(match.id)) {
      debug("evaluateAddRule: skip %s (already on board)", match.id)
      continue
    }

    // Skip if already an embed in this section
    if (existingEmbeds.includes(match.id)) {
      debug("evaluateAddRule: skip %s (already embedded here)", match.id)
      continue
    }

    // Create embed node directly in database
    // Use a relative path or node ID for the embed link
    const targetPath = getEmbedPath(match)
    const embedId = ulid()
    const now = Date.now()
    db.run(
      `INSERT INTO nodes (id, type, parent_id, parent_idx, link_to, content, data, created_at, updated_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        embedId,
        "embed",
        sectionId,
        nextIdx++,
        match.id,
        `![[${targetPath}]]`,
        JSON.stringify({ targetPath }),
        now,
        now,
        ulid(),
      ],
    )

    addedCount++
    existingOnBoard.add(match.id) // Prevent adding same match twice
  }

  debug(
    "evaluateAddRule: created %d embeds, removed %d",
    addedCount,
    removedCount,
  )

  // Mark the file for write-back if we added or removed any embeds
  if (addedCount > 0 || removedCount > 0) {
    const fileNode = findFileAncestor(db, sectionId, ctx)
    if (fileNode?.fs_path) {
      ctx.pendingWriteBack.add(fileNode.fs_path)
      debug("evaluateAddRule: marked %s for write-back", fileNode.fs_path)
    }
  }
}

/**
 * Find the file ancestor of a node (the nearest ancestor with type='file')
 * Uses cached lookup during bulk evaluation for O(1) access.
 */
function findFileAncestor(
  db: Database,
  nodeId: string,
  ctx: RuleContext,
): KNode | null {
  // km-load-perf.3: Use cache if available (during evaluateAllRules)
  if (ctx.fileAncestorCache) {
    return ctx.fileAncestorCache.get(nodeId) ?? null
  }

  // Fallback to tree walk for incremental updates
  let current = getNode(db, nodeId)
  while (current) {
    if (current.type === "file") {
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
 * Uses relative path from repo root, or a short ID for non-file nodes.
 */
function getEmbedPath(node: KNode): string {
  // For file nodes, extract the relative path (filename without .md)
  if (node.fs_path) {
    // Extract just the filename, removing .md extension
    const parts = node.fs_path.split("/")
    const filename = parts[parts.length - 1] || ""
    return filename.replace(/\.md$/, "")
  }

  // For task/section nodes, use a short ID (last 8 chars)
  // This allows linking to specific nodes within files
  return node.id.slice(-8)
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
export function getNodesWithRule(
  db: Database,
  ruleType: keyof NodeRules,
): KNode[] {
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
    .query("SELECT * FROM nodes WHERE type = 'file'")
    .all() as Record<string, unknown>[]
  const fileNodes = new Map<string, KNode>()
  for (const row of fileRows) {
    const node = rowToNode(row)
    fileNodes.set(node.id, node)
    cache.set(node.id, node) // Files are their own ancestor
  }

  // Get all non-file nodes and build parent chain
  const nodeRows = db
    .query("SELECT id, parent_id FROM nodes WHERE type != 'file'")
    .all() as { id: string; parent_id: string | null }[]

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
export function* evaluateAllRules(
  db: Database,
  ctx: RuleContext,
): Generator<RulesProgress, void, unknown> {
  debug("evaluateAllRules: starting")
  const start = Date.now()

  const nodesWithRules = getNodesWithRules(db)
  debug("evaluateAllRules: found %d nodes with rules", nodesWithRules.length)

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

  debug("evaluateAllRules: completed in %dms", Date.now() - start)
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
  debug("onNodeChanged: %s changes=%O", changedNodeId, changes)

  // For simplicity, re-evaluate all add= rules when any node changes.
  // This is O(rules * matches) but rules count is typically small (<20).
  //
  // Future optimization: index queries by terms and only re-evaluate
  // rules whose terms match the changed fields (e.g., if task_status
  // changed, only re-evaluate rules containing "status:").

  const nodesWithAddRule = getNodesWithRule(db, "add")

  for (const node of nodesWithAddRule) {
    if (node.rules?.add) {
      evaluateAddRule(db, node.id, node.rules.add, ctx)
    }
  }
}

/**
 * Called when a node is deleted to clean up any links pointing to it.
 */
export function onNodeDeleted(db: Database, deletedNodeId: string): void {
  debug("onNodeDeleted: %s", deletedNodeId)

  // Remove any computed links that point TO this node
  db.run("DELETE FROM links WHERE target_id = ? AND relationship = ?", [
    deletedNodeId,
    ADD_RULE_RELATIONSHIP,
  ])

  // If this node had rules, its outgoing links are already deleted
  // by the node deletion cascade (if FK is set) or we need to clean up
  removeLinksFromSourceByRelationship(db, deletedNodeId, ADD_RULE_RELATIONSHIP)
}
