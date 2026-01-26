/**
 * Board Action Handlers
 *
 * Extracted from Board.tsx to reduce file size and improve testability.
 * Each handler receives TUIContext and performs the action.
 *
 * These handlers bridge CommandAction from @km/commands to actual state changes.
 * Eventually, commands will be directly executable (per km-mz2g design),
 * but this extraction is a first step to make Board.tsx manageable.
 */

import type { TaskStatus, TaskMark, KNode } from "@km/core"
import { initBoardState } from "./state.ts"
import { actions } from "./ui-reducer.ts"
import type { TUIContext } from "./tui-context.ts"
import { makeSelectionKey } from "./types.ts"
import {
  clearSelection,
  pushNavHistoryEntry,
  refreshBoardState,
  progressiveSelectAll,
  updateSelectionRange,
} from "./keyboard-helpers.ts"
import {
  outdentNode,
  moveCardInColumn,
  moveCardToColumn,
} from "./keyboard-card-ops.ts"
import { DEFAULT_FAVORITES } from "./keyboard-types.ts"
import { assertNever } from "./action-handlers.ts"
import type { CommandAction } from "@km/commands"
import {
  type ActionResult,
  boundary,
  precondition,
  unimplemented,
  ok,
} from "@km/commands"
import { getCardMidY } from "./card-positions.ts"
import createDebug from "debug"
import {
  handleTreeNavigation,
  type TreeDirection,
} from "./navigation-handlers.ts"

const debug = createDebug("km:tui:nav")

// =============================================================================
// Action Handler Type
// =============================================================================

export type ActionHandler = (
  ctx: TUIContext,
  action: CommandAction,
) => ActionResult

// =============================================================================
// Main Action Dispatcher
// =============================================================================

/**
 * Handle a command action from the command system.
 *
 * Uses exhaustive switch - TypeScript errors if any action type is missing.
 * See km-y00m for why this pattern replaced the layered type guard approach.
 *
 * Returns ActionResult: ok() on success, boundary/precondition/unimplemented on expected failure.
 * Callers should check result and provide feedback (e.g., ring bell for boundary).
 */
