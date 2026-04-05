/**
 * ViewNavigation — view-owned navigation policy.
 *
 * Each view mode implements this interface to resolve directional input
 * to a target node ID. The navigation layer asks "where should I go?",
 * the view answers with a nodeId.
 *
 * See docs/design/visual-navigation.md for the full design.
 */

import type { Repo } from "@km/storage"
import type { GridNavigator, ViewNode } from "@km/board"
import { classifyCursorFromViewIndex, buildViewTree, buildViewIndex } from "@km/board"
import type { ViewMode } from "../types.ts"
import { computeMetadataKeys as computeDetailMetadataKeys, DETAIL_META_PREFIX } from "../views/detail-pane-items.ts"

// =============================================================================
// ViewNavigation interface
// =============================================================================

/**
 * Navigation state passed to the view for resolving movement.
 */
export interface NavState {
  cursorNodeId: string
  rootId: string | null
  foldDepths: Map<string, number>
  collapsedNodes: Set<string>
  /** Current card containing the cursor (from layout derivation). Used as embed-aware
   * card boundary hint for ViewNode navigation. */
  cursorCardNodeId?: string | null
  /** ViewNode tree — explicit visual hierarchy for ViewNode-based navigation */
  viewTree: ViewNode
  /** ViewNode index — O(1) lookup by node ID */
  viewIndex: Map<string, ViewNode>
}

/**
 * View-owned navigation policy.
 *
 * Each view mode (cards, list, columns, tabs) implements this to resolve
 * directional input to a target nodeId.
 *
 * The one navigation rule: move to the next selectable node in that direction.
 * What "selectable" means depends on the view mode and current state.
 */
export type CursorClassification = {
  cursorCardNodeId: string | null
  cursorColumnNodeId: string | null
  cursorDepth: "board" | "column" | "card"
}

export interface ViewNavigation {
  navigate(dir: "up" | "down" | "left" | "right", state: NavState, repo: Repo, navigator: GridNavigator): string | null
  classifyCursor(nodeId: string | null, rootId: string | null, repo: Repo): CursorClassification
}

// =============================================================================
// Cards view navigation
// =============================================================================

/**
 * Cards view navigation (kanban board).
 *
 * Visual model:
 * - Board title at top, columns side by side, cards stacked vertically in columns
 * - j/k: navigate through hierarchy (board → column → card → next/prev card)
 * - h/l: cross-column movement using curswantY for vertical position matching
 */
export function createCardsViewNavigation(): ViewNavigation {
  return {
    navigate(dir, state, _repo, navigator) {
      return dir === "up" || dir === "down"
        ? vnNavigateVertical(dir, state, navigator)
        : vnNavigateHorizontal(dir, state, navigator)
    },
    classifyCursor(nodeId, rootId, repo) {
      const vTree = buildViewTree(repo, rootId, new Map())
      const vIndex = buildViewIndex(vTree)
      return classifyCursorFromViewIndex(vIndex, nodeId)
    },
  }
}

// =============================================================================
// Detail view navigation
// =============================================================================

/**
 * Detail view navigation — flat sibling navigation through properties + children.
 *
 * Same navigation pattern as column view: j/k moves between sibling items
 * (metadata rows then direct children). No DFS tree walking — to go deeper
 * into a child's tree, use zoom (z).
 *
 * h/l: left returns to parent pane (handled by handleHorizontalNav), right is boundary.
 */
