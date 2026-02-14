/**
 * useColumns Hook
 *
 * Derives ColumnState[] directly from Repo.
 * Replaces the old pattern of storing nodes in BoardState and deriving columns from there.
 *
 * See plan hazy-forging-crayon.md for design rationale.
 */

import { useMemo, useSyncExternalStore } from "react"
import type { Repo } from "@km/storage"
import type { KNode } from "@km/core"
import { isBlock } from "@km/core"
import { extractBody } from "@km/tree"
import type { ColumnState, CardState, ColumnRules } from "../types.ts"
import { parseColumnRules } from "../state.ts"

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
    return deriveColumnsFromRepo(repo, rootId, foldedNodes)
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
 *
 * Uses extractBody to split root children into leading body content and
 * structural (oi) columns -- matching buildBoardState's logic so that
 * zoomed-in views render identically to the board root.
 */
export function deriveColumnsFromRepo(repo: Repo, rootId: string | null, foldedNodes: Set<string>): ColumnState[] {
  // Split root children into leading body content and structural columns.
  // Only oi nodes become columns; li/link/block nodes before the first oi
  // are leading body content (displayed as a virtual "Description" column).
  const allChildren = repo.getChildren(rootId)
  const { body: bodyNodes, items: columnNodes } = extractBody(allChildren)

  // Extract WIP limits from column frontmatter
  const wipLimits = extractWipLimits(columnNodes)

  const columns: ColumnState[] = []

  // Add virtual body column for meaningful leading content
  // (paragraphs, tasks, embeds that appear before the first section/file/folder)
  const meaningfulBody = bodyNodes.filter((n) => n.content && n.content.replace(/<[^>]+>/g, "").trim().length > 0)
  if (meaningfulBody.length > 0) {
    columns.push({
      node: createVirtualBodyNode(rootId),
      cards: [{ node: meaningfulBody[0]!, children: [], childCount: 0, isVirtual: true, bodyNodes: meaningfulBody }],
      isVirtual: true,
    })
  }

  // Convert structural children to columns
  for (const node of columnNodes) {
    columns.push(kNodeToColumnState(repo, node, wipLimits, foldedNodes))
  }

  return columns
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

  // Extract body content (paragraphs before first section/file/folder)
  const { body: bodyNodes, items: structuralNodes } = extractBody(cardNodes)

  // Build cards from body + structural children.
  // Body blocks (p, code, quote) merge into one virtual card.
  // Non-block body items (li, link/embed) become individual cards.
  // Structural (oi) nodes are regular cards.
  const cards: CardState[] = []

  // Block-type nodes without link_to are pure body content (p, code, quote).
  // Nodes with link_to are embeds — discrete navigable items even if block-typed.
  const isMergeableBody = (n: KNode) => isBlock(n.type) && !n.link_to
  const mergedBody = bodyNodes.filter(isMergeableBody)
  const discreteBody = bodyNodes.filter((n) => !isMergeableBody(n))

  if (mergedBody.length > 0) {
    cards.push({
      node: mergedBody[0]!,
      children: [],
      childCount: 0,
      isVirtual: true,
      bodyNodes: mergedBody,
    })
  }

  // Non-block body items (li, link/embed) and structural (oi) nodes are regular cards
  for (const child of [...discreteBody, ...structuralNodes]) {
    const childChildren = repo.getChildren(child.id)
    const isFolded = foldedNodes.has(child.id)
    cards.push({
      node: child,
      children: isFolded ? [] : childChildren,
      childCount: childChildren.length,
    })
  }

  return {
    node,
    cards,
    wipLimit,
    rules,
  }
}

/**
 * Create a virtual node for the body column.
 * This node represents leading non-section content grouped for display.
 */
function createVirtualBodyNode(parentId: string | null): KNode {
  const now = Date.now()
  return {
    id: `__body__${parentId ?? "root"}`,
    type: "oi",
    fstype: "mdsection",
    parent_id: parentId,
    parent_idx: 0,
    title: "Description",
    content: "",
    data: {},
    link_to: null,
    created_at: now,
    updated_at: now,
    version: "",
  }
}
