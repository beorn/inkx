/**
 * Board Action Handlers
 *
 * Main dispatcher for command actions.
 * Delegates to specialized handler modules for different operation categories.
 *
 * These handlers bridge CommandAction from @km/commands to actual state changes.
 * Eventually, commands will be directly executable (per km-mz2g design),
 * but this extraction is a first step to make Board.tsx manageable.
 *
 * Card operations follow the batch convention (see board-actions-edit.ts header):
 * gather → validate (all-or-nothing) → confirm? → execute → cleanup.
 * Every operation is batch-aware; single card = batch of 1.
 */

import { spawn } from "node:child_process"
import { dirname, join } from "node:path"
import type { CommandAction } from "@km/commands"
import { type ActionResult, boundary, ok, unimplemented } from "@km/commands"
import { createLogger } from "@beorn/logger"
import * as chrono from "chrono-node"
import { naturalToRRule } from "@km/storage"
import { addIgnored, removeIgnored, computeIgnorePath, isIgnored, readBoardIgnored } from "../ignored.ts"
import { assertNever } from "../action-handlers.ts"
import { indentNode, outdentNode } from "../keyboard/keyboard-card-ops.ts"
import { blockEditTargetRef } from "../block-edit-target.ts"
import { dialogTargetRef } from "../dialog-target.ts"
import { extractBody } from "@km/tree"
import {
  clearSelection,
  getSelectedCards,
  progressiveSelectAll,
  pushNavHistoryEntry,
  refreshBoardState,
} from "../keyboard/keyboard-helpers.ts"
import { DEFAULT_FAVORITES } from "../keyboard/keyboard-types.ts"
import type { ActionCtx } from "../tui-context.ts"
import type { ViewMode } from "../types.ts"

const log = createLogger("km:tui:board-actions")