export function createDetailViewNavigation(): ViewNavigation {
  return {
    classifyCursor(nodeId) {
      if (!nodeId) return { cursorCardNodeId: null, cursorColumnNodeId: null, cursorDepth: "board" }
      return { cursorCardNodeId: nodeId, cursorColumnNodeId: null, cursorDepth: "card" }
    },
    navigate(dir, state, repo) {
      const { cursorNodeId, rootId } = state

      if (dir === "left" || dir === "right") return null

      // Build the flat list of navigable items: root node + metadata keys + flattened doc tree
      const rootNode = rootId ? repo.getNode(rootId) : null
      const metaKeys = rootNode ? computeDetailMetadataKeys(rootNode) : []
      const metaIds = metaKeys.map((key) => `${DETAIL_META_PREFIX}${key}`)
      const allChildren = repo.getChildren(rootId)
      // Flatten the doc tree to match what DocContent renders (items only, up to depth 3)
      if (allChildren.length === 0 && metaIds.length === 0) return null

      // j/k = sibling navigation (same parent level), like cards view.
      // H1 (rootId) → meta rows → direct children of root.
      // Within a heading's children, j/k moves between siblings at that level.
      // Use z/l to enter a heading's children (zoom in).

      // Cursor is the H1 (root)
      if (cursorNodeId === rootId) {
        if (dir === "down") return metaIds[0] ?? allChildren[0]?.id ?? null
        return null // k on H1 = boundary
      }

      // Cursor is a meta row
      const metaIdx = metaIds.indexOf(cursorNodeId)
      if (metaIdx >= 0) {
        if (dir === "down") {
          const next = metaIdx + 1
          if (next < metaIds.length) return metaIds[next]!
          return allChildren[0]?.id ?? null // past meta → first child
        }
        const prev = metaIdx - 1
        return prev >= 0 ? metaIds[prev]! : rootId // before first meta → H1
      }

      // Cursor is a child node
      const cursorNode = repo.getNode(cursorNodeId)
      if (!cursorNode) return null
      const parentId = cursorNode.parent_id ?? rootId

      if (dir === "down") {
        // j on a heading/item with children → enter first child
        if (cursorNode.item) {
          const nodeChildren = repo.getChildren(cursorNodeId)
          if (nodeChildren.length > 0) return nodeChildren[0]!.id
        }
        // j on a leaf or item with no children → next sibling
        const siblings = repo.getChildren(parentId)
        const sibIdx = siblings.findIndex((c) => c.id === cursorNodeId)
        if (sibIdx >= 0 && sibIdx + 1 < siblings.length) return siblings[sibIdx + 1]!.id
        // Past last sibling → go to parent's next sibling (bubble up)
        if (parentId === rootId || !parentId) return null
        const parent = repo.getNode(parentId)
        if (parent?.parent_id) {
          const parentSiblings = repo.getChildren(parent.parent_id)
          const parentIdx = parentSiblings.findIndex((c) => c.id === parentId)
          if (parentIdx >= 0 && parentIdx + 1 < parentSiblings.length) return parentSiblings[parentIdx + 1]!.id
        }
        return null
      }

      // k — go to previous sibling, or parent
      const siblings = repo.getChildren(parentId)
      const sibIdx = siblings.findIndex((c) => c.id === cursorNodeId)
      if (sibIdx >= 0) {
        if (sibIdx - 1 >= 0) {
          // k → previous sibling. If that sibling has children, go to its LAST descendant.
          let target = siblings[sibIdx - 1]!
          while (target.item) {
            const targetChildren = repo.getChildren(target.id)
            if (targetChildren.length === 0) break
            target = targetChildren[targetChildren.length - 1]!
          }
          return target.id
        }
        // k before first sibling → parent
        if (parentId === rootId) return metaIds.length > 0 ? metaIds[metaIds.length - 1]! : rootId
        return parentId
      }

      // Fallback
      return rootId
    },
  }
}

/**
 * Default remaining depth for detail view children (matching column behavior).
 * DetailView passes remainingDepth={DETAIL_DEFAULT_DEPTH} to TreeNode,
 * giving fold indicators and controlled tree depth — same as cards in columns.
 */
export const DETAIL_DEFAULT_DEPTH = 1

// =============================================================================
// ViewNavigation lookup
// =============================================================================

const cardsNav = createCardsViewNavigation()
const detailNav = createDetailViewNavigation()

const navigations: Record<ViewMode, ViewNavigation> = {
  cards: cardsNav,
  list: cardsNav,
  columns: cardsNav,
  tabs: cardsNav,
  detail: detailNav,
}

export function getViewNavigation(viewMode: ViewMode): ViewNavigation {
  return navigations[viewMode]
}

// =============================================================================
// ViewNode-based navigation
// =============================================================================

/**
 * Find next/prev sibling in ViewNode tree.
 * Returns null if at boundary.
 */
function vnSibling(vn: ViewNode, delta: 1 | -1): ViewNode | null {
  if (!vn.parent) return null
  const siblings = vn.parent.children
  const idx = siblings.indexOf(vn)
  if (idx < 0) return null
  const targetIdx = idx + delta
  if (targetIdx < 0 || targetIdx >= siblings.length) return null
  return siblings[targetIdx]!
}

/**
 * Walk up ancestors to find the containing column ViewNode.
 */
function vnFindColumn(vn: ViewNode): ViewNode | null {
  let cur: ViewNode | null = vn
  while (cur) {
    if (cur.role === "column" || cur.role === "body-column") return cur
    cur = cur.parent
  }
  return null
}

