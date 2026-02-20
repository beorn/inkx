/**
 * useColumns Hook — VIEW MODEL DERIVATION
 *
 * Derives ColumnState[] from Repo. This is the main view model construction point:
 * it reads data model (KNode tree via Repo) and produces view model (ColumnState/CardState).
 *
 * Structure:
 * 1. useColumns() — React hook with repo subscription
 * 2. deriveColumnsFromRepo() — Pure function: repo → ColumnState[]
 * 3. buildNodeIndex() — O(1) cursor position lookup map
 */

import { useMemo, useSyncExternalStore } from "react"
import type { Repo } from "@km/storage"
import type { KNode } from "@km/core"
import { extractBody } from "@km/tree"
import type { ColumnState, CardState } from "../types.ts"
import type { SectionRules } from "@km/markdown"
import { parseHeadingRules } from "@km/markdown"

// =============================================================================
// Helpers — detail-only filtering
// =============================================================================

/** Nodes marked detailOnly (e.g., imported comments/attachments/activity) are
 *  shown only in the detail pane, never as cards in columns. */
function isDetailOnly(node: KNode): boolean {
  return (node.data as Record<string, unknown>)?.detailOnly === true
}

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
  const bodyCards = bodyNodes
    .filter((n) => n.content && n.content.replace(/<[^>]+>/g, "").trim().length > 0)
    .map((n) => buildCardState(repo, n, foldedNodes, true))
    .filter((c): c is CardState => c !== null)

  if (bodyCards.length > 0) {
    columns.push({
      node: createVirtualBodyNode(rootId),
      cards: bodyCards,
      isVirtual: true,
    })
  }

  // Deduplicate column nodes by fs_path (import bugs can create duplicate file entries).
  // Keep the node with more children; if tied, keep the first one.
  const deduped = deduplicateByFsPath(columnNodes, repo)

  // Convert structural children to columns
  for (const node of deduped) {
    columns.push(kNodeToColumnState(repo, node, wipLimits, foldedNodes))
  }

  return columns
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Deduplicate column nodes that share the same fs_path.
 * Import bugs can create duplicate file entries in the DB.
 * Keeps the node with more children; if tied, keeps the first occurrence.
 */
function deduplicateByFsPath(nodes: KNode[], repo: Repo): KNode[] {
  const seen = new Map<string, { node: KNode; childCount: number }>()
  const result: KNode[] = []

  for (const node of nodes) {
    const path = node.fs_path
    if (!path) {
      result.push(node)
      continue
    }

    const childCount = repo.getChildren(node.id).length
    const existing = seen.get(path)

    if (!existing) {
      seen.set(path, { node, childCount })
      result.push(node)
    } else if (childCount > existing.childCount) {
      // Replace the previous entry with this one (more children)
      const idx = result.indexOf(existing.node)
      if (idx >= 0) result[idx] = node
      seen.set(path, { node, childCount })
    }
    // Otherwise skip (existing has more or equal children)
  }

  return result
}

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
 * Build a CardState from a KNode. Shared by virtual body columns and structural columns.
 * - Body nodes (non-link_to) are marked isVirtual for borderless rendering.
 * - Embed links (link_to) are discrete items — not virtual.
 * - Children are fetched for buildNodeIndex cursor resolution.
 * - detailOnly nodes are excluded.
 */
function buildCardState(repo: Repo, node: KNode, foldedNodes: Set<string>, isBody: boolean): CardState | null {
  if (isDetailOnly(node)) return null
  const children = repo.getChildren(node.id)
  const isFolded = foldedNodes.has(node.id)
  return {
    node,
    children: isFolded ? [] : children,
    childCount: children.length,
    ...(isBody && !node.link_to ? { isVirtual: true } : {}),
  }
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
  const rules: SectionRules = node.rules ?? parseHeadingRules(node.title || "").rules

  // Look up WIP limit
  const normalizedName = (node.name || node.title || "").toLowerCase().replace(/\s+/g, "_")
  const wipLimit = rules.limit ?? wipLimits.get(normalizedName)

  // Split children into body (paragraphs) and structural (oi) cards
  const cardNodes = repo.getChildren(node.id)
  const { body: bodyNodes, items: structuralNodes } = extractBody(cardNodes)

  const cards: CardState[] = []
  for (const child of bodyNodes) {
    const card = buildCardState(repo, child, foldedNodes, true)
    if (card) cards.push(card)
  }
  for (const child of structuralNodes) {
    const card = buildCardState(repo, child, foldedNodes, false)
    if (card) cards.push(card)
  }

  return { node, cards, wipLimit, rules }
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

