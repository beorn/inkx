/**
 * Board Action Handlers - Navigation Operations
 *
 * Handles cursor movement, history navigation, and sibling board navigation.
 */

import type { ActionResult } from "@km/commands"
import { boundary, ok } from "@km/commands"
import { KNode } from "@km/core"
import { extractBody } from "@km/tree"
import { clearSelection, saveNavHistory } from "../keyboard/keyboard-helpers.ts"
import { handleTreeNavigation, isTreeDirection, type TreeDirection } from "../handlers/navigation-handlers.ts"
import { indexOfChild } from "../sibling-index.ts"
import { detailPaneIdFor } from "../board-types.ts"
import type { ActionCtx } from "../tui-context.ts"
import { type NavState } from "../view-navigation.ts"

/**
 * Handle cursor movement in any direction.
 *
 * Dispatches to per-mode handlers: outline, selection, horizontal,
 * vertical (hierarchical), and tree-based navigation.
 */
export function handleCursorMove(ctx: ActionCtx, dir: string): ActionResult {
  const { ui } = ctx

  // Outline mode sub-item navigation (when cursor is inside a card's descendants)
  const inOutlineMode = ctx.cursorNodeId !== null && ctx.card !== undefined && ctx.cursorNodeId !== ctx.card.id
  if (inOutlineMode && (dir === "prev" || dir === "next")) {
    return handleOutlineNav(ctx, dir, ctx.card)
  }

  // Reset scroll anchor so viewport snaps back to follow cursor
  if (ui.columnScrollAnchor !== null) {
    ctx.setUI({ columnScrollAnchor: null })
  }

  // Non-shift cursor moves clear multi-selection (Shift+movement extends it
  // via separate extend_select_* commands that don't go through handleCursorMove)
  if (ui.multiSelected.size > 0) {
    clearSelection(ctx)
  }

  // Horizontal (h/l) — preserves stickyY across columns, clears stickyX
  if (dir === "left" || dir === "right") {
    const result = handleHorizontalNav(ctx, dir)
    ctx.navigator.clearStickyX()
    return result
  }

  // Hierarchical vertical (up/down) — clears stickyY so h/l will lazy-capture
  if (dir === "up" || dir === "down") {
    const result = handleVerticalNav(ctx, dir)
    ctx.navigator.clearStickyY()
    return result
  }

  // Spatial block navigation (in/out) — J/K move to next/prev visible block in column
  if (dir === "in" || dir === "out") {
    const result = handleBlockNav(ctx, dir)
    ctx.navigator.clearStickyY()
    return result
  }

  // Tree navigation (first, last, prev, next)
  const result = handleTreeNav(ctx, dir)
  ctx.navigator.clearStickyY()
  return result
}

/** Outline mode prev/next sub-item navigation using node IDs. */
function handleOutlineNav(ctx: ActionCtx, dir: "prev" | "next", card: KNode | undefined): ActionResult {
  const { ui: _ui } = ctx
  if (!card || !ctx.cursorNodeId) return boundary(dir)

  const descendantIds = ctx.getVisibleDescendantIds(card, Infinity, ctx.foldDepths)
  const currentIdx = descendantIds.indexOf(ctx.cursorNodeId)
  if (currentIdx < 0) return boundary(dir)

  const targetIdx = dir === "prev" ? currentIdx - 1 : currentIdx + 1
  const targetId = descendantIds[targetIdx]
  if (!targetId) return boundary(dir)

  ctx.dispatchBoard({ type: "SELECT", nodeId: targetId })
  return ok()
}

