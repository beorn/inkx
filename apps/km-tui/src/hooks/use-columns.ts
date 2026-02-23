/**
 * useColumns Hook — VIEW MODEL DERIVATION
 *
 * Derives ColumnView[] from Repo. This is the main view model construction point:
 * it reads data model (KNode tree via Repo) and produces view model (ColumnView with KNode cards).
 *
 * Structure:
 * 1. useColumns() — React hook with repo subscription
 * 2. deriveColumnsFromRepo() — Pure function: repo → ColumnView[]
 * 3. buildNodeIndex() — O(1) cursor position lookup map
 * 4. deriveCursorIndices() — Derives colIndex/cardIndex from cursorNodeId
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from "react"
import type { Repo } from "@km/storage"
import type { KNode } from "@km/core"
import { isEmbed } from "@km/core"
import { createLogger } from "@beorn/logger"
import { extractBody } from "@km/tree"
import type { ColumnView } from "../types.ts"
import type { SectionRules } from "@km/markdown"
import { parseHeadingRules } from "@km/markdown"

const log = createLogger("km:tui:columns")

// =============================================================================
// Helpers — collapsed node filtering
// =============================================================================

/** Nodes with km.collapse:: true (e.g., imported comments/attachments/activity) are
 *  shown only in the detail pane, never as cards in columns.
 *  Also supports legacy detailOnly data flag. */
function isCollapsedChild(node: KNode): boolean {
  if ((node.data as Record<string, unknown>)?.detailOnly === true) return true
  const rules = node.rules ?? parseHeadingRules(node.title || "").rules
  return rules.collapse === true
}

// =============================================================================
// Cursor Position Derivation
// =============================================================================

export interface CursorIndices {
  colIndex: number
  cardIndex: number
  isAtCardLevel: boolean
}

/**
 * Derive cursor indices from cursorNodeId using nodeIndex for O(1) lookup.
 */