export function handleCommandAction(
  ctx: TUIContext,
  action: CommandAction,
): ActionResult {
  const { state, dispatch, exit } = ctx
  const col = state.columns[state.colIndex]
  const card = col?.cards[state.cardIndex]

  switch (action.type) {
    // === TUI-specific actions ===
    case "QUIT":
      exit()
      return ok()
    case "SHOW_NEW_ITEM_DIALOG":
      dispatch(actions.showNewItemDialog())
      dispatch(actions.exitOutlineMode())
      dispatch(actions.setSubIndex(0))
      clearSelection(ctx)
      dispatch(actions.setDetailPane(false))
      return ok()
    case "SHOW_PROJECT_PICKER":
      if (card) {
        dispatch(actions.showProjectPicker())
        dispatch(actions.exitOutlineMode())
        dispatch(actions.setSubIndex(0))
        clearSelection(ctx)
        dispatch(actions.setDetailPane(false))
      }
      return ok()
    case "JUMP_TO_FAVORITE":
      handleJumpToFavorite(ctx, action.favoriteNumber)
      return ok()
    case "JUMP_TO_COLUMN":
      return handleJumpToColumn(ctx, action.columnNumber)
    case "CLOSE_OR_QUIT":
      return handleCloseOrQuit(ctx)
    case "OUTDENT_NODE":
      if (card) outdentNode(ctx, card)
      return ok()
    case "NAV_SIBLING_BOARD":
      return handleNavSiblingBoard(ctx, action.direction)
    case "ZOOM_INWARDS":
      return handleZoomInwards(ctx)
    case "PAGE_JUMP":
      handlePageJump(ctx, action.direction)
      return ok()

    // === UI actions ===
    case "CYCLE_VIEW_MODE":
      dispatch(actions.cycleViewMode())
      return ok()
    case "SHOW_HELP":
      dispatch(actions.showHelp())
      return ok()
    case "HIDE_HELP":
      dispatch(actions.hideHelp())
      return ok()
    case "OPEN_DETAIL_PANE": {
      // If current node has children, zoom into it instead of opening detail pane
      const curCol = state.columns[state.colIndex]
      const curCard = curCol?.cards[state.cardIndex]
      const curNodeId = curCard?.node.id ?? curCol?.node.id
      debug(
        "OPEN_DETAIL_PANE: colIndex=%d cardIndex=%d curNodeId=%s",
        state.colIndex,
        state.cardIndex,
        curNodeId,
      )
      if (curNodeId) {
        const children = ctx.repo.getChildren(curNodeId)
        debug("OPEN_DETAIL_PANE: children=%d", children.length)
        if (children.length > 0) {
          // Use handleZoomInNode to support both card and column level zoom
          return handleZoomInNode(ctx, curNodeId)
        }
      }
      // No children - open detail pane for leaf nodes
      dispatch(actions.setDetailPane(true))
      return ok()
    }
    case "CLOSE_DETAIL_PANE":
      dispatch(actions.setDetailPane(false))
      return ok()
    case "ZOOM_OUTWARDS":
      return handleZoomOutwards(ctx)
    case "DELETE_NODE":
      handleDeleteNode(ctx)
      return ok()
    case "SELECT_ALL_PROGRESSIVE":
      progressiveSelectAll(ctx)
      return ok()

    // === Task actions ===
    case "TASK_SET_STATUS":
      handleTaskStatusCycle(ctx)
      return ok()

    // === History actions (not yet implemented) ===
    case "HISTORY_UNDO":
    case "HISTORY_REDO":
      return unimplemented("history")

    // === Board/navigation actions ===
    case "CURSOR_MOVE":
      return handleCursorMove(ctx, action.dir)
    case "TOGGLE_FOLD":
      return handleToggleFold(ctx)
    case "FOLD_LEVEL":
      if (col) dispatch(actions.foldAll(col.cards.map((c) => c.node.id)))
      return ok()
    case "UNFOLD_LEVEL":
      if (col) dispatch(actions.unfoldAll(col.cards.map((c) => c.node.id)))
      return ok()
    case "TOGGLE_COLLAPSE":
      dispatch(actions.toggleColumnCollapse(state.colIndex))
      return ok()
    case "NAV_BACK":
      return handleNavBack(ctx)
    case "NAV_FORWARD":
      return handleNavForward(ctx)
    case "ZOOM_IN":
      return handleZoomIn(ctx)
    case "CLEAR_SELECTION":
      clearSelection(ctx)
      return ok()

    // === BoardAction passthrough (forward to board reducer) ===
    case "SELECT":
    case "SET_ROOT":
    case "SET_CURSWANT":
      ctx.dispatchBoard(action)
      return ok()

    case "EXTEND_SELECT_UP":
      handleExtendSelectVertical(ctx, "up")
      return ok()
    case "EXTEND_SELECT_DOWN":
      handleExtendSelectVertical(ctx, "down")
      return ok()
    case "EXTEND_SELECT_LEFT":
      handleExtendSelectHorizontal(ctx, "left")
      return ok()
    case "EXTEND_SELECT_RIGHT":
      handleExtendSelectHorizontal(ctx, "right")
      return ok()
    case "INCREASE_OUTLINE_DEPTH":
      dispatch(actions.increaseOutlineDepth())
      return ok()
    case "DECREASE_OUTLINE_DEPTH":
      dispatch(actions.decreaseOutlineDepth())
      return ok()
    case "INCREASE_CONTENT_LINES":
      dispatch(actions.increaseContentLines())
      return ok()
    case "DECREASE_CONTENT_LINES":
      dispatch(actions.decreaseContentLines())
      return ok()
    case "SHIFT_UP":
      handleShiftCard(ctx, "up")
      return ok()
    case "SHIFT_DOWN":
      handleShiftCard(ctx, "down")
      return ok()
    case "SHIFT_LEFT":
      handleShiftCard(ctx, "left")
      return ok()
    case "SHIFT_RIGHT":
      handleShiftCard(ctx, "right")
      return ok()

    // === Selection actions ===
    case "SELECT_NODE_ADD":
    case "SELECT_NODE_REMOVE":
    case "SELECT_NODE_TOGGLE":
    case "SELECT_ALL_SIBLINGS":
    case "SELECT_ALL":
      return unimplemented("selection")

    // Legacy navigation actions removed (were in BoardAction, not in CommandAction)

    // === Move mode actions ===
    // Commands return minimal actions; TUI augments with context before dispatching
    case "ENTER_MOVE_MODE": {
      const nodeIds = Array.from(ctx.boardState.selectedNodes)
      const cursorNodeId = ctx.boardState.cursorNodeId
      ctx.dispatchBoard({ type: "ENTER_MOVE_MODE", nodeIds, cursorNodeId })
      return ok()
    }
    case "CONFIRM_MOVE":
      handleConfirmMove(ctx)
      return ok()
    case "CANCEL_MOVE":
      ctx.dispatchBoard(action)
      return ok()

    default:
      assertNever(action)
  }
}

