/**
 * Board Action Handlers - Navigation Operations
 *
 * Handles cursor movement, history navigation, and sibling board navigation.
 */

import type { ActionResult } from "@km/commands"
import { boundary, ok } from "@km/commands"
import { getCardMidY } from "../card-positions.ts"
import { clearSelection, pushNavHistoryEntry } from "../keyboard/keyboard-helpers.ts"
import { handleTreeNavigation, type TreeDirection } from "../handlers/navigation-handlers.ts"
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

  // Horizontal (h/l) — preserves stickyY across columns
  if (dir === "left" || dir === "right") return handleHorizontalNav(ctx, dir)

  // Hierarchical vertical (up/down) — clears stickyY so h/l will lazy-capture
  if (dir === "up" || dir === "down") {
    const result = handleVerticalNav(ctx, dir)
    ctx.layoutRegistry.clearStickyY()
    return result
  }

  // Tree navigation (first, last, prev, next, in, out)
  const result = handleTreeNav(ctx, dir)
  ctx.layoutRegistry.clearStickyY()
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
  const { layout, ui, dispatchBoard, layoutRegistry, viewNavigation } = ctx

  // In non-list views, h closes the detail pane if it's open (before navigation).
  // In list view, showDetailPane defaults to true so h must always navigate.
  if (dir === "left" && ui.showDetailPane && ui.viewMode !== "list") {
    ctx.setUI({ showDetailPane: false })
    return ok()
  }

  // Lazy capture: if stickyY not yet set, capture from current card by nodeId.
  // At h/l time, the focused card is always rendered (no dispatch has happened yet).
  // j/k clears stickyY; subsequent h/l preserves it.
  if (layoutRegistry.getStickyY() === null && layout.isAtCardLevel && ctx.cursorNodeId) {
    const nodeLayout = layoutRegistry.getNodeOptional(ctx.cursorNodeId)
    if (nodeLayout?.headY !== undefined && nodeLayout.headHeight !== undefined) {
      layoutRegistry.setStickyY(getCardMidY(nodeLayout))
    }
    // If card not yet measured, stickyY stays null — navigateHorizontal
    // falls back to first card in target column.
  }

  // Use ViewNavigation for the core navigation logic
  if (ctx.cursorNodeId) {
    let targetId = viewNavigation.navigate(dir, navStateFrom(ctx), ctx.repo, layoutRegistry)

    // Skip virtual cards (body content without borders/selection).
    // Navigate vertically (down, then up) within the target column to find
    // a non-virtual card. The previous approach navigated in the same horizontal
    // direction, which fails at column boundaries (e.g., rightmost column).
    if (targetId && isVirtualCard(ctx, targetId)) {
      const MAX_SKIP = 10
      // Try navigating down first
      let found = false
      let tempId = targetId
      for (let i = 0; i < MAX_SKIP && tempId && isVirtualCard(ctx, tempId); i++) {
        const next = viewNavigation.navigate(
          "down",
          { ...navStateFrom(ctx), cursorNodeId: tempId },
          ctx.repo,
          layoutRegistry,
        )
        if (next === null) break
        tempId = next
      }
      if (tempId && !isVirtualCard(ctx, tempId)) {
        targetId = tempId
        found = true
      }
      // If down didn't work, try up
      if (!found) {
        tempId = targetId
        for (let i = 0; i < MAX_SKIP && tempId && isVirtualCard(ctx, tempId); i++) {
          const next = viewNavigation.navigate(
            "up",
            { ...navStateFrom(ctx), cursorNodeId: tempId },
            ctx.repo,
            layoutRegistry,
          )
          if (next === null) break
          tempId = next
        }
        if (tempId && !isVirtualCard(ctx, tempId)) {
          targetId = tempId
        }
      }
    }

    if (targetId !== null) {
      dispatchBoard({ type: "SELECT", nodeId: targetId })
      // In cards view, attach deferred resolve for off-screen Y-correction.
      // registerCard will fire it during inkx's Phase 2.7.
      if (ui.viewMode === "cards") {
        layoutRegistry.setDeferredResolve((nodeId) => {
          dispatchBoard({ type: "SELECT", nodeId })
        })
      }
      return ok()
    }
  }

  return boundary(dir)
}

/** Hierarchical vertical navigation (j/k up/down). */
function handleVerticalNav(ctx: ActionCtx, dir: "up" | "down"): ActionResult {
  const { dispatchBoard, layoutRegistry, viewNavigation } = ctx

  if (!ctx.cursorNodeId) {
    throw new Error("[nav] handleVerticalNav called without cursorNodeId")
  }

  // Navigate, skipping virtual cards (body content rendered without borders/selection)
  let targetId = viewNavigation.navigate(dir, navStateFrom(ctx), ctx.repo, layoutRegistry)
  if (targetId === null) return boundary(dir)

  const MAX_SKIP = 10
  for (let i = 0; i < MAX_SKIP && targetId && isVirtualCard(ctx, targetId); i++) {
    const next = viewNavigation.navigate(
      dir,
      { ...navStateFrom(ctx), cursorNodeId: targetId },
      ctx.repo,
      layoutRegistry,
    )
    if (next === null) break
    targetId = next
  }

  // If we still landed on a virtual card (all remaining cards are virtual), stay put
  if (isVirtualCard(ctx, targetId)) return boundary(dir)

  dispatchBoard({ type: "SELECT", nodeId: targetId })
  return ok()
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
  const { ui, dispatchBoard, layout } = ctx

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

  let targetIdx =
    direction === "up"
      ? Math.max(0, layout.cardIndex - pageSize)
      : Math.min(col.cards.length - 1, layout.cardIndex + pageSize)

  // Skip virtual cards at target position
  const step = direction === "up" ? -1 : 1
  while (targetIdx >= 0 && targetIdx < col.cards.length && col.cards[targetIdx]?.isVirtual) {
    targetIdx += step
  }
  targetIdx = Math.max(0, Math.min(col.cards.length - 1, targetIdx))

  if (targetIdx !== layout.cardIndex && !col.cards[targetIdx]?.isVirtual) {
    const targetCard = col.cards[targetIdx]
    if (targetCard) {
      dispatchBoard({ type: "SELECT", nodeId: targetCard.node.id })
    }
  }
}

/** Check if a node ID corresponds to a virtual card in the current layout. */
function isVirtualCard(ctx: ActionCtx, nodeId: string): boolean {
  for (const col of ctx.layout.columns) {
    if (col.isVirtual && col.node.id === nodeId) return true
    for (const card of col.cards) {
      if (card.node.id === nodeId && card.isVirtual) return true
    }
  }
  return false
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
