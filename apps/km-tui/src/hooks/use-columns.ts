/**
 * useColumns Hook
 *
 * Derives ColumnState[] directly from Repo.
 * Replaces the old pattern of storing nodes in BoardState and deriving columns from there.
 *
 * See plan hazy-forging-crayon.md for design rationale.
 */

import { useMemo, useSyncExternalStore } from "react"
import { createLogger } from "@beorn/logger"
import type { Repo } from "@km/storage"
import type { KNode } from "@km/core"
import type { ColumnState, CardState, ColumnRules } from "../types.ts"
import { parseColumnRules } from "../state.ts"

const log = createLogger("km:perf")

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
 * Uses useSyncExternalStore to subscribe to repo mutations — columns
 * automatically recompute when any mutation (updateNode, moveNode, etc.)
 * occurs, without requiring manual dispatch at each call site.
 *
 * @param repo - Repo instance
 * @param rootId - Current zoom root (null for repo root)
 * @param foldedNodes - Set of folded node IDs
 * @returns ColumnState[] for rendering
 */
export function useColumns(repo: Repo, rootId: string | null, foldedNodes: Set<string>): ColumnState[] {
  // Subscribe to repo mutations — triggers re-render on any mutation
  const repoVersion = useSyncExternalStore(repo.subscribe, repo.getSnapshot)

  return useMemo(() => {
    const start = performance.now()
    const result = deriveColumnsFromRepo(repo, rootId, foldedNodes)
    const duration = performance.now() - start
    if (duration > 5) {
      log.debug?.(`useColumns: ${duration.toFixed(2)}ms for ${result.length} columns`)
    }
    return result
  }, [repoVersion, rootId, foldedNodes])
}

/**
 * Build a nodeId → {colIndex, cardIndex} map for O(1) cursor position lookup.
 * Includes column header nodes (cardIndex = COLUMN_HEADER_INDEX) and card nodes.
 * Also checks card children for descendant mapping.
 */
export function buildNodeIndex(columns: ColumnState[]): Map<string, { colIndex: number; cardIndex: number }> {
  const index = new Map<string, { colIndex: number; cardIndex: number }>()
  for (let colIdx = 0; colIdx < columns.length; colIdx++) {
    const col = columns[colIdx]
    if (!col) continue
    // Column header node
    index.set(col.node.id, { colIndex: colIdx, cardIndex: -1 })
    // Card nodes
    for (let cardIdx = 0; cardIdx < col.cards.length; cardIdx++) {
      const card = col.cards[cardIdx]
      if (!card) continue
      index.set(card.node.id, { colIndex: colIdx, cardIndex: cardIdx })
      // Map descendants to this card position
      for (const child of card.children) {
        mapDescendants(child, colIdx, cardIdx, index)
      }
    }
  }
  return index
}

function mapDescendants(
  node: { id: string; children?: unknown[] },
  colIndex: number,
  cardIndex: number,
  index: Map<string, { colIndex: number; cardIndex: number }>,
): void {
  index.set(node.id, { colIndex, cardIndex })
  const children = (node as { children?: { id: string; children?: unknown[] }[] }).children
  if (children) {
    for (const child of children) {
      mapDescendants(child, colIndex, cardIndex, index)
    }
  }
}

/**
 * Pure function to derive columns from Repo.
 * Can be used outside of React for testing and in the store for synchronous layout.
 */
export function deriveColumnsFromRepo(repo: Repo, rootId: string | null, foldedNodes: Set<string>): ColumnState[] {
  // Get children of root, filtered to exclude non-column types
  const allChildren = repo.getChildren(rootId)
  const columnNodes = allChildren.filter((n) => !NON_COLUMN_TYPES.has(n.type))

  // Extract WIP limits from root frontmatter
  const wipLimits = extractWipLimits(columnNodes)

  // Convert to column state
  return columnNodes.map((node) => kNodeToColumnState(repo, node, wipLimits, foldedNodes))
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
    const columnsConfig = (node.data as { columns?: Record<string, { limit?: number }> })?.columns
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
  // Use node.rules if available, otherwise parse from title
  const rules: ColumnRules = node.rules ?? parseColumnRules(node.title || "")

  // Look up WIP limit
  const normalizedName = (node.name || node.title || "").toLowerCase().replace(/\s+/g, "_")
  const wipLimit = rules.limit ?? wipLimits.get(normalizedName)

  // Get cards (children of column)
  const cardNodes = repo.getChildren(node.id)

  // Convert children to cards
  const cards: CardState[] = cardNodes.map((child) => {
    const childChildren = repo.getChildren(child.id)
    const isFolded = foldedNodes.has(child.id)
    return {
      node: child,
      children: isFolded ? [] : childChildren,
      childCount: childChildren.length,
    }
  })

  return {
    node,
    cards,
    wipLimit,
    rules,
  }
}