// =============================================================================
// Individual Action Handlers
// =============================================================================

function handleZoomOutwards(ctx: TUIContext): ActionResult {
  const { state, boardState, ui, layout, dispatch, dispatchBoard } = ctx
  const col = state.columns[state.colIndex]
  const card = col?.cards[state.cardIndex]

  if (ui.showDetailPane) {
    dispatch(actions.setDetailPane(false))
    return ok()
  }
  if (ui.inOutlineMode) {
    dispatch(actions.exitOutlineMode())
    dispatch(actions.setSubIndex(0))
    clearSelection(ctx)
    return ok()
  }
  if (boardState.rootId) {
    const currentRoot = ctx.repo.getNode(boardState.rootId)
    if (currentRoot?.parent_id) {
      const parentNode = ctx.repo.getNode(currentRoot.parent_id)
      if (parentNode) {
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

        // When zooming out, keep the current root as the cursor
        dispatchBoard({
          type: "ZOOM_IN",
          nodeId: parentNode.id,
          cursorNodeId: boardState.rootId,
        })
        clearSelection(ctx)
        return ok()
      }
    } else {
      const rootView = initBoardState(ctx.repo)
      if (rootView && rootView.rootId !== boardState.rootId) {
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

        // When zooming out to root, keep the current root as the cursor
        dispatchBoard({
          type: "ZOOM_IN",
          nodeId: rootView.rootId,
          cursorNodeId: boardState.rootId,
        })
        clearSelection(ctx)
        return ok()
      }
    }
  }

  // Already at root level - try to move cursor to parent of current selection
  if (card?.node.parent_id) {
    const parentNode = ctx.repo.getNode(card.node.parent_id)
    if (parentNode) {
      // Search in layout.columns for the parent node
      const columns = layout.columns

      // Check if parent is a column header
      const colIdx = columns.findIndex((col) => col.node.id === parentNode.id)
      if (colIdx >= 0) {
        dispatchBoard({ type: "SELECT", nodeId: parentNode.id })
        clearSelection(ctx)
        return ok()
      }

      // Check if parent is a card within any column
      for (let cIdx = 0; cIdx < columns.length; cIdx++) {
        const column = columns[cIdx]
        if (!column) continue
        const cardIdx = column.cards.findIndex(
          (c) => c.node.id === parentNode.id,
        )
        if (cardIdx >= 0) {
          dispatchBoard({ type: "SELECT", nodeId: parentNode.id })
          clearSelection(ctx)
          return ok()
        }
      }
    }
  }

  // Try moving from card to column level
  if (layout.cardIndex >= 0) {
    const column = layout.columns[layout.colIndex]
    if (column) {
      dispatchBoard({ type: "SELECT", nodeId: column.node.id })
    }
    return ok()
  }

  // Try moving from column level to board level
  // Derive selection level from layout indices
  const derivedSelectionLevel =
    layout.cardIndex >= 0 ? "card" : layout.colIndex >= 0 ? "column" : "board"
  if (derivedSelectionLevel === "column") {
    dispatchBoard({ type: "SELECT", nodeId: null })
    return ok()
  }

  // At root level - try hierarchical cursor up instead
  const targetId = handleHierarchicalNavigation(ctx, "up")
  if (targetId) {
    dispatchBoard({ type: "SELECT", nodeId: targetId })
    return ok()
  }

  // Cursor up also failed - now return boundary
  return boundary("up", "already at board level")
}

function handleDeleteNode(ctx: TUIContext): void {
  const { state } = ctx
  const col = state.columns[state.colIndex]
  const card = col?.cards[state.cardIndex]

  if (!card) return
  ctx.repo.deleteNode(card.node.id)
  refreshBoardState(ctx, {
    cardIndex: (c) =>
      Math.min(state.cardIndex, Math.max(0, (c?.cards.length ?? 1) - 1)),
  })
}