/**
 * Walk up ancestors to find the containing card ViewNode.
 */
function vnFindCard(vn: ViewNode): ViewNode | null {
  let cur: ViewNode | null = vn
  while (cur) {
    if (cur.role === "card") return cur
    cur = cur.parent
  }
  return null
}

/**
 * Get the structural column index (excluding body column) for stickyX purposes.
 * stickyX is an index into structural (non-body) columns only.
 */
function vnStructuralColumnIndex(col: ViewNode): number {
  if (col.parent?.role !== "board") return -1
  const cols = col.parent.children
  let structIdx = 0
  for (const c of cols) {
    if (c.role === "body-column") continue
    if (c === col) return structIdx
    structIdx++
  }
  return -1
}

/**
 * Get structural (non-body) columns.
 * Hidden nodes are already excluded at tree construction time.
 */
function vnStructuralColumns(board: ViewNode): ViewNode[] {
  return board.children.filter((c) => c.role !== "body-column")
}

/**
 * Get body column from the board, if it exists.
 * Hidden nodes are already excluded at tree construction time.
 */
function vnBodyColumn(board: ViewNode): ViewNode | null {
  return board.children.find((c) => c.role === "body-column") ?? null
}

/**
 * Get card children of a column.
 * Hidden nodes are already excluded at tree construction time.
 */
function vnVisibleCards(col: ViewNode): ViewNode[] {
  return col.children
}

/**
 * ViewNode-based vertical navigation (j/k).
 *
 * Uses the ViewNode tree to determine navigation targets instead of
 * ad-hoc repo walks. The tree already encodes visual roles.
 */
function vnNavigateVertical(dir: "up" | "down", state: NavState, navigator: GridNavigator): string | null {
  const { cursorNodeId, viewTree, viewIndex } = state

  const vn = viewIndex.get(cursorNodeId)
  if (!vn) {
    // Node not in view tree (e.g., deleted during sync)
    return state.rootId
  }

  // ----- Board level -----
  if (vn.role === "board") {
    if (dir === "down") {
      const stickyX = navigator.stickyX
      const structCols = vnStructuralColumns(viewTree)
      if (stickyX !== null && stickyX < structCols.length) {
        return structCols[stickyX]?.id ?? null
      }
      // No stickyX: prefer first visible body card, then first structural column
      const bodyCol = vnBodyColumn(viewTree)
      if (bodyCol) {
        const visCards = vnVisibleCards(bodyCol)
        if (visCards.length > 0) return visCards[0]!.id
      }
      const visCols = viewTree.children
      return visCols[0]?.id ?? null
    }
    // k from board → null
    return null
  }

  // ----- Body column header -----
  if (vn.role === "body-column") {
    if (dir === "down") {
      const visCards = vnVisibleCards(vn)
      return visCards[0]?.id ?? null
    }
    // k from body column header → board
    return state.rootId
  }

  // ----- Column level -----
  if (vn.role === "column") {
    if (dir === "down") {
      // Collapsed column → can't enter
      if (state.collapsedNodes.has(cursorNodeId)) return null
      const visCards = vnVisibleCards(vn)
      return visCards[0]?.id ?? null
    }
    // k from column → board (save stickyX)
    const structIdx = vnStructuralColumnIndex(vn)
    if (structIdx >= 0) navigator.setStickyX(structIdx)
    return state.rootId
  }

  // ----- Card level -----
  if (vn.role === "card") {
    const col = vn.parent
    if (!col) return null

    if (col.role === "body-column") {
      // Body card navigation
      const visCards = vnVisibleCards(col)
      const idx = visCards.indexOf(vn)
      if (dir === "down") {
        return idx >= 0 && idx < visCards.length - 1 ? visCards[idx + 1]!.id : null
      }
      // k from body card
      if (idx > 0) return visCards[idx - 1]!.id
      // At first body card → body column header
      return col.id
    }

    // Structural column card
    if (dir === "down") {
      const next = vnSibling(vn, 1)
      return next?.id ?? null
    }
    // k from card
    const prev = vnSibling(vn, -1)
    if (prev) return prev.id
    // At first card → column header
    return col.id
  }

  // ----- Subitem level (inside a card) -----
  if (vn.role === "subitem") {
    // Find the containing card
    const cardVn = vnFindCard(vn)
    if (!cardVn) return null

    if (dir === "down") {
      // DFS order: first child → next sibling → parent's next sibling → next card
      // 1. Descend into first child if visible
      if (vn.children.length > 0) return vn.children[0]!.id
      // 2. Try next sibling at current level
      const next = vnSibling(vn, 1)
      if (next) return next.id
      // 3. Walk up ancestors to find one with a next sibling
      let walk: ViewNode | null = vn.parent
      while (walk && walk !== cardVn) {
        const parentNext = vnSibling(walk, 1)
        if (parentNext) return parentNext.id
        walk = walk.parent
      }
      // 4. Reached card level: jump to next card
      if (cardVn.parent) {
        const nextCard = vnSibling(cardVn, 1)
        return nextCard?.id ?? null
      }
      return null
    }
    // k from subitem — reverse DFS order
    const prev = vnSibling(vn, -1)
    if (prev) {
      // Go to the deepest last descendant of the previous sibling
      let deepest: ViewNode = prev
      while (deepest.children.length > 0) {
        deepest = deepest.children[deepest.children.length - 1]!
      }
      return deepest.id
    }
    // At first sibling → parent
    return vn.parent?.id ?? null
  }

  return null
}

