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

import { spawn } from "node:child_process"
import { dirname } from "node:path"
import type { CommandAction } from "@km/commands"
import { type ActionResult, boundary, ok, unimplemented } from "@km/commands"
import { createLogger } from "@beorn/logger"
import { assertNever } from "../action-handlers.ts"
import { outdentNode } from "../keyboard/keyboard-card-ops.ts"
import { blockEditTargetRef } from "../block-edit-target.ts"
import { dialogTargetRef } from "../dialog-target.ts"
import { extractBody } from "@km/tree"
import {
  clearSelection,
  progressiveSelectAll,
  pushNavHistoryEntry,
} from "../keyboard/keyboard-helpers.ts"
import { DEFAULT_FAVORITES } from "../keyboard/keyboard-types.ts"
import type { ActionCtx } from "../tui-context.ts"
import { actions } from "../ui-reducer.ts"

const log = createLogger("km:tui:board-actions")

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
// oxlint-disable-next-line complexity/max-cognitive, complexity/max-cyclomatic -- Exhaustive action switch — TS validates completeness
export function handleCommandAction(
  ctx: ActionCtx,
  action: CommandAction,
): ActionResult {
  const { layout, dispatchUI, exit } = ctx
  const col = layout.columns[layout.colIndex]
  const card = col?.cards[layout.cardIndex]

  switch (action.type) {
    // === TUI-specific actions ===
    case "QUIT":
      exit()
      return ok()
    case "SHOW_NEW_ITEM_DIALOG":
      dispatchUI(actions.showNewItemDialog())
      dispatchUI(actions.exitOutlineMode())
      dispatchUI(actions.setSubIndex(0))
      clearSelection(ctx)
      dispatchUI(actions.setDetailPane(false))
      return ok()
    case "SHOW_PROJECT_PICKER":
      if (card) {
        dispatchUI(actions.showProjectPicker())
        dispatchUI(actions.exitOutlineMode())
        dispatchUI(actions.setSubIndex(0))
        clearSelection(ctx)
        dispatchUI(actions.setDetailPane(false))
      }
      return ok()
    case "SHOW_SEARCH_DIALOG":
      dispatchUI(actions.showSearchDialog())
      dispatchUI(actions.exitOutlineMode())
      dispatchUI(actions.setSubIndex(0))
      clearSelection(ctx)
      dispatchUI(actions.setDetailPane(false))
      return ok()
    case "JUMP_TO_FAVORITE":
      handleJumpToFavorite(ctx, action.favoriteNumber)
      return ok()
    case "JUMP_TO_COLUMN":
      return handleJumpToColumn(ctx, action.columnNumber)
    case "ENTER_INLINE_EDIT":
      dispatchUI(
        actions.enterInlineEdit({
          nodeId: action.nodeId,
          blockIndex: action.blockIndex ?? 0,
        }),
      )
      return ok()
    case "EDIT_BLOCK_NAVIGATE":
      return handleEditBlockNavigate(ctx, action.direction)
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
    case "OPEN_IN_SYSTEM":
      handleOpenInSystem(ctx, action.nodeId)
      return ok()
    case "OPEN_IN_TERMINAL":
      handleOpenInTerminal(ctx, action.nodeId)
      return ok()

    // === UI actions ===
    case "CYCLE_VIEW_MODE":
      // Clear stickyY when changing view mode - Y coordinates are incomparable across views
      // (cards view has borders, columns view is single-row items, etc.)
      ctx.layoutRegistry.clearStickyY()
      dispatchUI(actions.cycleViewMode())
      return ok()
    case "SHOW_HELP":
      dispatchUI(actions.showHelp())
      return ok()
    case "HIDE_HELP":
      dispatchUI(actions.hideHelp())
      return ok()
    case "OPEN_DETAIL_PANE": {
      // If current node has children, zoom into it instead of opening detail pane
      const curCol = layout.columns[layout.colIndex]
      const curCard = curCol?.cards[layout.cardIndex]
      const curNodeId = curCard?.node.id ?? curCol?.node.id
      log.debug?.(
        `OPEN_DETAIL_PANE: colIndex=${layout.colIndex} cardIndex=${layout.cardIndex} curNodeId=${curNodeId}`,
      )
      if (curNodeId) {
        const children = ctx.repo.getChildren(curNodeId)
        log.debug?.(`OPEN_DETAIL_PANE: children=${children.length}`)
        if (children.length > 0) {
          // Use handleZoomInNode to support both card and column level zoom
          return handleZoomInNode(ctx, curNodeId)
        }
      }
      // No children - open detail pane for leaf nodes
      dispatchUI(actions.setDetailPane(true))
      return ok()
    }
    case "CLOSE_DETAIL_PANE":
      dispatchUI(actions.setDetailPane(false))
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
      // Navigate-away saves: confirm inline edit before moving cursor.
      // Calling confirm() saves the value and exits inline edit mode.
      // This fires synchronously before navigation so React picks up
      // both the repo mutation and cursor change in the same render.
      if (ctx.ui.inlineEditBlock && blockEditTargetRef.current) {
        blockEditTargetRef.current.confirm()
      }
      return handleCursorMove(ctx, action.dir)
    case "TOGGLE_FOLD":
      return handleToggleFold(ctx)
    case "FOLD_LEVEL":
      if (col) dispatchUI(actions.foldAll(col.cards.map((c) => c.node.id)))
      return ok()
    case "UNFOLD_LEVEL":
      if (col) dispatchUI(actions.unfoldAll(col.cards.map((c) => c.node.id)))
      return ok()
    case "TOGGLE_COLLAPSE":
      dispatchUI(actions.toggleColumnCollapse(layout.colIndex))
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
      dispatchUI(actions.increaseOutlineDepth())
      return ok()
    case "DECREASE_OUTLINE_DEPTH":
      dispatchUI(actions.decreaseOutlineDepth())
      return ok()
    case "INCREASE_CONTENT_LINES":
      dispatchUI(actions.increaseContentLines())
      return ok()
    case "DECREASE_CONTENT_LINES":
      dispatchUI(actions.decreaseContentLines())
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

    // === Text editing actions (dispatched to TextEditTarget) ===
    // Read from shared ref directly (not ActionCtx snapshot) because
    // the target is set by useEffect after render.
    case "TEXT_INSERT":
      blockEditTargetRef.current?.insertChar(action.char)
      return ok()
    case "TEXT_DELETE_BACKWARD":
      blockEditTargetRef.current?.deleteBackward()
      return ok()
    case "TEXT_DELETE_FORWARD":
      blockEditTargetRef.current?.deleteForward()
      return ok()
    case "TEXT_CURSOR_LEFT":
      blockEditTargetRef.current?.cursorLeft()
      return ok()
    case "TEXT_CURSOR_RIGHT":
      blockEditTargetRef.current?.cursorRight()
      return ok()
    case "TEXT_CURSOR_START":
      blockEditTargetRef.current?.cursorStart()
      return ok()
    case "TEXT_CURSOR_END":
      blockEditTargetRef.current?.cursorEnd()
      return ok()
    case "TEXT_DELETE_WORD":
      blockEditTargetRef.current?.deleteWord()
      return ok()
    case "TEXT_DELETE_TO_START":
      blockEditTargetRef.current?.deleteToStart()
      return ok()
    case "TEXT_DELETE_TO_END":
      blockEditTargetRef.current?.deleteToEnd()
      return ok()
    case "TEXT_CONFIRM":
      blockEditTargetRef.current?.confirm()
      return ok()
    case "TEXT_CANCEL":
      blockEditTargetRef.current?.cancel()
      return ok()

    // === Detail pane ===
    case "DETAIL_PANE_CLOSE":
      dispatchUI(actions.setDetailPane(false))
      return ok()

    // === Dialog navigation (dispatched to active dialog via dialogTargetRef) ===
    case "DIALOG_NAV_UP":
      dialogTargetRef.current?.navUp()
      return ok()
    case "DIALOG_NAV_DOWN":
      dialogTargetRef.current?.navDown()
      return ok()
    case "DIALOG_CONFIRM":
      dialogTargetRef.current?.confirm()
      return ok()
    case "DIALOG_CANCEL":
      dialogTargetRef.current?.cancel()
      return ok()

    default:
      assertNever(action)
  }
}