function handleConfirmMove(ctx: TUIContext): void {
  const { boardState, layout, repo, dispatchBoard } = ctx
  const sourceNodeIds = boardState.moveSourceNodes
  if (sourceNodeIds.length === 0) return
  const targetCol = layout.columns[layout.colIndex]
  if (!targetCol) return
  let newSortOrder =
    targetCol.cards.length > 0
      ? (targetCol.cards[targetCol.cards.length - 1]?.node.parent_idx ?? 0) + 1
      : 0
  for (const nodeId of sourceNodeIds) {
    repo.moveNode(nodeId, targetCol.node.id, newSortOrder)
    newSortOrder++
  }
  dispatchBoard({ type: "CONFIRM_MOVE" })
  refreshBoardState(ctx, {
    colIndex: layout.colIndex,
    cardIndex: () => targetCol.cards.length,
  })
}

function handleTaskStatusCycle(ctx: TUIContext): void {
  const { state } = ctx
  const col = state.columns[state.colIndex]
  const card = col?.cards[state.cardIndex]

  if (!card) return
  const targetId = card.node.link_to || card.node.id
  const targetNode = card.node.link_to
    ? ctx.repo.getNode(card.node.link_to)
    : card.node
  const currentStatus = targetNode?.task_status || "todo"
  const statusCycle: TaskStatus[] = [
    "todo",
    "wip",
    "blocked",
    "done",
    "dropped",
  ]
  const currentIndex = statusCycle.indexOf(currentStatus)
  const nextStatus = statusCycle[
    (currentIndex + 1) % statusCycle.length
  ] as TaskStatus
  const markMap: Record<TaskStatus, TaskMark> = {
    todo: " ",
    wip: "/",
    blocked: "!",
    done: "x",
    dropped: "-",
  }
  ctx.repo.updateNode(targetId, {
    task_status: nextStatus,
    task_mark: markMap[nextStatus],
  })
  refreshBoardState(ctx)
}

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
  const { state, boardState, repo, positionRegistry } = ctx
  const { cursorNodeId, rootId } = boardState
  const col = state.columns[state.colIndex]

  if (!cursorNodeId) {
    // No cursor - can't navigate
    debug("h-nav: no cursor")
    return null
  }

  // Determine current level in hierarchy
  const isAtBoardLevel = cursorNodeId === rootId
  const isAtColumnLevel = state.columns.some((c) => c.node.id === cursorNodeId)
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
      positionRegistry.setStickyX(state.colIndex)
      return rootId
    }

    if (isAtBoardLevel) {
      // Already at board - can't go higher
      return null
    }
  }

  return null
}

