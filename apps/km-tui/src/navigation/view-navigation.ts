/* eslint-disable @typescript-eslint/no-non-null-assertion -- codebase idiom: arr[i]! / map.get(k)! / stack.pop()! after surrounding length/has/bounds check; TS noUncheckedIndexedAccess requires the assertion even when invariant is obvious */
/**
 * ViewNavigation — view-owned navigation policy.
 *
 * Each view mode implements this interface to resolve directional input
 * to a target node ID. The navigation layer asks "where should I go?",
 * the view answers with a nodeId.
 *
 * See docs/design/ui/navigation.md for the full design.
 */

import type { Repo } from "@km/storage"
import type { GridNavigator, ViewTreeProjection, ViewType } from "@km/board"
import { classifyCursorFromLens, createViewLens } from "@km/board"
import type { ViewMode } from "../types.ts"
import { log, sid } from "../log.ts"
// computeDetailMetadataKeys/DETAIL_META_PREFIX removed — detail navigation
// now skips virtual __meta__ IDs (not in sel walkOrder).

const detailNavLog = log.child("detail-nav")

// =============================================================================
// ViewNavigation interface
// =============================================================================

/**
 * Navigation state passed to the view for resolving movement.
 */
export interface NavState {
  cursor: string
  rootId: string | null
  foldDepths: Map<string, number>
  collapsedNodes: Set<string>
  /** Current card containing the cursor (from layout derivation). Used as symlink-aware
   * card boundary hint for ViewNode navigation. */
  cursorCardNodeId?: string | null
  /** ViewTreeProjection — per-node navigation tree. Primary API for view navigation. */
  tree: ViewTreeProjection
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
      const lens = createViewLens(repo, { rootId, foldDepths: new Map() })
      return classifyCursorFromLens(lens, nodeId)
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
      const { cursor, rootId } = state

      if (dir === "left" || dir === "right") return null

      // Build the flat list of navigable items: root node + flattened doc tree.
      // Metadata rows (__meta__* IDs) are rendered visually but NOT navigable —
      // they are virtual IDs that don't exist in the sel walkOrder, so selecting
      // them normalizes to deselection (cursor null). Skip them in navigation.
      const allChildren = repo.getChildren(rootId)
      if (allChildren.length === 0) return null

      // Cursor is the H1 (root)
      if (cursor === rootId) {
        if (dir === "down") {
          const target = allChildren[0]?.id ?? null
          detailNavLog.debug?.(`root ${sid(rootId ?? "")} → first child ${target ? sid(target) : "null"}`)
          return target
        }
        return null // k on H1 = boundary
      }

      // Cursor is a child node
      const cursorNode = repo.getNode(cursor)
      if (!cursorNode) {
        detailNavLog.debug?.(`cursor ${sid(cursor)} not found in repo — boundary`)
        return null
      }
      const parentId = cursorNode.parent_id ?? rootId

      if (dir === "down") {
        // j on a heading/item with children → enter first child
        if (cursorNode.item) {
          const nodeChildren = repo.getChildren(cursor)
          detailNavLog.debug?.(`j on item ${sid(cursor)} (type=${cursorNode.type}) — children=${nodeChildren.length}`)
          if (nodeChildren.length > 0) return nodeChildren[0]!.id
        }
        // j on a leaf or item with no children → next sibling
        const siblings = repo.getChildren(parentId)
        const sibIdx = siblings.findIndex((c) => c.id === cursor)
        detailNavLog.debug?.(
          `j on ${sid(cursor)} — siblings=${siblings.length} sibIdx=${sibIdx} parent=${sid(parentId ?? "")}`,
        )
        if (sibIdx >= 0 && sibIdx + 1 < siblings.length) return siblings[sibIdx + 1]!.id
        // Past last sibling → go to parent's next sibling (bubble up)
        if (parentId === rootId || !parentId) {
          detailNavLog.debug?.("j past last sibling at root — boundary")
          return null
        }
        const parent = repo.getNode(parentId)
        if (parent?.parent_id) {
          const parentSiblings = repo.getChildren(parent.parent_id)
          const parentIdx = parentSiblings.findIndex((c) => c.id === parentId)
          detailNavLog.debug?.(`j bubble up — parentSiblings=${parentSiblings.length} parentIdx=${parentIdx}`)
          if (parentIdx >= 0 && parentIdx + 1 < parentSiblings.length) return parentSiblings[parentIdx + 1]!.id
        }
        return null
      }

