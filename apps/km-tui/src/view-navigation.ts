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
import { isOutline } from "@km/core"
import { createLogger } from "@beorn/logger"
import { extractBody } from "@km/tree"
import type { LayoutRegistry } from "./card-positions.ts"

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
  foldedNodes: Set<string>
  collapsedNodes: Set<string>
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
export interface ViewNavigation {
  navigate(
    dir: "up" | "down" | "left" | "right",
    state: NavState,
    repo: Repo,
    layoutRegistry: LayoutRegistry,
  ): string | null
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
    navigate(dir, state, repo, layoutRegistry) {
      if (dir === "up" || dir === "down") {
        return navigateVertical(dir, state, repo, layoutRegistry)
      }

      // dir === "left" || dir === "right"
      return navigateHorizontal(dir, state, repo, layoutRegistry)
    },
  }
}

// =============================================================================
// Vertical navigation (j/k)
// =============================================================================

function navigateVertical(
  dir: "up" | "down",
  state: NavState,
  repo: Repo,
  layoutRegistry: LayoutRegistry,
): string | null {
  const { cursorNodeId, rootId } = state

  const cursorNode = repo.getNode(cursorNodeId)
  if (!cursorNode) {
    // Cursor node was deleted (e.g., by file watcher re-parse during sync).
    // Fall back to first column instead of crashing the event loop.
    log.error?.(`cursor node not in repo: ${cursorNodeId}, falling back to root`)
    return rootId
  }

  const isAtBoardLevel = cursorNodeId === rootId

  // Detect body content: direct child of root but NOT an outline item.
  // Body nodes (p, li, code, quote, hr, etc.) that appear before the first oi
  // child are rendered as cards in the virtual "Description" column by the view
  // layer (see extractBody). The navigation layer must treat them as card-level,
  // not column-level, even though their parent_id === rootId.
  const isDirectChildOfRoot = cursorNode.parent_id === rootId && !isAtBoardLevel
  const isBodyContent = isDirectChildOfRoot && !isOutline(cursorNode.type)

  const isAtColumnLevel = isDirectChildOfRoot && !isBodyContent
  const isAtCardLevel = !isAtBoardLevel && !isAtColumnLevel

  // Resolve sub-card descendants to their card-level ancestor.
  // After indent, cursorNodeId may point to a node nested inside a card.
  // j/k must navigate at card level (column children), not at the descendant's sibling level.
  let cardNodeId = cursorNodeId
  if (isAtCardLevel && !isBodyContent) {
    const cardAncestor = findAncestorAtDepth(cursorNodeId, rootId, 2, repo)
    if (cardAncestor) cardNodeId = cardAncestor
  }

  if (dir === "down") {
    if (isAtBoardLevel) {
      // Board → column header (use stickyX to remember which column)
      const stickyX = layoutRegistry.getStickyX()
      const columns = repo.getChildren(rootId)
      const targetIdx = stickyX !== null && stickyX < columns.length ? stickyX : 0
      return columns[targetIdx]?.id ?? null
    }

    if (isBodyContent) {
      // Body card → next meaningful body sibling.
      // Use filterMeaningfulBody to skip HR/empty nodes that the view doesn't render.
      const allChildren = repo.getChildren(rootId)
      const { body: rawBody } = extractBody(allChildren)
      const bodyNodes = filterMeaningfulBody(rawBody)
      const bodyIdx = bodyNodes.findIndex((n) => n.id === cursorNodeId)
      if (bodyIdx >= 0 && bodyIdx < bodyNodes.length - 1) {
        return bodyNodes[bodyIdx + 1]!.id
      }
      // At last body card — boundary (can't go down to column headers,
      // they're in a different visual column)
      return null
    }

    if (isAtColumnLevel) {
      // Collapsed column → can't go down into cards (they're not rendered)
      if (state.collapsedNodes.has(cursorNodeId)) return null
      // Column header → first card in column
      const cards = repo.getChildren(cursorNodeId)
      return cards[0]?.id ?? null
    }

    if (isAtCardLevel) {
      // Card → next sibling (using card-level ancestor)
      return getSibling(cardNodeId, repo, 1)
    }
  } else {
    // k: move up
    if (isBodyContent) {
      // Body card → previous meaningful body sibling, or board level if at first.
      // Use filterMeaningfulBody to skip HR/empty nodes that the view doesn't render.
      const allChildren = repo.getChildren(rootId)
      const { body: rawBody } = extractBody(allChildren)
      const bodyNodes = filterMeaningfulBody(rawBody)
      const bodyIdx = bodyNodes.findIndex((n) => n.id === cursorNodeId)
      if (bodyIdx > 0) {
        return bodyNodes[bodyIdx - 1]!.id
      }
      // At first body card → board level
      return rootId
    }

    if (isAtCardLevel) {
      // Try previous sibling first (using card-level ancestor)
      const prev = getSibling(cardNodeId, repo, -1)
      if (prev) return prev
      // At first card → parent (column header)
      const cardNode = repo.getNode(cardNodeId)
      return cardNode?.parent_id ?? cursorNode.parent_id
    }

    if (isAtColumnLevel) {
      // Column header → board (save column index for return via stickyX)
      const columns = repo.getChildren(rootId)
      const colIdx = indexOfChild(columns, cursorNodeId)
      if (colIdx >= 0) layoutRegistry.setStickyX(colIdx)
      return rootId
    }

    if (isAtBoardLevel) {
      return null // can't go higher
    }
  }

  return null
}