function handleCursorMove(ctx: TUIContext, dir: string): ActionResult {
  const { state, ui, dispatch, dispatchBoard, positionRegistry } = ctx
  const col = state.columns[state.colIndex]
  const card = col?.cards[state.cardIndex]

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
          ? Math.max(0, state.cardIndex - 1)
          : Math.min((col?.cards.length ?? 1) - 1, state.cardIndex + 1)

      if (targetIdx !== state.cardIndex) {
        const direction = dir === "prev" ? "prev" : "next"
        const targetId = handleTreeNavigation(
          direction as TreeDirection,
          ctx.boardState,
          ctx.repo,
        )
        if (targetId) {
          dispatchBoard({ type: "SELECT", nodeId: targetId })
          if (ui.selectionAnchor !== null) {
            updateSelectionRange(ctx, state.colIndex, targetIdx, 0)
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
    let targetColIndex = state.colIndex
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
      targetColIndex === state.colIndex ||
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
    if (state.cardIndex < 0) {
      dispatchBoard({ type: "SELECT", nodeId: targetCol.node.id })
      return ok()
    }

    // Position-based navigation: Check if we have registered positions
    // Positions may be missing during initialization, in test environments,
    // or if columns are off-screen (virtualized).
    // Fallback: navigate to first card in target column if positions unavailable.
    const hasCurrentPositions = positionRegistry.hasCardsInColumn(
      state.colIndex,
    )
    const hasTargetPositions = positionRegistry.hasCardsInColumn(targetColIndex)

    debug(
      "h/l nav: curCol=%d hasCur=%s, targetCol=%d hasTgt=%s",
      state.colIndex,
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
        state.colIndex,
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
        state.colIndex,
        state.cardIndex,
      )
      debug(
        "h/l: getting curswantY from current card col=%d idx=%d layout=%O",
        state.colIndex,
        state.cardIndex,
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
    if (targetId) {
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

function handleToggleFold(ctx: TUIContext): ActionResult {
  const { state, dispatch, repo } = ctx
  const col = state.columns[state.colIndex]
  const card = col?.cards[state.cardIndex]

  if (!card) return boundary("fold", "no card selected")

  // Check if card has children to fold/unfold
  const children = repo.getChildren(card.node.id)
  if (children.length === 0) {
    return boundary("fold", "no children to fold")
  }

  dispatch(actions.toggleFold(card.node.id))
  return ok()
}

function handleNavBack(ctx: TUIContext): ActionResult {
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

function handleNavForward(ctx: TUIContext): ActionResult {
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

function handleZoomIn(ctx: TUIContext): ActionResult {
  const { state, boardState, ui, dispatch, dispatchBoard, layout } = ctx
  const col = state.columns[state.colIndex]
  const card = col?.cards[state.cardIndex]

  if (!card) return precondition("card")

  // If card has no children, return boundary (nothing to zoom into)
  const children = ctx.repo.getChildren(card.node.id)
  if (children.length === 0) {
    return boundary("in", "no children")
  }

  // Save current state to history
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

  // Dispatch zoom to the card node, with first child as initial cursor
  const firstChild = children[0]
  dispatchBoard({
    type: "ZOOM_IN",
    nodeId: card.node.id,
    cursorNodeId: firstChild?.id ?? null,
  })

  clearSelection(ctx)
  return ok()
}

/**
 * Zoom into a specific node by ID (works for both cards and columns)
 */
function handleZoomInNode(ctx: TUIContext, nodeId: string): ActionResult {
  const { boardState, ui, dispatch, dispatchBoard, layout } = ctx

  // Verify node has children
  const children = ctx.repo.getChildren(nodeId)
  if (children.length === 0) {
    return boundary("in", "no children")
  }

  // Save current state to history
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

  // Dispatch zoom with first child as initial cursor
  const firstChild = children[0]
  dispatchBoard({
    type: "ZOOM_IN",
    nodeId,
    cursorNodeId: firstChild?.id ?? null,
  })

  clearSelection(ctx)
  return ok()
}

function handleExtendSelectVertical(
  ctx: TUIContext,
  direction: "up" | "down",
): void {
  const { state, ui, dispatch, dispatchBoard } = ctx
  const col = state.columns[state.colIndex]
  const card = col?.cards[state.cardIndex]

  if (!card || !col) return

  // Initialize selection if starting fresh
  if (ui.multiSelected.size === 0) {
    dispatch(
      actions.setSelectionAnchor({
        col: state.colIndex,
        card: state.cardIndex,
        sub: 0,
      }),
    )
    const newSelected = new Set(ui.multiSelected)
    newSelected.add(makeSelectionKey(state.colIndex, state.cardIndex, 0))
    dispatch(actions.setMultiSelected(newSelected))
    dispatch(
      actions.setStatus({
        level: "info",
        message: "1 item selected",
      }),
    )
  }

  // Calculate target
  const targetIdx =
    direction === "up"
      ? Math.max(0, state.cardIndex - 1)
      : Math.min(col.cards.length - 1, state.cardIndex + 1)

  if (targetIdx === state.cardIndex) return

  // Move cursor
  const treeDir = direction === "up" ? "prev" : "next"
  const targetId = handleTreeNavigation(
    treeDir as TreeDirection,
    ctx.boardState,
    ctx.repo,
  )
  if (targetId) {
    dispatchBoard({ type: "SELECT", nodeId: targetId })
    // Update selection range (will also set status)
    updateSelectionRange(ctx, state.colIndex, targetIdx, 0)
  }
}

function handleExtendSelectHorizontal(
  ctx: TUIContext,
  _direction: "left" | "right",
): void {
  const { ui, dispatch } = ctx

  // Clear selection only (TODO: horizontal extend-select doesn't support range selection)
  if (ui.multiSelected.size > 0) {
    dispatch(actions.clearMultiSelection())
    dispatch(actions.setSelectionAnchor(null))
    dispatch(actions.clearStatus())
  }
}

function handleJumpToFavorite(ctx: TUIContext, favoriteNumber: number): void {
  const { boardState, ui, dispatch, dispatchBoard, layout } = ctx

  const favoriteKey =
    `favorite${favoriteNumber}` as keyof typeof DEFAULT_FAVORITES
  const favoriteId = DEFAULT_FAVORITES[favoriteKey]

  if (!favoriteId) return

  const targetNode = ctx.repo.getNode(favoriteId)
  if (!targetNode) return

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

  // Navigate to favorite
  dispatchBoard({
    type: "ZOOM_IN",
    nodeId: favoriteId,
  })

  clearSelection(ctx)
}

function handleJumpToColumn(
  ctx: TUIContext,
  columnNumber: number,
): ActionResult {
  const { state, dispatchBoard } = ctx

  // Column numbers are 1-indexed for user, 0-indexed internally
  const targetColIdx = columnNumber - 1

  if (targetColIdx < 0 || targetColIdx >= state.columns.length) {
    return boundary("column", `column ${columnNumber} does not exist`)
  }

  const targetCol = state.columns[targetColIdx]
  if (targetCol && targetCol.cards.length > 0) {
    const firstCard = targetCol.cards[0]
    if (firstCard) {
      dispatchBoard({ type: "SELECT", nodeId: firstCard.node.id })
    }
  }
  return ok()
}

function handleCloseOrQuit(ctx: TUIContext): ActionResult {
  const { ui, dispatch } = ctx

  // Close any open overlay first
  if (ui.showDetailPane) {
    dispatch(actions.setDetailPane(false))
    return ok()
  }
  if (ui.inOutlineMode) {
    dispatch(actions.exitOutlineMode())
    dispatch(actions.setSubIndex(0))
    return ok()
  }
  if (ui.showHelp) {
    dispatch(actions.hideHelp())
    return ok()
  }
  if (ui.showProjectPicker) {
    dispatch(actions.hideProjectPicker())
    return ok()
  }
  if (ui.showNewItemDialog) {
    dispatch(actions.hideNewItemDialog())
    return ok()
  }

  // Try to navigate back (zoom out) if we have history
  if (ui.navHistoryIndex > 0) {
    return handleNavBack(ctx)
  }

  // Nothing to close or navigate - indicate boundary
  return boundary("escape", "nothing to close")
}

function handleShiftCard(
  ctx: TUIContext,
  direction: "up" | "down" | "left" | "right",
): void {
  const { state } = ctx
  const col = state.columns[state.colIndex]
  const card = col?.cards[state.cardIndex]

  if (!card) return

  if (direction === "up" || direction === "down") {
    moveCardInColumn(ctx, card, direction)
  } else {
    moveCardToColumn(ctx, card, direction)
  }
}

function handleNavSiblingBoard(
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

function handleZoomInwards(ctx: TUIContext): ActionResult {
  const { state, boardState, ui, dispatch, dispatchBoard, layout } = ctx
  const col = state.columns[state.colIndex]
  const card = col?.cards[state.cardIndex]

  if (!card) {
    return precondition("card")
  }

  // If we're in outline mode with a sub-selection, zoom to that child
  if (ui.inOutlineMode && ui.subIndex > 0) {
    const flatChildren: { node: KNode; depth: number }[] = []

    // Build flat list of visible descendants
    function collectVisible(
      nodeId: string,
      depth: number,
      maxDepth: number,
    ): void {
      if (depth > maxDepth) return
      const nodeChildren = ctx.repo.getChildren(nodeId)
      for (const child of nodeChildren) {
        flatChildren.push({ node: child, depth })
        if (!ui.foldedNodes.has(child.id)) {
          collectVisible(child.id, depth + 1, maxDepth)
        }
      }
    }

    collectVisible(card.node.id, 1, ui.maxOutlineDepth)

    const targetChild = flatChildren[ui.subIndex - 1]
    if (targetChild?.node) {
      // Save state and zoom to child
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

      dispatch(actions.exitOutlineMode())
      dispatch(actions.setSubIndex(0))

      // Get first child of zoom target for cursor initialization
      const targetChildChildren = ctx.repo.getChildren(targetChild.node.id)
      const firstChild = targetChildChildren[0]

      dispatchBoard({
        type: "ZOOM_IN",
        nodeId: targetChild.node.id,
        cursorNodeId: firstChild?.id ?? null,
      })

      clearSelection(ctx)
      return ok()
    }
  }

  // Standard zoom in behavior
  return handleZoomIn(ctx)
}

function handlePageJump(ctx: TUIContext, direction: "up" | "down"): void {
  const { state, ui, dispatchBoard } = ctx
  const col = state.columns[state.colIndex]

  if (!col) return

  // Page size is roughly half the visible cards
  const pageSize = Math.max(5, Math.floor((ui.dimensions.rows - 4) / 2))

  const targetIdx =
    direction === "up"
      ? Math.max(0, state.cardIndex - pageSize)
      : Math.min(col.cards.length - 1, state.cardIndex + pageSize)

  if (targetIdx !== state.cardIndex) {
    const targetCard = col.cards[targetIdx]
    if (targetCard) {
      dispatchBoard({ type: "SELECT", nodeId: targetCard.node.id })
    }
  }
}
