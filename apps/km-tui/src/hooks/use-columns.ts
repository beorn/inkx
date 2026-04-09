/**
 * Column Utilities — VIEW MODEL DERIVATION
 *
 * Column derivation, node index, and cursor position utilities.
 * DerivedColumn materializes tree lens data for consumers that can't
 * subscribe reactively (tests, web canvas, detail-mode cursor derivation).
 * Live rendering uses the tree lens directly (useNode + useSignal).
 */

import type { Repo } from "@km/storage"
import { KNode } from "@km/core"
import type { SectionRules } from "@km/markdown"
import { createLogger } from "loggily"
import { computeMetadataKeys } from "../views/detail-pane-items.ts"
import { createViewLens, extractWipLimits, type ViewLensRepo } from "@km/board"

// =============================================================================
// DerivedColumn — materialized column snapshot
// =============================================================================

/**
 * A materialized column: a parent KNode whose children render as KNode[].
 *
 * Used by `deriveColumnsFromRepo` for consumers that can't subscribe
 * reactively (tests, web canvas). Detail mode uses `deriveDetailColumns`
 * for real children only — metadata rows are focusable React components
 * in DetailView.tsx. Live rendering uses `colId: string` +
 * `useNode(id)` + `useSignal(ps.visibleLens)`.
 */
export interface DerivedColumn {
  node: KNode
  cardNodes: KNode[]
  wipLimit?: number
  rules?: SectionRules
  /** True for virtual body column (displays leading non-section content) */
  isVirtual?: boolean
  /** Total card count before filtering (undefined = no filter active) */
  totalCardCount?: number
  /** Count of descendant nodes hidden by filters within cards (e.g., done children) */
  hiddenDescendantCount?: number
}

const log = createLogger("km:tui:columns")
const perfLog = createLogger("km:perf")

// =============================================================================
// Column derivation — delegates to the TreeLens
// =============================================================================

/**
 * Legacy column derivation over an ephemeral ViewLens.
 *
 * Runtime derivation uses `useSignal(pane.signals.visibleLens)` + the tree
 * lens directly — this function exists only for tests and the web target
 * (km-canvas.tsx) that need to materialize a DerivedColumn[] without mounting
 * the React tree.
 *
 * The previous `deriveColumnsFromLens` helper has been inlined here since it
 * had no callers outside this function.
 */
export function deriveColumnsFromRepo(
  repo: Repo,
  rootId: string | null,
  foldDepths: Map<string, number>,
): DerivedColumn[] {
  using span = log.span("derive-columns")
  const lens = createViewLens(repo as unknown as ViewLensRepo, { rootId, foldDepths })

  const lensRootId = lens.rootId
  if (!lensRootId) {
    span.spanData.columns = 0
    return []
  }

  const colIds = lens.children(lensRootId)

  // Collect structural column nodes for WIP limit extraction (excludes body-column)
  const structuralNodes: KNode[] = []
  for (const colId of colIds) {
    if (lens.role(colId) !== "body-column") {
      const node = lens.get(colId)
      if (node) structuralNodes.push(node)
    }
  }
  const wipLimits = extractWipLimits(structuralNodes)

  const columns = colIds
    .map((colId): DerivedColumn | null => {
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
    .filter((c): c is DerivedColumn => c != null)

  span.spanData.columns = columns.length
  return columns
}

// =============================================================================
// Detail view columns
// =============================================================================

/**
 * Derive columns for the detail view mode.
 *
 * Returns a single virtual column containing only real tree children.
 * Metadata property rows are rendered as focusable React components
 * in DetailView.tsx (with testID="__meta__<Key>") and navigated via
 * the view-navigation system — no virtual KNode objects needed.
 */
export function deriveDetailColumns(repo: Repo, rootId: string | null, _foldDepths: Map<string, number>): DerivedColumn[] {
  const rootNode = rootId ? repo.getNode(rootId) : null
  const metaKeys = rootNode ? computeMetadataKeys(rootNode) : []

  const allChildren = repo.getChildren(rootId)

  // If no metadata rows and no children, nothing to show
  if (metaKeys.length === 0 && allChildren.length === 0) return []

  return [
    {
      node: createVirtualBodyNode(rootId),
      cardNodes: allChildren,
      isVirtual: true,
    },
  ]
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
  columns: { length: number },
  cursor: string | null,
  nodeIndex: Map<string, { colIndex: number; cardIndex: number }>,
  getNode?: (id: string) => { parent_id: string | null } | null,
  /** Hint from cursor store — for symlinks where parent_id chain leads to wrong card */
  cursorCardNodeId?: string | null,
): CursorIndices {
  if (!cursor || columns.length === 0) {
    return { colIndex: -1, cardIndex: -1, isAtCardLevel: false }
  }

  // Direct lookup
  let entry = nodeIndex.get(cursor)

  // On miss: try cursorCardNodeId hint first (symlink-aware), then parent walk
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
// Node Index
// =============================================================================

/**
 * Build a nodeId → {colIndex, cardIndex} map for O(1) cursor position lookup.
 * Includes column header nodes (cardIndex = -1) and card nodes.
 * When getChildren is provided, also maps card descendants for cursor resolution.
 */
export function buildNodeIndex(
  columns: DerivedColumn[],
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
 * Build nodeIndex from ViewTreeProjection — no DerivedColumn dependency.
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