// =============================================================================
// Helper Functions (local to this file)
// =============================================================================

function getBlockCount(ctx: ActionCtx, nodeId: string): number {
  const children = ctx.repo.getChildren(nodeId)
  const { body } = extractBody(children)
  return 1 + body.length // 1 for title + N body children
}

function handleEditBlockNavigate(
  ctx: ActionCtx,
  direction: "up" | "down",
): ActionResult {
  const { dispatchUI, ui } = ctx
  const edit = ui.inlineEditBlock
  if (!edit) return ok()

  const blockCount = getBlockCount(ctx, edit.nodeId)
  const nextIndex = edit.blockIndex + (direction === "down" ? 1 : -1)

  if (nextIndex < 0 || nextIndex >= blockCount) {
    // Past edges → confirm (save + exit edit mode) and navigate to adjacent card
    blockEditTargetRef.current?.confirm()
    return handleCursorMove(ctx, direction === "down" ? "down" : "up")
  } else {
    // Moving between blocks within same node → save current block, change index
    blockEditTargetRef.current?.save()
    dispatchUI(actions.setEditBlockIndex(nextIndex))
  }
  return ok()
}

function handleToggleFold(ctx: ActionCtx): ActionResult {
  const { layout, dispatchUI, repo } = ctx
  const col = layout.columns[layout.colIndex]
  const card = col?.cards[layout.cardIndex]

  if (!card) return boundary("fold", "no card selected")

  // Check if card has children to fold/unfold
  const children = repo.getChildren(card.node.id)
  if (children.length === 0) {
    return boundary("fold", "no children to fold")
  }

  dispatchUI(actions.toggleFold(card.node.id))
  return ok()
}