// =============================================================================
// Horizontal navigation (h/l)
// =============================================================================

/**
 * Filter body nodes to only those with meaningful content.
 * Mirrors the view layer's meaningfulBody filter in use-columns.ts:
 *   bodyNodes.filter((n) => n.content && n.content.replace(/<[^>]+>/g, "").trim().length > 0)
 *
 * Navigation must use this filter so that card indices match what the view
 * renders and what LayoutRegistry tracks. Without this, HR nodes and empty
 * paragraphs create an index mismatch between navigation's bodyNodes[]
 * and the view's registered card array.
 */
function filterMeaningfulBody<T extends { content?: string }>(nodes: T[]): T[] {
  return nodes.filter((n) => n.content && n.content.replace(/<[^>]+>/g, "").trim().length > 0)
}

/**
 * Split root children into body content nodes and structural (oi) columns.
 * Mirrors the view layer's extractBody split: body nodes are grouped into
 * a single virtual "Description" column, only oi nodes are real columns.
 *
 * Body nodes are filtered to match the view layer's meaningfulBody filter,
 * so navigation indices align with rendered card indices.
 */
function splitBodyAndColumns(allChildren: { id: string; type: string; content?: string }[]): {
  bodyNodes: { id: string; type: string; content?: string }[]
  structuralCols: { id: string; type: string; content?: string }[]
} {
  const firstStructuralIdx = allChildren.findIndex((c) => isOutline(c.type))
  if (firstStructuralIdx === -1) return { bodyNodes: filterMeaningfulBody(allChildren), structuralCols: [] }
  if (firstStructuralIdx === 0) return { bodyNodes: [], structuralCols: allChildren }
  return {
    bodyNodes: filterMeaningfulBody(allChildren.slice(0, firstStructuralIdx)),
    structuralCols: allChildren.slice(firstStructuralIdx),
  }
}

function navigateHorizontal(
  dir: "left" | "right",
  state: NavState,
  repo: Repo,
  layoutRegistry: LayoutRegistry,
): string | null {
  const { cursorNodeId, rootId } = state

  const cursorNode = repo.getNode(cursorNodeId)
  if (!cursorNode) {
    log.error?.(`cursor node not in repo: ${cursorNodeId}, falling back to root`)
    return rootId
  }

  // At board level, h/l can't move
  if (cursorNodeId === rootId) return null

  // Split root children into body content and structural (oi) columns.
  // This mirrors the view layer's extractBody split — body nodes are grouped
  // into a single virtual "Description" column, only oi nodes are real columns.
  const allChildren = repo.getChildren(rootId)
  const { bodyNodes, structuralCols } = splitBodyAndColumns(allChildren)
  const hasBody = bodyNodes.length > 0

  // Determine if cursor is in body content (before the first oi node).
  // Check membership in bodyNodes rather than just type — non-oi nodes that
  // appear AFTER the first oi are treated as structural columns by the view.
  const cursorDirectChild = findAncestorAtDepth(cursorNodeId, rootId, 1, repo)
  if (!cursorDirectChild) {
    throw new Error(`[nav] cursor ${cursorNodeId} has no ancestor under root ${rootId}`)
  }
  const isInBody = hasBody && bodyNodes.some((n) => n.id === cursorDirectChild)

  if (isInBody) {
    // Cursor is in the virtual body column
    if (dir === "left") return null // Body is leftmost column
    // dir === "right": navigate to first structural column
    if (structuralCols.length === 0) return null
    return navigateToStructuralCol(0, structuralCols, state, layoutRegistry, repo, hasBody)
  }

  // Cursor is in a structural column — find its index within structural columns only
  const cursorColId = cursorDirectChild
  const colIdx = indexOfChild(structuralCols, cursorColId)
  if (colIdx < 0) {
    throw new Error(`[nav] column ${cursorColId} not found in structural children`)
  }

  const isAtColumnLevel = cursorNode.parent_id === rootId

  if (dir === "left") {
    if (colIdx === 0) {
      // First structural column → navigate left to body (if it exists)
      if (!hasBody) return null
      return navigateToBody(bodyNodes, layoutRegistry)
    }
    // Navigate to previous structural column
    return navigateToStructuralCol(colIdx - 1, structuralCols, state, layoutRegistry, repo, hasBody, isAtColumnLevel, cursorColId)
  }

  // dir === "right"
  const targetColIdx = colIdx + 1
  if (targetColIdx >= structuralCols.length) return null
  return navigateToStructuralCol(targetColIdx, structuralCols, state, layoutRegistry, repo, hasBody, isAtColumnLevel, cursorColId)
}

/**
 * Navigate to a structural column at the given index, selecting the appropriate card.
 * viewColIdx accounts for the virtual body column offset when computing layout positions.
 */
