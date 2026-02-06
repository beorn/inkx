/**
 * Board Action Handlers - Navigation Operations
 *
 * Handles cursor movement, history navigation, and sibling board navigation.
 */

import type { ActionResult } from "@km/commands"
import { boundary, ok } from "@km/commands"
import { createLogger } from "@beorn/logger"
import { getCardMidY } from "../card-positions.ts"
import { type CardState, isAtColumnHeader } from "../types.ts"

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

const log = createLogger("km:tui:nav")

/**
 * Handle hierarchical vertical navigation (j/k).
 * Navigates through the visual hierarchy: board → columns → cards
 *
 * @param ctx - TUI context
 * @param dir - "up" (k) or "down" (j)
 * @returns nodeId to select, or null if can't move
 */
// oxlint-disable-next-line complexity/max-cognitive -- Navigation with fallback chains
function handleHierarchicalNavigation(
  ctx: ActionCtx,
  dir: "up" | "down",
): string | null {
  const { layout, boardState, repo, layoutRegistry } = ctx
  const { cursorNodeId, rootId } = boardState
  const col = layout.columns[layout.colIndex]

  if (!cursorNodeId) {
    // No cursor - can't navigate
    log.debug?.("h-nav: no cursor")
    return null
  }

  // Determine current level in hierarchy using repo (not layout state)
  // This is more reliable than checking layout.columns which may be stale
  const cursorNode = repo.getNode(cursorNodeId)
  const isAtBoardLevel = cursorNodeId === rootId
  const isAtColumnLevel = cursorNode?.parent_id === rootId && !isAtBoardLevel
  const isAtCardLevel = !isAtBoardLevel && !isAtColumnLevel

  log.debug?.(
    `h-nav: dir=${dir} cursor=${cursorNodeId.slice(-4)} board=${isAtBoardLevel} col=${isAtColumnLevel} card=${isAtCardLevel}`,
  )

  if (dir === "down") {
    // j: move down through hierarchy
    if (isAtBoardLevel) {
      // Board → column header (use stickyX to remember which column)
      const stickyX = layoutRegistry.getStickyX()
      const targetColIdx =
        stickyX !== null && stickyX < layout.columns.length ? stickyX : 0
      const targetCol = layout.columns[targetColIdx]
      return targetCol?.node.id ?? null
    }

    if (isAtColumnLevel) {
      // Column header → first card in column
      if (col && col.cards.length > 0) {
        return col.cards[0]?.node.id ?? null
      }
      // Empty column - stay at header
      return null
    }

    if (isAtCardLevel) {
      // Card → next card (sibling navigation)
      return handleTreeNavigation("next", boardState, repo)
    }
  } else {
    // k: move up through hierarchy
    if (isAtCardLevel) {
      // Try to move to previous card first
      const prevCard = handleTreeNavigation("prev", boardState, repo)
      if (prevCard) {
        return prevCard
      }
      // At first card → column header
      return col?.node.id ?? null
    }

    if (isAtColumnLevel) {
      // Column header → board title (save column index for return)
      layoutRegistry.setStickyX(layout.colIndex)
      return rootId
    }

    if (isAtBoardLevel) {
      // Already at board - can't go higher
      return null
    }
  }

  return null
}

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
      ctx.boardState.foldedNodes,
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
        ctx.boardState,
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
// oxlint-disable-next-line complexity/max-cognitive -- Extracted from handleCursorMove — residual complexity from navigation logic
function handleHorizontalNav(
  ctx: ActionCtx,
  dir: "left" | "right",
): ActionResult {
  const { layout, ui, dispatchBoard, layoutRegistry } = ctx

  // In non-list views, h closes the detail pane if it's open (before navigation).
  // In list view, showDetailPane defaults to true so h must always navigate.
  if (dir === "left" && ui.showDetailPane && ui.viewMode !== "list") {
    ctx.setUI({ showDetailPane: false })
    return ok()
  }

  // At board level, h/l should not move - board title spans full width
  const { cursorNodeId, rootId } = ctx.boardState
  if (cursorNodeId === rootId) {
    return boundary(dir)
  }

  // Find next non-virtual column, skipping body columns
  let targetColIndex = layout.colIndex
  const step = dir === "left" ? -1 : 1
  do {
    targetColIndex += step
  } while (
    targetColIndex >= 0 &&
    targetColIndex < layout.columns.length &&
    layout.columns[targetColIndex]?.isVirtual
  )

  // Clamp to valid range
  targetColIndex = Math.max(
    0,
    Math.min(layout.columns.length - 1, targetColIndex),
  )

  // No movement possible (or landed on virtual column at boundary)
  if (
    targetColIndex === layout.colIndex ||
    layout.columns[targetColIndex]?.isVirtual
  ) {
    return boundary(dir)
  }

  const targetCol = layout.columns[targetColIndex]

  // Capture stickyY BEFORE checking empty columns, so it persists across empty columns
  // This is the key fix: we need to remember Y position even when passing through empty columns
  if (layout.cardIndex >= 0 && layoutRegistry.getStickyY() === null) {
    const hasCurrentPositions = layoutRegistry.hasCardsInColumn(layout.colIndex)
    if (hasCurrentPositions) {
      const currentLayoutOpt = layoutRegistry.getCardOptional(
        layout.colIndex,
        layout.cardIndex,
      )
      if (currentLayoutOpt) {
        const curswantY = getCardMidY(currentLayoutOpt.layout)
        log.debug?.(`h/l: capturing stickyY=${curswantY} before leaving card`)
        layoutRegistry.setStickyY(curswantY)
      }
    }
  }

  if (!targetCol || targetCol.cards.length === 0) {
    // Target column is empty - move to column level but KEEP stickyY
    log.debug?.(
      `h/l: target column ${targetColIndex} empty, moving to header but keeping stickyY=${layoutRegistry.getStickyY()}`,
    )
    dispatchBoard({ type: "SELECT", nodeId: targetCol?.node.id ?? null })
    return ok()
  }

  // If at column level (header selected), use stickyY to find card if available
  if (isAtColumnHeader(layout.cardIndex)) {
    const stickyY = layoutRegistry.getStickyY()
    if (stickyY !== null && layoutRegistry.hasCardsInColumn(targetColIndex)) {
      // We have a sticky Y from before - use it to find the right card
      const targetCardIndex = layoutRegistry.findCardAtYVisual(
        targetColIndex,
        stickyY,
      )
      const finalCardIndex = Math.max(0, targetCardIndex)
      log.debug?.(
        `h/l from column: using stickyY=${stickyY} -> card ${finalCardIndex}`,
      )
      const targetCard = targetCol.cards[finalCardIndex]
      if (targetCard) {
        dispatchBoard({ type: "SELECT", nodeId: targetCard.node.id })
        return ok()
      }
    }
    // No stickyY or can't find card - move to column header
    dispatchBoard({ type: "SELECT", nodeId: targetCol.node.id })
    return ok()
  }

  // Position-based navigation: Check if we have registered positions
  // Positions may be missing during initialization, in test environments,
  // or if columns are off-screen (virtualized).
  // Fallback: navigate to first card in target column if positions unavailable.
  const hasCurrentPositions = layoutRegistry.hasCardsInColumn(layout.colIndex)
  const hasTargetPositions = layoutRegistry.hasCardsInColumn(targetColIndex)

  log.debug?.(
    `h/l nav: curCol=${layout.colIndex} hasCur=${hasCurrentPositions}, targetCol=${targetColIndex} hasTgt=${hasTargetPositions}`,
  )

  // Fallback when positions aren't available: go to first card in target column
  if (!hasTargetPositions) {
    log.debug?.(
      `h/l nav: target column ${targetColIndex} has no positions, falling back to first card. Registry:\n${layoutRegistry.dump()}`,
    )
    const firstCard = targetCol.cards[0]
    if (firstCard) {
      dispatchBoard({ type: "SELECT", nodeId: firstCard.node.id })
      return ok()
    }
    return boundary(dir)
  }

  if (!hasCurrentPositions) {
    log.debug?.(
      `h/l nav: current column ${layout.colIndex} has no positions, can't get curswantY. Falling back to first card. Registry:\n${layoutRegistry.dump()}`,
    )
    const firstCard = targetCol.cards[0]
    if (firstCard) {
      dispatchBoard({ type: "SELECT", nodeId: firstCard.node.id })
      return ok()
    }
    return boundary(dir)
  }

  // Get or calculate curswantY (head midpoint of current card)
  let curswantY = layoutRegistry.getStickyY()
  if (curswantY === null) {
    // First h/l move - get head midpoint of current card from measured position
    const currentLayoutOpt = layoutRegistry.getCardOptional(
      layout.colIndex,
      layout.cardIndex,
    )
    if (!currentLayoutOpt) {
      log.debug?.(
        `h/l: current card col=${layout.colIndex} idx=${layout.cardIndex} NOT in registry. Registry state:\n${layoutRegistry.dump()}`,
      )
      // Fallback: go to first card
      const firstCard = targetCol.cards[0]
      if (firstCard) {
        dispatchBoard({ type: "SELECT", nodeId: firstCard.node.id })
        return ok()
      }
      return boundary(dir)
    }
    log.debug?.(
      `h/l: getting curswantY from current card col=${layout.colIndex} idx=${layout.cardIndex} layout=${JSON.stringify(currentLayoutOpt.layout)}`,
    )
    curswantY = getCardMidY(currentLayoutOpt.layout)
    log.debug?.(`h/l: computed curswantY=${curswantY}`)
    layoutRegistry.setStickyY(curswantY)
  } else {
    log.debug?.(`h/l: using sticky curswantY=${curswantY}`)
  }

  // Find card in target column whose box intersects curswantY (or closest)
  const targetCardIndex = layoutRegistry.findCardAtYVisual(
    targetColIndex,
    curswantY,
  )

  log.debug?.(
    `h/l findCardAtYVisual: targetColIndex=${targetColIndex} curswantY=${curswantY} -> targetCardIndex=${targetCardIndex}`,
  )

  // targetCardIndex can be -1 if curswantY is above all cards (land on header)
  // For now, clamp to first card (column header navigation is separate)
  const finalCardIndex = Math.max(0, targetCardIndex)

  log.debug?.(
    `h/l visual: curswantY=${curswantY}, targetCol=${targetColIndex}, targetCard=${finalCardIndex}`,
  )

  const targetCard = targetCol.cards[finalCardIndex]
  if (targetCard) {
    dispatchBoard({ type: "SELECT", nodeId: targetCard.node.id })
    return ok()
  }
  return boundary(dir)
}

