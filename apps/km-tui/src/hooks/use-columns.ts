/**
 * useColumns Hook
 *
 * Derives ColumnState[] directly from Repo.
 * Replaces the old pattern of storing nodes in BoardState and deriving columns from there.
 *
 * See plan hazy-forging-crayon.md for design rationale.
 */

import { useMemo, useRef, useSyncExternalStore } from "react"
import type { Repo } from "@km/storage"
import type { KNode } from "@km/core"
import { extractBody } from "@km/tree"
import type { ColumnState, CardState } from "../types.ts"
import type { SectionRules } from "@km/markdown"
import { parseHeadingRules } from "@km/markdown"

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
 * Structural sharing: reuses previous CardState references when the
 * underlying data hasn't changed, enabling simple reference equality
 * checks in React.memo instead of field-by-field comparison.
 *
 * @param repo - Repo instance
 * @param rootId - Current zoom root (null for repo root)
 * @param foldedNodes - Set of folded node IDs
 * @returns ColumnState[] for rendering
 */
export function useColumns(repo: Repo, rootId: string | null, foldedNodes: Set<string>): ColumnState[] {
  // Subscribe to repo mutations — triggers re-render on any mutation
  const repoVersion = useSyncExternalStore(repo.subscribe, repo.getSnapshot)
  const prevColumnsRef = useRef<ColumnState[]>([])

  return useMemo(() => {
    const next = deriveColumnsFromRepo(repo, rootId, foldedNodes)
    const shared = applyStructuralSharing(prevColumnsRef.current, next)
    prevColumnsRef.current = shared
    return shared
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
      cards: meaningfulBody.map((n) => ({ node: n, children: [], childCount: 0, ...(n.link_to ? {} : { isVirtual: true }) })),
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
  const rules: SectionRules = node.rules ?? parseHeadingRules(node.title || "").rules

  // Look up WIP limit
  const normalizedName = (node.name || node.title || "").toLowerCase().replace(/\s+/g, "_")
  const wipLimit = rules.limit ?? wipLimits.get(normalizedName)

  // Get cards (children of column)
  const cardNodes = repo.getChildren(node.id)

  // Extract body content (paragraphs before first section/file/folder)
  const { body: bodyNodes, items: structuralNodes } = extractBody(cardNodes)

  // Build cards from body + structural children.
  // Each body node is its own navigable card (isVirtual for styling).
  // Structural (oi) nodes are regular cards.
  const cards: CardState[] = []

  // Body nodes: each becomes its own navigable card.
  // Embed links (link_to) are discrete items — not virtual.
  // Children are fetched so buildNodeIndex can map descendants for cursor resolution
  // (e.g., after indent, a child may be reparented under a body node).
  for (const child of bodyNodes) {
    const childChildren = repo.getChildren(child.id)
    const isFolded = foldedNodes.has(child.id)
    cards.push({
      node: child,
      children: isFolded ? [] : childChildren,
      childCount: childChildren.length,
      ...(child.link_to ? {} : { isVirtual: true }),
    })
  }

  // Structural (oi) nodes are regular cards
  for (const child of structuralNodes) {
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

// =============================================================================
// Structural Sharing
// =============================================================================

/**
 * Check if two KNode instances have the same render-relevant fields.
 * These are the fields that affect how a card is displayed in the TUI.
 */
function nodesEqual(a: KNode, b: KNode): boolean {
  return (
    a.id === b.id &&
    a.type === b.type &&
    a.content === b.content &&
    a.task_status === b.task_status &&
    a.due_at === b.due_at &&
    a.start_at === b.start_at &&
    a.due_date === b.due_date &&
    a.scheduled_date === b.scheduled_date &&
    a.priority === b.priority &&
    a.recurrence === b.recurrence
  )
}

/**
 * Check if two CardState instances are structurally equal.
 * If so, the previous reference can be reused to skip re-renders.
 */
function cardsEqual(prev: CardState, next: CardState): boolean {
  if (!nodesEqual(prev.node, next.node)) return false
  if (prev.childCount !== next.childCount) return false
  if ((prev.children?.length ?? 0) !== (next.children?.length ?? 0)) return false
  if (prev.isVirtual !== next.isVirtual) return false

  // Check children nodes for content changes (unfolded cards)
  if (prev.children.length > 0 && next.children.length > 0) {
    for (let i = 0; i < prev.children.length; i++) {
      if (!nodesEqual(prev.children[i]!, next.children[i]!)) return false
    }
  }

  return true
}

/**
 * Apply structural sharing between previous and next column arrays.
 * Reuses previous CardState references when the underlying data hasn't changed,
 * enabling simple reference equality checks in React.memo.
 *
 * Exported for testing.
 */
export function applyStructuralSharing(prev: ColumnState[], next: ColumnState[]): ColumnState[] {
  // Build lookup from previous columns: nodeId -> ColumnState
  const prevByNodeId = new Map<string, ColumnState>()
  for (const col of prev) {
    prevByNodeId.set(col.node.id, col)
  }

  let anyColumnChanged = false
  const result: ColumnState[] = []

  for (const nextCol of next) {
    const prevCol = prevByNodeId.get(nextCol.node.id)
    if (!prevCol) {
      // New column — no sharing possible
      result.push(nextCol)
      anyColumnChanged = true
      continue
    }

    // Share individual cards within the column
    let anyCardChanged = false
    const sharedCards: CardState[] = []

    for (let i = 0; i < nextCol.cards.length; i++) {
      const nextCard = nextCol.cards[i]!
      const prevCard = prevCol.cards[i]

      if (prevCard && cardsEqual(prevCard, nextCard)) {
        // Reuse previous reference — enables === check in React.memo
        sharedCards.push(prevCard)
      } else {
        sharedCards.push(nextCard)
        anyCardChanged = true
      }
    }

    // If card count changed, column changed
    if (nextCol.cards.length !== prevCol.cards.length) {
      anyCardChanged = true
    }

    if (anyCardChanged || !nodesEqual(prevCol.node, nextCol.node) || prevCol.wipLimit !== nextCol.wipLimit) {
      result.push({ ...nextCol, cards: sharedCards })
      anyColumnChanged = true
    } else {
      // Entire column unchanged — reuse previous reference
      result.push(prevCol)
    }
  }

  // If nothing changed and same length, check if order also matches.
  // Column shift (Meta+l/Meta+h) swaps sort orders without changing content —
  // without this order check, the old array is reused and columns don't reorder.
  if (!anyColumnChanged && prev.length === next.length) {
    let sameOrder = true
    for (let i = 0; i < prev.length; i++) {
      if (prev[i]!.node.id !== next[i]!.node.id) {
        sameOrder = false
        break
      }
    }
    if (sameOrder) return prev
  }

  return result
}
