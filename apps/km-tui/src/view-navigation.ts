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
import { KNode } from "@km/core"
import { createLogger } from "loggily"
import { findIndexFile } from "@km/core"
import { extractBody } from "@km/tree"
import type { GridNavigator, ViewNode } from "@km/board"
import type { ViewMode } from "./types.ts"
import { deriveCursorAncestors } from "./cursor-store.ts"
import { computeMetadataKeys as computeDetailMetadataKeys, DETAIL_META_PREFIX } from "./views/detail-pane-items.ts"

const log = createLogger("km:nav")

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
  /** Current card containing the cursor (from CursorStore). Used as embed-aware
   * card boundary hint — overrides findAncestorAtDepth when available. */
  cursorCardNodeId?: string | null
  /** Hidden node IDs — navigation skips these nodes */
  hiddenNodeIds?: Set<string>
  /** ViewNode tree — explicit visual hierarchy for ViewNode-based navigation */
  viewTree?: ViewNode
  /** ViewNode index — O(1) lookup by node ID */
  viewIndex?: Map<string, ViewNode>
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
  selectionLevel: "board" | "column" | "card"
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
    navigate(dir, state, repo, navigator) {
      let result: string | null

      if (state.viewTree && state.viewIndex) {
        // ViewNode-based navigation (primary path)
        if (dir === "up" || dir === "down") {
          result = vnNavigateVertical(dir, state, navigator)
        } else {
          result = vnNavigateHorizontal(dir, state, navigator)
        }
      } else {
        // Legacy fallback — no ViewNode tree available (shouldn't happen in normal operation)
        if (dir === "up" || dir === "down") {
          result = navigateVertical(dir, state, repo, navigator)
        } else {
          result = navigateHorizontal(dir, state, repo, navigator)
        }
      }

      // Runtime invariant: navigation must never land on a hidden node
      if (result && state.hiddenNodeIds?.has(result)) {
        log.error?.(`navigate(${dir}) landed on hidden node ${result} — this is a navigation bug`)
        return null // Refuse to navigate to hidden node
      }
      return result
    },
    classifyCursor(nodeId, rootId, repo) {
      return deriveCursorAncestors(
        (id) => repo.getNode(id),
        rootId,
        nodeId,
        (pid) => repo.getChildren(pid),
      )
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
      if (!nodeId) return { cursorCardNodeId: null, cursorColumnNodeId: null, selectionLevel: "board" }
      return { cursorCardNodeId: nodeId, cursorColumnNodeId: null, selectionLevel: "card" }
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
// ViewNode-based navigation (Phase 2b)
// =============================================================================

/**
 * Find next/prev sibling in ViewNode tree, skipping hidden nodes.
 * Returns null if at boundary.
 */
function vnSibling(vn: ViewNode, delta: 1 | -1, hiddenNodeIds?: Set<string>): ViewNode | null {
  if (!vn.parent) return null
  const siblings = vn.parent.children
  let idx = siblings.indexOf(vn)
  if (idx < 0) return null
  idx += delta
  while (idx >= 0 && idx < siblings.length) {
    const candidate = siblings[idx]!
    if (!hiddenNodeIds?.has(candidate.id)) return candidate
    idx += delta
  }
  return null
}

/**
 * Get the index of a ViewNode among its parent's children.
 */
function vnIndex(vn: ViewNode): number {
  if (!vn.parent) return -1
  return vn.parent.children.indexOf(vn)
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
function vnStructuralColumnIndex(col: ViewNode, hiddenNodeIds?: Set<string>): number {
  if (col.parent?.role !== "board") return -1
  const cols = col.parent.children
  let structIdx = 0
  for (const c of cols) {
    if (c.role === "body-column") continue
    if (hiddenNodeIds?.has(c.id)) continue
    if (c === col) return structIdx
    structIdx++
  }
  return -1
}

/**
 * Get visible columns from the board, optionally filtering by type.
 */
function vnVisibleColumns(board: ViewNode, hiddenNodeIds?: Set<string>): ViewNode[] {
  return board.children.filter((c) => !hiddenNodeIds?.has(c.id))
}

/**
 * Get visible structural (non-body) columns.
 */
function vnStructuralColumns(board: ViewNode, hiddenNodeIds?: Set<string>): ViewNode[] {
  return board.children.filter((c) => c.role !== "body-column" && !hiddenNodeIds?.has(c.id))
}

/**
 * Get body column from the board, if it exists and is visible.
 */
function vnBodyColumn(board: ViewNode, hiddenNodeIds?: Set<string>): ViewNode | null {
  const bc = board.children.find((c) => c.role === "body-column")
  if (!bc) return null
  if (hiddenNodeIds?.has(bc.id)) return null
  return bc
}

/**
 * Get visible card children of a column, filtering hidden.
 */
function vnVisibleCards(col: ViewNode, hiddenNodeIds?: Set<string>): ViewNode[] {
  return col.children.filter((c) => !hiddenNodeIds?.has(c.id))
}

/**
 * ViewNode-based vertical navigation (j/k).
 *
 * Uses the ViewNode tree to determine navigation targets instead of
 * ad-hoc repo walks. The tree already encodes visual roles.
 */
function vnNavigateVertical(dir: "up" | "down", state: NavState, navigator: GridNavigator): string | null {
  const { cursorNodeId, hiddenNodeIds, viewTree, viewIndex } = state
  if (!viewTree || !viewIndex) return null

  const vn = viewIndex.get(cursorNodeId)
  if (!vn) {
    // Node not in view tree (e.g., deleted during sync)
    return state.rootId
  }

  // ----- Board level -----
  if (vn.role === "board") {
    if (dir === "down") {
      const stickyX = navigator.stickyX
      const structCols = vnStructuralColumns(viewTree, hiddenNodeIds)
      if (stickyX !== null && stickyX < structCols.length) {
        return structCols[stickyX]?.id ?? null
      }
      // No stickyX: prefer first visible body card, then first structural column
      const bodyCol = vnBodyColumn(viewTree, hiddenNodeIds)
      if (bodyCol) {
        const visCards = vnVisibleCards(bodyCol, hiddenNodeIds)
        if (visCards.length > 0) return visCards[0]!.id
      }
      const visCols = vnVisibleColumns(viewTree, hiddenNodeIds)
      return visCols[0]?.id ?? null
    }
    // k from board → null
    return null
  }

  // ----- Body column header -----
  if (vn.role === "body-column") {
    if (dir === "down") {
      const visCards = vnVisibleCards(vn, hiddenNodeIds)
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
      const visCards = vnVisibleCards(vn, hiddenNodeIds)
      return visCards[0]?.id ?? null
    }
    // k from column → board (save stickyX)
    const structIdx = vnStructuralColumnIndex(vn, hiddenNodeIds)
    if (structIdx >= 0) navigator.setStickyX(structIdx)
    return state.rootId
  }

  // ----- Card level -----
  if (vn.role === "card") {
    const col = vn.parent
    if (!col) return null

    if (col.role === "body-column") {
      // Body card navigation
      const visCards = vnVisibleCards(col, hiddenNodeIds)
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
      const next = vnSibling(vn, 1, hiddenNodeIds)
      return next?.id ?? null
    }
    // k from card
    const prev = vnSibling(vn, -1, hiddenNodeIds)
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
      // Try next sibling at current level
      const next = vnSibling(vn, 1, hiddenNodeIds)
      if (next) return next.id
      // Walk up ancestors to find one with a next sibling (DFS next)
      let walk: ViewNode | null = vn.parent
      while (walk && walk !== cardVn) {
        const parentNext = vnSibling(walk, 1, hiddenNodeIds)
        if (parentNext) return parentNext.id
        walk = walk.parent
      }
      // Reached card level: jump to next card
      if (cardVn.parent) {
        const nextCard = vnSibling(cardVn, 1, hiddenNodeIds)
        return nextCard?.id ?? null
      }
      return null
    }
    // k from subitem
    const prev = vnSibling(vn, -1, hiddenNodeIds)
    if (prev) return prev.id
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
  const { cursorNodeId, hiddenNodeIds, viewTree, viewIndex } = state
  if (!viewTree || !viewIndex) return null

  const vn = viewIndex.get(cursorNodeId)
  if (!vn) {
    return state.rootId
  }

  // Board level → can't move h/l
  if (vn.role === "board") return null

  // ----- Body column header -----
  if (vn.role === "body-column") {
    if (dir === "left") return null // body is leftmost
    const structCols = vnStructuralColumns(viewTree, hiddenNodeIds)
    return structCols[0]?.id ?? null
  }

  // ----- Column header -----
  if (vn.role === "column") {
    const col = vn
    const structCols = vnStructuralColumns(viewTree, hiddenNodeIds)
    const bodyCol = vnBodyColumn(viewTree, hiddenNodeIds)
    const structIdx = structCols.indexOf(col)

    if (dir === "left") {
      if (structIdx === 0) {
        // First structural col → body column (if it has cards)
        if (!bodyCol) return null
        return vnNavigateToBody(bodyCol, navigator, hiddenNodeIds)
      }
      if (structIdx > 0) {
        return vnNavigateToStructuralCol(structCols[structIdx - 1]!, state, navigator, bodyCol !== null, true, col.id)
      }
      return null
    }
    // right
    if (structIdx >= 0 && structIdx + 1 < structCols.length) {
      return vnNavigateToStructuralCol(structCols[structIdx + 1]!, state, navigator, bodyCol !== null, true, col.id)
    }
    return null
  }

  // ----- Card or subitem level -----
  // Resolve to the containing column
  const colVn = vnFindColumn(vn)
  if (!colVn) return null

  const structCols = vnStructuralColumns(viewTree, hiddenNodeIds)
  const bodyCol = vnBodyColumn(viewTree, hiddenNodeIds)
  const hasBody = bodyCol !== null

  if (colVn.role === "body-column") {
    // In body column
    if (dir === "left") return null
    if (structCols.length === 0) return null
    return vnNavigateToStructuralCol(structCols[0]!, state, navigator, hasBody)
  }

  // In a structural column
  const structIdx = structCols.indexOf(colVn)
  if (structIdx < 0) {
    // Cursor is on a hidden column — redirect
    if (structCols.length > 0) return structCols[0]!.id
    if (hasBody && bodyCol) {
      const visCards = vnVisibleCards(bodyCol, hiddenNodeIds)
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
        sourceCardIdx = vnIndex(cardVn)
        if (sourceCardIdx < 0) sourceCardIdx = undefined
      }
      return vnNavigateToBody(bodyCol, navigator, hiddenNodeIds, sourceCardIdx)
    }
    return vnNavigateToStructuralCol(structCols[structIdx - 1]!, state, navigator, hasBody, false, colVn.id)
  }

  // right
  if (structIdx + 1 >= structCols.length) return null
  return vnNavigateToStructuralCol(structCols[structIdx + 1]!, state, navigator, hasBody, false, colVn.id)
}

/**
 * Navigate to a structural column ViewNode, selecting the appropriate card.
 */
function vnNavigateToStructuralCol(
  targetCol: ViewNode,
  state: NavState,
  navigator: GridNavigator,
  hasBody: boolean,
  isAtColumnLevel?: boolean,
  sourceColId?: string,
): string | null {
  const { hiddenNodeIds, viewTree } = state
  if (!viewTree) return null

  // View column index: offset by 1 if body column exists (body is view column 0)
  const structCols = vnStructuralColumns(viewTree, hiddenNodeIds)
  const structIdx = structCols.indexOf(targetCol)
  const viewColIdx = hasBody ? structIdx + 1 : structIdx

  // Collapsed target → always land on column header
  if (state.collapsedNodes.has(targetCol.id)) {
    return targetCol.id
  }

  const visCards = vnVisibleCards(targetCol, hiddenNodeIds)

  if (visCards.length === 0) {
    return targetCol.id
  }

  if (isAtColumnLevel) {
    // At column header: if current column has cards, stay at header level
    if (sourceColId) {
      const sourceColVn = state.viewIndex?.get(sourceColId)
      if (sourceColVn) {
        const sourceCards = vnVisibleCards(sourceColVn, hiddenNodeIds)
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
    return targetCol.id
  }

  // At card level: use stickyY
  const stickyY = navigator.stickyY
  if (stickyY === null) {
    return visCards[0]?.id ?? null
  }

  if (navigator.hasSection(viewColIdx)) {
    const targetCardIdx = navigator.findItemAtY(viewColIdx, stickyY)
    return visCards[Math.min(Math.max(0, targetCardIdx), visCards.length - 1)]?.id ?? null
  }

  navigator.setDeferredNavigation(viewColIdx, stickyY)
  return visCards[0]?.id ?? null
}

/**
 * Navigate to the virtual body column, selecting the appropriate body card.
 */
function vnNavigateToBody(
  bodyCol: ViewNode,
  navigator: GridNavigator,
  hiddenNodeIds?: Set<string>,
  sourceCardIdx?: number,
): string | null {
  const visCards = vnVisibleCards(bodyCol, hiddenNodeIds)
  if (visCards.length === 0) return null

  const stickyY = navigator.stickyY
  if (stickyY === null) {
    return visCards[0]?.id ?? null
  }

  if (sourceCardIdx !== undefined) {
    const clampedIdx = Math.min(sourceCardIdx, visCards.length - 1)
    navigator.setDeferredNavigation(0, stickyY)
    return visCards[clampedIdx]?.id ?? null
  }

  if (navigator.hasSection(0)) {
    const targetCardIdx = navigator.findItemAtY(0, stickyY)
    const clampedIdx = Math.min(Math.max(0, targetCardIdx), visCards.length - 1)
    return visCards[clampedIdx]?.id ?? null
  }

  return visCards[0]?.id ?? null
}

// =============================================================================
// Shared helpers
// =============================================================================

import { indexOfChild } from "./sibling-index.ts"

/**
 * Get navigable children of a node, filtering out index files for folders.
 *
 * The view layer (kNodeToColumnView) filters index files from cardNodes so they
 * are not rendered. Navigation must match: if a node is invisible in the view,
 * the cursor must not land on it. This mirrors the filtering at use-columns.ts:776-778.
 */
export function getNavigableChildren(parentId: string | null, repo: Repo): import("@km/core").KNode[] {
  const children = repo.getChildren(parentId)
  if (!parentId) return children
  const parentNode = repo.getNode(parentId)
  if (parentNode?.fstype !== "folder") return children
  const indexFile = findIndexFile(parentNode, children)
  if (!indexFile) return children
  return children.filter((c) => c.id !== indexFile.id)
}

// =============================================================================
// LEGACY FALLBACK — repo-based navigation (used when ViewNode tree is unavailable)
//
// These functions implement the original navigation logic that walks the repo
// data model directly. They are kept as an emergency fallback path in case
// viewTree/viewIndex are not populated (shouldn't happen in normal operation).
// The primary navigation path uses ViewNode-based functions above.
// =============================================================================

function filterMeaningfulBody<T extends { content?: string }>(nodes: T[]): T[] {
  return nodes.filter((n) => n.content && n.content.replace(/<[^>]+>/g, "").trim().length > 0)
}

/** Get card ID by index, throw if out of bounds (programming error). */
function cardAt(cards: { id: string }[], idx: number): string {
  const card = cards[idx]
  if (!card) {
    throw new Error(`[nav] card index ${idx} out of bounds (${cards.length} cards)`)
  }
  return card.id
}

function getSibling(nodeId: string, repo: Repo, delta: 1 | -1, hiddenNodeIds?: Set<string>): string | null {
  const node = repo.getNode(nodeId)
  if (!node) throw new Error(`[nav] node not in repo: ${nodeId}`)
  const siblings = getNavigableChildren(node.parent_id, repo)
  const idx = indexOfChild(siblings, nodeId)
  if (idx < 0) {
    throw new Error(`[nav] node ${nodeId} not found in parent's children`)
  }
  // Skip hidden nodes in the given direction
  let targetIdx = idx + delta
  while (targetIdx >= 0 && targetIdx < siblings.length && hiddenNodeIds?.has(siblings[targetIdx]!.id)) {
    targetIdx += delta
  }
  if (targetIdx < 0 || targetIdx >= siblings.length) return null
  return siblings[targetIdx]?.id ?? null
}

function findAncestorAtDepth(nodeId: string, rootId: string | null, depth: number, repo: Repo): string | null {
  const chain: string[] = []
  let currentId: string | null = nodeId

  while (currentId !== rootId && currentId !== null) {
    chain.push(currentId)
    const node = repo.getNode(currentId)
    if (!node) {
      throw new Error(`[nav] broken parent chain: ${currentId} not in repo`)
    }
    currentId = node.parent_id
  }

  const targetIndex = chain.length - depth
  if (targetIndex < 0 || targetIndex >= chain.length) return null
  const result = chain[targetIndex]
  if (!result) {
    throw new Error(`[nav] chain index ${targetIndex} missing after bounds check`)
  }
  return result
}

function navigateVertical(dir: "up" | "down", state: NavState, repo: Repo, navigator: GridNavigator): string | null {
  const { cursorNodeId, rootId, hiddenNodeIds } = state

  if (cursorNodeId.startsWith("__body__")) {
    if (dir === "down") {
      const allChildren = repo.getChildren(rootId)
      const { body } = extractBody(allChildren)
      const bodyNodes = filterMeaningfulBody(body)
      return bodyNodes[0]?.id ?? null
    }
    return rootId
  }

  const cursorNode = repo.getNode(cursorNodeId)
  if (!cursorNode) {
    log.error?.(`cursor node not in repo: ${cursorNodeId}, falling back to root`)
    return rootId
  }

  const isAtBoardLevel = cursorNodeId === rootId
  const isDirectChildOfRoot = cursorNode.parent_id === rootId && !isAtBoardLevel
  const isBodyContent = isDirectChildOfRoot && !KNode.isOutline(cursorNode)
  const isAtColumnLevel = isDirectChildOfRoot && !isBodyContent
  const isAtCardLevel = !isAtBoardLevel && !isAtColumnLevel

  let cardNodeId = cursorNodeId
  let isBodyCardDescendant = false
  if (isAtCardLevel && !isBodyContent) {
    if (state.cursorCardNodeId) {
      cardNodeId = state.cursorCardNodeId
      const directChildOfRoot = findAncestorAtDepth(state.cursorCardNodeId, rootId, 0, repo)
      if (directChildOfRoot) {
        const directChildNode = repo.getNode(state.cursorCardNodeId)
        if (directChildNode && directChildNode.parent_id === rootId && !KNode.isOutline(directChildNode)) {
          isBodyCardDescendant = true
        }
      }
    } else {
      const directChildOfRoot = findAncestorAtDepth(cursorNodeId, rootId, 1, repo)
      if (directChildOfRoot) {
        const directChildNode = repo.getNode(directChildOfRoot)
        if (directChildNode && !KNode.isOutline(directChildNode)) {
          cardNodeId = directChildOfRoot
          isBodyCardDescendant = true
        } else {
          const cardAncestor = findAncestorAtDepth(cursorNodeId, rootId, 2, repo)
          if (cardAncestor) cardNodeId = cardAncestor
        }
      }
    }
  }

  const isInsideCard = isAtCardLevel && !isBodyContent && cursorNodeId !== cardNodeId
  if (isInsideCard) {
    if (dir === "down") {
      const next = getSibling(cursorNodeId, repo, 1, hiddenNodeIds)
      if (next) return next
      let walkId: string | null = cursorNode.parent_id
      while (walkId && walkId !== cardNodeId) {
        const parentNext = getSibling(walkId, repo, 1, hiddenNodeIds)
        if (parentNext) return parentNext
        const walkNode = repo.getNode(walkId)
        walkId = walkNode?.parent_id ?? null
      }
      return getSibling(cardNodeId, repo, 1, hiddenNodeIds)
    } else {
      const prev = getSibling(cursorNodeId, repo, -1, hiddenNodeIds)
      if (prev) return prev
      return cursorNode.parent_id
    }
  }

  if (dir === "down") {
    if (isAtBoardLevel) {
      const stickyX = navigator.stickyX
      const allChildren = repo.getChildren(rootId)
      const { body: rawBody, items: rawCols } = extractBody(allChildren)
      const rawBodyNodes = filterMeaningfulBody(rawBody)
      const bodyNodes = hiddenNodeIds ? rawBodyNodes.filter((n) => !hiddenNodeIds.has(n.id)) : rawBodyNodes
      const structuralCols = hiddenNodeIds ? rawCols.filter((n) => !hiddenNodeIds.has(n.id)) : rawCols

      if (stickyX !== null) {
        if (stickyX < structuralCols.length) {
          return structuralCols[stickyX]?.id ?? null
        }
      }

      if (bodyNodes.length > 0) {
        return bodyNodes[0]?.id ?? null
      }
      const visibleChildren = hiddenNodeIds ? allChildren.filter((n) => !hiddenNodeIds.has(n.id)) : allChildren
      return structuralCols[0]?.id ?? visibleChildren[0]?.id ?? null
    }

    if (isBodyContent || isBodyCardDescendant) {
      const effectiveCursorId = isBodyCardDescendant ? cardNodeId : cursorNodeId
      const allChildren = repo.getChildren(rootId)
      const { body: rawBody } = extractBody(allChildren)
      const bodyNodes = filterMeaningfulBody(rawBody)
      const bodyIdx = bodyNodes.findIndex((n) => n.id === effectiveCursorId)
      if (bodyIdx >= 0 && bodyIdx < bodyNodes.length - 1) {
        return bodyNodes[bodyIdx + 1]?.id ?? null
      }
      return null
    }

    if (isAtColumnLevel) {
      if (state.collapsedNodes.has(cursorNodeId)) return null
      const cards = getNavigableChildren(cursorNodeId, repo)
      const firstVisible = hiddenNodeIds ? cards.find((c) => !hiddenNodeIds.has(c.id)) : cards[0]
      return firstVisible?.id ?? null
    }

    if (isAtCardLevel) {
      return getSibling(cardNodeId, repo, 1, hiddenNodeIds)
    }
  } else {
    if (isBodyContent || isBodyCardDescendant) {
      const effectiveCursorId = isBodyCardDescendant ? cardNodeId : cursorNodeId
      const allChildren = repo.getChildren(rootId)
      const { body: rawBody } = extractBody(allChildren)
      const bodyNodes = filterMeaningfulBody(rawBody)
      const bodyIdx = bodyNodes.findIndex((n) => n.id === effectiveCursorId)
      if (bodyIdx > 0) {
        return bodyNodes[bodyIdx - 1]?.id ?? null
      }
      return `__body__${rootId ?? "root"}`
    }

    if (isAtCardLevel) {
      const prev = getSibling(cardNodeId, repo, -1, hiddenNodeIds)
      if (prev) return prev
      const cardNode = repo.getNode(cardNodeId)
      return cardNode?.parent_id ?? cursorNode.parent_id
    }

    if (isAtColumnLevel) {
      const allChildren = repo.getChildren(rootId)
      const { items: rawCols } = extractBody(allChildren)
      const visibleCols = hiddenNodeIds ? rawCols.filter((n) => !hiddenNodeIds.has(n.id)) : rawCols
      const colIdx = indexOfChild(visibleCols, cursorNodeId)
      if (colIdx >= 0) navigator.setStickyX(colIdx)
      return rootId
    }

    if (isAtBoardLevel) {
      return null
    }
  }

  return null
}

function navigateHorizontal(
  dir: "left" | "right",
  state: NavState,
  repo: Repo,
  navigator: GridNavigator,
): string | null {
  const { cursorNodeId, rootId, hiddenNodeIds } = state

  if (cursorNodeId.startsWith("__body__")) {
    if (dir === "left") return null
    const allChildren = repo.getChildren(rootId)
    const { items: rawCols } = extractBody(allChildren)
    const structuralCols = hiddenNodeIds ? rawCols.filter((n) => !hiddenNodeIds.has(n.id)) : rawCols
    if (structuralCols.length === 0) return null
    return structuralCols[0]?.id ?? null
  }

  const cursorNode = repo.getNode(cursorNodeId)
  if (!cursorNode) {
    log.error?.(`cursor node not in repo: ${cursorNodeId}, falling back to root`)
    return rootId
  }

  if (cursorNodeId === rootId) return null

  const allChildren = repo.getChildren(rootId)
  const { body: rawBody, items: rawCols } = extractBody(allChildren)
  const rawBodyNodes = filterMeaningfulBody(rawBody)
  const bodyNodes = hiddenNodeIds ? rawBodyNodes.filter((n) => !hiddenNodeIds.has(n.id)) : rawBodyNodes
  const structuralCols = hiddenNodeIds ? rawCols.filter((n) => !hiddenNodeIds.has(n.id)) : rawCols
  const hasBody = bodyNodes.length > 0

  const cursorDirectChild = findAncestorAtDepth(cursorNodeId, rootId, 1, repo)
  if (!cursorDirectChild) {
    throw new Error(`[nav] cursor ${cursorNodeId} has no ancestor under root ${rootId}`)
  }
  const isInBody = hasBody && bodyNodes.some((n) => n.id === cursorDirectChild)

  if (isInBody) {
    if (dir === "left") return null
    if (structuralCols.length === 0) return null
    return navigateToStructuralCol(0, structuralCols, state, navigator, repo, hasBody)
  }

  const cursorColId = cursorDirectChild
  const colIdx = indexOfChild(structuralCols, cursorColId)
  if (colIdx < 0) {
    if (structuralCols.length > 0) return structuralCols[0]!.id
    if (hasBody) return bodyNodes[0]?.id ?? null
    return null
  }

  const isAtColumnLevel = cursorNode.parent_id === rootId

  if (dir === "left") {
    if (colIdx === 0) {
      if (!hasBody) return null
      let sourceCardIdx: number | undefined
      if (!isAtColumnLevel) {
        const cardInCol = findAncestorAtDepth(cursorNodeId, rootId, 2, repo)
        if (cardInCol) {
          const colChildren = repo.getChildren(cursorColId)
          sourceCardIdx = indexOfChild(colChildren, cardInCol)
          if (sourceCardIdx < 0) sourceCardIdx = undefined
        }
      }
      return navigateToBody(bodyNodes, navigator, sourceCardIdx)
    }
    return navigateToStructuralCol(
      colIdx - 1,
      structuralCols,
      state,
      navigator,
      repo,
      hasBody,
      isAtColumnLevel,
      cursorColId,
    )
  }

  const targetColIdx = colIdx + 1
  if (targetColIdx >= structuralCols.length) return null
  return navigateToStructuralCol(
    targetColIdx,
    structuralCols,
    state,
    navigator,
    repo,
    hasBody,
    isAtColumnLevel,
    cursorColId,
  )
}

function navigateToStructuralCol(
  structIdx: number,
  structuralCols: { id: string }[],
  state: NavState,
  navigator: GridNavigator,
  repo: Repo,
  hasBody: boolean,
  isAtColumnLevel?: boolean,
  sourceColId?: string,
): string | null {
  const targetCol = structuralCols[structIdx]
  if (!targetCol) return null

  const viewColIdx = hasBody ? structIdx + 1 : structIdx

  if (state.collapsedNodes.has(targetCol.id)) {
    return targetCol.id
  }

  const targetCards = getNavigableChildren(targetCol.id, repo)

  if (targetCards.length === 0) {
    return targetCol.id
  }

  if (isAtColumnLevel) {
    if (sourceColId) {
      const currentCards = getNavigableChildren(sourceColId, repo)
      if (currentCards.length > 0) {
        return targetCol.id
      }
    }
    const stickyY = navigator.stickyY
    if (stickyY !== null) {
      if (navigator.hasSection(viewColIdx)) {
        const targetCardIdx = navigator.findItemAtY(viewColIdx, stickyY)
        return cardAt(targetCards, Math.min(Math.max(0, targetCardIdx), targetCards.length - 1))
      }
      navigator.setDeferredNavigation(viewColIdx, stickyY)
      return cardAt(targetCards, 0)
    }
    return targetCol.id
  }

  const stickyY = navigator.stickyY
  if (stickyY === null) {
    return cardAt(targetCards, 0)
  }

  if (navigator.hasSection(viewColIdx)) {
    const targetCardIdx = navigator.findItemAtY(viewColIdx, stickyY)
    return cardAt(targetCards, Math.min(Math.max(0, targetCardIdx), targetCards.length - 1))
  }

  navigator.setDeferredNavigation(viewColIdx, stickyY)
  return cardAt(targetCards, 0)
}

function navigateToBody(bodyNodes: { id: string }[], navigator: GridNavigator, sourceCardIdx?: number): string | null {
  if (bodyNodes.length === 0) return null

  const stickyY = navigator.stickyY
  if (stickyY === null) {
    return bodyNodes[0]?.id ?? null
  }

  if (sourceCardIdx !== undefined) {
    const clampedIdx = Math.min(sourceCardIdx, bodyNodes.length - 1)
    navigator.setDeferredNavigation(0, stickyY)
    return bodyNodes[clampedIdx]?.id ?? null
  }

  if (navigator.hasSection(0)) {
    const targetCardIdx = navigator.findItemAtY(0, stickyY)
    const clampedIdx = Math.min(Math.max(0, targetCardIdx), bodyNodes.length - 1)
    return bodyNodes[clampedIdx]?.id ?? null
  }

  return bodyNodes[0]?.id ?? null
}