/** Horizontal (h/l) cross-column navigation with stickyY. */
function handleHorizontalNav(ctx: ActionCtx, dir: "left" | "right"): ActionResult {
  const { ui, dispatchBoard, navigator, viewNavigation } = ctx
  const isDetailPane = ctx.focusedPaneViewType() === "detail"

  // Detail pane boundary: h always exits to parent board, l at right edge enters detail.
  // Must run before within-pane navigation — the detail pane is a single virtual column,
  // so within-pane h would just select the column header instead of exiting.
  if (dir === "left" && isDetailPane) {
    const parentPaneId = ctx.getParentPaneId?.()
    if (parentPaneId) {
      ctx.focusPaneById(parentPaneId)
      ctx.syncFocusScope()
      return ok()
    }
  }

  // When at leftmost card pressing h, position at column header instead of moving columns
  if (dir === "left" && ctx.colIndex === 0 && ctx.isAtCardLevel && ctx.column) {
    const columnNode = ctx.column.node
    dispatchBoard({ type: "SELECT", nodeId: columnNode.id })
    navigator.clearStickyY()
    return ok()
  }

  // Lazy capture: if stickyY not yet set, capture from current card by nodeId.
  // At h/l time, the focused card is always rendered (no dispatch has happened yet).
  // j/k clears stickyY; subsequent h/l preserves it.
  if (navigator.stickyY === null && ctx.isAtCardLevel) {
    const midY = navigator.getItemMidY(ctx.colIndex, ctx.cardIndex)
    if (midY > 0) {
      navigator.setStickyY(midY)
    }
    // If card not yet measured, stickyY stays null — navigateHorizontal
    // falls back to first card in target column.
  }

  // Use ViewNavigation for the core navigation logic
  if (ctx.cursorNodeId) {
    const targetId = viewNavigation.navigate(dir, navStateFrom(ctx), ctx.repo, navigator)

    if (targetId !== null) {
      // Pass cursorCardNodeId hint for embed-aware card classification.
      // When navigating within an embed's children, the data model parent
      // chain leads to the wrong card — the hint ensures the visual card is used.
      dispatchBoard({ type: "SELECT", nodeId: targetId })
      // In cards view, attach deferred resolve for off-screen Y-correction.
      // register() will fire it during silvery's Phase 2.7.
      if (ui.viewMode === "cards") {
        // Find the column that contains targetId for deferred resolution.
        // Body cards need special handling: their parent_id is the root,
        // but repo.getChildren(root) includes both body nodes and structural
        // columns. We must filter to meaningful body nodes only so the
        // itemIndex from findItemAtY maps to the correct node.
        const targetNode = ctx.repo.getNode(targetId)
        const columnId = targetNode?.parent_id
        const isBodyCard = columnId === ctx.rootId && targetNode && !KNode.isOutline(targetNode)
        navigator.setDeferredResolve((itemIndex) => {
          if (columnId) {
            let children: { id: string; type: string; content?: string }[]
            if (isBodyCard) {
              const allChildren = ctx.repo.getChildren(columnId)
              const { body } = extractBody(allChildren)
              children = body.filter((n) => n.content && n.content.replace(/<[^>]+>/g, "").trim().length > 0)
            } else {
              children = ctx.repo.getChildren(columnId)
            }
            const child = children[itemIndex]
            if (child) {
              dispatchBoard({ type: "SELECT", nodeId: child.id })
            }
          }
        })
      }
      // Prefetch adjacent column children for smooth navigation
      const prefetchRootId = ctx.rootId
      const prefetchColId = ctx.repo.getNode(targetId)?.parent_id
      if (prefetchRootId && prefetchColId) {
        setTimeout(() => {
          const cols = ctx.repo.getChildren(prefetchRootId)
          const targetColIdx = cols.findIndex((c) => c.id === prefetchColId)
          const prev = targetColIdx > 0 ? cols[targetColIdx - 1] : undefined
          const next = targetColIdx < cols.length - 1 ? cols[targetColIdx + 1] : undefined
          if (prev) ctx.repo.getChildren(prev.id)
          if (next) ctx.repo.getChildren(next.id)
        })
      }
      return ok()
    }
  }

  // At the right boundary, navigate into the detail pane if it exists as a workspace pane.
  if (dir === "right" && ctx.hasDetailPane && !isDetailPane) {
    const detailPane = detailPaneIdFor(ctx.focusedPaneId())
    ctx.focusPaneById(detailPane)
    ctx.syncFocusScope()
    return ok()
  }

  // Boundary: clear stickyY so it doesn't pollute the next h/l navigation.
  // Without this, lazy capture or a prior successful h/l leaves a stale stickyY
  // that would skip fresh capture on the next h/l press.
  navigator.clearStickyY()
  return boundary(dir)
}

