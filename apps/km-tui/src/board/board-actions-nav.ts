/**
 * Board Action Handlers - Navigation Operations
 *
 * Handles cursor movement, history navigation, and sibling board navigation.
 */

import type { ActionResult } from "@km/commands"
import { boundary, ok } from "@km/commands"
import { getCardMidY } from "../card-positions.ts"
import type { CardState } from "../types.ts"

import {
  clearSelection,
  pushNavHistoryEntry,
  updateSelectionRange,
} from "../keyboard/keyboard-helpers.ts"
import {
  handleTreeNavigation,
  type TreeDirection,
} from "../handlers/navigation-handlers.ts"
import type { ActionCtx } from "../tui-context.ts"
import type { NavState } from "../view-navigation.ts"

/**
 * Handle cursor movement in any direction.
 *
 * Dispatches to per-mode handlers: outline, selection, horizontal,
 * vertical (hierarchical), and tree-based navigation.
 */
export function handleCursorMove(ctx: ActionCtx, dir: string): ActionResult {
  const { layout, ui, layoutRegistry } = ctx
  const col = layout.columns[layout.colIndex]
  const card = col?.cards[layout.cardIndex]

  // Outline mode sub-item navigation
  if (ui.inOutlineMode && (dir === "prev" || dir === "next")) {
    return handleOutlineNav(ctx, dir, card)
  }

  // Vertical movement clears sticky Y
  if (dir === "prev" || dir === "next") layoutRegistry.clearStickyY()

  // Selection range extension
  if (ui.multiSelected.size > 0 && ui.selectionAnchor !== null) {
    const result = handleSelectionNav(ctx, dir)
    if (result) return result
  }

  // Horizontal (h/l)
  if (dir === "left" || dir === "right") return handleHorizontalNav(ctx, dir)

  // Hierarchical vertical (up/down)
  if (dir === "up" || dir === "down") return handleVerticalNav(ctx, dir)

  // Tree navigation (first, last, prev, next, in, out)
  return handleTreeNav(ctx, dir)
}

/** Outline mode prev/next sub-item navigation. */
function handleOutlineNav(
  ctx: ActionCtx,
  dir: "prev" | "next",
  card: CardState | undefined,
): ActionResult {
  const { ui } = ctx

  if (dir === "prev" && ui.subIndex > 0) {
    ctx.setUI({ subIndex: ui.subIndex - 1 })
    return ok()
  }
  if (dir === "next" && card) {
    const maxIdx = ctx.countVisibleDescendants(
      card.node,
      0,
      ui.maxOutlineDepth,
      ctx.foldedNodes,
    )
    if (ui.subIndex < maxIdx) {
      ctx.setUI({ subIndex: ui.subIndex + 1 })
      return ok()
    }
  }
  return boundary(dir)
}

/** Handle navigation while shift-selection is active. Returns null to fall through. */
function handleSelectionNav(ctx: ActionCtx, dir: string): ActionResult | null {
  const { layout, ui, dispatchBoard } = ctx
  const col = layout.columns[layout.colIndex]

  if (dir === "prev" || dir === "next") {
    // Vertical navigation with selection
    const targetIdx =
      dir === "prev"
        ? Math.max(0, layout.cardIndex - 1)
        : Math.min((col?.cards.length ?? 1) - 1, layout.cardIndex + 1)

    if (targetIdx !== layout.cardIndex) {
      const direction = dir === "prev" ? "prev" : "next"
      const targetId = handleTreeNavigation(
        direction as TreeDirection,
        ctx,
        ctx.repo,
      )
      if (targetId) {
        dispatchBoard({ type: "SELECT", nodeId: targetId })
        if (ui.selectionAnchor !== null) {
          updateSelectionRange(ctx, layout.colIndex, targetIdx, 0)
        }
        return ok()
      }
    }
    return boundary(dir)
  }

  if (dir === "left" || dir === "right") {
    // Horizontal: clear selection and fall through to horizontal handler
    clearSelection(ctx)
  }

  return null
}

/** Horizontal (h/l) cross-column navigation with stickyY. */
function handleHorizontalNav(
  ctx: ActionCtx,
  dir: "left" | "right",
): ActionResult {
  const { layout, ui, dispatchBoard, layoutRegistry, viewNavigation } = ctx

  // In non-list views, h closes the detail pane if it's open (before navigation).
  // In list view, showDetailPane defaults to true so h must always navigate.
  if (dir === "left" && ui.showDetailPane && ui.viewMode !== "list") {
    ctx.setUI({ showDetailPane: false })
    return ok()
  }

  // Capture stickyY before navigating (so it persists across empty columns).
  // Uses layout's measured card positions when available.
  if (layout.cardIndex >= 0 && layoutRegistry.getStickyY() === null) {
    if (layoutRegistry.hasCardsInColumn(layout.colIndex)) {
      const entry = layoutRegistry.getCardOptional(
        layout.colIndex,
        layout.cardIndex,
      )
      if (entry) {
        layoutRegistry.setStickyY(getCardMidY(entry.layout))
      }
    }
  }

  // Use ViewNavigation for the core navigation logic
  if (ctx.cursorNodeId) {
    const targetId = viewNavigation.navigate(
      dir,
      navStateFrom(ctx),
      ctx.repo,
      layoutRegistry,
    )
    if (targetId !== null) {
      dispatchBoard({ type: "SELECT", nodeId: targetId })
      return ok()
    }
  }

  return boundary(dir)
}

