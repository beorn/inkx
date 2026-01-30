/**
 * Board Action Handlers - Navigation Operations
 *
 * Handles cursor movement, history navigation, and sibling board navigation.
 */

import type { ActionResult } from "@km/commands"
import { boundary, ok } from "@km/commands"
import createDebug from "debug"
import { getCardMidY } from "../card-positions.ts"

import {
  clearSelection,
  pushNavHistoryEntry,
  updateSelectionRange,
} from "../keyboard/keyboard-helpers.ts"
import {
  handleTreeNavigation,
  type TreeDirection,
} from "../handlers/navigation-handlers.ts"
import type { TUIContext } from "../tui-context.ts"
import { actions } from "../ui-reducer.ts"

const debug = createDebug("km:tui:nav")

/**
 * Handle hierarchical vertical navigation (j/k).
 * Navigates through the visual hierarchy: board → columns → cards
 */
function handleHierarchicalNavigation(
  ctx: TUIContext,
  dir: "up" | "down",
): string | null {
  const { state, layout, boardState, repo, positionRegistry } = ctx
  const { cursorNodeId, rootId } = boardState
  const col = state.columns[layout.colIndex]

  if (!cursorNodeId) {
    debug("h-nav: no cursor")
    return null
  }

  const cursorNode = repo.getNode(cursorNodeId)
  const isAtBoardLevel = cursorNodeId === rootId
  const isAtColumnLevel = cursorNode?.parent_id === rootId && !isAtBoardLevel
  const isAtCardLevel = !isAtBoardLevel && !isAtColumnLevel

  debug(
    "h-nav: dir=%s cursor=%s board=%s col=%s card=%s",
    dir,
    cursorNodeId.slice(-4),
    isAtBoardLevel,
    isAtColumnLevel,
    isAtCardLevel,
  )

  if (dir === "down") {
    return navigateDown(
      ctx,
      isAtBoardLevel,
      isAtColumnLevel,
      isAtCardLevel,
      col,
    )
  }
  return navigateUp(ctx, isAtBoardLevel, isAtColumnLevel, isAtCardLevel, col)
}

/**
 * Navigate down through hierarchy (j key)
 */
function navigateDown(
  ctx: TUIContext,
  isAtBoardLevel: boolean,
  isAtColumnLevel: boolean,
  isAtCardLevel: boolean,
  col: TUIContext["state"]["columns"][number] | undefined,
): string | null {
  const { state, boardState, repo, positionRegistry } = ctx

  if (isAtBoardLevel) {
    const stickyX = positionRegistry.getStickyX()
    const targetColIdx =
      stickyX !== null && stickyX < state.columns.length ? stickyX : 0
    const targetCol = state.columns[targetColIdx]
    return targetCol?.node.id ?? null
  }

  if (isAtColumnLevel) {
    if (col && col.cards.length > 0) {
      return col.cards[0]?.node.id ?? null
    }
    return null
  }

  if (isAtCardLevel) {
    return handleTreeNavigation("next", boardState, repo)
  }

  return null
}

/**
 * Navigate up through hierarchy (k key)
 */
function navigateUp(
  ctx: TUIContext,
  isAtBoardLevel: boolean,
  isAtColumnLevel: boolean,
  isAtCardLevel: boolean,
  col: TUIContext["state"]["columns"][number] | undefined,
): string | null {
  const { layout, boardState, repo, positionRegistry } = ctx
  const { rootId } = boardState

  if (isAtCardLevel) {
    const prevCard = handleTreeNavigation("prev", boardState, repo)
    if (prevCard) return prevCard
    return col?.node.id ?? null
  }

  if (isAtColumnLevel) {
    positionRegistry.setStickyX(layout.colIndex)
    return rootId
  }

  return null
}

/**
 * Handle outline mode sub-item navigation
 */
function handleOutlineNav(ctx: TUIContext, dir: string): ActionResult | null {
  const { ui, dispatch } = ctx
  const col = ctx.state.columns[ctx.layout.colIndex]
  const card = col?.cards[ctx.layout.cardIndex]

  if (!ui.inOutlineMode || (dir !== "prev" && dir !== "next")) {
    return null
  }

  if (dir === "prev" && ui.subIndex > 0) {
    dispatch(actions.setSubIndex(ui.subIndex - 1))
    return ok()
  }

  if (dir === "next" && card) {
    const maxIdx = ctx.countVisibleDescendants(
      card.node,
      0,
      ui.maxOutlineDepth,
      ui.foldedNodes,
    )
    if (ui.subIndex < maxIdx) {
      dispatch(actions.setSubIndex(ui.subIndex + 1))
      return ok()
    }
  }

  return boundary(dir)
}

/**
 * Handle selection range vertical navigation
 */