/** Hierarchical vertical navigation (j/k up/down). */
function handleVerticalNav(ctx: ActionCtx, dir: "up" | "down"): ActionResult {
  const { dispatchBoard, navigator, viewNavigation } = ctx

  if (!ctx.cursorNodeId) {
    return boundary(dir, "no cursor")
  }

  const targetId = viewNavigation.navigate(dir, navStateFrom(ctx), ctx.repo, navigator)
  if (targetId === null) return boundary(dir)

  dispatchBoard({ type: "SELECT", nodeId: targetId })
  return ok()
}

/**
 * Spatial block navigation (J/K — next/previous visible block in column).
 *
 * Unlike j/k which navigate the tree hierarchy (siblings, parent, children),
 * J/K are purely spatial: they move to the next/previous visible block in
 * document order within the current column — like arrow keys in a text editor.
 *
 * The visible block list is: [column header, card1, card1-child1, card1-child2, ..., card2, ...]
 * J moves forward (+1), K moves backward (-1). Bell at boundaries.
 * Key invariant: J and K are strict inverses.
 */
function handleBlockNav(ctx: ActionCtx, dir: "in" | "out"): ActionResult {
  const { dispatchBoard } = ctx

  if (!ctx.cursorNodeId) {
    return boundary(dir, "no cursor")
  }

  // Build flat list of all visible blocks in the current column
  const blocks = getVisibleColumnBlocks(ctx)
  if (blocks.length === 0) return boundary(dir, "no visible blocks")

  const currentIdx = blocks.indexOf(ctx.cursorNodeId)
  if (currentIdx < 0) {
    // Cursor not found in column blocks — boundary
    return boundary(dir, "cursor not in column blocks")
  }

  const targetIdx = dir === "in" ? currentIdx + 1 : currentIdx - 1
  if (targetIdx < 0 || targetIdx >= blocks.length) {
    return boundary(dir)
  }

  const targetId = blocks[targetIdx]!
  dispatchBoard({ type: "SELECT", nodeId: targetId })
  return ok()
}

/**
 * Get flat list of all visible block IDs in the current column, in document order.
 *
 * Order: column header, then for each card: card title, then its visible descendants.
 * Respects fold depths and hidden nodes. This is the spatial order matching
 * what the user sees rendered on screen.
 */
function getVisibleColumnBlocks(ctx: ActionCtx): string[] {
  const col = ctx.column
  if (!col) return []

  const blocks: string[] = []

  // Column header
  blocks.push(col.node.id)

  // For each card in the column, add the card and its visible descendants
  for (const card of col.cardNodes) {
    if (ctx.hiddenNodeIds.has(card.id)) continue
    const descendants = ctx.getVisibleDescendantIds(card, Infinity, ctx.foldDepths)
    for (const id of descendants) {
      if (!ctx.hiddenNodeIds.has(id)) {
        blocks.push(id)
      }
    }
  }

  return blocks
}

/** Default tree navigation (first, last, prev, next). */
function handleTreeNav(ctx: ActionCtx, dir: string): ActionResult {
  const { dispatchBoard } = ctx
  const treeDir: TreeDirection = isTreeDirection(dir) ? dir : "next"
  const targetId = handleTreeNavigation(treeDir, ctx, ctx.repo)
  if (targetId && targetId !== ctx.cursorNodeId) {
    dispatchBoard({ type: "SELECT", nodeId: targetId })
    return ok()
  }
  return boundary(dir)
}

/**
 * Navigate back in history.
 */
export function handleNavBack(ctx: ActionCtx): ActionResult {
  return navigateHistory(ctx, -1)
}