/** Hierarchical vertical navigation (j/k up/down). */
function handleVerticalNav(ctx: ActionCtx, dir: "up" | "down"): ActionResult {
  const { dispatchBoard, layoutRegistry, viewNavigation } = ctx

  layoutRegistry.clearStickyY()

  // Use ViewNavigation if cursor is set
  if (ctx.cursorNodeId) {
    const targetId = viewNavigation.navigate(
      dir,
      navStateFrom(ctx),
      ctx.repo,
      layoutRegistry,
    )
    if (targetId !== null) {
      dispatchBoard({ type: "SELECT", nodeId: targetId })
      return ok()
    }
    return boundary(dir)
  }

  // No cursor is a programming error — key handler shouldn't dispatch navigation without one
  throw new Error("[nav] handleVerticalNav called without cursorNodeId")
}

/** Default tree navigation (first, last, prev, next, in, out). */
function handleTreeNav(ctx: ActionCtx, dir: string): ActionResult {
  const { dispatchBoard } = ctx
  const treeDir = dir as TreeDirection
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
  const { ui, dispatchBoard } = ctx

  // Check if we can go back
  if (ui.navHistoryIndex <= 0) {
    return boundary("back", "no history")
  }

  // Calculate new index
  const newIndex = ui.navHistoryIndex - 1

  // Get the entry we're navigating to
  const entry = ui.navHistory[newIndex]
  if (!entry) return ok()

  // Move index back
  ctx.setUI({ navHistoryIndex: newIndex })

  // Navigate to the saved state
  dispatchBoard({
    type: "ZOOM_IN",
    nodeId: entry.rootId || null,
    cursorNodeId: entry.cursorNodeId || null,
  })

  // Restore selection state
  if (entry.multiSelected && entry.multiSelected.size > 0) {
    ctx.setUI({
      multiSelected: entry.multiSelected,
      ...(entry.inOutlineMode
        ? { inOutlineMode: true, subIndex: entry.subIndex }
        : {}),
    })
  } else {
    clearSelection(ctx)
    if (entry.inOutlineMode) {
      ctx.setUI({ inOutlineMode: true, subIndex: entry.subIndex })
    }
  }

  // Restore folded nodes state
  if (entry.foldedNodes) {
    ctx.setFoldedNodes(entry.foldedNodes)
  }

  return ok()
}

/**
 * Navigate forward in history.
 */
export function handleNavForward(ctx: ActionCtx): ActionResult {
  const { ui, dispatchBoard } = ctx

  // Check if we can go forward
  if (ui.navHistoryIndex >= ui.navHistory.length - 1) {
    return boundary("forward", "at end of history")
  }

  // Get the entry we're navigating to (before incrementing index)
  const newIndex = ui.navHistoryIndex + 1
  const entry = ui.navHistory[newIndex]
  if (!entry) return ok()

  // Move index forward
  ctx.setUI({ navHistoryIndex: newIndex })

  // Navigate to the saved state
  dispatchBoard({
    type: "ZOOM_IN",
    nodeId: entry.rootId || null,
    cursorNodeId: entry.cursorNodeId || null,
  })

  // Restore selection state
  if (entry.multiSelected && entry.multiSelected.size > 0) {
    ctx.setUI({
      multiSelected: entry.multiSelected,
      ...(entry.inOutlineMode
        ? { inOutlineMode: true, subIndex: entry.subIndex }
        : {}),
    })
  } else {
    clearSelection(ctx)
    if (entry.inOutlineMode) {
      ctx.setUI({ inOutlineMode: true, subIndex: entry.subIndex })
    }
  }

  // Restore folded nodes state
  if (entry.foldedNodes) {
    ctx.setFoldedNodes(entry.foldedNodes)
  }

  return ok()
}

/**
 * Navigate to sibling board.
 */
export function handleNavSiblingBoard(
  ctx: ActionCtx,
  direction: "next" | "prev",
): ActionResult {
  const { ui, dispatchBoard, layout } = ctx

  if (!ctx.rootId) {
    return boundary(direction, "no root")
  }

  const currentRoot = ctx.repo.getNode(ctx.rootId)
  if (!currentRoot?.parent_id) {
    return boundary(direction, "no parent")
  }

  const siblings = ctx.repo.getChildren(currentRoot.parent_id)
  const currentIdx = siblings.findIndex((n) => n.id === currentRoot.id)

  if (currentIdx < 0) return ok()

  const targetIdx =
    direction === "next"
      ? (currentIdx + 1) % siblings.length
      : (currentIdx - 1 + siblings.length) % siblings.length

  const targetSibling = siblings[targetIdx]
  if (!targetSibling || targetSibling.id === currentRoot.id) return ok()

  // Save current state
  pushNavHistoryEntry(
    ctx.setUI,
    ctx.rootId,
    layout.colIndex,
    layout.cardIndex,
    ui.subIndex,
    ui.multiSelected,
    ui.inOutlineMode,
    ctx.cursorNodeId,
    ctx.foldedNodes,
  )

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

  const targetIdx =
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

/** Build NavState from action context. */
function navStateFrom(ctx: ActionCtx): NavState {
  return {
    cursorNodeId: ctx.cursorNodeId!,
    rootId: ctx.rootId,
    foldedNodes: ctx.foldedNodes,
    collapsedNodes: ctx.collapsedNodes,
  }
}