/**
 * ViewNode-based horizontal navigation (h/l).
 *
 * Cross-column movement using the ViewNode tree.
 */
function vnNavigateHorizontal(dir: "left" | "right", state: NavState, navigator: GridNavigator): string | null {
  const { cursorNodeId, viewTree, viewIndex } = state

  const vn = viewIndex.get(cursorNodeId)
  if (!vn) {
    return state.rootId
  }

  // Board level → can't move h/l
  if (vn.role === "board") return null

  // ----- Body column header -----
  if (vn.role === "body-column") {
    if (dir === "left") return null // body is leftmost
    const structCols = vnStructuralColumns(viewTree)
    return structCols[0]?.id ?? null
  }

  // ----- Column header -----
  if (vn.role === "column") {
    const col = vn
    const structCols = vnStructuralColumns(viewTree)
    const bodyCol = vnBodyColumn(viewTree)
    const structIdx = structCols.indexOf(col)

    const hasBody = bodyCol !== null

    if (dir === "left") {
      if (structIdx === 0) {
        // First structural col → body column (if it has cards)
        if (!bodyCol) return null
        return vnNavigateToColumn(bodyCol, state, navigator, {
          viewColIdx: 0,
          isAtColumnLevel: true,
          sourceColId: col.id,
          canLandOnHeader: false,
        })
      }
      if (structIdx > 0) {
        const targetIdx = structIdx - 1
        return vnNavigateToColumn(structCols[targetIdx]!, state, navigator, {
          viewColIdx: hasBody ? targetIdx + 1 : targetIdx,
          isAtColumnLevel: true,
          sourceColId: col.id,
          canLandOnHeader: true,
        })
      }
      return null
    }
    // right
    if (structIdx >= 0 && structIdx + 1 < structCols.length) {
      const targetIdx = structIdx + 1
      return vnNavigateToColumn(structCols[targetIdx]!, state, navigator, {
        viewColIdx: hasBody ? targetIdx + 1 : targetIdx,
        isAtColumnLevel: true,
        sourceColId: col.id,
        canLandOnHeader: true,
      })
    }
    return null
  }

  // ----- Card or subitem level -----
  // Resolve to the containing column
  const colVn = vnFindColumn(vn)
  if (!colVn) return null

  const structCols = vnStructuralColumns(viewTree)
  const bodyCol = vnBodyColumn(viewTree)
  const hasBody = bodyCol !== null

  if (colVn.role === "body-column") {
    // In body column
    if (dir === "left") return null
    if (structCols.length === 0) return null
    return vnNavigateToColumn(structCols[0]!, state, navigator, { viewColIdx: hasBody ? 1 : 0, canLandOnHeader: true })
  }

  // In a structural column
  const structIdx = structCols.indexOf(colVn)
  if (structIdx < 0) {
    // Cursor is on a column not in the tree — redirect
    if (structCols.length > 0) return structCols[0]!.id
    if (hasBody && bodyCol) {
      const visCards = vnVisibleCards(bodyCol)
      return visCards[0]?.id ?? null
    }
    return null
  }

  if (dir === "left") {
    if (structIdx === 0) {
      if (!hasBody || !bodyCol) return null
      // Compute source card index for scroll-aware body navigation
      const cardVn = vn.role === "card" ? vn : vnFindCard(vn)
      let sourceCardIdx: number | undefined
      if (cardVn) {
        sourceCardIdx = cardVn.parent ? cardVn.parent.children.indexOf(cardVn) : -1
        if (sourceCardIdx < 0) sourceCardIdx = undefined
      }
      return vnNavigateToColumn(bodyCol, state, navigator, { viewColIdx: 0, sourceCardIdx, canLandOnHeader: false })
    }
    const targetIdx = structIdx - 1
    return vnNavigateToColumn(structCols[targetIdx]!, state, navigator, {
      viewColIdx: hasBody ? targetIdx + 1 : targetIdx,
      canLandOnHeader: true,
    })
  }

  // right
  if (structIdx + 1 >= structCols.length) return null
  const targetIdx = structIdx + 1
  return vnNavigateToColumn(structCols[targetIdx]!, state, navigator, {
    viewColIdx: hasBody ? targetIdx + 1 : targetIdx,
    canLandOnHeader: true,
  })
}

