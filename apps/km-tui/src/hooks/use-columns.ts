/**
 * useColumns Hook — VIEW MODEL DERIVATION
 *
 * Thin wrapper over the TreeLens (km-board). Delegates column derivation to
 * createViewLens() + deriveColumnsFromLens(), keeping only React hook plumbing
 * and cursor index utilities.
 *
 * Structure:
 * 1. useColumns() — React hook with repo subscription
 * 2. deriveColumnsFromRepo() — Builds a lens internally, then deriveColumnsFromLens
 * 3. deriveColumnsFromLens() — Lens → ColumnView[] conversion
 * 4. buildNodeIndex() — O(1) cursor position lookup map
 * 5. deriveCursorIndices() — Derives colIndex/cardIndex from cursor
 */

import { useRef, useState } from "react"
import type { Repo } from "@km/storage"
import { KNode } from "@km/core"
import { useStore } from "../state/store-context.tsx"
import { useCommitVersion } from "./use-signal.ts"
import { createLogger } from "loggily"
import type { ColumnView } from "../types.ts"
import { computeMetadataKeys, DETAIL_META_PREFIX } from "../views/detail-pane-items.ts"
import { createViewLens, extractWipLimits, type TreeLens, type ViewLensRepo } from "@km/board"

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loggily types don't fully resolve via tsc bundler mode
const log = createLogger("km:tui:columns") as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const perfLog = createLogger("km:perf") as any

// =============================================================================
// Column derivation — delegates to the TreeLens
// =============================================================================

/**
 * CANONICAL column derivation — the single source of truth for Repo → ColumnView[].
 *
 * Runtime column derivation paths:
 * - Board.tsx via deriveColumnsFromLens (primary React path)
 * - buildOpCtx() in board-app.ts via deriveColumnsFromLens
 * - driver.ts getContext/getDriverState (test/AI automation path)
 * - km-canvas.tsx via useColumns() hook (web target)
 *
 * Builds an ephemeral ViewLens over the repo and delegates to deriveColumnsFromLens.
 * Used by tests, the web target, and any caller that doesn't already have a lens.
 */
export function deriveColumnsFromRepo(
  repo: Repo,
  rootId: string | null,
  foldDepths: Map<string, number>,
): ColumnView[] {
  using span = log.span("derive-columns")
  const lens = createViewLens(repo as unknown as ViewLensRepo, { rootId, foldDepths })
  const columns = deriveColumnsFromLens(lens, repo)
  span.spanData.columns = columns.length
  return columns
}

/**
 * Derive ColumnView[] from a TreeLens — the modern, lens-based path.
 * No ViewNode tree, no ViewNodeColumnCache — the lens caches internally.
 * Used by Board.tsx, buildOpCtx, driver.ts, and deriveColumnsFromRepo.
 */
export function deriveColumnsFromLens(
  lens: TreeLens,
  repo: { getNode: (id: string) => KNode | null | undefined },
): ColumnView[] {
  const rootId = lens.rootId
  if (!rootId) return []

  const colIds = lens.children(rootId)

  // Collect structural column nodes for WIP limit extraction (excludes body-column)
  const structuralNodes: KNode[] = []
  for (const colId of colIds) {
    if (lens.role(colId) !== "body-column") {
      const node = lens.get(colId)
      if (node) structuralNodes.push(node)
    }
  }
  const wipLimits = extractWipLimits(structuralNodes)

  return colIds
    .map((colId): ColumnView | null => {
      const node = lens.get(colId)
      if (!node) return null
      const role = lens.role(colId)
      const rules = lens.rules(colId)
      const cardIds = lens.children(colId)
      const cardNodes = cardIds.map((id) => lens.get(id) ?? repo.getNode(id)).filter((n): n is KNode => n != null)
      const normalizedName = (node.name || node.title || "").toLowerCase().replace(/\s+/g, "_")
      const wipLimit = rules?.limit ?? wipLimits.get(normalizedName)
      return {
        node,
        cardNodes,
        rules,
        wipLimit,
        isVirtual: role === "body-column" ? true : undefined,
      }
    })
    .filter((c): c is ColumnView => c != null)
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
      cardNodes: toCards(repo, allNodes, bodyIds),
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

/** Convert KNode[] to plain KNode[] (identity — CardView enrichment no longer needed). */
function toCards(_repo: Repo, nodes: KNode[], _bodyIds: Set<string>): KNode[] {
  return nodes
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

/**
 * Build nodeIndex from ViewTreeProjection — no ColumnView dependency.
 * Uses tree.children(rootId) for columns, tree.children(colId) for cards.
 */
export function buildNodeIndexFromTree(
  tree: Pick<import("@km/board").TreeLens, "rootId" | "children">,
): Map<string, { colIndex: number; cardIndex: number }> {
  const index = new Map<string, { colIndex: number; cardIndex: number }>()
  const rootId = tree.rootId
  if (!rootId) return index
  const colIds = tree.children(rootId)
  for (let colIdx = 0; colIdx < colIds.length; colIdx++) {
    const colId = colIds[colIdx]!
    index.set(colId, { colIndex: colIdx, cardIndex: -1 })
    const cardIds = tree.children(colId)
    for (let cardIdx = 0; cardIdx < cardIds.length; cardIdx++) {
      index.set(cardIds[cardIdx]!, { colIndex: colIdx, cardIndex: cardIdx })
    }
  }
  return index
}