function navigateToStructuralCol(
  structIdx: number,
  structuralCols: { id: string }[],
  state: NavState,
  layoutRegistry: LayoutRegistry,
  repo: Repo,
  hasBody: boolean,
  isAtColumnLevel?: boolean,
  sourceColId?: string,
): string | null {
  const targetCol = structuralCols[structIdx]
  if (!targetCol) return null

  // View column index: offset by 1 if body column exists (body is view column 0)
  const viewColIdx = hasBody ? structIdx + 1 : structIdx

  // Collapsed target column → always land on column header
  if (state.collapsedNodes.has(targetCol.id)) {
    return targetCol.id
  }

  const targetCards = repo.getChildren(targetCol.id)

  if (targetCards.length === 0) {
    return targetCol.id
  }

  if (isAtColumnLevel) {
    // At column header: if current column has cards, stay at header level
    if (sourceColId) {
      const currentCards = repo.getChildren(sourceColId)
      if (currentCards.length > 0) {
        return targetCol.id
      }
    }
    // Empty source column → use stickyY if available
    const stickyY = layoutRegistry.getStickyY()
    if (stickyY !== null) {
      if (layoutRegistry.hasCardsInColumn(viewColIdx)) {
        const targetCardIdx = layoutRegistry.findCardAtYVisual(viewColIdx, stickyY)
        return cardAt(targetCards, Math.min(Math.max(0, targetCardIdx), targetCards.length - 1))
      }
      layoutRegistry.setDeferredNavigation(viewColIdx, stickyY)
      return cardAt(targetCards, 0)
    }
    return targetCol.id
  }

  // At card level (or navigating from body): use stickyY for Y-position matching
  const stickyY = layoutRegistry.getStickyY()
  if (stickyY === null) {
    return cardAt(targetCards, 0)
  }

  if (layoutRegistry.hasCardsInColumn(viewColIdx)) {
    const targetCardIdx = layoutRegistry.findCardAtYVisual(viewColIdx, stickyY)
    return cardAt(targetCards, Math.min(Math.max(0, targetCardIdx), targetCards.length - 1))
  }

  // Target column off-screen: start at first card, deferred corrects to Y-match
  layoutRegistry.setDeferredNavigation(viewColIdx, stickyY)
  return cardAt(targetCards, 0)
}

/**
 * Navigate to the virtual body column, selecting the appropriate body card.
 * Body cards are at view column index 0.
 */
function navigateToBody(
  bodyNodes: { id: string }[],
  layoutRegistry: LayoutRegistry,
): string | null {
  if (bodyNodes.length === 0) return null

  const stickyY = layoutRegistry.getStickyY()
  if (stickyY === null) {
    return bodyNodes[0]!.id
  }

  // Body is always view column 0
  if (layoutRegistry.hasCardsInColumn(0)) {
    const targetCardIdx = layoutRegistry.findCardAtYVisual(0, stickyY)
    const clampedIdx = Math.min(Math.max(0, targetCardIdx), bodyNodes.length - 1)
    return bodyNodes[clampedIdx]!.id
  }

  return bodyNodes[0]!.id
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * WeakMap-based index cache for children arrays from repo.getChildren().
 * Since getChildren() returns cached array references (ChildrenCache in repo.ts),
 * the WeakMap provides O(1) index lookup after the first scan per array.
 * When the children cache is busted (mutation), a new array is created and
 * the stale WeakMap entry is naturally GC'd.
 *
 * This eliminates O(N) findIndex() scans — critical for parents with 3000+ children.
 */
import { indexOfChild } from "./sibling-index.ts"

/** Get card ID by index, throw if out of bounds (programming error). */
function cardAt(cards: { id: string }[], idx: number): string {
  const card = cards[idx]
  if (!card) {
    throw new Error(`[nav] card index ${idx} out of bounds (${cards.length} cards)`)
  }
  return card.id
}

function getSibling(nodeId: string, repo: Repo, delta: 1 | -1): string | null {
  const node = repo.getNode(nodeId)
  if (!node) throw new Error(`[nav] node not in repo: ${nodeId}`)
  const siblings = repo.getChildren(node.parent_id)
  const idx = indexOfChild(siblings, nodeId)
  if (idx < 0) {
    throw new Error(`[nav] node ${nodeId} not found in parent's children`)
  }
  const targetIdx = idx + delta
  if (targetIdx < 0 || targetIdx >= siblings.length) return null
  return siblings[targetIdx]?.id ?? null
}

/**
 * Find the ancestor of nodeId at a given depth from rootId.
 * depth=1 means direct child of rootId (column level).
 */
function findAncestorAtDepth(nodeId: string, rootId: string | null, depth: number, repo: Repo): string | null {
  // Walk up from nodeId, collecting ancestor chain
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

  // chain is [nodeId, ..., directChildOfRoot]
  // depth=1 means we want the last element (direct child of root)
  const targetIndex = chain.length - depth
  if (targetIndex < 0 || targetIndex >= chain.length) return null
  const result = chain[targetIndex]
  if (!result) {
    throw new Error(`[nav] chain index ${targetIndex} missing after bounds check`)
  }
  return result
}
