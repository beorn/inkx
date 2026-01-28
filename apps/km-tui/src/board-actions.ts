/**
 * Board Action Handlers
 *
 * Main dispatcher for command actions.
 * Delegates to specialized handler modules for different operation categories.
 *
 * These handlers bridge CommandAction from @km/commands to actual state changes.
 * Eventually, commands will be directly executable (per km-mz2g design),
 * but this extraction is a first step to make Board.tsx manageable.
 */

import type { CommandAction } from "@km/commands"
import {
  type ActionResult,
  boundary,
  ok,
  precondition,
  unimplemented,
} from "@km/commands"
import createDebug from "debug"
import { assertNever } from "./action-handlers.ts"
import {
  outdentNode,
  moveCardInColumn,
  moveCardToColumn,
} from "./keyboard-card-ops.ts"
import {
  clearSelection,
  progressiveSelectAll,
  pushNavHistoryEntry,
} from "./keyboard-helpers.ts"
import { DEFAULT_FAVORITES } from "./keyboard-types.ts"
import type { TUIContext } from "./tui-context.ts"
import { actions } from "./ui-reducer.ts"

const debug = createDebug("km:tui:board-actions")

// Import handlers from specialized modules
import {
  handleConfirmMove,
  handleDeleteNode,
  handleShiftCard,
  handleTaskStatusCycle,
} from "./board-actions-edit.ts"
import {
  handleCursorMove,
  handleNavBack,
  handleNavForward,
  handleNavSiblingBoard,
  handlePageJump,
} from "./board-actions-nav.ts"
import {
  handleExtendSelectHorizontal,
  handleExtendSelectVertical,
} from "./board-actions-selection.ts"
import {
  handleZoomIn,
  handleZoomInNode,
  handleZoomInwards,
  handleZoomOutwards,
} from "./board-actions-zoom.ts"

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
  const { state, layout, dispatch, exit } = ctx
  const col = state.columns[layout.colIndex]
  const card = col?.cards[layout.cardIndex]

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
    case "SHOW_SEARCH_DIALOG":
      dispatch(actions.showSearchDialog())
      dispatch(actions.exitOutlineMode())
      dispatch(actions.setSubIndex(0))
      clearSelection(ctx)
      dispatch(actions.setDetailPane(false))
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
      const curCol = state.columns[layout.colIndex]
      const curCard = curCol?.cards[layout.cardIndex]
      const curNodeId = curCard?.node.id ?? curCol?.node.id
      debug(
        "OPEN_DETAIL_PANE: colIndex=%d cardIndex=%d curNodeId=%s",
        layout.colIndex,
        layout.cardIndex,
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
      dispatch(actions.toggleColumnCollapse(layout.colIndex))
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
      // Convert ui.multiSelected (SelectionKey format) to node IDs
      // TODO: Unify selection systems - boardState.selectedNodes vs ui.multiSelected
      const nodeIds: string[] = []
      if (ctx.ui.multiSelected.size > 0) {
        for (const selKey of ctx.ui.multiSelected) {
          const [colStr, cardStr] = selKey.split(":")
          const colIdx = parseInt(colStr ?? "0", 10)
          const cardIdx = parseInt(cardStr ?? "0", 10)
          const col = ctx.layout.columns[colIdx]
          const card = col?.cards[cardIdx]
          if (card?.node.id && !nodeIds.includes(card.node.id)) {
            nodeIds.push(card.node.id)
          }
        }
      }
      // Fall back to cursor node if no selection
      if (nodeIds.length === 0 && ctx.boardState.cursorNodeId) {
        nodeIds.push(ctx.boardState.cursorNodeId)
      }
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
// Helper Functions (local to this file)
// =============================================================================

function handleToggleFold(ctx: TUIContext): ActionResult {
  const { state, layout, dispatch, repo } = ctx
  const col = state.columns[layout.colIndex]
  const card = col?.cards[layout.cardIndex]

  if (!card) return boundary("fold", "no card selected")

  // Check if card has children to fold/unfold
  const children = repo.getChildren(card.node.id)
  if (children.length === 0) {
    return boundary("fold", "no children to fold")
  }

  dispatch(actions.toggleFold(card.node.id))
  return ok()
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
  const { state, layout } = ctx
  const col = state.columns[layout.colIndex]
  const card = col?.cards[layout.cardIndex]

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
  // Check if at repo root (parent_id is null) - can't navigate siblings
  if (!currentRoot || currentRoot.parent_id === null) {
    return boundary(direction, "at repo root")
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
  const col = state.columns[layout.colIndex]
  const card = col?.cards[layout.cardIndex]

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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access -- targetChild from flatChildren array
      const targetChildChildren = ctx.repo.getChildren(targetChild.node.id)
      const firstChild = targetChildChildren[0]

      dispatchBoard({
        type: "ZOOM_IN",
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- targetChild from flatChildren array
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