      // k — go to previous sibling, or parent
      const siblings = repo.getChildren(parentId)
      const sibIdx = siblings.findIndex((c) => c.id === cursor)
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
        // k before first sibling → parent (rootId)
        if (parentId === rootId) return rootId
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
// ViewTreeProjection-based navigation helpers
// =============================================================================

/** Get the viewType for a node, using the ViewTreeProjection. */
function viewType(tree: ViewTreeProjection, id: string): ViewType | undefined {
  return tree.track(id)?.viewType()
}

/**
 * Find next/prev sibling ID in the tree.
 * Returns null if at boundary.
 */
function siblingId(tree: ViewTreeProjection, id: string, delta: 1 | -1): string | null {
  const parentId = tree.parent(id)
  if (!parentId) return null
  const siblings = tree.children(parentId)
  const idx = siblings.indexOf(id)
  if (idx < 0) return null
  const targetIdx = idx + delta
  if (targetIdx < 0 || targetIdx >= siblings.length) return null
  return siblings[targetIdx]!
}

/**
 * Walk up ancestors to find the containing column ID.
 */
function findColumnId(tree: ViewTreeProjection, id: string): string | null {
  let cur: string | null = id
  while (cur) {
    const vt = viewType(tree, cur)
    if (vt === "column" || vt === "body-column") return cur
    cur = tree.parent(cur)
  }
  return null
}

/**
 * Walk up ancestors to find the containing card ID.
 */
function findCardId(tree: ViewTreeProjection, id: string): string | null {
  let cur: string | null = id
  while (cur) {
    const vt = viewType(tree, cur)
    if (vt === "card") return cur
    cur = tree.parent(cur)
  }
  return null
}

/**
 * Get the structural column index (excluding body column) for stickyX purposes.
 * stickyX is an index into structural (non-body) columns only.
 */
function structuralColumnIndex(tree: ViewTreeProjection, colId: string, rootId: string): number {
  const cols = tree.children(rootId)
  let structIdx = 0
  for (const cId of cols) {
    if (viewType(tree, cId) === "body-column") continue
    if (cId === colId) return structIdx
    structIdx++
  }
  return -1
}

/**
 * Get structural (non-body) column IDs.
 * Hidden nodes are already excluded at tree construction time.
 */
function structuralColumnIds(tree: ViewTreeProjection, rootId: string): string[] {
  return tree.children(rootId).filter((cId) => viewType(tree, cId) !== "body-column") as string[]
}

/**
 * Get body column ID from the board, if it exists.
 * Hidden nodes are already excluded at tree construction time.
 */
function bodyColumnId(tree: ViewTreeProjection, rootId: string): string | null {
  return (tree.children(rootId).find((cId) => viewType(tree, cId) === "body-column") as string) ?? null
}

/**
 * Get visible card child IDs of a column.
 * Hidden nodes are already excluded at tree construction time.
 */
function visibleCardIds(tree: ViewTreeProjection, colId: string): readonly string[] {
  return tree.children(colId)
}

/**
 * ViewTreeProjection-based vertical navigation (j/k).
 *
 * Uses the ViewTreeProjection to determine navigation targets.
 * The tree already encodes visual roles via track().viewType().
 */
// oxlint-disable-next-line complexity/complexity -- grid navigation: view-mode variants (cards, columns, tabs) × direction × wrap/clamp/detail-pane edge cases; each branch is a distinct navigation rule, not tangled logic
function vnNavigateVertical(dir: "up" | "down", state: NavState, navigator: GridNavigator): string | null {
  const { cursor, tree } = state
  const rootId = state.rootId!

  const vt = viewType(tree, cursor)
  if (!vt) {
    // Node not in view tree (e.g., deleted during sync)
    return state.rootId
  }

  // ----- Board level -----
  if (vt === "board") {
    if (dir === "down") {
      const stickyX = navigator.stickyX
      const structCols = structuralColumnIds(tree, rootId)
      if (stickyX !== null && stickyX < structCols.length) {
        return structCols[stickyX] ?? null
      }
      // No stickyX: prefer first visible body card, then first structural column
      const bodyCol = bodyColumnId(tree, rootId)
      if (bodyCol) {
        const visCards = visibleCardIds(tree, bodyCol)
        if (visCards.length > 0) return visCards[0]!
      }
      const visCols = tree.children(rootId)
      return visCols[0] ?? null
    }
    // k from board → null
    return null
  }

  // ----- Body column header -----
  if (vt === "body-column") {
    if (dir === "down") {
      const visCards = visibleCardIds(tree, cursor)
      return visCards[0] ?? null
    }
    // k from body column header → board
    return state.rootId
  }

  // ----- Column level -----
  if (vt === "column") {
    if (dir === "down") {
      // Collapsed column → can't enter
      if (state.collapsedNodes.has(cursor)) return null
      const visCards = visibleCardIds(tree, cursor)
      return visCards[0] ?? null
    }
    // k from column → board (save stickyX)
    const structIdx = structuralColumnIndex(tree, cursor, rootId)
    if (structIdx >= 0) navigator.setStickyX(structIdx)
    return state.rootId
  }

  // ----- Card level -----
  if (vt === "card") {
    const colId = tree.parent(cursor)
    if (!colId) return null
    const colType = viewType(tree, colId)

    if (colType === "body-column") {
      // Body card navigation
      const visCards = visibleCardIds(tree, colId)
      const idx = visCards.indexOf(cursor)
      if (dir === "down") {
        return idx >= 0 && idx < visCards.length - 1 ? visCards[idx + 1]! : null
      }
      // k from body card
      if (idx > 0) return visCards[idx - 1]!
      // At first body card → body column header
      return colId
    }

    // Structural column card
    if (dir === "down") {
      return siblingId(tree, cursor, 1)
    }
    // k from card
    const prev = siblingId(tree, cursor, -1)
    if (prev) return prev
    // At first card → column header
    return colId
  }

  // ----- Subitem level (inside a card) -----
  if (vt === "subitem") {
    // Find the containing card
    const cardId = findCardId(tree, cursor)
    if (!cardId) return null

    if (dir === "down") {
      // DFS order: first child → next sibling → parent's next sibling → next card
      // 1. Descend into first child if visible
      const children = tree.children(cursor)
      if (children.length > 0) return children[0]!
      // 2. Try next sibling at current level
      const next = siblingId(tree, cursor, 1)
      if (next) return next
      // 3. Walk up ancestors to find one with a next sibling
      let walkId: string | null = tree.parent(cursor)
      while (walkId && walkId !== cardId) {
        const parentNext = siblingId(tree, walkId, 1)
        if (parentNext) return parentNext
        walkId = tree.parent(walkId)
      }
      // 4. Reached card level: jump to next card
      const cardParent = tree.parent(cardId)
      if (cardParent) {
        return siblingId(tree, cardId, 1)
      }
      return null
    }
    // k from subitem — reverse DFS order
    const prev = siblingId(tree, cursor, -1)
    if (prev) {
      // Go to the deepest last descendant of the previous sibling
      let deepestId: string = prev
      let deepChildren = tree.children(deepestId)
      while (deepChildren.length > 0) {
        deepestId = deepChildren[deepChildren.length - 1]!
        deepChildren = tree.children(deepestId)
      }
      return deepestId
    }
    // At first sibling → parent
    return tree.parent(cursor)
  }

  return null
}

/**
 * ViewTreeProjection-based horizontal navigation (h/l).
 *
 * Cross-column movement using the ViewTreeProjection.
 */
// oxlint-disable-next-line complexity/complexity -- grid navigation: cross-column targeting with sticky-Y, column gaps, card vs outline vs tab variants, detail-pane handoff; each branch encodes a navigation rule
function vnNavigateHorizontal(dir: "left" | "right", state: NavState, navigator: GridNavigator): string | null {
  const { cursor, tree } = state
  const rootId = state.rootId!

  const vt = viewType(tree, cursor)
  if (!vt) {
    return state.rootId
  }

  // Board level → can't move h/l
  if (vt === "board") return null

  // ----- Body column header -----
  if (vt === "body-column") {
    if (dir === "left") return null // body is leftmost
    const structCols = structuralColumnIds(tree, rootId)
    return structCols[0] ?? null
  }

  // ----- Column header -----
  if (vt === "column") {
    const colId = cursor
    const structCols = structuralColumnIds(tree, rootId)
    const bodyCol = bodyColumnId(tree, rootId)
    const structIdx = structCols.indexOf(colId)

    const hasBody = bodyCol !== null

    if (dir === "left") {
      if (structIdx === 0) {
        // First structural col → body column (if it has cards)
        if (!bodyCol) return null
        return navigateToColumn(bodyCol, state, navigator, {
          viewColIdx: 0,
          isAtColumnLevel: true,
          sourceColId: colId,
          canLandOnHeader: false,
        })
      }
      if (structIdx > 0) {
        const targetIdx = structIdx - 1
        return navigateToColumn(structCols[targetIdx]!, state, navigator, {
          viewColIdx: hasBody ? targetIdx + 1 : targetIdx,
          isAtColumnLevel: true,
          sourceColId: colId,
          canLandOnHeader: true,
        })
      }
      return null
    }
    // right
    if (structIdx >= 0 && structIdx + 1 < structCols.length) {
      const targetIdx = structIdx + 1
      return navigateToColumn(structCols[targetIdx]!, state, navigator, {
        viewColIdx: hasBody ? targetIdx + 1 : targetIdx,
        isAtColumnLevel: true,
        sourceColId: colId,
        canLandOnHeader: true,
      })
    }
    return null
  }

  // ----- Card or subitem level -----
  // Resolve to the containing column
  const colId = findColumnId(tree, cursor)
  if (!colId) return null

  const structCols = structuralColumnIds(tree, rootId)
  const bodyCol = bodyColumnId(tree, rootId)
  const hasBody = bodyCol !== null
  const colType = viewType(tree, colId)

  if (colType === "body-column") {
    // In body column
    if (dir === "left") return null
    if (structCols.length === 0) return null
    return navigateToColumn(structCols[0]!, state, navigator, { viewColIdx: hasBody ? 1 : 0, canLandOnHeader: true })
  }

  // In a structural column
  const structIdx = structCols.indexOf(colId)
  if (structIdx < 0) {
    // Cursor is on a column not in the tree — redirect
    if (structCols.length > 0) return structCols[0]!
    if (hasBody && bodyCol) {
      const visCards = visibleCardIds(tree, bodyCol)
      return visCards[0] ?? null
    }
    return null
  }

  if (dir === "left") {
    if (structIdx === 0) {
      if (!hasBody || !bodyCol) return null
      // Compute source card index for scroll-aware body navigation
      const cursorVt = viewType(tree, cursor)
      const cardNodeId = cursorVt === "card" ? cursor : findCardId(tree, cursor)
      let sourceCardIdx: number | undefined
      if (cardNodeId) {
        const cardParent = tree.parent(cardNodeId)
        sourceCardIdx = cardParent ? tree.children(cardParent).indexOf(cardNodeId) : -1
        if (sourceCardIdx < 0) sourceCardIdx = undefined
      }
      return navigateToColumn(bodyCol, state, navigator, { viewColIdx: 0, sourceCardIdx, canLandOnHeader: false })
    }
    const targetIdx = structIdx - 1
    return navigateToColumn(structCols[targetIdx]!, state, navigator, {
      viewColIdx: hasBody ? targetIdx + 1 : targetIdx,
      canLandOnHeader: true,
    })
  }

  // right
  if (structIdx + 1 >= structCols.length) return null
  const targetIdx = structIdx + 1
  return navigateToColumn(structCols[targetIdx]!, state, navigator, {
    viewColIdx: hasBody ? targetIdx + 1 : targetIdx,
    canLandOnHeader: true,
  })
}

/** Options for navigateToColumn controlling column-type-specific behavior. */
interface NavigateToColumnOpts {
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
 * Navigate to a column, selecting the appropriate card.
 *
 * Unified helper for both structural and body column navigation.
 * Behavior is controlled by `opts` — see NavigateToColumnOpts.
 */
function navigateToColumn(
  targetColId: string,
  state: NavState,
  navigator: GridNavigator,
  opts: NavigateToColumnOpts,
): string | null {
  const { tree } = state
  const { viewColIdx, isAtColumnLevel, sourceColId, sourceCardIdx, canLandOnHeader } = opts

  // Collapsed target → land on column header (structural only)
  if (canLandOnHeader && state.collapsedNodes.has(targetColId)) {
    return targetColId
  }

  const visCards = visibleCardIds(tree, targetColId)

  if (visCards.length === 0) {
    return canLandOnHeader ? targetColId : null
  }

  if (isAtColumnLevel) {
    // At column header: if source column has cards, stay at header level
    if (sourceColId) {
      const sourceCards = visibleCardIds(tree, sourceColId)
      if (sourceCards.length > 0) {
        return targetColId
      }
    }
    // Empty source column → use stickyY if available
    const stickyY = navigator.stickyY
    if (stickyY !== null) {
      if (navigator.hasSection(viewColIdx)) {
        const targetCardIdx = navigator.findItemAtY(viewColIdx, stickyY)
        return visCards[Math.min(Math.max(0, targetCardIdx), visCards.length - 1)] ?? null
      }
      navigator.setDeferredNavigation(viewColIdx, stickyY)
      return visCards[0] ?? null
    }
    return canLandOnHeader ? targetColId : (visCards[0] ?? null)
  }

  // At card level: use stickyY for position matching
  const stickyY = navigator.stickyY
  if (stickyY === null) {
    return visCards[0] ?? null
  }

  // Index-based matching (body column cross-column navigation).
  // Don't set deferred navigation here — the index-based match is already
  // correct and stickyY may reflect a scrolled source column position that
  // would cause a Y-mismatch override in the unscrolled target column.
  if (sourceCardIdx !== undefined) {
    const clampedIdx = Math.min(sourceCardIdx, visCards.length - 1)
    return visCards[clampedIdx] ?? null
  }

  // Position-based matching via stickyY
  if (navigator.hasSection(viewColIdx)) {
    const targetCardIdx = navigator.findItemAtY(viewColIdx, stickyY)
    return visCards[Math.min(Math.max(0, targetCardIdx), visCards.length - 1)] ?? null
  }

  navigator.setDeferredNavigation(viewColIdx, stickyY)
  return visCards[0] ?? null
}