// Import handlers from specialized modules
import {
  executeDelete,
  executeBatchDelete,
  handleConfirmMove,
  handleAddNodeAfter,
  handleAddNodeBefore,
  handleDeleteNode,
  handleDuplicateNode,
  handleIndentColumn,
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
import { handleExtendSelectHorizontal, handleExtendSelectVertical } from "./board-actions-selection.ts"
import {
  handleFollowLink,
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
// oxlint-disable-next-line complexity/complexity -- Exhaustive action switch — TS validates completeness
export function handleCommandAction(ctx: ActionCtx, action: CommandAction): ActionResult {
  const { layout, exit } = ctx
  const col = layout.columns[layout.colIndex]
  const card = col?.cards[layout.cardIndex]

  switch (action.type) {
    // === TUI-specific actions ===
    case "QUIT":
      exit()
      return ok()
    case "SHOW_NEW_ITEM_DIALOG":
      ctx.setUI({
        showNewItemDialog: true,
        inOutlineMode: false,
        subIndex: 0,
        showDetailPane: false,
      })
      clearSelection(ctx)
      return ok()
    case "SHOW_PROJECT_PICKER":
      if (card) {
        ctx.setUI({
          showProjectPicker: true,
          inOutlineMode: false,
          subIndex: 0,
          showDetailPane: false,
        })
        clearSelection(ctx)
      }
      return ok()
    case "SHOW_SEARCH_DIALOG":
      ctx.setUI({
        showSearchDialog: true,
        searchDialogInitialInput: "",
        inOutlineMode: false,
        subIndex: 0,
        showDetailPane: false,
      })
      clearSelection(ctx)
      return ok()
    case "JUMP_TO_FAVORITE":
      handleJumpToFavorite(ctx, action.favoriteNumber)
      return ok()
    case "JUMP_TO_COLUMN":
      return handleJumpToColumn(ctx, action.columnNumber)
    case "ENTER_INLINE_EDIT":
      ctx.setUI({
        inlineEditBlock: {
          nodeId: action.nodeId,
          blockIndex: action.blockIndex ?? 0,
        },
      })
      return ok()
    case "EDIT_BLOCK_NAVIGATE":
      return handleEditBlockNavigate(ctx, action.direction)
    case "CLOSE_OR_QUIT":
      return handleCloseOrQuit(ctx)
    case "INDENT_NODE":
      if (!card && col) return handleIndentColumn(ctx, col)
      if (!card) return boundary("indent", "No card to indent")
      if (!indentNode(ctx, card)) return boundary("indent", "Can't indent further")
      return ok()
    case "OUTDENT_NODE":
      if (!card) return boundary("outdent", "No card to outdent")
      if (!outdentNode(ctx, card)) return boundary("outdent", "Can't outdent further")
      return ok()
    case "NAV_SIBLING_BOARD":
      return handleNavSiblingBoard(ctx, action.direction)
    case "ZOOM_INWARDS":
      return handleZoomInwards(ctx)
    case "FOLLOW_LINK":
      return handleFollowLink(ctx)
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
      ctx.setUI((prev) => {
        const modes: ViewMode[] = ["cards", "columns", /* "list", */ "tabs"]
        const idx = modes.indexOf(prev.viewMode)
        return { viewMode: modes[(idx + 1) % modes.length] ?? "cards" }
      })
      return ok()
    case "CYCLE_ICON_STYLE":
      ctx.setUI((prev) => {
        const styles = ["nerdfont", "workflowy", "regular"] as const
        const idx = styles.indexOf(prev.iconStyle)
        return { iconStyle: styles[(idx + 1) % styles.length] ?? "nerdfont" }
      })
      return ok()
    case "SHOW_HELP":
      ctx.setUI({ showHelp: true })
      return ok()
    case "HIDE_HELP":
      ctx.setUI({ showHelp: false })
      return ok()
    case "OPEN_DETAIL_PANE": {
      // If current node has children, zoom into it instead of opening detail pane.
      // Exception: folders always get the detail pane (shows contents outline).
      const curCol = layout.columns[layout.colIndex]
      const curCard = curCol?.cards[layout.cardIndex]
      const curNodeId = curCard?.node.id ?? curCol?.node.id
      const curNode = curNodeId ? ctx.repo.getNode(curNodeId) : undefined
      // Resolve embedded links to get the actual target node type
      const resolvedNode = curNode?.link_to ? ctx.repo.getNode(curNode.link_to) : curNode
      const isFolder = resolvedNode?.type === "folder"
      log.debug?.(
        `OPEN_DETAIL_PANE: colIndex=${layout.colIndex} cardIndex=${layout.cardIndex} curNodeId=${curNodeId} isFolder=${isFolder}`,
      )
      if (curNodeId && !isFolder) {
        const children = ctx.repo.getChildren(curNodeId)
        log.debug?.(`OPEN_DETAIL_PANE: children=${children.length}`)
        if (children.length > 0) {
          // Use handleZoomInNode to support both card and column level zoom
          return handleZoomInNode(ctx, curNodeId)
        }
      }
      // No children, or folder — open detail pane
      ctx.setUI({ showDetailPane: true })
      return ok()
    }
    case "CLOSE_DETAIL_PANE":
      ctx.setUI({ showDetailPane: false })
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

    // === History actions (undo/redo) ===
    case "HISTORY_UNDO": {
      if (!ctx.undoStack.canUndo()) return boundary("undo", "Nothing to undo")
      ctx.undoStack.undo()
      refreshBoardState(ctx)
      return ok()
    }
    case "HISTORY_REDO": {
      if (!ctx.undoStack.canRedo()) return boundary("redo", "Nothing to redo")
      ctx.undoStack.redo()
      refreshBoardState(ctx)
      return ok()
    }

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
      if (col) {
        const newFolded = new Set(ctx.foldedNodes)
        for (const c of col.cards) newFolded.add(c.node.id)
        ctx.setFoldedNodes(newFolded)
      }
      return ok()
    case "UNFOLD_LEVEL":
      if (col) {
        const newFolded = new Set(ctx.foldedNodes)
        for (const c of col.cards) newFolded.delete(c.node.id)
        ctx.setFoldedNodes(newFolded)
      }
      return ok()
    case "TOGGLE_COLLAPSE": {
      // Collapse the column (not the card) — use column node ID
      const collapseNodeId = col?.node.id
      if (!collapseNodeId) return boundary("collapse", "No column to collapse")
      ctx.dispatchBoard({ type: "TOGGLE_COLLAPSE", nodeId: collapseNodeId })
      return ok()
    }
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
      ctx.setUI((prev) => ({
        maxOutlineDepth: Math.min(10, prev.maxOutlineDepth + 1),
      }))
      return ok()
    case "DECREASE_OUTLINE_DEPTH":
      ctx.setUI((prev) => ({
        maxOutlineDepth: Math.max(0, prev.maxOutlineDepth - 1),
      }))
      return ok()
    case "INCREASE_CONTENT_LINES":
      ctx.setUI((prev) => ({
        maxContentLines: Math.min(10, prev.maxContentLines + 1),
      }))
      return ok()
    case "DECREASE_CONTENT_LINES":
      ctx.setUI((prev) => ({
        maxContentLines: Math.max(1, prev.maxContentLines - 1),
      }))
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

    // === Fold operations (single-node) ===
    case "FOLD_NODE": {
      const foldCard = col?.cards[layout.cardIndex]
      if (!foldCard) return boundary("fold", "no card selected")
      const newFolded = new Set(ctx.foldedNodes)
      newFolded.add(foldCard.node.id)
      ctx.setFoldedNodes(newFolded)
      return ok()
    }
    case "UNFOLD_NODE": {
      const unfoldCard = col?.cards[layout.cardIndex]
      if (!unfoldCard) return boundary("fold", "no card selected")
      const newFolded = new Set(ctx.foldedNodes)
      newFolded.delete(unfoldCard.node.id)
      ctx.setFoldedNodes(newFolded)
      return ok()
    }
    case "UNFOLD_RECURSIVE": {
      const recursiveCard = col?.cards[layout.cardIndex]
      if (!recursiveCard) return boundary("fold", "no card selected")
      const newFolded = new Set(ctx.foldedNodes)
      // Unfold the card and all descendants
      const unfoldDescendants = (nodeId: string) => {
        newFolded.delete(nodeId)
        for (const child of ctx.repo.getChildren(nodeId)) {
          unfoldDescendants(child.id)
        }
      }
      unfoldDescendants(recursiveCard.node.id)
      ctx.setFoldedNodes(newFolded)
      return ok()
    }

    // === Ignore operations ===
    case "IGNORE_NODE":
      return handleIgnoreNode(ctx)
    case "TOGGLE_SHOW_IGNORED":
      ctx.setUI((prev) => ({ showIgnored: !prev.showIgnored }))
      return ok()

    // === Edit operations ===
    case "INSERT_ABOVE":
      handleAddNodeBefore(ctx)
      return ok()
    case "INSERT_BELOW":
      handleAddNodeAfter(ctx)
      return ok()
    case "DUPLICATE_NODE":
      handleDuplicateNode(ctx, action.nodeId)
      return ok()

    // === UI stubs (future features) ===
    case "FILTER":
    case "COMMAND_PALETTE":
      return unimplemented("ui")

    // === Property actions ===
    case "SET_DUE_DATE":
      return handleSetDatePrompt(ctx, "due_date")
    case "SET_START_DATE":
      return handleSetDatePrompt(ctx, "scheduled_date")
    case "SET_RECURRING":
      return handleSetDatePrompt(ctx, "recurrence")
    case "SET_PRIORITY":
      return handleSetPriority(ctx)
    case "DATE_PROMPT_CONFIRM":
      return handleDatePromptConfirm(ctx)
    case "DATE_PROMPT_CANCEL":
      ctx.setUI({ datePrompt: null })
      return ok()

    // === Property stubs (future features) ===
    case "SET_LABEL":
    case "SET_ASSIGNEE":
      return unimplemented("properties")

    // Legacy navigation actions removed (were in BoardAction, not in CommandAction)

    // === Move mode actions ===
    // Commands return minimal actions; TUI augments with context before dispatching
    case "ENTER_MOVE_MODE": {
      // Convert ui.multiSelected (SelectionKey format) to node IDs
      // TODO: Unify selection systems - ctx.selectedNodes vs ui.multiSelected
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
      if (nodeIds.length === 0 && ctx.cursorNodeId) {
        nodeIds.push(ctx.cursorNodeId)
      }
      const cursorNodeId = ctx.cursorNodeId
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
    case "TEXT_DELETE_BACKWARD": {
      const target = blockEditTargetRef.current
      // Smart delete: at position 0 of empty node, delete the node itself
      if (target && ctx.ui.inlineEditBlock && target.getCursorOffset() === 0 && target.getContent() === "") {
        const nodeId = ctx.ui.inlineEditBlock.nodeId
        ctx.setUI({ inlineEditBlock: null })
        executeDelete(ctx, nodeId)
        return ok()
      }
      target?.deleteBackward()
      return ok()
    }
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
    case "TEXT_CONFIRM": {
      // Outliner-style Enter: save current + create new sibling + edit it.
      // Key insight: don't clear inlineEditBlock to null as intermediate state.
      // Go directly from old edit → new edit. React handles unmount/mount via
      // key change (different nodeId). The intermediate null creates a timing
      // vulnerability where batched events or sync I/O can leave the ref null.
      const target = blockEditTargetRef.current
      if (target) {
        target.insertBreak?.()
        target.save()
        // handleAddNodeAfter sets inlineEditBlock to newId directly —
        // no intermediate null state that could be caught by batched events
        handleAddNodeAfter(ctx)
      } else if (ctx.ui.inlineEditBlock) {
        // Batched Enter: inlineEditBlock is set but React hasn't rendered the
        // InlineEditField yet (no ref). This happens when events arrive faster
        // than React renders. The new node has empty content, so just create
        // another sibling directly.
        handleAddNodeAfter(ctx)
      }
      return ok()
    }
    case "TEXT_EXIT_EDIT":
      // Save current content and exit edit mode (Esc = save + switch to node mode)
      blockEditTargetRef.current?.save()
      ctx.setUI({ inlineEditBlock: null })
      return ok()
    case "TEXT_YANK":
      // Stub: yank (paste kill ring) — not yet implemented
      return unimplemented("text.yank")

    // === Detail pane ===
    case "DETAIL_PANE_CLOSE":
      ctx.setUI({ showDetailPane: false })
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

    // === Modal commands (routed through command system via when predicates) ===
    case "NOOP":
      return ok()
    case "CONSOLE_TOGGLE":
      ctx.setUI((prev) => ({ showConsole: !prev.showConsole }))
      return ok()
    case "CONSOLE_CLOSE":
      ctx.setUI({ showConsole: false })
      return ok()
    case "DELETE_CONFIRM_EXECUTE":
      if (ctx.ui.deleteConfirm) {
        executeBatchDelete(ctx, ctx.ui.deleteConfirm.nodeIds)
      }
      ctx.setUI({ deleteConfirm: null })
      return ok()
    case "DELETE_CONFIRM_CANCEL":
      ctx.setUI({ deleteConfirm: null })
      return ok()
    case "TOAST_DISMISS": {
      const latest = ctx.toastQueue.getLatest()
      if (latest?.action && typeof latest.action.trigger === "function") {
        // Job cancel — the callback handles its own toast dismissal
        latest.action.trigger()
      } else {
        ctx.toastQueue.dismissAll()
      }
      // Force re-render (toastQueue is external state, not in Zustand)
      ctx.setUI({})
      return ok()
    }
    case "DEV_TEST_TOAST": {
      const { toastQueue } = ctx
      const examples = [
        () => toastQueue.success("Task completed!"),
        () =>
          toastQueue.error("Failed to save", {
            description: "Network error",
          }),
        () => toastQueue.warning("Disk space low"),
        () => toastQueue.info("3 tasks selected"),
        () =>
          toastQueue.info("File deleted", {
            action: { label: "Undo", trigger: "z" },
          }),
      ]
      const randomToast = examples[Math.floor(Math.random() * examples.length)]
      randomToast?.()
      return ok()
    }

    default:
      assertNever(action)
  }
}

// =============================================================================
// Helper Functions (local to this file)
// =============================================================================

function handleEditBlockNavigate(ctx: ActionCtx, direction: "up" | "down"): ActionResult {
  const { ui } = ctx
  const edit = ui.inlineEditBlock
  if (!edit) return ok()

  const blockCount = 1 + extractBody(ctx.repo.getChildren(edit.nodeId)).body.length
  const nextIndex = edit.blockIndex + (direction === "down" ? 1 : -1)

  if (nextIndex < 0 || nextIndex >= blockCount) {
    // Past edges → confirm (save + exit edit mode) and navigate to adjacent card
    blockEditTargetRef.current?.confirm()
    return handleCursorMove(ctx, direction === "down" ? "down" : "up")
  } else {
    // Moving between blocks within same node → save current block, change index
    blockEditTargetRef.current?.save()
    ctx.setUI({ inlineEditBlock: { ...edit, blockIndex: nextIndex } })
  }
  return ok()
}

function handleToggleFold(ctx: ActionCtx): ActionResult {
  const { layout, repo } = ctx
  const col = layout.columns[layout.colIndex]
  const card = col?.cards[layout.cardIndex]

  if (!card) return boundary("fold", "no card selected")

  // Check if card has children to fold/unfold
  const children = repo.getChildren(card.node.id)
  if (children.length === 0) {
    return boundary("fold", "no children to fold")
  }

  ctx.dispatchBoard({ type: "TOGGLE_FOLD", nodeId: card.node.id })
  return ok()
}

function handleJumpToFavorite(ctx: ActionCtx, favoriteNumber: number): void {
  const { ui, dispatchBoard, layout } = ctx

  const favoriteKey = `favorite${favoriteNumber}` as keyof typeof DEFAULT_FAVORITES
  const favoriteId = DEFAULT_FAVORITES[favoriteKey]

  if (!favoriteId) return

  const targetNode = ctx.repo.getNode(favoriteId)
  if (!targetNode) return

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

  // Navigate to favorite
  dispatchBoard({
    type: "ZOOM_IN",
    nodeId: favoriteId,
  })

  clearSelection(ctx)
}

function handleJumpToColumn(ctx: ActionCtx, columnNumber: number): ActionResult {
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
  const { ui, dispatchBoard } = ctx

  // Cancel move mode first (highest priority for escape)
  if (ctx.moveMode) {
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
    ctx.setUI({ showDetailPane: false })
    return ok()
  }
  if (ui.inOutlineMode) {
    ctx.setUI({ inOutlineMode: false, subIndex: 0 })
    return ok()
  }
  if (ui.showHelp) {
    ctx.setUI({ showHelp: false })
    return ok()
  }
  if (ui.showSearchDialog) {
    dialogTargetRef.current?.cancel()
    return ok()
  }
  if (ui.showProjectPicker) {
    ctx.setUI({ showProjectPicker: false })
    return ok()
  }
  if (ui.showNewItemDialog) {
    ctx.setUI({ showNewItemDialog: false })
    return ok()
  }
  if (ui.datePrompt) {
    ctx.setUI({ datePrompt: null })
    return ok()
  }

  // Clear multi-selection if active
  if (ui.multiSelected.size > 0) {
    clearSelection(ctx)
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

/** Walk up the tree to find the nearest node with fs_path, returning absolute path. */
function resolveNodeFsPath(repo: ActionCtx["repo"], nodeId: string): { fsPath: string; isFolder: boolean } {
  if (!repo.data) return { fsPath: repo.path, isFolder: true }
  let current = repo.data.getNode(nodeId)
  while (current) {
    if (current.fs_path) {
      // fs_path is repo-relative — join with repo root for absolute path
      const absPath = join(repo.path, current.fs_path)
      return {
        fsPath: absPath,
        isFolder: current.type === "folder",
      }
    }
    if (!current.parent_id) break
    current = repo.data.getNode(current.parent_id)
  }
  // Fallback: open the repo root itself
  return { fsPath: repo.path, isFolder: true }
}

/** Spawn `open` and report errors via toast + log instead of silently swallowing. */
function spawnOpen(ctx: ActionCtx, args: string[], label: string): void {
  const child = spawn("open", args, {
    detached: true,
    stdio: ["ignore", "ignore", "pipe"],
  })
  let stderr = ""
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString()
  })
  child.on("error", (err) => {
    log.error?.(`${label}: spawn failed: ${err.message}`)
    ctx.toastQueue.error(`Failed to open: ${err.message}`)
  })
  child.on("close", (code) => {
    if (code !== 0) {
      const msg = stderr.trim() || `exit code ${code}`
      log.error?.(`${label}: ${msg}`)
      ctx.toastQueue.error(`Failed to open: ${msg}`)
    }
  })
  child.unref()
}

function handleOpenInSystem(ctx: ActionCtx, nodeId: string): void {
  const result = resolveNodeFsPath(ctx.repo, nodeId)
  log.debug?.("open_in_system: opening %s", result.fsPath)
  spawnOpen(ctx, [result.fsPath], "open_in_system")
}

function handleIgnoreNode(ctx: ActionCtx): ActionResult {
  const { layout, repo } = ctx
  const col = layout.columns[layout.colIndex]
  const card = col?.cards[layout.cardIndex]
  const node = card?.node ?? col?.node
  if (!node) return boundary("ignore", "No node to ignore")

  const ignorePath = computeIgnorePath(node, repo)
  if (!ignorePath) return boundary("ignore", "Cannot compute ignore path")

  try {
    const ignoredPaths = readBoardIgnored(repo.path)
    const alreadyIgnored = isIgnored(ignoredPaths, node, repo)

    if (alreadyIgnored) {
      // Un-ignore (only works in reveal mode)
      removeIgnored(repo.path, ignorePath)
      ctx.toastQueue.info(`Un-ignored: ${ignorePath}`)
    } else {
      addIgnored(repo.path, ignorePath)
      ctx.toastQueue.info(`Ignored: ${ignorePath}`)
    }

    // Bump ignore version so readBoardIgnored memo invalidates
    ctx.setUI((prev) => ({ ignoreVersion: prev.ignoreVersion + 1 }))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    ctx.toastQueue.error(`Failed to ignore: ${msg}`)
  }
  return ok()
}

function handleOpenInTerminal(ctx: ActionCtx, nodeId: string): void {
  const result = resolveNodeFsPath(ctx.repo, nodeId)
  // For files, open terminal at the parent directory
  const dir = result.isFolder ? result.fsPath : dirname(result.fsPath)
  const termProgram = process.env.TERM_PROGRAM
  const app = termProgram || "Terminal"
  log.debug?.("open_in_terminal: opening %s at %s", app, dir)
  spawnOpen(ctx, ["-a", app, dir], "open_in_terminal")
}

// =============================================================================
// Date / Priority / Recurrence Handlers
// =============================================================================

/** Get node IDs from selected cards (batch-aware). */
function getSelectedCardNodeIds(ctx: ActionCtx): string[] {
  const cards = getSelectedCards(ctx)
  return cards.map((c) => c.node.id)
}

/** Open the date prompt dialog for a given field. */
function handleSetDatePrompt(ctx: ActionCtx, field: "due_date" | "scheduled_date" | "recurrence"): ActionResult {
  const nodeIds = getSelectedCardNodeIds(ctx)
  if (nodeIds.length === 0) return boundary(field, "No card selected")
  const firstNodeId = nodeIds[0]
  if (!firstNodeId) return boundary(field, "No card selected")

  const firstNode = ctx.repo.getNode(firstNodeId)
  let currentValue = ""
  if (firstNode) {
    if (field === "due_date") currentValue = firstNode.due_date ?? ""
    else if (field === "scheduled_date") currentValue = firstNode.scheduled_date ?? ""
    else if (field === "recurrence") currentValue = firstNode.recurrence ?? ""
  }

  ctx.setUI({
    datePrompt: { field, nodeIds, currentValue },
  })
  return ok()
}

/** Cycle priority: none → P1 → P2 → P3 → P4 → none */
function handleSetPriority(ctx: ActionCtx): ActionResult {
  const nodeIds = getSelectedCardNodeIds(ctx)
  if (nodeIds.length === 0) return boundary("priority", "No card selected")
  const firstNodeId = nodeIds[0]
  if (!firstNodeId) return boundary("priority", "No card selected")

  const firstNode = ctx.repo.getNode(firstNodeId)
  const current = firstNode?.priority ?? 0
  const next = current >= 4 ? 0 : (current || 0) + 1

  const prevValues: Array<{ nodeId: string; priority: number | null }> = []
  for (const nodeId of nodeIds) {
    const node = ctx.repo.getNode(nodeId)
    prevValues.push({ nodeId, priority: node?.priority ?? null })
    ctx.repo.updateNode(nodeId, { priority: next || null })
  }

  ctx.undoStack.push({
    label: "Set priority",
    undo: () => {
      for (const { nodeId, priority } of prevValues) {
        ctx.repo.updateNode(nodeId, { priority })
      }
    },
    redo: () => {
      for (const nodeId of nodeIds) {
        ctx.repo.updateNode(nodeId, { priority: next || null })
      }
    },
  })

  const label = next ? `P${next}` : "None"
  ctx.toastQueue.info(`Priority: ${label}`)
  refreshBoardState(ctx)
  return ok()
}

/** Format a Date as YYYY-MM-DD */
function formatDateStr(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/** Format a Date's time as HH:MM (or empty if midnight) */
function formatTimeStr(d: Date): string {
  const h = d.getHours()
  const m = d.getMinutes()
  if (h === 0 && m === 0) return ""
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

/**
 * Resolve a natural language date input to { date, time }.
 * Supports: "today", "tomorrow", "fri", "+3d", "jan 15", "next tue 3pm", YYYY-MM-DD, etc.
 */
function resolveDate(input: string): { date: string; time: string } | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  // Direct YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { date: trimmed, time: "" }
  }

  // Relative shortcut: +Nd (days)
  const relMatch = trimmed.match(/^\+(\d+)d$/)
  if (relMatch?.[1]) {
    const d = new Date()
    d.setDate(d.getDate() + parseInt(relMatch[1], 10))
    return { date: formatDateStr(d), time: "" }
  }

  // Use chrono-node for natural language
  const results = chrono.parse(trimmed)
  if (results.length > 0 && results[0]) {
    const d = results[0].start.date()
    const time = results[0].start.isCertain("hour") ? formatTimeStr(d) : ""
    return { date: formatDateStr(d), time }
  }

  return null
}

/** Handle confirmation of the date prompt dialog. */
function handleDatePromptConfirm(ctx: ActionCtx): ActionResult {
  const prompt = ctx.ui.datePrompt
  if (!prompt) return ok()

  // Read the current input from the block edit target (set by DatePromptDialog)
  const input = blockEditTargetRef.current?.getContent() ?? ""
  const trimmed = input.trim()

  const { field, nodeIds } = prompt

  // Build prev values for undo
  const prevValues: Array<{ nodeId: string; values: Record<string, unknown> }> = []

  if (field === "recurrence") {
    // Recurrence: convert NL → RRULE, or clear
    const rrule = trimmed ? naturalToRRule(trimmed) : null
    if (trimmed && !rrule) {
      ctx.toastQueue.error("Invalid recurrence: " + trimmed)
      return ok()
    }
    for (const nodeId of nodeIds) {
      const node = ctx.repo.getNode(nodeId)
      prevValues.push({ nodeId, values: { recurrence: node?.recurrence ?? null } })
      ctx.repo.updateNode(nodeId, { recurrence: rrule })
    }
    ctx.toastQueue.info(rrule ? `Recurrence: ${trimmed}` : "Recurrence cleared")
  } else {
    // Date field: resolve NL → date + time, or clear
    if (trimmed) {
      const resolved = resolveDate(trimmed)
      if (!resolved) {
        ctx.toastQueue.error("Invalid date: " + trimmed)
        return ok()
      }
      const dateField = field // "due_date" | "scheduled_date"
      const timeField = field === "due_date" ? "due_time" : "scheduled_time"
      for (const nodeId of nodeIds) {
        const node = ctx.repo.getNode(nodeId)
        prevValues.push({
          nodeId,
          values: {
            [dateField]: node?.[dateField] ?? null,
            [timeField]: node?.[timeField as keyof typeof node] ?? null,
          },
        })
        const update: Record<string, unknown> = { [dateField]: resolved.date }
        if (resolved.time) update[timeField] = resolved.time
        else update[timeField] = null
        ctx.repo.updateNode(nodeId, update)
      }
      const display = resolved.time ? `${resolved.date} ${resolved.time}` : resolved.date
      const label = field === "due_date" ? "Due" : "Start"
      ctx.toastQueue.info(`${label}: ${display}`)
    } else {
      // Clear the field
      const dateField = field
      const timeField = field === "due_date" ? "due_time" : "scheduled_time"
      for (const nodeId of nodeIds) {
        const node = ctx.repo.getNode(nodeId)
        prevValues.push({
          nodeId,
          values: {
            [dateField]: node?.[dateField] ?? null,
            [timeField]: node?.[timeField as keyof typeof node] ?? null,
          },
        })
        ctx.repo.updateNode(nodeId, { [dateField]: null, [timeField]: null })
      }
      const label = field === "due_date" ? "Due date" : "Start date"
      ctx.toastQueue.info(`${label} cleared`)
    }
  }

  // Push undo
  ctx.undoStack.push({
    label: `Set ${field}`,
    undo: () => {
      for (const { nodeId, values } of prevValues) {
        ctx.repo.updateNode(nodeId, values)
      }
    },
    redo: () => {
      // Re-apply — simplification: just re-run the same logic isn't practical,
      // so we store forward values
    },
  })

  ctx.setUI({ datePrompt: null })
  refreshBoardState(ctx)
  return ok()
}