function handleJumpToFavorite(ctx: ActionCtx, favoriteNumber: number): void {
  const { boardState, ui, dispatchUI, dispatchBoard, layout } = ctx

  const favoriteKey =
    `favorite${favoriteNumber}` as keyof typeof DEFAULT_FAVORITES
  const favoriteId = DEFAULT_FAVORITES[favoriteKey]

  if (!favoriteId) return

  const targetNode = ctx.repo.getNode(favoriteId)
  if (!targetNode) return

  // Save current state
  pushNavHistoryEntry(
    dispatchUI,
    boardState.rootId,
    layout.colIndex,
    layout.cardIndex,
    ui.subIndex,
    ui.multiSelected,
    ui.inOutlineMode,
    boardState.cursorNodeId,
    ui.foldedNodes,
  )

  // Navigate to favorite
  dispatchBoard({
    type: "ZOOM_IN",
    nodeId: favoriteId,
  })

  clearSelection(ctx)
}

function handleJumpToColumn(
  ctx: ActionCtx,
  columnNumber: number,
): ActionResult {
  const columns = ctx.layout.columns
  const { dispatchBoard } = ctx

  // Column numbers are 1-indexed for user, 0-indexed internally
  const targetColIdx = columnNumber - 1

  if (targetColIdx < 0 || targetColIdx >= columns.length) {
    return boundary("column", `column ${columnNumber} does not exist`)
  }

  const targetCol = columns[targetColIdx]
  if (targetCol && targetCol.cards.length > 0) {
    const firstCard = targetCol.cards[0]
    if (firstCard) {
      dispatchBoard({ type: "SELECT", nodeId: firstCard.node.id })
    }
  }
  return ok()
}

function handleCloseOrQuit(ctx: ActionCtx): ActionResult {
  const { ui, dispatchUI, boardState, dispatchBoard } = ctx

  // Cancel move mode first (highest priority for escape)
  if (boardState.moveMode) {
    dispatchBoard({ type: "CANCEL_MOVE" })
    return ok()
  }

  // Cancel inline edit (must call cancel() so auto-save on unmount is suppressed)
  if (ui.inlineEditBlock) {
    blockEditTargetRef.current?.cancel()
    return ok()
  }

  // Close any open overlay first
  if (ui.showDetailPane) {
    dispatchUI(actions.setDetailPane(false))
    return ok()
  }
  if (ui.inOutlineMode) {
    dispatchUI(actions.exitOutlineMode())
    dispatchUI(actions.setSubIndex(0))
    return ok()
  }
  if (ui.showHelp) {
    dispatchUI(actions.hideHelp())
    return ok()
  }
  if (ui.showProjectPicker) {
    dispatchUI(actions.hideProjectPicker())
    return ok()
  }
  if (ui.showNewItemDialog) {
    dispatchUI(actions.hideNewItemDialog())
    return ok()
  }

  // Try to navigate back (zoom out) if we have history
  if (ui.navHistoryIndex > 0) {
    return handleNavBack(ctx)
  }

  // Nothing to close or navigate - indicate boundary
  return boundary("escape", "nothing to close")
}

// =============================================================================
// Open in System / Terminal
// =============================================================================

/** Walk up the tree to find the nearest node with fs_path. */
function resolveNodeFsPath(
  repo: ActionCtx["repo"],
  nodeId: string,
): { fsPath: string; isFolder: boolean } | null {
  let current = repo.data.getNode(nodeId)
  while (current) {
    if (current.fs_path) {
      return {
        fsPath: current.fs_path,
        isFolder: current.type === "folder",
      }
    }
    if (!current.parent_id) break
    current = repo.data.getNode(current.parent_id)
  }
  return null
}

function handleOpenInSystem(ctx: ActionCtx, nodeId: string): void {
  const result = resolveNodeFsPath(ctx.repo, nodeId)
  if (!result) {
    log.debug?.("open_in_system: no fs_path for node %s", nodeId)
    return
  }
  log.debug?.("open_in_system: opening %s", result.fsPath)
  spawn("open", [result.fsPath], { detached: true, stdio: "ignore" }).unref()
}

function handleOpenInTerminal(ctx: ActionCtx, nodeId: string): void {
  const result = resolveNodeFsPath(ctx.repo, nodeId)
  if (!result) {
    log.debug?.("open_in_terminal: no fs_path for node %s", nodeId)
    return
  }
  // For files, open terminal at the parent directory
  const dir = result.isFolder ? result.fsPath : dirname(result.fsPath)
  const termProgram = process.env.TERM_PROGRAM
  if (termProgram) {
    log.debug?.("open_in_terminal: opening %s at %s", termProgram, dir)
    spawn("open", ["-a", termProgram, dir], {
      detached: true,
      stdio: "ignore",
    }).unref()
  } else {
    log.debug?.("open_in_terminal: opening Terminal.app at %s", dir)
    spawn("open", ["-a", "Terminal", dir], {
      detached: true,
      stdio: "ignore",
    }).unref()
  }
}
