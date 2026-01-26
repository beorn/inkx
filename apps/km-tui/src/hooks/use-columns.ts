/**
 * useColumns Hook
 *
 * Derives ColumnState[] directly from Repo.
 * Replaces the old pattern of storing nodes in BoardState and deriving columns from there.
 *
 * See plan hazy-forging-crayon.md for design rationale.
 */

import { useMemo } from "react"
import type { Repo } from "@km/storage"
import type { KNode } from "@km/core"
import type { ColumnState, CardState, ColumnRules } from "../types.ts"
import { parseColumnRules } from "../state.ts"

// =============================================================================
// Non-Column Types (content blocks, not navigable columns)
// =============================================================================

const NON_COLUMN_TYPES = new Set(["paragraph", "code", "quote"])

// =============================================================================
// Hook
// =============================================================================

/**
 * Derive columns from Repo for rendering.
 *
 * @param repo - Repo instance
 * @param rootId - Current zoom root (null for repo root)
 * @param foldedNodes - Set of folded node IDs
 * @returns ColumnState[] for rendering
 */
export function useColumns(
  repo: Repo,
  rootId: string | null,
  foldedNodes: Set<string>,
): ColumnState[] {
  return useMemo(() => {
    return deriveColumnsFromRepo(repo, rootId, foldedNodes)
  }, [repo.stats.nodeCount, rootId, foldedNodes])
}

/**
 * Pure function to derive columns from Repo.
 * Can be used outside of React for testing.
 */
export function deriveColumnsFromRepo(
  repo: Repo,
  rootId: string | null,
  foldedNodes: Set<string>,
): ColumnState[] {
  // Get children of root, filtered to exclude non-column types
  const allChildren = repo.getChildren(rootId)
  const columnNodes = allChildren.filter((n) => !NON_COLUMN_TYPES.has(n.type))

  // Extract WIP limits from root frontmatter
  const wipLimits = extractWipLimits(columnNodes)

  // Convert to column state
  return columnNodes.map((node) =>
    kNodeToColumnState(repo, node, wipLimits, foldedNodes),
  )
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Extract WIP limits from column nodes' frontmatter.
 */
function extractWipLimits(nodes: KNode[]): Map<string, number> {
  const limits = new Map<string, number>()

  for (const node of nodes) {
    const columnsConfig = (
      node.data as { columns?: Record<string, { limit?: number }> }
    )?.columns
    if (!columnsConfig) continue

    for (const [colName, config] of Object.entries(columnsConfig)) {
      if (typeof config?.limit === "number" && config.limit > 0) {
        const normalizedName = colName.toLowerCase().replace(/\s+/g, "_")
        limits.set(normalizedName, config.limit)
      }
    }
  }

  return limits
}

/**
 * Convert a KNode to ColumnState.
 */
function kNodeToColumnState(
  repo: Repo,
  node: KNode,
  wipLimits: Map<string, number>,
  foldedNodes: Set<string>,
): ColumnState {
  // Parse column rules from node content
  const rules: ColumnRules = parseColumnRules(node.title || "")

  // Look up WIP limit
  const normalizedName = (node.name || node.title || "")
    .toLowerCase()
    .replace(/\s+/g, "_")
  const wipLimit = rules.limit ?? wipLimits.get(normalizedName)

  // Get cards (children of column)
  const cardNodes = repo.getChildren(node.id)

  // Convert children to cards
  const cards: CardState[] = cardNodes.map((child) => ({
    node: child,
    children: foldedNodes.has(child.id)
      ? [] // Don't load children for folded nodes
      : repo.getChildren(child.id),
    childCount: repo.getChildren(child.id).length,
  }))

  return {
    node,
    cards,
    wipLimit,
    rules,
  }
}
