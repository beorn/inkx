/**
 * Board Action Handlers - Navigation Operations
 *
 * Handles cursor movement, history navigation, and sibling board navigation.
 */

import type { ActionResult } from "@km/commands"
import { boundary, ok } from "@km/commands"
import { isOutline } from "@km/core"
import { extractBody } from "@km/tree"
import { clearSelection, saveNavHistory } from "../keyboard/keyboard-helpers.ts"
import { handleTreeNavigation, isTreeDirection, type TreeDirection } from "../handlers/navigation-handlers.ts"
import { indexOfChild } from "../sibling-index.ts"
import type { ActionCtx } from "../tui-context.ts"
import type { CardState } from "../types.ts"
import type { NavState } from "../view-navigation.ts"

/**
 * Handle cursor movement in any direction.
 *
 * Dispatches to per-mode handlers: outline, selection, horizontal,
 * vertical (hierarchical), and tree-based navigation.
 */
export function handleCursorMove(ctx: ActionCtx, dir: string): ActionResult {
  const { layout, ui } = ctx
  const col = layout.columns[layout.colIndex]
  const card = col?.cards[layout.cardIndex]

  // Outline mode sub-item navigation
  if (ui.inOutlineMode && (dir === "prev" || dir === "next")) {
    return handleOutlineNav(ctx, dir, card)
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

  // Tree navigation (first, last, prev, next, in, out)
  const result = handleTreeNav(ctx, dir)
  ctx.navigator.clearStickyY()
  return result
}

/** Outline mode prev/next sub-item navigation. */
function handleOutlineNav(ctx: ActionCtx, dir: "prev" | "next", card: CardState | undefined): ActionResult {
  const { ui } = ctx

  if (dir === "prev" && ui.subIndex > 0) {
    ctx.setUI({ subIndex: ui.subIndex - 1 })
    return ok()
  }
  if (dir === "next" && card) {
    const maxIdx = ctx.countVisibleDescendants(card.node, 0, ui.maxOutlineDepth, ctx.foldedNodes)
    if (ui.subIndex < maxIdx) {
      ctx.setUI({ subIndex: ui.subIndex + 1 })
      return ok()
    }
  }
  return boundary(dir)
}

/** Horizontal (h/l) cross-column navigation with stickyY. */
function handleHorizontalNav(ctx: ActionCtx, dir: "left" | "right"): ActionResult {
  const { layout, ui, dispatchBoard, navigator, viewNavigation } = ctx

  // Lazy capture: if stickyY not yet set, capture from current card by nodeId.
  // At h/l time, the focused card is always rendered (no dispatch has happened yet).
  // j/k clears stickyY; subsequent h/l preserves it.
  if (navigator.stickyY === null && layout.isAtCardLevel) {
    const midY = navigator.getItemMidY(layout.colIndex, layout.cardIndex)
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
      dispatchBoard({ type: "SELECT", nodeId: targetId })
      // In cards view, attach deferred resolve for off-screen Y-correction.
      // register() will fire it during inkx's Phase 2.7.
      if (ui.viewMode === "cards") {
        // Find the column that contains targetId for deferred resolution.
        // Body cards need special handling: their parent_id is the root,
        // but repo.getChildren(root) includes both body nodes and structural
        // columns. We must filter to meaningful body nodes only so the
        // itemIndex from findItemAtY maps to the correct node.
        const targetNode = ctx.repo.getNode(targetId)
        const columnId = targetNode?.parent_id
        const isBodyCard = columnId === ctx.rootId && targetNode && !isOutline(targetNode.type)
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
      return ok()
    }
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
    throw new Error("[nav] handleVerticalNav called without cursorNodeId")
  }

  const targetId = viewNavigation.navigate(dir, navStateFrom(ctx), ctx.repo, navigator)
  if (targetId === null) return boundary(dir)

  dispatchBoard({ type: "SELECT", nodeId: targetId })
  return ok()
}

/** Default tree navigation (first, last, prev, next, in, out). */
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
    ctx.setUI({
      multiSelected: entry.multiSelected,
      ...(entry.inOutlineMode ? { inOutlineMode: true, subIndex: entry.subIndex } : {}),
    })
  } else {
    clearSelection(ctx)
    if (entry.inOutlineMode) {
      ctx.setUI({ inOutlineMode: true, subIndex: entry.subIndex })
    }
  }

  if (entry.foldedNodes) {
    ctx.setFoldedNodes(entry.foldedNodes)
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
  const { layout, ui, dispatchBoard } = ctx
  const col = layout.columns[layout.colIndex]

  if (!col) return

  // Page size is roughly half the visible cards
  const pageSize = Math.max(5, Math.floor((ui.dimensions.rows - 4) / 2))

  let targetIdx =
    direction === "up"
      ? Math.max(0, layout.cardIndex - pageSize)
      : Math.min(col.cards.length - 1, layout.cardIndex + pageSize)

  if (targetIdx !== layout.cardIndex) {
    const targetCard = col.cards[targetIdx]
    if (targetCard) {
      dispatchBoard({ type: "SELECT", nodeId: targetCard.node.id })
    }
  }
}

/** Build NavState from action context. Caller must guard that cursorNodeId is non-null. */
function navStateFrom(ctx: ActionCtx): NavState {
  if (!ctx.cursorNodeId) {
    throw new Error("[nav] navStateFrom: cursorNodeId is null")
  }
  return {
    cursorNodeId: ctx.cursorNodeId,
    rootId: ctx.rootId,
    foldedNodes: ctx.foldedNodes,
    collapsedNodes: ctx.collapsedNodes,
  }
}
