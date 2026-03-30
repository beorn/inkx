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
import type { GridNavigator } from "@km/board"
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
  /** Ignored node IDs — navigation skips these nodes */
  ignoredNodeIds?: Set<string>
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
      if (dir === "up" || dir === "down") {
        result = navigateVertical(dir, state, repo, navigator)
      } else {
        result = navigateHorizontal(dir, state, repo, navigator)
      }
      // Runtime invariant: navigation must never land on an ignored node
      if (result && state.ignoredNodeIds?.has(result)) {
        log.error?.(`navigate(${dir}) landed on ignored node ${result} — this is a navigation bug`)
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
// Vertical navigation (j/k)
// =============================================================================

function navigateVertical(dir: "up" | "down", state: NavState, repo: Repo, navigator: GridNavigator): string | null {
  const { cursorNodeId, rootId, ignoredNodeIds } = state

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
  const isBodyContent = isDirectChildOfRoot && !KNode.isOutline(cursorNode)

  const isAtColumnLevel = isDirectChildOfRoot && !isBodyContent
  const isAtCardLevel = !isAtBoardLevel && !isAtColumnLevel

  // Resolve sub-card descendants to their card-level ancestor.
  // Needed to know which card we're inside, even when navigating at sub-block level.
  // Prefer cursorCardNodeId from the cursor store when available — it reflects the
  // VISUAL card, which may differ from the data model parent chain for embeds.
  let cardNodeId = cursorNodeId
  let isBodyCardDescendant = false
  if (isAtCardLevel && !isBodyContent) {
    if (state.cursorCardNodeId) {
      // Use the cursor store's card (embed-aware)
      cardNodeId = state.cursorCardNodeId
      // Check if it's a body card descendant
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

  // Sub-block navigation: when cursor is inside a card (not the card title itself),
  // j/k navigate between siblings at the current level instead of jumping between cards.
  // On boundaries: j walks up ancestors to find one with a next sibling (DFS-like),
  // k goes to parent. This gives natural spatial navigation within a card's tree.
  const isInsideCard = isAtCardLevel && !isBodyContent && cursorNodeId !== cardNodeId
  if (isInsideCard) {
    if (dir === "down") {
      const next = getSibling(cursorNodeId, repo, 1, ignoredNodeIds)
      if (next) return next
      // Walk up ancestors to find one with a next sibling (DFS next)
      let walkId: string | null = cursorNode.parent_id
      while (walkId && walkId !== cardNodeId) {
        const parentNext = getSibling(walkId, repo, 1, ignoredNodeIds)
        if (parentNext) return parentNext
        const walkNode = repo.getNode(walkId)
        walkId = walkNode?.parent_id ?? null
      }
      // Reached card level: jump to next card
      return getSibling(cardNodeId, repo, 1, ignoredNodeIds)
    } else {
      const prev = getSibling(cursorNodeId, repo, -1, ignoredNodeIds)
      if (prev) return prev
      // At first sibling: go to parent
      return cursorNode.parent_id
    }
  }

  if (dir === "down") {
    if (isAtBoardLevel) {
      // Board → first meaningful body card or column header.
      // stickyX remembers which column was last visited.
      const stickyX = navigator.stickyX
      const allChildren = repo.getChildren(rootId)
      const { bodyNodes: rawBodyNodes, structuralCols: rawCols } = splitBodyAndColumns(allChildren)
      const bodyNodes = ignoredNodeIds ? rawBodyNodes.filter((n) => !ignoredNodeIds.has(n.id)) : rawBodyNodes
      const structuralCols = ignoredNodeIds ? rawCols.filter((n) => !ignoredNodeIds.has(n.id)) : rawCols

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
      const visibleChildren = ignoredNodeIds ? allChildren.filter((n) => !ignoredNodeIds.has(n.id)) : allChildren
      return structuralCols[0]?.id ?? visibleChildren[0]?.id ?? null
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
      // Column header → first navigable card in column (skip index files + ignored)
      const cards = getNavigableChildren(cursorNodeId, repo)
      const firstVisible = ignoredNodeIds ? cards.find((c) => !ignoredNodeIds.has(c.id)) : cards[0]
      return firstVisible?.id ?? null
    }

    if (isAtCardLevel) {
      // Card → next sibling (using card-level ancestor)
      return getSibling(cardNodeId, repo, 1, ignoredNodeIds)
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
      const prev = getSibling(cardNodeId, repo, -1, ignoredNodeIds)
      if (prev) return prev
      // At first card → parent (column header)
      const cardNode = repo.getNode(cardNodeId)
      return cardNode?.parent_id ?? cursorNode.parent_id
    }

    if (isAtColumnLevel) {
      // Column header → board (save structural column index for return via stickyX)
      // Filter ignored columns so stickyX indexes match the j-from-board path
      const allChildren = repo.getChildren(rootId)
      const { structuralCols: rawCols } = splitBodyAndColumns(allChildren)
      const visibleCols = ignoredNodeIds ? rawCols.filter((n) => !ignoredNodeIds.has(n.id)) : rawCols
      const colIdx = indexOfChild(visibleCols, cursorNodeId)
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
function splitBodyAndColumns(allChildren: { id: string; type: string; item?: boolean; content?: string }[]): {
  bodyNodes: { id: string; type: string; item?: boolean; content?: string }[]
  structuralCols: { id: string; type: string; item?: boolean; content?: string }[]
} {
  const firstStructuralIdx = allChildren.findIndex((c) => KNode.isOutline(c))
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
  const { cursorNodeId, rootId, ignoredNodeIds } = state

  // Virtual body column header (__body__<rootId>) — synthetic node not in repo.
  // Treat as body column header: l → first structural column header, h → boundary.
  if (cursorNodeId.startsWith("__body__")) {
    if (dir === "left") return null // Body column is leftmost
    const allChildren = repo.getChildren(rootId)
    const { structuralCols: rawCols } = splitBodyAndColumns(allChildren)
    const structuralCols = ignoredNodeIds ? rawCols.filter((n) => !ignoredNodeIds.has(n.id)) : rawCols
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
  const { bodyNodes: rawBodyNodes, structuralCols: rawCols } = splitBodyAndColumns(allChildren)
  const bodyNodes = ignoredNodeIds ? rawBodyNodes.filter((n) => !ignoredNodeIds.has(n.id)) : rawBodyNodes
  const structuralCols = ignoredNodeIds ? rawCols.filter((n) => !ignoredNodeIds.has(n.id)) : rawCols
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
    // Cursor is on an ignored/hidden column — redirect to nearest visible column
    if (structuralCols.length > 0) return structuralCols[0]!.id
    if (hasBody) return bodyNodes[0]?.id ?? null
    return null
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

  const targetCards = getNavigableChildren(targetCol.id, repo)

  if (targetCards.length === 0) {
    return targetCol.id
  }

  if (isAtColumnLevel) {
    // At column header: if current column has cards, stay at header level
    if (sourceColId) {
      const currentCards = getNavigableChildren(sourceColId, repo)
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
        if (parentId === rootId) return null
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
      return dir === "down" ? (allChildren[0]?.id ?? null) : rootId
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

/**
 * Flatten a doc tree into a navigable node ID list.
 * Matches what DocContent renders — items at each depth, up to maxDepth,
 * capped at maxPerLevel per sibling group. Leaf blocks (paragraphs) are skipped
 * since they aren't independently selectable.
 */
function flattenDocTree(
  nodes: { id: string; type: string; item?: boolean }[],
  repo: { getChildren(parentId: string): { id: string; type: string; item?: boolean }[] },
  depth: number,
  maxDepth: number,
  maxPerLevel: number,
): string[] {
  const result: string[] = []
  const visible = nodes.slice(0, maxPerLevel)
  for (const node of visible) {
    const isItem = node.item === true
    // Only items (headings, list items, tasks) are navigable
    if (isItem) {
      result.push(node.id)
      if (depth < maxDepth) {
        const children = repo.getChildren(node.id)
        // Headings don't indent (depth stays same), items indent
        const childDepth = node.type === "h" ? depth : depth + 1
        result.push(...flattenDocTree(children, repo, childDepth, maxDepth, maxPerLevel))
      }
    }
  }
  return result
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

function getSibling(nodeId: string, repo: Repo, delta: 1 | -1, ignoredNodeIds?: Set<string>): string | null {
  const node = repo.getNode(nodeId)
  if (!node) throw new Error(`[nav] node not in repo: ${nodeId}`)
  const siblings = getNavigableChildren(node.parent_id, repo)
  const idx = indexOfChild(siblings, nodeId)
  if (idx < 0) {
    throw new Error(`[nav] node ${nodeId} not found in parent's children`)
  }
  // Skip ignored nodes in the given direction
  let targetIdx = idx + delta
  while (targetIdx >= 0 && targetIdx < siblings.length && ignoredNodeIds?.has(siblings[targetIdx]!.id)) {
    targetIdx += delta
  }
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