/** Options for vnNavigateToColumn controlling column-type-specific behavior. */
interface VnNavigateToColumnOpts {
  /** View column index for position registry lookups. */
  viewColIdx: number
  /**
   * When true, the cursor is at column-header level (h/l between column headers).
   * Structural columns use this to decide whether to stay at header or drop into cards.
   */
  isAtColumnLevel?: boolean
  /**
   * Source column ID when navigating at column level.
   * If the source column has visible cards, navigation stays at header level.
   */
  sourceColId?: string
  /**
   * Source card index for index-based matching (body column cross-column nav).
   * When provided, the target card is selected by clamped index instead of stickyY.
   */
  sourceCardIdx?: number
  /**
   * Whether the target column can serve as a landing spot (header).
   * Structural columns return their header ID when collapsed or empty;
   * body columns return null (they have no meaningful header to land on).
   */
  canLandOnHeader: boolean
}

/**
 * Navigate to a column ViewNode, selecting the appropriate card.
 *
 * Unified helper for both structural and body column navigation.
 * Behavior is controlled by `opts` — see VnNavigateToColumnOpts.
 */
function vnNavigateToColumn(
  targetCol: ViewNode,
  state: NavState,
  navigator: GridNavigator,
  opts: VnNavigateToColumnOpts,
): string | null {
  const { viewColIdx, isAtColumnLevel, sourceColId, sourceCardIdx, canLandOnHeader } = opts

  // Collapsed target → land on column header (structural only)
  if (canLandOnHeader && state.collapsedNodes.has(targetCol.id)) {
    return targetCol.id
  }

  const visCards = vnVisibleCards(targetCol)

  if (visCards.length === 0) {
    return canLandOnHeader ? targetCol.id : null
  }

  if (isAtColumnLevel) {
    // At column header: if source column has cards, stay at header level
    if (sourceColId) {
      const sourceColVn = state.viewIndex.get(sourceColId)
      if (sourceColVn) {
        const sourceCards = vnVisibleCards(sourceColVn)
        if (sourceCards.length > 0) {
          return targetCol.id
        }
      }
    }
    // Empty source column → use stickyY if available
    const stickyY = navigator.stickyY
    if (stickyY !== null) {
      if (navigator.hasSection(viewColIdx)) {
        const targetCardIdx = navigator.findItemAtY(viewColIdx, stickyY)
        return visCards[Math.min(Math.max(0, targetCardIdx), visCards.length - 1)]?.id ?? null
      }
      navigator.setDeferredNavigation(viewColIdx, stickyY)
      return visCards[0]?.id ?? null
    }
    return canLandOnHeader ? targetCol.id : (visCards[0]?.id ?? null)
  }

  // At card level: use stickyY for position matching
  const stickyY = navigator.stickyY
  if (stickyY === null) {
    return visCards[0]?.id ?? null
  }

  // Index-based matching (body column cross-column navigation)
  if (sourceCardIdx !== undefined) {
    const clampedIdx = Math.min(sourceCardIdx, visCards.length - 1)
    navigator.setDeferredNavigation(viewColIdx, stickyY)
    return visCards[clampedIdx]?.id ?? null
  }

  // Position-based matching via stickyY
  if (navigator.hasSection(viewColIdx)) {
    const targetCardIdx = navigator.findItemAtY(viewColIdx, stickyY)
    return visCards[Math.min(Math.max(0, targetCardIdx), visCards.length - 1)]?.id ?? null
  }

  navigator.setDeferredNavigation(viewColIdx, stickyY)
  return visCards[0]?.id ?? null
}