/**
 * Navigate forward in history.
 */
export function handleNavForward(ctx: ActionCtx): ActionResult {
  return navigateHistory(ctx, 1)
}

function navigateHistory(ctx: ActionCtx, delta: -1 | 1): ActionResult {
  const { ui, dispatchBoard } = ctx
  const newIndex = ui.navHistoryIndex + delta

  if (newIndex < 0) return boundary("back", "no history")
  if (newIndex >= ui.navHistory.length) return boundary("forward", "at end of history")

  const entry = ui.navHistory[newIndex]
  if (!entry) return ok()

  ctx.setUI({ navHistoryIndex: newIndex })

  dispatchBoard({
    type: "ZOOM_IN",
    nodeId: entry.rootId || null,
    cursorNodeId: entry.cursorNodeId || null,
  })

  // Restore selection state
  if (entry.multiSelected && entry.multiSelected.size > 0) {
    ctx.setUI({ multiSelected: entry.multiSelected })
  } else {
    clearSelection(ctx)
  }

  if (entry.foldDepths) {
    ctx.setFoldDepths(entry.foldDepths)
  }

  return ok()
}

/**
 * Navigate to sibling board.
 */
export function handleNavSiblingBoard(ctx: ActionCtx, direction: "next" | "prev"): ActionResult {
  const { dispatchBoard } = ctx

  if (!ctx.rootId) {
    return boundary(direction, "no root")
  }

  const currentRoot = ctx.repo.getNode(ctx.rootId)
  if (!currentRoot?.parent_id) {
    return boundary(direction, "no parent")
  }

  const siblings = ctx.repo.getChildren(currentRoot.parent_id)
  const currentIdx = indexOfChild(siblings, currentRoot.id)

  if (currentIdx < 0) return ok()

  const targetIdx =
    direction === "next" ? (currentIdx + 1) % siblings.length : (currentIdx - 1 + siblings.length) % siblings.length

  const targetSibling = siblings[targetIdx]
  if (!targetSibling || targetSibling.id === currentRoot.id) return ok()

  saveNavHistory(ctx)

  // Navigate to sibling
  dispatchBoard({
    type: "ZOOM_IN",
    nodeId: targetSibling.id,
  })

  clearSelection(ctx)
  return ok()
}

/**
 * Page jump up or down.
 */
export function handlePageJump(ctx: ActionCtx, direction: "up" | "down"): void {
  const { ui, dispatchBoard } = ctx
  const col = ctx.column

  if (!col) return

  // Reset scroll anchor so viewport snaps back to follow cursor
  if (ui.columnScrollAnchor !== null) {
    ctx.setUI({ columnScrollAnchor: null })
  }

  // Page size is roughly half the visible cards
  const pageSize = Math.max(5, Math.floor((ui.dimensions.rows - 4) / 2))

  const currentIdx = ctx.cardIndex
  const targetIdx =
    direction === "up" ? Math.max(0, currentIdx - pageSize) : Math.min(col.cardNodes.length - 1, currentIdx + pageSize)

  if (targetIdx !== currentIdx) {
    const targetCard = col.cardNodes[targetIdx]
    if (targetCard) {
      dispatchBoard({ type: "SELECT", nodeId: targetCard.id })
    }
  }
}

/** Build NavState from action context. Caller must guard that cursorNodeId is non-null. */
export function navStateFrom(ctx: ActionCtx): NavState {
  if (!ctx.cursorNodeId) {
    throw new Error("[nav] navStateFrom: cursorNodeId is null")
  }
  return {
    cursorNodeId: ctx.cursorNodeId,
    rootId: ctx.rootId,
    foldDepths: ctx.foldDepths,
    collapsedNodes: ctx.collapsedNodes,
    cursorCardNodeId: ctx.cursorCardNodeId,
    hiddenNodeIds: ctx.hiddenNodeIds.size > 0 ? ctx.hiddenNodeIds : undefined,
  }
}
