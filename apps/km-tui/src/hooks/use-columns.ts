/**
 * useColumns Hook — VIEW MODEL DERIVATION
 *
 * Thin wrapper over ViewNode tree (km-board). Delegates column derivation to
 * buildViewTree() + viewNodeToColumnViews(), keeping only React hook plumbing
 * and cursor index utilities.
 *
 * Structure:
 * 1. useColumns() — React hook with repo subscription
 * 2. deriveColumnsFromRepo() — Delegates to buildViewTree + viewNodeToColumnViews
 * 3. buildNodeIndex() — O(1) cursor position lookup map
 * 4. deriveCursorIndices() — Derives colIndex/cardIndex from cursor
 */

import { useRef, useState } from "react"
import type { Repo } from "@km/storage"
import { KNode } from "@km/core"
import { useStore } from "../state/store-context.tsx"
import { useCommitVersion } from "./use-signal.ts"
import { createLogger } from "loggily"
import type { CardView, ColumnView } from "../types.ts"
import { computeMetadataKeys, DETAIL_META_PREFIX } from "../views/detail-pane-items.ts"
import {
  buildViewTree,
  viewNodeToColumnViews,
  type ViewNode,
  type ViewNodeColumnCache,
  type ViewTreeRepo,
} from "@km/board"

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loggily types don't fully resolve via tsc bundler mode
const log = createLogger("km:tui:columns") as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const perfLog = createLogger("km:perf") as any

// =============================================================================
// Column derivation — delegates to ViewNode tree
// =============================================================================

/** Default per-column memoization cache — used when no external cache is provided (tests, driver) */
const defaultViewNodeCache: ViewNodeColumnCache = new Map()

/**
 * Internal derivation — builds ViewNode tree and converts to ColumnView[].
 * Returns both for callers that need the tree (buildOpCtx).
 *
 * @param cache - External ViewNodeColumnCache (per-pane in board-app, default singleton elsewhere)
 * @param hiddenNodeIds - Node IDs to exclude from the tree (board-level hidden filtering)
 */
function deriveColumnsAndTree(
  repo: Repo,
  rootId: string | null,
  foldDepths: Map<string, number>,
  cache: ViewNodeColumnCache,
  hiddenNodeIds?: Set<string>,
): { columns: ColumnView[]; viewTree: ViewNode } {
  using span = log.span("derive-columns")

  // Build the ViewNode tree — WIP limits are extracted from column nodes inside the tree
  const viewTree = buildViewTree(repo as ViewTreeRepo, rootId, foldDepths, cache, hiddenNodeIds)

  // Convert ViewNode tree to ColumnView[] with full CardView[]
  const columns = viewNodeToColumnViews(viewTree) as ColumnView[]

  span.spanData.columns = columns.length
  return { columns, viewTree }
}

/**
 * CANONICAL column derivation — the single source of truth for Repo → ColumnView[].
 *
 * All runtime column derivation paths must delegate here:
 * - useColumns() hook (React render path)
 * - buildOpCtx() in board-app.ts (key handler path, via deriveColumnsWithTree)
 * - driver.ts getContext/getDriverState (test/AI automation path)
 *
 * Delegates to buildViewTree() for tree construction and viewNodeToColumnViews()
 * for ColumnView[] conversion. The ViewNode tree is the authoritative derivation;
 * this function is a thin bridge to the km-tui ColumnView shape.
 */
export function deriveColumnsFromRepo(
  repo: Repo,
  rootId: string | null,
  foldDepths: Map<string, number>,
): ColumnView[] {
  return deriveColumnsAndTree(repo, rootId, foldDepths, defaultViewNodeCache).columns
}

/**
 * Extended column derivation that also returns the ViewNode tree.
 * Used by buildOpCtx which needs both columns and the tree for navigation/indexing.
 *
 * @param cache - External ViewNodeColumnCache (per-pane cache for cross-call memoization)
 * @param hiddenNodeIds - Node IDs to exclude from the tree (board-level hidden filtering)
 */
export function deriveColumnsWithTree(
  repo: Repo,
  rootId: string | null,
  foldDepths: Map<string, number>,
  cache: ViewNodeColumnCache,
  hiddenNodeIds?: Set<string>,
): { columns: ColumnView[]; viewTree: ViewNode } {
  return deriveColumnsAndTree(repo, rootId, foldDepths, cache, hiddenNodeIds)
}

// =============================================================================
// Detail view columns
// =============================================================================

/**
 * Derive columns for the detail view mode.
 *
 * Returns a single virtual column containing:
 * 1. Virtual metadata property nodes (with __meta__ IDs) — navigable property rows
 * 2. Actual tree children — shown as card-like rows below the properties
 *
 * This gives standard j/k navigation through metadata rows first, then children.
 */
export function deriveDetailColumns(repo: Repo, rootId: string | null, _foldDepths: Map<string, number>): ColumnView[] {
  const rootNode = rootId ? repo.getNode(rootId) : null

  // Compute metadata rows for the root node
  const metaKeys = rootNode ? computeMetadataKeys(rootNode) : []
  const metaNodes = metaKeys.map((key) => createVirtualMetaNode(rootId, key))

  const allChildren = repo.getChildren(rootId)

  // If no metadata rows and no children, still show an empty column
  if (metaNodes.length === 0 && allChildren.length === 0) return []

  // All items (meta + children) are virtual/body for the detail column
  const allNodes = [...metaNodes, ...allChildren]
  const bodyIds = new Set(allNodes.map((n) => n.id))

  return [
    {
      node: createVirtualBodyNode(rootId),
      cardNodes: toCardViews(repo, allNodes, bodyIds),
      isVirtual: true,
    },
  ]
}