export function deriveCursorIndices(
  columns: ColumnView[],
  cursorNodeId: string | null,
  nodeIndex: Map<string, { colIndex: number; cardIndex: number }>,
): CursorIndices {
  if (!cursorNodeId || columns.length === 0) {
    return { colIndex: -1, cardIndex: -1, isAtCardLevel: false }
  }

  const pos = nodeIndex.get(cursorNodeId)
  if (pos) {
    return {
      colIndex: pos.colIndex,
      cardIndex: pos.cardIndex,
      isAtCardLevel: pos.cardIndex !== -1,
    }
  }

  // Cursor node not found in visible columns
  const perfLog = createLogger("km:perf")
  perfLog.debug?.(`cursor node ${cursorNodeId?.slice(-8)} not found in nodeIndex (${nodeIndex.size} entries)`)
  return { colIndex: -1, cardIndex: -1, isAtCardLevel: false }
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
 * @param foldDepths - Map of node ID → depth budget (0 = folded, no entry = inherit)
 * @returns ColumnView[] for rendering
 */
export function useColumns(repo: Repo, rootId: string | null, foldDepths: Map<string, number>): ColumnView[] {
  // Subscribe to repo mutations — triggers re-render on any mutation
  const repoVersion = useSyncExternalStore(repo.subscribe, repo.getSnapshot)

  // Coalesce rapid version bumps — multiple mutations within one frame
  // (e.g., background link resolution firing touch() multiple times)
  // only trigger one derivation. Disabled in test env where act() needs sync updates.
  // @ts-expect-error - React internal flag set by inkx test renderer
  const isTest = globalThis.IS_REACT_ACT_ENVIRONMENT as boolean
  const [debouncedVersion, setDebouncedVersion] = useState(repoVersion)
  useEffect(() => {
    if (isTest) {
      setDebouncedVersion(repoVersion)
      return
    }
    const id = setTimeout(() => setDebouncedVersion(repoVersion), 0)
    return () => clearTimeout(id)
  }, [repoVersion, isTest])

  // In test mode, use repoVersion directly for synchronous updates
  const effectiveVersion = isTest ? repoVersion : debouncedVersion

  return useMemo(() => {
    // No preloadSubtree here — getChildren() lazily loads from DB on cache miss.
    // computeDefaultFolds already warms the cache for cards at fold depth.
    // Avoiding the recursive CTE eliminates 10s+ startup freeze on large vaults.
    return deriveColumnsFromRepo(repo, rootId, foldDepths)
  }, [effectiveVersion, rootId, foldDepths])
}

/**
 * Build a nodeId → {colIndex, cardIndex} map for O(1) cursor position lookup.
 * Includes column header nodes (cardIndex = -1) and card nodes.
 * When getChildren is provided, also maps card descendants for cursor resolution
 * (e.g., after indent, the indented node resolves to its parent card's position).
 */
export function buildNodeIndex(
  columns: ColumnView[],
  getChildren?: (parentId: string) => { id: string }[],
  foldDepths?: Map<string, number>,
  rootId?: string | null,
): Map<string, { colIndex: number; cardIndex: number }> {
  const index = new Map<string, { colIndex: number; cardIndex: number }>()
  // Root fold depth controls how deep within each card to index for navigation
  const rootDepth = foldDepths?.get(rootId ?? "") ?? 1
  for (let colIdx = 0; colIdx < columns.length; colIdx++) {
    const col = columns[colIdx]
    if (!col) continue
    // Column header node
    index.set(col.node.id, { colIndex: colIdx, cardIndex: -1 })
    // Card nodes + descendants
    for (let cardIdx = 0; cardIdx < col.cardNodes.length; cardIdx++) {
      const card = col.cardNodes[cardIdx]
      if (!card) continue
      index.set(card.id, { colIndex: colIdx, cardIndex: cardIdx })
      if (getChildren) {
        // Per-card override or root depth
        const cardDepth = foldDepths?.get(card.id) ?? rootDepth
        mapDescendants(card.id, colIdx, cardIdx, index, getChildren, foldDepths, cardDepth)
      }
    }
  }
  return index
}

function mapDescendants(
  parentId: string,
  colIndex: number,
  cardIndex: number,
  index: Map<string, { colIndex: number; cardIndex: number }>,
  getChildren: (parentId: string) => { id: string }[],
  foldDepths: Map<string, number> | undefined,
  remainingDepth: number,
): void {
  if (remainingDepth <= 0) return
  for (const child of getChildren(parentId)) {
    if (!index.has(child.id)) {
      index.set(child.id, { colIndex, cardIndex })
      const childDepth = foldDepths?.get(child.id) ?? remainingDepth - 1
      mapDescendants(child.id, colIndex, cardIndex, index, getChildren, foldDepths, childDepth)
    }
  }
}

/**
 * Pure function to derive columns from Repo.
 * Can be used outside of React for testing and in the store for synchronous layout.
 *
 * Uses extractBody to split root children into leading body content and
 * structural (outline) columns -- matching buildBoardState's logic so that
 * zoomed-in views render identically to the board root.
 */
export function deriveColumnsFromRepo(
  repo: Repo,
  rootId: string | null,
  foldDepths: Map<string, number>,
): ColumnView[] {
  using span = log.span("derive-columns")
  // Split root children into leading body content and structural columns.
  // Only outline nodes become columns; list items/embeds/block nodes before the first outline
  // are leading body content (displayed as a virtual "Description" column).
  const allChildren = repo.getChildren(rootId)
  const { body: bodyNodes, items: columnNodes } = extractBody(allChildren)

  // Extract WIP limits from column frontmatter
  const wipLimits = extractWipLimits(columnNodes)

  const columns: ColumnView[] = []

  // Add virtual body column for meaningful leading content
  // (paragraphs, tasks, embeds that appear before the first section/file/folder)
  const filteredBody = bodyNodes.filter(
    (n) => !isCollapsedChild(n) && n.content && n.content.replace(/<[^>]+>/g, "").trim().length > 0,
  )

  if (filteredBody.length > 0) {
    const virtualCardIds = new Set<string>()
    for (const n of filteredBody) {
      if (!isEmbed(n.type)) virtualCardIds.add(n.id)
    }
    columns.push({
      node: createVirtualBodyNode(rootId),
      cardNodes: filteredBody,
      virtualCardIds,
      isVirtual: true,
    })
  }

  // Deduplicate column nodes by fs_path (import bugs can create duplicate file entries).
  // Keep the node with more children; if tied, keep the first one.
  const deduped = deduplicateByFsPath(columnNodes, (id) => repo.getChildren(id).length)

  // Convert structural children to columns (with per-column memoization)
  for (const node of deduped) {
    columns.push(kNodeToColumnViewCached(repo, node, wipLimits, foldDepths))
  }

  span.spanData.columns = columns.length
  return columns
}

// =============================================================================
// Per-column memoization
// =============================================================================

/**
 * Cache for kNodeToColumnView results to avoid re-deriving unchanged columns.
 * Key: column node ID. The cache is invalidated per-column when:
 * - The column's children array reference changes (childrenCache was busted)
 * - The foldDepths map reference changes (fold state changed)
 * - WIP limits change
 *
 * This avoids the O(columns * cards) cost on every repoVersion bump when
 * only one column's children actually changed.
 */
interface ColumnViewCacheEntry {
  childrenRef: KNode[] // Reference identity check — childrenCache returns same array if not busted
  foldDepthsRef: Map<string, number>
  wipLimitsRef: Map<string, number>
  view: ColumnView
}

const columnViewCache = new Map<string, ColumnViewCacheEntry>()

function kNodeToColumnViewCached(
  repo: Repo,
  node: KNode,
  wipLimits: Map<string, number>,
  foldDepths: Map<string, number>,
): ColumnView {
  const childrenRef = repo.getChildren(node.id)
  const cached = columnViewCache.get(node.id)

  if (
    cached &&
    cached.childrenRef === childrenRef &&
    cached.foldDepthsRef === foldDepths &&
    cached.wipLimitsRef === wipLimits
  ) {
    return cached.view
  }

  const view = kNodeToColumnView(repo, node, wipLimits, foldDepths)
  columnViewCache.set(node.id, { childrenRef, foldDepthsRef: foldDepths, wipLimitsRef: wipLimits, view })
  return view
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Deduplicate column nodes that share the same fs_path.
 * Import bugs can create duplicate file entries in the DB.
 * Keeps the node with more children; if tied, keeps the first occurrence.
 */
export function deduplicateByFsPath(nodes: KNode[], getChildCount: (id: string) => number): KNode[] {
  const seen = new Map<string, { node: KNode; childCount: number }>()
  const result: KNode[] = []

  for (const node of nodes) {
    const path = node.fs_path
    if (!path) {
      result.push(node)
      continue
    }

    const childCount = getChildCount(node.id)
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
 * Convert a KNode to ColumnView.
 */
function kNodeToColumnView(
  repo: Repo,
  node: KNode,
  wipLimits: Map<string, number>,
  _foldDepths: Map<string, number>,
): ColumnView {
  // Use node.rules if available, otherwise parse from title
  const rules: SectionRules = node.rules ?? parseHeadingRules(node.title || "").rules

  // Look up WIP limit
  const normalizedName = (node.name || node.title || "").toLowerCase().replace(/\s+/g, "_")
  const wipLimit = rules.limit ?? wipLimits.get(normalizedName)

  // Split children into body (paragraphs) and structural (outline) cards
  const allCardNodes = repo.getChildren(node.id)
  const { body: bodyNodes, items: structuralNodes } = extractBody(allCardNodes)

  const cardNodes: KNode[] = []
  const virtualCardIds = new Set<string>()

  for (const child of bodyNodes) {
    if (isCollapsedChild(child)) continue
    cardNodes.push(child)
    if (!isEmbed(child.type)) virtualCardIds.add(child.id)
  }
  for (const child of structuralNodes) {
    // Collapsed structural nodes are kept but rendered folded (compact card)
    // Only body blocks are filtered out by isCollapsedChild
    cardNodes.push(child)
  }

  return { node, cardNodes, virtualCardIds, wipLimit, rules }
}

/**
 * Create a virtual node for the body column.
 * This node represents leading non-section content grouped for display.
 */
function createVirtualBodyNode(parentId: string | null): KNode {
  const now = Date.now()
  return {
    id: `__body__${parentId ?? "root"}`,
    type: "h",
    item: true,
    fstype: "mdsection",
    parent_id: parentId,
    parent_idx: 0,
    title: "Description",
    content: "",
    data: {},
    created_at: now,
    updated_at: now,
    version: "",
  }
}