/** Hierarchical vertical navigation (j/k up/down). */
function handleVerticalNav(ctx: ActionCtx, dir: "up" | "down"): ActionResult {
  const { dispatchBoard, layoutRegistry } = ctx

  layoutRegistry.clearStickyY()
  const targetId = handleHierarchicalNavigation(ctx, dir)
  if (targetId !== null) {
    dispatchBoard({ type: "SELECT", nodeId: targetId })
    return ok()
  }
  return boundary(dir)
}

/** Default tree navigation (first, last, prev, next, in, out). */
function handleTreeNav(ctx: ActionCtx, dir: string): ActionResult {
  const { dispatchBoard } = ctx
  const treeDir = dir as TreeDirection
  const targetId = handleTreeNavigation(treeDir, ctx.boardState, ctx.repo)
  if (targetId && targetId !== ctx.boardState.cursorNodeId) {
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
  const { boardState, ui, dispatchBoard, layout } = ctx

  if (!boardState.rootId) {
    return boundary(direction, "no root")
  }

  const currentRoot = ctx.repo.getNode(boardState.rootId)
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
    boardState.rootId,
    layout.colIndex,
    layout.cardIndex,
    ui.subIndex,
    ui.multiSelected,
    ui.inOutlineMode,
    boardState.cursorNodeId,
    boardState.foldedNodes,
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