function handleSelectionVerticalNav(
  ctx: TUIContext,
  dir: string,
): ActionResult | null {
  const { ui, layout, dispatchBoard } = ctx
  const col = ctx.state.columns[layout.colIndex]

  const isShiftSelection =
    ui.multiSelected.size > 0 && ui.selectionAnchor !== null
  if (!isShiftSelection) return null

  const verticalDirs = ["prev", "next"]
  if (!verticalDirs.includes(dir)) return null

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

/**
 * Find target column index for horizontal navigation
 */
function findTargetColumn(
  ctx: TUIContext,
  dir: "left" | "right",
): number | null {
  const { state, layout } = ctx
  const step = dir === "left" ? -1 : 1
  let targetColIndex = layout.colIndex

  do {
    targetColIndex += step
  } while (
    targetColIndex >= 0 &&
    targetColIndex < state.columns.length &&
    state.columns[targetColIndex]?.isVirtual
  )

  targetColIndex = Math.max(
    0,
    Math.min(state.columns.length - 1, targetColIndex),
  )

  if (
    targetColIndex === layout.colIndex ||
    state.columns[targetColIndex]?.isVirtual
  ) {
    return null
  }

  return targetColIndex
}

/**
 * Get curswantY for horizontal navigation
 */
function getCurswantY(ctx: TUIContext): number {
  const { layout, positionRegistry } = ctx
  let curswantY = positionRegistry.getStickyY()

  if (curswantY === null) {
    const currentLayout = positionRegistry.getCard(
      layout.colIndex,
      layout.cardIndex,
    )
    debug(
      "h/l: getting curswantY from current card col=%d idx=%d layout=%O",
      layout.colIndex,
      layout.cardIndex,
      currentLayout.layout,
    )
    curswantY = getCardMidY(currentLayout.layout)
    debug("h/l: computed curswantY=%d", curswantY)
    positionRegistry.setStickyY(curswantY)
  } else {
    debug("h/l: using sticky curswantY=%d", curswantY)
  }

  return curswantY
}

/**
 * Navigate to first card in column (fallback when positions unavailable)
 */
function navigateToFirstCard(
  ctx: TUIContext,
  targetCol: TUIContext["state"]["columns"][number],
  dir: string,
): ActionResult {
  const firstCard = targetCol.cards[0]
  if (firstCard) {
    ctx.dispatchBoard({ type: "SELECT", nodeId: firstCard.node.id })
    return ok()
  }
  return boundary(dir)
}

/**
 * Handle horizontal navigation (h/l keys)
 */
function handleHorizontalNav(
  ctx: TUIContext,
  dir: "left" | "right",
): ActionResult {
  const { state, layout, boardState, dispatchBoard, positionRegistry } = ctx

  // At board level, h/l should not move
  if (boardState.cursorNodeId === boardState.rootId) {
    return boundary(dir)
  }

  const targetColIndex = findTargetColumn(ctx, dir)
  if (targetColIndex === null) {
    return boundary(dir)
  }

  const targetCol = state.columns[targetColIndex]
  if (!targetCol || targetCol.cards.length === 0) {
    dispatchBoard({ type: "SELECT", nodeId: targetCol?.node.id ?? null })
    return ok()
  }

  // At column level, move to target column's header
  if (layout.cardIndex < 0) {
    dispatchBoard({ type: "SELECT", nodeId: targetCol.node.id })
    return ok()
  }

  // Check position availability
  const hasCurrentPositions = positionRegistry.hasCardsInColumn(layout.colIndex)
  const hasTargetPositions = positionRegistry.hasCardsInColumn(targetColIndex)

  debug(
    "h/l nav: curCol=%d hasCur=%s, targetCol=%d hasTgt=%s",
    layout.colIndex,
    hasCurrentPositions,
    targetColIndex,
    hasTargetPositions,
  )

  // Fallback when positions unavailable
  if (!hasTargetPositions) {
    debug(
      "h/l nav: target column %d has no positions, falling back to first card. Registry:\n%s",
      targetColIndex,
      positionRegistry.dump(),
    )
    return navigateToFirstCard(ctx, targetCol, dir)
  }

  if (!hasCurrentPositions) {
    debug(
      "h/l nav: current column %d has no positions, can't get curswantY. Falling back to first card. Registry:\n%s",
      layout.colIndex,
      positionRegistry.dump(),
    )
    return navigateToFirstCard(ctx, targetCol, dir)
  }

  // Position-based navigation
  const curswantY = getCurswantY(ctx)
  const targetCardIndex = positionRegistry.findCardAtYVisual(
    targetColIndex,
    curswantY,
  )
  const finalCardIndex = Math.max(0, targetCardIndex)

  debug(
    "h/l visual: curswantY=%d, targetCol=%d, targetCard=%d",
    curswantY,
    targetColIndex,
    finalCardIndex,
  )

  const targetCard = targetCol.cards[finalCardIndex]
  if (targetCard) {
    dispatchBoard({ type: "SELECT", nodeId: targetCard.node.id })
    return ok()
  }
  return boundary(dir)
}

/**
 * Handle cursor movement in any direction.
 */
export function handleCursorMove(ctx: TUIContext, dir: string): ActionResult {
  const { ui, positionRegistry, dispatchBoard, boardState } = ctx

  // Check for outline mode first
  const outlineResult = handleOutlineNav(ctx, dir)
  if (outlineResult) return outlineResult

  // Vertical movement clears sticky Y
  if (dir === "prev" || dir === "next") {
    positionRegistry.clearStickyY()
  }

  // Selection range extension
  const isShiftSelection =
    ui.multiSelected.size > 0 && ui.selectionAnchor !== null
  if (isShiftSelection) {
    const verticalResult = handleSelectionVerticalNav(ctx, dir)
    if (verticalResult) return verticalResult

    // Horizontal clears selection
    if (dir === "left" || dir === "right") {
      clearSelection(ctx)
    }
  }

  // Horizontal movement (h/l)
  if (dir === "left" || dir === "right") {
    return handleHorizontalNav(ctx, dir)
  }

  // Hierarchical vertical navigation (j/k)
  if (dir === "up" || dir === "down") {
    positionRegistry.clearStickyY()
    const targetId = handleHierarchicalNavigation(ctx, dir)
    if (targetId !== null) {
      dispatchBoard({ type: "SELECT", nodeId: targetId })
      return ok()
    }
    return boundary(dir)
  }

  // Normal cursor movement (first, last, etc.)
  const treeDir = dir as TreeDirection
  const targetId = handleTreeNavigation(treeDir, boardState, ctx.repo)
  if (targetId && targetId !== boardState.cursorNodeId) {
    dispatchBoard({ type: "SELECT", nodeId: targetId })
    return ok()
  }
  return boundary(dir)
}

/**
 * Navigate back in history.
 */
export function handleNavBack(ctx: TUIContext): ActionResult {
  const { ui, dispatch, dispatchBoard } = ctx

  if (ui.navHistoryIndex <= 0) {
    return boundary("back", "no history")
  }

  const newIndex = ui.navHistoryIndex - 1
  const entry = ui.navHistory[newIndex]
  if (!entry) return ok()

  dispatch(actions.setNavHistoryIndex(newIndex))

  dispatchBoard({
    type: "ZOOM_IN",
    nodeId: entry.rootId || null,
    cursorNodeId: entry.cursorNodeId || null,
  })

  if (entry.multiSelected && entry.multiSelected.size > 0) {
    dispatch(actions.setMultiSelected(entry.multiSelected))
  } else {
    clearSelection(ctx)
  }

  if (entry.inOutlineMode) {
    dispatch(actions.enterOutlineMode())
    dispatch(actions.setSubIndex(entry.subIndex))
  }
  return ok()
}

/**
 * Navigate forward in history.
 */
export function handleNavForward(ctx: TUIContext): ActionResult {
  const { ui, dispatch, dispatchBoard } = ctx

  if (ui.navHistoryIndex >= ui.navHistory.length - 1) {
    return boundary("forward", "at end of history")
  }

  dispatch(actions.navForward())

  const entry = ui.navHistory[ui.navHistoryIndex + 1]
  if (!entry) return ok()

  dispatchBoard({
    type: "ZOOM_IN",
    nodeId: entry.rootId || null,
    cursorNodeId: entry.cursorNodeId || null,
  })

  if (entry.multiSelected && entry.multiSelected.size > 0) {
    dispatch(actions.setMultiSelected(entry.multiSelected))
  } else {
    clearSelection(ctx)
  }

  if (entry.inOutlineMode) {
    dispatch(actions.enterOutlineMode())
    dispatch(actions.setSubIndex(entry.subIndex))
  }
  return ok()
}

/**
 * Navigate to sibling board.
 */
export function handleNavSiblingBoard(
  ctx: TUIContext,
  direction: "next" | "prev",
): ActionResult {
  const { boardState, ui, dispatch, dispatchBoard, layout } = ctx

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

  pushNavHistoryEntry(
    dispatch,
    boardState.rootId,
    layout.colIndex,
    layout.cardIndex,
    ui.subIndex,
    ui.multiSelected,
    ui.inOutlineMode,
    boardState.cursorNodeId,
  )

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
export function handlePageJump(
  ctx: TUIContext,
  direction: "up" | "down",
): void {
  const { state, layout, ui, dispatchBoard } = ctx
  const col = state.columns[layout.colIndex]

  if (!col) return

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
