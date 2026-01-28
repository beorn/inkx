/**
 * Board Action Handlers - Navigation Operations
 *
 * Handles cursor movement, history navigation, and sibling board navigation.
 */

import type { ActionResult } from "@km/commands"
import { boundary, ok } from "@km/commands"
import createDebug from "debug"
import { getCardMidY } from "./card-positions.ts"
import {
  clearSelection,
  pushNavHistoryEntry,
  updateSelectionRange,
} from "./keyboard-helpers.ts"
import {
  handleTreeNavigation,
  type TreeDirection,
} from "./navigation-handlers.ts"
import type { TUIContext } from "./tui-context.ts"
import { actions } from "./ui-reducer.ts"

const debug = createDebug("km:tui:nav")

/**
 * Handle hierarchical vertical navigation (j/k).
 * Navigates through the visual hierarchy: board → columns → cards
 *
 * @param ctx - TUI context
 * @param dir - "up" (k) or "down" (j)
 * @returns nodeId to select, or null if can't move
 */
function handleHierarchicalNavigation(
  ctx: TUIContext,
  dir: "up" | "down",
): string | null {
  const { state, layout, boardState, repo, positionRegistry } = ctx
  const { cursorNodeId, rootId } = boardState
  const col = state.columns[layout.colIndex]

  if (!cursorNodeId) {
    // No cursor - can't navigate
    debug("h-nav: no cursor")
    return null
  }

  // Determine current level in hierarchy using repo (not layout state)
  // This is more reliable than checking state.columns which may be stale
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
    // j: move down through hierarchy
    if (isAtBoardLevel) {
      // Board → column header (use stickyX to remember which column)
      const stickyX = positionRegistry.getStickyX()
      const targetColIdx =
        stickyX !== null && stickyX < state.columns.length ? stickyX : 0
      const targetCol = state.columns[targetColIdx]
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
      positionRegistry.setStickyX(layout.colIndex)
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
 */
export function handleCursorMove(ctx: TUIContext, dir: string): ActionResult {
  const { state, layout, ui, dispatch, dispatchBoard, positionRegistry } = ctx
  const col = state.columns[layout.colIndex]
  const card = col?.cards[layout.cardIndex]

  // Check for special modes first
  if (ui.inOutlineMode && (dir === "prev" || dir === "next")) {
    // Outline mode sub-item navigation
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

  // Vertical movement (j/k) clears sticky Y
  if (dir === "prev" || dir === "next") {
    positionRegistry.clearStickyY()
  }

  // Selection range extension mode
  const isShiftSelection =
    ui.multiSelected.size > 0 && ui.selectionAnchor !== null
  if (isShiftSelection) {
    const verticalDirs = ["prev", "next"]
    const horizontalDirs = ["left", "right"]

    if (verticalDirs.includes(dir)) {
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

    if (horizontalDirs.includes(dir)) {
      // Horizontal: clear selection and move
      clearSelection(ctx)
    }
  }

  // Horizontal movement (h/l) uses visual Y coordinates for cross-column navigation
  // Per docs/06-ui.md: curswantY = head midpoint, find card whose box intersects
  if (dir === "left" || dir === "right") {
    // Find next non-virtual column, skipping body columns
    let targetColIndex = layout.colIndex
    const step = dir === "left" ? -1 : 1
    do {
      targetColIndex += step
    } while (
      targetColIndex >= 0 &&
      targetColIndex < state.columns.length &&
      state.columns[targetColIndex]?.isVirtual
    )

    // Clamp to valid range
    targetColIndex = Math.max(
      0,
      Math.min(state.columns.length - 1, targetColIndex),
    )

    // No movement possible (or landed on virtual column at boundary)
    if (
      targetColIndex === layout.colIndex ||
      state.columns[targetColIndex]?.isVirtual
    ) {
      return boundary(dir)
    }

    const targetCol = state.columns[targetColIndex]
    if (!targetCol || targetCol.cards.length === 0) {
      // Target column is empty - just move to column level
      dispatchBoard({ type: "SELECT", nodeId: targetCol?.node.id ?? null })
      return ok()
    }

    // If at column level (cardIndex < 0), move to target column's header (not a card)
    if (layout.cardIndex < 0) {
      dispatchBoard({ type: "SELECT", nodeId: targetCol.node.id })
      return ok()
    }

    // Position-based navigation: Check if we have registered positions
    // Positions may be missing during initialization, in test environments,
    // or if columns are off-screen (virtualized).
    // Fallback: navigate to first card in target column if positions unavailable.
    const hasCurrentPositions = positionRegistry.hasCardsInColumn(
      layout.colIndex,
    )
    const hasTargetPositions = positionRegistry.hasCardsInColumn(targetColIndex)

    debug(
      "h/l nav: curCol=%d hasCur=%s, targetCol=%d hasTgt=%s",
      layout.colIndex,
      hasCurrentPositions,
      targetColIndex,
      hasTargetPositions,
    )

    // Fallback when positions aren't available: go to first card in target column
    if (!hasTargetPositions) {
      debug(
        "h/l nav: target column %d has no positions, falling back to first card. Registry:\n%s",
        targetColIndex,
        positionRegistry.dump(),
      )
      const firstCard = targetCol.cards[0]
      if (firstCard) {
        dispatchBoard({ type: "SELECT", nodeId: firstCard.node.id })
        return ok()
      }
      return boundary(dir)
    }

    if (!hasCurrentPositions) {
      debug(
        "h/l nav: current column %d has no positions, can't get curswantY. Falling back to first card. Registry:\n%s",
        layout.colIndex,
        positionRegistry.dump(),
      )
      const firstCard = targetCol.cards[0]
      if (firstCard) {
        dispatchBoard({ type: "SELECT", nodeId: firstCard.node.id })
        return ok()
      }
      return boundary(dir)
    }

    // Get or calculate curswantY (head midpoint of current card)
    let curswantY = positionRegistry.getStickyY()
    if (curswantY === null) {
      // First h/l move - get head midpoint of current card from measured position
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

    // Find card in target column whose box intersects curswantY (or closest)
    const targetCardIndex = positionRegistry.findCardAtYVisual(
      targetColIndex,
      curswantY,
    )

    // targetCardIndex can be -1 if curswantY is above all cards (land on header)
    // For now, clamp to first card (column header navigation is separate)
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
export function handleNavBack(ctx: TUIContext): ActionResult {
  const { ui, dispatch, dispatchBoard } = ctx

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
  dispatch(actions.setNavHistoryIndex(newIndex))

  // Navigate to the saved state
  dispatchBoard({
    type: "ZOOM_IN",
    nodeId: entry.rootId || null,
    cursorNodeId: entry.cursorNodeId || null,
  })

  // Restore selection state
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

  // Check if we can go forward
  if (ui.navHistoryIndex >= ui.navHistory.length - 1) {
    return boundary("forward", "at end of history")
  }

  // Move index forward
  dispatch(actions.navForward())

  // Get the entry we're navigating to
  const entry = ui.navHistory[ui.navHistoryIndex + 1]
  if (!entry) return ok()

  // Navigate to the saved state
  dispatchBoard({
    type: "ZOOM_IN",
    nodeId: entry.rootId || null,
    cursorNodeId: entry.cursorNodeId || null,
  })

  // Restore selection state
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

  // Save current state
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
export function handlePageJump(
  ctx: TUIContext,
  direction: "up" | "down",
): void {
  const { state, layout, ui, dispatchBoard } = ctx
  const col = state.columns[layout.colIndex]

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
