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
import type { GridNavigator } from "@km/board"

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
  navigate(dir: "up" | "down" | "left" | "right", state: NavState, repo: Repo, navigator: GridNavigator): string | null
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
      if (dir === "up" || dir === "down") {
        return navigateVertical(dir, state, repo, navigator)
      }

      // dir === "left" || dir === "right"
      return navigateHorizontal(dir, state, repo, navigator)
    },
  }
}

// =============================================================================
// Vertical navigation (j/k)
// =============================================================================

function navigateVertical(dir: "up" | "down", state: NavState, repo: Repo, navigator: GridNavigator): string | null {
  const { cursorNodeId, rootId } = state

  // Virtual body column header (__body__<rootId>) — synthetic node not in repo.
  // Treat as a column header for the body column: j → first body card, k → board.
  if (cursorNodeId.startsWith("__body__")) {
    if (dir === "down") {
      const allChildren = repo.getChildren(rootId)
      const { bodyNodes } = splitBodyAndColumns(allChildren)
      return bodyNodes[0]?.id ?? null
    }
    // k from body column header → board level
    return rootId
  }

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
  //
  // Body-card descendants need special handling: body cards live at depth 1
  // (direct children of root), not depth 2 (root→column→card). When cursor
  // is inside a body card's subtree, resolve at depth 1 so j/k navigates
  // between body cards rather than between subtasks.
  let cardNodeId = cursorNodeId
  let isBodyCardDescendant = false
  if (isAtCardLevel && !isBodyContent) {
    // Check if the direct-child-of-root ancestor is a body node (not outline).
    // If so, cursor is inside a body card's subtree → resolve at depth 1.
    const directChildOfRoot = findAncestorAtDepth(cursorNodeId, rootId, 1, repo)
    if (directChildOfRoot) {
      const directChildNode = repo.getNode(directChildOfRoot)
      if (directChildNode && !isOutline(directChildNode.type)) {
        // Descendant of a body card — resolve to the body card itself
        cardNodeId = directChildOfRoot
        isBodyCardDescendant = true
      } else {
        // Standard multi-column card — resolve at depth 2
        const cardAncestor = findAncestorAtDepth(cursorNodeId, rootId, 2, repo)
        if (cardAncestor) cardNodeId = cardAncestor
      }
    }
  }

  if (dir === "down") {
    if (isAtBoardLevel) {
      // Board → first meaningful body card or column header.
      // stickyX remembers which column was last visited.
      const stickyX = navigator.stickyX
      const allChildren = repo.getChildren(rootId)
      const { bodyNodes, structuralCols } = splitBodyAndColumns(allChildren)

      if (stickyX !== null) {
        // stickyX indexes into structural columns (set by column-level k)
        if (stickyX < structuralCols.length) {
          return structuralCols[stickyX]?.id ?? null
        }
      }

      // No stickyX: prefer first meaningful body card, then first structural column
      if (bodyNodes.length > 0) {
        return bodyNodes[0]?.id ?? null
      }
      return structuralCols[0]?.id ?? allChildren[0]?.id ?? null
    }

    if (isBodyContent || isBodyCardDescendant) {
      // Body card (or descendant of body card) → next meaningful body sibling.
      // Use filterMeaningfulBody to skip HR/empty nodes that the view doesn't render.
      // For body-card descendants, cardNodeId has been resolved to the body card.
      const effectiveCursorId = isBodyCardDescendant ? cardNodeId : cursorNodeId
      const allChildren = repo.getChildren(rootId)
      const { body: rawBody } = extractBody(allChildren)
      const bodyNodes = filterMeaningfulBody(rawBody)
      const bodyIdx = bodyNodes.findIndex((n) => n.id === effectiveCursorId)
      if (bodyIdx >= 0 && bodyIdx < bodyNodes.length - 1) {
        return bodyNodes[bodyIdx + 1]?.id ?? null
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
    if (isBodyContent || isBodyCardDescendant) {
      // Body card (or descendant of body card) → previous meaningful body sibling,
      // or body column header if at first.
      // For body-card descendants, cardNodeId has been resolved to the body card.
      const effectiveCursorId = isBodyCardDescendant ? cardNodeId : cursorNodeId
      const allChildren = repo.getChildren(rootId)
      const { body: rawBody } = extractBody(allChildren)
      const bodyNodes = filterMeaningfulBody(rawBody)
      const bodyIdx = bodyNodes.findIndex((n) => n.id === effectiveCursorId)
      if (bodyIdx > 0) {
        return bodyNodes[bodyIdx - 1]?.id ?? null
      }
      // At first body card → body column header (virtual node)
      return `__body__${rootId ?? "root"}`
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
      // Column header → board (save structural column index for return via stickyX)
      const allChildren = repo.getChildren(rootId)
      const { structuralCols } = splitBodyAndColumns(allChildren)
      const colIdx = indexOfChild(structuralCols, cursorNodeId)
      if (colIdx >= 0) navigator.setStickyX(colIdx)
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
 * renders and what GridNavigator tracks. Without this, HR nodes and empty
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
  navigator: GridNavigator,
): string | null {
  const { cursorNodeId, rootId } = state

  // Virtual body column header (__body__<rootId>) — synthetic node not in repo.
  // Treat as body column header: l → first structural column header, h → boundary.
  if (cursorNodeId.startsWith("__body__")) {
    if (dir === "left") return null // Body column is leftmost
    const allChildren = repo.getChildren(rootId)
    const { structuralCols } = splitBodyAndColumns(allChildren)
    if (structuralCols.length === 0) return null
    // Navigate to structural column header (column-to-column navigation)
    return structuralCols[0]?.id ?? null
  }

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
    return navigateToStructuralCol(0, structuralCols, state, navigator, repo, hasBody)
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
      // Compute source card index for scroll-aware body navigation.
      // When the structural column is scrolled but the body column isn't,
      // stickyY (screen-relative) gives the wrong body card. Pass the
      // source card index so navigateToBody can use it as a hint.
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
    // Navigate to previous structural column
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

  // dir === "right"
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

/**
 * Navigate to a structural column at the given index, selecting the appropriate card.
 * viewColIdx accounts for the virtual body column offset when computing layout positions.
 */
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

  // At card level (or navigating from body): use stickyY for Y-position matching
  const stickyY = navigator.stickyY
  if (stickyY === null) {
    return cardAt(targetCards, 0)
  }

  if (navigator.hasSection(viewColIdx)) {
    const targetCardIdx = navigator.findItemAtY(viewColIdx, stickyY)
    return cardAt(targetCards, Math.min(Math.max(0, targetCardIdx), targetCards.length - 1))
  }

  // Target column off-screen: start at first card, deferred corrects to Y-match
  navigator.setDeferredNavigation(viewColIdx, stickyY)
  return cardAt(targetCards, 0)
}

/**
 * Navigate to the virtual body column, selecting the appropriate body card.
 * Body cards are at view column index 0.
 *
 * When sourceCardIdx is provided (from the structural column), it's used as
 * the initial target. This handles the scroll-offset mismatch: when the source
 * column has scrolled but the body column hasn't, stickyY (screen-relative)
 * would pick the wrong body card. The source card index gives the correct
 * logical position. After SELECT, the body column scrolls to show the target,
 * and deferred Y-correction (from handleHorizontalNav) fine-tunes the result.
 */
function navigateToBody(bodyNodes: { id: string }[], navigator: GridNavigator, sourceCardIdx?: number): string | null {
  if (bodyNodes.length === 0) return null

  const stickyY = navigator.stickyY
  if (stickyY === null) {
    return bodyNodes[0]?.id ?? null
  }

  // Body is always view column 0.
  // When source card index is available, use it as the primary hint
  // to handle scroll-offset mismatches between columns. The stickyY
  // (screen-relative) only works when both columns have similar scroll
  // positions. The source card index gives a scroll-invariant position.
  if (sourceCardIdx !== undefined) {
    const clampedIdx = Math.min(sourceCardIdx, bodyNodes.length - 1)
    // Set up deferred navigation so handleHorizontalNav's deferred resolve
    // can fine-tune via Y-matching after the body column scrolls.
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