/**
 * Create a virtual node representing a metadata property row in the detail pane.
 * Uses the DETAIL_META_PREFIX convention: "__meta__Status", "__meta__Due", etc.
 */
function createVirtualMetaNode(parentId: string | null, key: string): KNode {
  const now = Date.now()
  return {
    id: `${DETAIL_META_PREFIX}${key}`,
    type: "p",
    parent_id: parentId,
    parent_idx: 0,
    content: key,
    data: {},
    created_at: now,
    updated_at: now,
    version: "",
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
    type: "h",
    item: {},
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

/**
 * Convert KNode[] to CardView[] with batch-resolved embeds.
 * Used only by deriveDetailColumns (which doesn't go through ViewNode).
 */
function toCardViews(repo: Repo, nodes: KNode[], bodyIds: Set<string>): CardView[] {
  const embedSourceIds = nodes.filter((n) => n.embed_source).map((n) => n.embed_source!)
  const resolvedMap = embedSourceIds.length > 0 ? repo.getNodesBatch(embedSourceIds) : new Map<string, KNode>()

  return nodes.map((node) => {
    const isBody = bodyIds.has(node.id)
    const resolvedNode = node.embed_source ? resolvedMap.get(node.embed_source) : undefined
    const sourceId = resolvedNode?.id ?? node.id
    const firstChild = isBody ? undefined : repo.getChildren(sourceId)[0]
    const hasBodyChildren = firstChild != null && !KNode.isOutline(firstChild)
    return {
      ...node,
      __cardView: true as const,
      resolvedNode,
      isBody,
      isBrokenEmbed: node.embed_source != null && resolvedNode === undefined,
      hasBodyChildren,
    } as CardView
  })
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
 * Derive cursor indices from cursor using nodeIndex for O(1) lookup.
 * When getNode is provided and cursor is not in the index (e.g., a descendant
 * of a card), walks up the parent chain to find the containing card's position.
 * This eliminates the need to index all descendants upfront (20k+ getChildren queries).
 */
export function deriveCursorIndices(
  columns: ColumnView[],
  cursor: string | null,
  nodeIndex: Map<string, { colIndex: number; cardIndex: number }>,
  getNode?: (id: string) => { parent_id: string | null } | null,
  /** Hint from cursor store — for embeds where parent_id chain leads to wrong card */
  cursorCardNodeId?: string | null,
): CursorIndices {
  if (!cursor || columns.length === 0) {
    return { colIndex: -1, cardIndex: -1, isAtCardLevel: false }
  }

  // Direct lookup
  let entry = nodeIndex.get(cursor)

  // On miss: try cursorCardNodeId hint first (embed-aware), then parent walk
  if (!entry && cursorCardNodeId) {
    entry = nodeIndex.get(cursorCardNodeId)
  }
  if (!entry && getNode) {
    let current = getNode(cursor)
    while (current?.parent_id) {
      entry = nodeIndex.get(current.parent_id)
      if (entry) break
      current = getNode(current.parent_id)
    }
  }

  if (entry) {
    return {
      colIndex: entry.colIndex,
      cardIndex: entry.cardIndex,
      isAtCardLevel: entry.cardIndex !== -1,
    }
  }

  // Cursor node not found in visible columns
  perfLog.debug?.(`cursor node ${cursor?.slice(-8)} not found in nodeIndex (${nodeIndex.size} entries)`)
  return { colIndex: -1, cardIndex: -1, isAtCardLevel: false }
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Derive columns from Repo for rendering.
 *
 * Uses useCommitVersion (signal-store) to subscribe to repo mutations — columns
 * automatically recompute when any mutation (updateNode, moveNode, etc.)
 * occurs, without requiring manual dispatch at each call site.
 *
 * @param repo - Repo instance
 * @param rootId - Current zoom root (null for repo root)
 * @param foldDepths - Map of node ID → depth budget (0 = folded, no entry = inherit)
 * @returns ColumnView[] for rendering
 */
export function useColumns(
  repo: Repo,
  rootId: string | null,
  foldDepths: Map<string, number>,
  viewMode?: string,
): ColumnView[] {
  // Subscribe to all store commits — triggers re-render on any structural change.
  // Uses broad subscription because column layout can be affected by any mutation.
  const store = useStore()
  const repoVersion = useCommitVersion(store)

  // Batch-preload children cache before column derivation + Card mount.
  const derive = viewMode === "detail" ? deriveDetailColumns : deriveColumnsFromRepo
  const [columns, setColumns] = useState<ColumnView[]>(() => {
    repo.preloadSubtree(rootId, 3)
    return derive(repo, rootId, foldDepths)
  })

  // Track deps to detect changes.
  const depsRef = useRef({ rootId, version: repoVersion })
  const foldDepthsRef = useRef(foldDepths)
  foldDepthsRef.current = foldDepths

  // Synchronous column derivation on rootId or version change.
  if (depsRef.current.rootId !== rootId || depsRef.current.version !== repoVersion) {
    repo.preloadSubtree(rootId, 3)
    const newColumns = derive(repo, rootId, foldDepthsRef.current)
    depsRef.current = { rootId, version: repoVersion }
    setColumns(newColumns)
  }

  return columns
}

// =============================================================================
// Node Index
// =============================================================================

/**
 * Build a nodeId → {colIndex, cardIndex} map for O(1) cursor position lookup.
 * Includes column header nodes (cardIndex = -1) and card nodes.
 * When getChildren is provided, also maps card descendants for cursor resolution.
 */
export function buildNodeIndex(
  columns: ColumnView[],
  getChildren?: (parentId: string) => { id: string }[],
  foldDepths?: Map<string, number>,
  rootId?: string | null,
): Map<string, { colIndex: number; cardIndex: number }> {
  const index = new Map<string, { colIndex: number; cardIndex: number }>()
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
