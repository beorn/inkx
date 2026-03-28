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
import { createLogger } from "loggily"
import * as chrono from "chrono-node"
import { naturalToRRule, onNodeChanged, createRuleContext } from "@km/storage"
import { addIgnored, removeIgnored, computeIgnorePath, isIgnored, readBoardIgnored } from "../ignored.ts"
import { ownerPaneId, detailPaneIdFor } from "../board-types.ts"
import { DETAIL_META_PREFIX } from "../views/detail-pane-items.ts"
import { assertNever } from "../action-handlers.ts"
import { markDialogConfirmed, isDialogConfirmGracePeriod, pushDialogMode, popDialogMode } from "../dialog-guard.ts"
import { indentNode, outdentNode } from "../keyboard/keyboard-card-ops.ts"
import { activeEditTargetRef, activeEditContextRef, copyToClipboard } from "@silvery/ag-react"
import { dialogTargetRef } from "../dialog-target.ts"
import {
  extractBody,
  splitNode,
  mergeWithNext,
  mergeWithPrevious,
  detectPrefixConversion,
  backspaceDegradation,
  getNextSibling,
  getNodeText,
  setNodeText,
} from "@km/tree"
import { type KNode, isOutline, isListItem, extractTitleTaskMarker } from "@km/core"
import { clearSelection, getSelectedCards, progressiveSelectAll, saveNavHistory } from "../keyboard/keyboard-helpers.ts"
import {
  getFavorite,
  setFavorite,
  clearFavorite,
  RESERVED_KEYS,
  getReservedKeyLabel,
  initDefaultKeybindings,
} from "@km/commands"
import { resolveLocationKey, isPickTarget, isAtPosition, moveTo } from "./position-resolver.ts"
import type { ActionCtx } from "../tui-context.ts"
import { makeSelectionKey, type ViewMode } from "../types.ts"
import { createEmptyFilterProperties, VIEW_DIALOG_ROWS, type IconStyle } from "../ui-reducer.ts"

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loggily types don't fully resolve via tsc bundler mode
const log = createLogger("km:tui:board-actions") as any

/**
 * Maximum fold depth. Prevents runaway expansion when unfolding.
 * 20 levels is very generous — most real outlines are 3-5 levels deep.
 */
export const MAX_FOLD_DEPTH = 20

/** Determine fold target node IDs from selection → card → column fallback. */
function getFoldTargetRoots(ctx: ActionCtx, card: KNode | null | undefined): string[] {
  const selected = getSelectedCards(ctx)
  return selected.length > 0
    ? selected.map((c) => c.id)
    : card
      ? [card.id]
      : ctx.column
        ? ctx.column.cardNodes.map((n) => n.id)
        : []
}

/**
 * Apply backspace degradation to a node, adjusting content based on type changes.
 * When stripping task marker or converting outline/list to plain p, content is reformatted.
 */
function applyDegradation(node: KNode, degradation: Record<string, unknown>, content: string): void {
  if (node.task_marker && degradation.task_marker === undefined) {
    degradation.content = content
  }
  if (degradation.type === "p" && isOutline(node.type, node.item)) {
    degradation.content = content
    degradation.name = undefined
  }
  if (degradation.type === "p" && isListItem(node.type, node.item)) {
    degradation.content = content
  }
}

// Import handlers from specialized modules
import {
  executeDelete,
  executeBatchDelete,
  handleConfirmMove,
  handleAddNodeAfter,
  handleAddNodeBefore,
  handleAddNodeChild,
  handleAddNodeAtParent,
  handleDeleteNode,
  handleDuplicateNode,
  handleIndentColumn,
  handleShiftCard,
  handleTaskStatusCycle,
  handleClearTask,
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
  handleZoomInwards,
  handleZoomOutwards,
  handleZoomToRoot,
} from "./board-actions-zoom.ts"
import { handleLocalFindOpen, handleLocalFindNext, handleLocalFindPrev } from "./board-actions-find.ts"
import {
  handleSearchReplaceOpen,
  handleSearchReplaceNext,
  handleSearchReplacePrev,
  handleSearchReplaceDoReplace,
  handleSearchReplaceDoReplaceAll,
  handleSearchReplaceToggleRegex,
  handleSearchReplaceTabField,
} from "./board-actions-search-replace.ts"

// Re-export for external consumers (Board.tsx callbacks)
export { updateLocalSearchMatches } from "./board-actions-find.ts"
export { updateSearchReplaceMatches } from "./board-actions-search-replace.ts"

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
  const { exit } = ctx
  const col = ctx.column
  const card = ctx.card

  switch (action.type) {
    // === TUI-specific actions ===
    case "QUIT":
      exit()
      return ok()
    case "SHOW_NEW_ITEM_DIALOG":
      pushDialogMode("dialog:newItem")
      ctx.closeDetailPane()
      ctx.setUI({
        showNewItemDialog: true,
      })
      clearSelection(ctx)
      return ok()
    case "SHOW_ITEM_PICKER":
      // Allow item picker in empty panes (no card required) or when a card is selected
      if (card || ctx.focusedPaneViewType() === "empty") {
        pushDialogMode("dialog:picker")
        ctx.closeDetailPane()
        ctx.setUI({
          activePicker: { type: "project" },
        })
        clearSelection(ctx)
      }
      return ok()
    case "SHOW_TASK_DIALOG":
      // Stub: task properties dialog — not yet implemented
      ctx.toastQueue.info("Task dialog not yet implemented")
      ctx.setUI({})
      return ok()
    case "SHOW_SEARCH_DIALOG":
      pushDialogMode("dialog:search")
      ctx.closeDetailPane()
      ctx.setUI({
        showSearchDialog: true,
        searchDialogInitialInput: "",
        searchScope: "all",
        searchScopeNodeIds: ctx.cursorNodeId ? [ctx.cursorNodeId] : [],
      })
      clearSelection(ctx)
      return ok()
    case "CURSOR_TO":
      handleCursorTo(ctx, action.locationKey)
      return ok()
    case "REPARENT_TO":
      return handleReparentTo(ctx, action.locationKey)
    case "LINK_TO":
      return handleLinkTo(ctx, action.locationKey)
    case "CREATE_AT":
      return handleCreateAt(ctx, action.locationKey)
    case "ADD_LINK":
      // Stub: link picker not yet implemented
      ctx.toastQueue.info("Link picker not yet implemented")
      ctx.setUI({})
      return ok()
    case "REPARENT_PICKER":
      ctx.setUI({ activePicker: { type: "project" } })
      return ok()
    case "JUMP_TO_COLUMN":
      return handleJumpToColumn(ctx, action.columnNumber)
    case "ENTER_INLINE_EDIT": {
      // P1 fix (km-tui.keys-as-text): Suppress edit mode entry if a dialog was
      // just confirmed. When the user presses Enter to select a search result,
      // the Enter can propagate (in the same event batch or via rapid double-tap)
      // to the newly-focused card, triggering edit mode. Subsequent navigation
      // keys then corrupt the card title instead of navigating.
      if (isDialogConfirmGracePeriod()) {
        log.debug?.("ENTER_INLINE_EDIT suppressed: dialog confirm grace period")
        return ok()
      }
      // Virtual metadata rows in the detail pane are not editable nodes
      if (action.nodeId?.startsWith(DETAIL_META_PREFIX)) {
        log.debug?.("ENTER_INLINE_EDIT suppressed: virtual metadata row")
        return ok()
      }
      ctx.setUI({
        inlineEditBlock: {
          nodeId: action.nodeId,
          blockIndex: action.blockIndex ?? 0,
        },
      })
      return ok()
    }
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
      ctx.navigator.clearStickyY()
      ctx.setUI((prev) => {
        const modes: ViewMode[] = ["cards", "columns", /* "list", */ "tabs"]
        const idx = modes.indexOf(prev.viewMode)
        return { viewMode: modes[(idx + 1) % modes.length] ?? "cards" }
      })
      return ok()
    case "CYCLE_ICON_STYLE": {
      ctx.setUI((prev) => {
        const iconStyles = ["nerdfont", "workflowy", "regular"] as const
        const borderModes = ["normal", "black"] as const
        const iconIdx = iconStyles.indexOf(prev.iconStyle)
        const borderIdx = borderModes.indexOf(prev.borderMode)
        // Cycle: increment icon first, when it wraps, advance border
        const nextIconIdx = (iconIdx + 1) % iconStyles.length
        const nextBorderIdx = nextIconIdx === 0 ? (borderIdx + 1) % borderModes.length : borderIdx
        const nextIcon = iconStyles[nextIconIdx] ?? "nerdfont"
        const nextBorder = borderModes[nextBorderIdx] ?? "normal"
        const label = nextBorder === "black" ? `${nextIcon} (dark borders)` : nextIcon
        return {
          iconStyle: nextIcon,
          borderMode: nextBorder,
          status: { level: "info" as const, message: `Style: ${label}` },
        }
      })
      return ok()
    }
    case "SHOW_HELP":
      ctx.setUI({ showHelp: true, helpScrollOffset: 0 })
      return ok()
    case "HIDE_HELP":
      ctx.setUI({ showHelp: false, helpScrollOffset: 0 })
      return ok()
    case "HELP_SCROLL_UP":
      ctx.setUI((prev) => ({ helpScrollOffset: Math.max(0, prev.helpScrollOffset - 1) }))
      return ok()
    case "HELP_SCROLL_DOWN":
      ctx.setUI((prev) => ({ helpScrollOffset: prev.helpScrollOffset + 1 }))
      return ok()
    case "CLOSE_DETAIL_PANE": {
      const boardPane = ownerPaneId(ctx.focusedPaneId())
      ctx.closeDetailPane()
      ctx.focusPaneById(boardPane)
      ctx.syncFocusScope()
      return ok()
    }
    case "FOCUS_BOARD": {
      const boardPane = ownerPaneId(ctx.focusedPaneId())
      ctx.focusPaneById(boardPane)
      ctx.syncFocusScope()
      return ok()
    }
    case "FOCUS_DETAIL": {
      if (!ctx.hasDetailPane) {
        ctx.openDetailPane()
      }
      const detailPane = detailPaneIdFor(ownerPaneId(ctx.focusedPaneId()))
      ctx.focusPaneById(detailPane)
      ctx.syncFocusScope()
      return ok()
    }
    case "TOGGLE_DETAIL_PANE": {
      const boardPaneId = ownerPaneId(ctx.focusedPaneId())
      const wasOpen = ctx.hasDetailPane
      ctx.toggleDetailPane()
      // Opening → focus the detail pane; Closing → focus the board pane
      if (!wasOpen) {
        ctx.focusPaneById(detailPaneIdFor(boardPaneId))
      } else {
        ctx.focusPaneById(boardPaneId)
      }
      ctx.syncFocusScope()
      return ok()
    }
    case "ZOOM_OUTWARDS":
      return handleZoomOutwards(ctx)
    case "ZOOM_TO_ROOT":
      return handleZoomToRoot(ctx)
    case "DELETE_NODE":
      handleDeleteNode(ctx)
      return ok()
    case "SELECT_ALL":
      progressiveSelectAll(ctx)
      return ok()

    // === Task actions ===
    case "TASK_SET_STATUS":
      handleTaskStatusCycle(ctx)
      return ok()
    case "CLEAR_TASK":
      handleClearTask(ctx)
      return ok()

    // === History actions (undo/redo) ===
    case "HISTORY_UNDO": {
      if (!ctx.undoHandle.canUndo()) return boundary("undo", "Nothing to undo")
      const result = ctx.undoHandle.undo()
      // Restore cursor to saved position if available, otherwise keep current
      const cursorNodeId = result.ok && result.cursorNodeId != null ? result.cursorNodeId : ctx.cursorNodeId
      ctx.dispatchBoard({ type: "SELECT", nodeId: cursorNodeId })
      if (result.label) ctx.setUI({ status: { level: "info", message: `Undo: ${result.label}` } })
      return ok()
    }
    case "HISTORY_REDO": {
      if (!ctx.undoHandle.canRedo()) return boundary("redo", "Nothing to redo")
      const result = ctx.undoHandle.redo()
      ctx.dispatchBoard({ type: "SELECT", nodeId: ctx.cursorNodeId })
      if (result.label) ctx.setUI({ status: { level: "info", message: `Redo: ${result.label}` } })
      return ok()
    }

    // === Board/navigation actions (scope-aware) ===
    case "CURSOR_MOVE":
      // Navigate-away saves: confirm inline edit before moving cursor.
      // Calling confirm() saves the value and exits inline edit mode.
      // This fires synchronously before navigation so React picks up
      // both the repo mutation and cursor change in the same render.
      if (ctx.ui.inlineEditBlock && activeEditTargetRef.current) {
        activeEditTargetRef.current.confirm()
      }
      return handleCursorMove(ctx, action.dir)
    case "TOGGLE_FOLD":
      return handleToggleFold(ctx)
    case "FOLD_LEVEL": {
      const newDepths = new Map(ctx.foldDepths)
      for (const column of ctx.columns) for (const c of column.cardNodes) newDepths.set(c.id, 0)
      ctx.setFoldDepths(newDepths)
      return ok()
    }
    case "UNFOLD_LEVEL": {
      const newDepths = new Map(ctx.foldDepths)
      for (const column of ctx.columns) for (const c of column.cardNodes) newDepths.delete(c.id)
      ctx.setFoldDepths(newDepths)
      return ok()
    }
    case "TOGGLE_COLLAPSE": {
      // Collapse the column (not the card) — use column node ID
      const collapseNodeId = col?.node.id
      if (!collapseNodeId) return boundary("collapse", "No column to collapse")
      // Virtual body columns (synthetic __body__ IDs) don't exist in the repo
      // and cannot be collapsed — return boundary to ring the bell.
      if (collapseNodeId.startsWith("__body__")) return boundary("collapse", "Body column cannot be collapsed")
      const wasCollapsed = ctx.collapsedNodes?.has(collapseNodeId) ?? false
      // Record cursor for undo
      ctx.undoHandle.setCursor(ctx.cursorNodeId)
      // Persist collapsed state to node.data so it survives across sessions
      const colNode = ctx.repo.getNode(collapseNodeId)
      if (colNode) {
        const existingData = colNode.data
        if (!wasCollapsed) {
          ctx.repo.updateNode(collapseNodeId, { data: { ...existingData, collapsed: true } })
        } else {
          // Remove the collapsed key to keep data clean
          const { collapsed: _, ...rest } = existingData
          ctx.repo.updateNode(collapseNodeId, { data: rest })
        }
      }
      ctx.dispatchBoard({ type: "TOGGLE_COLLAPSE", nodeId: collapseNodeId })
      // When collapsing, move cursor to column header so it's on a visible element.
      // Without this, the cursor stays on an invisible card inside the collapsed column,
      // causing the column to not show as selected and j/k to behave unexpectedly.
      if (!wasCollapsed && ctx.cursorNodeId !== collapseNodeId) {
        ctx.dispatchBoard({ type: "SELECT", nodeId: collapseNodeId })
      }
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

    // === Visual mode ===
    case "VISUAL_MODE_ENTER": {
      if (!ctx.cursorNodeId) return boundary("visual", "no cursor")
      // Set visual mode with anchor at current cursor, and select the anchor node
      const anchorKey = makeSelectionKey(ctx.cursorNodeId)
      const selected = new Set(ctx.ui.multiSelected)
      selected.add(anchorKey)
      ctx.setUI({
        visualMode: true,
        visualAnchor: ctx.cursorNodeId,
        selectionAnchor: { nodeId: ctx.cursorNodeId },
        multiSelected: selected,
        status: { level: "info", message: "-- VISUAL --" },
      })
      return ok()
    }
    case "VISUAL_MODE_EXIT":
      clearSelection(ctx)
      ctx.setUI({
        visualMode: false,
        visualAnchor: null,
        status: null,
      })
      return ok()

    // === BoardAction passthrough (forward to board reducer) ===
    case "SELECT":
      // Reset scroll anchor so viewport snaps back to follow cursor
      if (ctx.ui.columnScrollAnchor !== null) {
        ctx.setUI({ columnScrollAnchor: null })
      }
      ctx.dispatchBoard(action)
      return ok()
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
    case "INCREASE_CONTENT_LINES": {
      ctx.setUI((prev) => {
        const next = Math.min(10, prev.maxContentLines + 1)
        return {
          maxContentLines: next,
          status: { level: "info" as const, message: `Content lines: ${next}` },
        }
      })
      return ok()
    }
    case "DECREASE_CONTENT_LINES": {
      ctx.setUI((prev) => {
        const next = Math.max(1, prev.maxContentLines - 1)
        return {
          maxContentLines: next,
          status: { level: "info" as const, message: `Content lines: ${next}` },
        }
      })
      return ok()
    }
    case "SHIFT_UP":
      return handleShiftCard(ctx, "up")
    case "SHIFT_DOWN":
      return handleShiftCard(ctx, "down")
    case "SHIFT_LEFT":
      return handleShiftCard(ctx, "left")
    case "SHIFT_RIGHT":
      return handleShiftCard(ctx, "right")

    // === Selection actions (passthrough to board reducer) ===
    case "SELECT_NODE_ADD":
    case "SELECT_NODE_REMOVE":
    case "SELECT_NODE_TOGGLE":
      ctx.dispatchBoard(action)
      return ok()

    // === Selection actions (not yet implemented) ===
    case "SELECT_ALL_SIBLINGS":
      return unimplemented("selection")

    // === Fold operations (depth-based progressive fold/unfold) ===
    // Visibility is driven by foldDepths: Map<string, number>.
    // depth 0 = fully folded, no entry = inherit parent's remaining depth, 999 = infinite.
    // MAX_FOLD_DEPTH caps how deep unfold can go (prevents runaway expansion).
    case "FOLD_NODE": {
      const newDepths = new Map(ctx.foldDepths)
      const boardDepth = newDepths.get(ctx.rootId ?? "") ?? 1

      // scope:"root" → modify the board-level depth directly
      if (action.scope === "root") {
        if (boardDepth <= 0) return boundary("fold", "already fully folded")
        newDepths.set(ctx.rootId ?? "", boardDepth - 1)
        // Clear per-card overrides so all cards inherit the new root depth
        for (const column of ctx.columns) {
          for (const c of column.cardNodes) newDepths.delete(c.id)
        }
        ctx.setFoldDepths(newDepths)
        return ok()
      }

      // Per-card fold: determine fold targets
      const roots = getFoldTargetRoots(ctx, card)
      if (roots.length === 0) return boundary("fold", "no card or column selected")
      let changed = false
      for (const nodeId of roots) {
        const current = newDepths.get(nodeId)
        if (current === 0) continue // already fully folded
        if (current === undefined) {
          // Inheriting from board root — decrement from inherited depth
          newDepths.set(nodeId, Math.max(0, boardDepth - 1))
          changed = true
        } else {
          newDepths.set(nodeId, Math.max(0, current - 1))
          changed = true
        }
      }
      if (!changed) return boundary("fold", "already fully folded")
      ctx.setFoldDepths(newDepths)
      return ok()
    }
    case "UNFOLD_NODE": {
      const newDepths = new Map(ctx.foldDepths)
      const boardDepth = newDepths.get(ctx.rootId ?? "") ?? 1

      // scope:"root" → modify the board-level depth directly
      if (action.scope === "root") {
        if (boardDepth >= MAX_FOLD_DEPTH) return boundary("fold", "maximum depth reached")
        newDepths.set(ctx.rootId ?? "", boardDepth + 1)
        // Clear per-card overrides so all cards inherit the new root depth
        for (const column of ctx.columns) {
          for (const c of column.cardNodes) newDepths.delete(c.id)
        }
        ctx.setFoldDepths(newDepths)
        return ok()
      }

      // Per-card unfold: determine targets
      const roots = getFoldTargetRoots(ctx, card)
      if (roots.length === 0) return boundary("fold", "no card or column selected")
      let changed = false
      for (const nodeId of roots) {
        const current = newDepths.get(nodeId)
        const effectiveDepth = current ?? boardDepth
        if (effectiveDepth >= MAX_FOLD_DEPTH) continue // already at max
        if (current === undefined) {
          // Inheriting from board root — increment from inherited depth
          newDepths.set(nodeId, boardDepth + 1)
          changed = true
        } else {
          newDepths.set(nodeId, current + 1)
          changed = true
        }
      }
      if (!changed) return boundary("fold", "maximum depth reached")

      ctx.setFoldDepths(newDepths)
      return ok()
    }
    case "UNFOLD_RECURSIVE": {
      if (!card) return boundary("fold", "no card selected")
      const newDepths = new Map(ctx.foldDepths)
      // Set depth to 999 (effectively infinite) for the card
      newDepths.set(card.id, 999)
      // Remove explicit depth entries for descendants so they inherit the parent's 999.
      // Instead of walking all descendants (can be 100k+ nodes), iterate foldDepths
      // entries (typically <20) and check ancestry via parent chain.
      const cardId = card.id
      for (const [id] of newDepths) {
        if (id === cardId) continue
        let nodeId: string | null = id
        while (nodeId) {
          const n = ctx.repo.getNode(nodeId)
          if (!n?.parent_id) break
          if (n.parent_id === cardId) {
            newDepths.delete(id)
            break
          }
          nodeId = n.parent_id
        }
      }
      ctx.setFoldDepths(newDepths)
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
    case "INSERT_CHILD":
      handleAddNodeChild(ctx)
      return ok()
    case "INSERT_AT_PARENT":
      handleAddNodeAtParent(ctx)
      return ok()
    case "DUPLICATE_NODE":
      handleDuplicateNode(ctx, action.nodeId)
      return ok()

    // === Filter ===
    case "SHOW_FILTER_DIALOG":
      if (ctx.ui.showFilterDialog) {
        popDialogMode()
      } else {
        pushDialogMode("dialog:filter")
      }
      ctx.closeDetailPane()
      ctx.setUI({
        showFilterDialog: !ctx.ui.showFilterDialog,
        inlineEditBlock: null,
      })
      return ok()
    case "SET_FILTER":
      popDialogMode()
      ctx.setUI({
        filterText: action.text,
        showFilterDialog: false,
      })
      return ok()
    case "CLEAR_FILTER":
      popDialogMode()
      ctx.setUI({
        filterText: "",
        filterProperties: createEmptyFilterProperties(),
        showFilterDialog: false,
      })
      return ok()
    case "TOGGLE_FILTER_PROPERTY": {
      const current = ctx.ui.filterProperties[action.category]
      const next = new Set(current)
      if (next.has(action.value)) {
        next.delete(action.value)
      } else {
        next.add(action.value)
      }
      ctx.setUI({
        filterProperties: { ...ctx.ui.filterProperties, [action.category]: next },
      })
      return ok()
    }
    case "CLEAR_FILTER_CATEGORY":
      ctx.setUI({
        filterProperties: { ...ctx.ui.filterProperties, [action.category]: new Set() },
      })
      return ok()
    case "CLEAR_ALL_FILTER_PROPERTIES":
      ctx.setUI({
        filterProperties: createEmptyFilterProperties(),
        filterCursorRow: 0,
        filterCursorVal: 0,
      })
      return ok()
    case "CLEAR_FILTERS":
      popDialogMode()
      ctx.setUI({
        filterText: "",
        filterProperties: createEmptyFilterProperties(),
        filterCursorRow: 0,
        filterCursorVal: 0,
        showFilterDialog: false,
      })
      return ok()
    case "TOGGLE_HIDE_DONE": {
      const activeStatuses = new Set(["todo", "wip", "blocked"])
      const current = ctx.ui.filterProperties.taskStatus
      // If currently showing only active (hiding done), toggle off → show all
      const isHidingDone = current.size === activeStatuses.size && [...activeStatuses].every((s) => current.has(s))
      const nextTaskStatus = isHidingDone ? new Set<string>() : activeStatuses
      ctx.setUI({
        filterProperties: { ...ctx.ui.filterProperties, taskStatus: nextTaskStatus },
        status: {
          level: "info" as const,
          message: isHidingDone ? "Showing all tasks" : "Hiding done/dropped tasks",
        },
      })
      return ok()
    }

    // === Command palette (omnibox) ===
    case "COMMAND_PALETTE":
      if (ctx.ui.showOmnibox) {
        // Already open — close (toggle behavior)
        popDialogMode()
        ctx.setUI({ showOmnibox: false })
      } else {
        pushDialogMode("dialog:omnibox")
        ctx.setUI({ showOmnibox: true })
        clearSelection(ctx)
      }
      return ok()

    // === Local find (inline search bar) ===
    case "LOCAL_FIND_OPEN":
      return handleLocalFindOpen(ctx)
    case "LOCAL_FIND_NEXT":
      return handleLocalFindNext(ctx)
    case "LOCAL_FIND_PREV":
      return handleLocalFindPrev(ctx)
    case "LOCAL_FIND_CLOSE":
      ctx.setUI({ localSearch: null })
      return ok()
    case "LOCAL_FIND_CONFIRM":
      // Close input but keep matches for n/N navigation
      if (ctx.ui.localSearch) {
        ctx.setUI({
          localSearch: { ...ctx.ui.localSearch, isInputActive: false },
        })
      }
      return ok()

    // === Search & replace dialog ===
    case "SEARCH_REPLACE_OPEN":
      return handleSearchReplaceOpen(ctx)
    case "SEARCH_REPLACE_CLOSE":
      ctx.setUI({ searchReplace: null })
      return ok()
    case "SEARCH_REPLACE_NEXT":
      return handleSearchReplaceNext(ctx)
    case "SEARCH_REPLACE_PREV":
      return handleSearchReplacePrev(ctx)
    case "SEARCH_REPLACE_DO_REPLACE":
      return handleSearchReplaceDoReplace(ctx)
    case "SEARCH_REPLACE_DO_REPLACE_ALL":
      return handleSearchReplaceDoReplaceAll(ctx)
    case "SEARCH_REPLACE_TOGGLE_REGEX":
      return handleSearchReplaceToggleRegex(ctx)
    case "FOCUS_NEXT":
    case "FOCUS_PREV":
      return handleSearchReplaceTabField(ctx)

    // === UI stubs (future features) ===
    case "ARCHIVE_NODE":
    case "CAPTURE":
    case "SETTINGS":
      return unimplemented("ui")
    case "MANAGE_FAVORITES":
      pushDialogMode("dialog:favorites")
      ctx.setUI({ showFavoritesDialog: true, favoritesSelectedKey: null })
      clearSelection(ctx)
      return ok()
    case "FAVORITES_SELECT_KEY":
      return handleFavoritesSelectKey(ctx, action.key)
    case "FAVORITES_ASSIGN":
      return handleFavoritesAssign(ctx)
    case "FAVORITES_CLEAR":
      return handleFavoritesClear(ctx)
    case "FAVORITES_BACK":
      ctx.setUI({ favoritesSelectedKey: null })
      return ok()

    // === Property actions ===
    case "SET_DUE_DATE":
      return handleSetDatePrompt(ctx, "due_at")
    case "SET_START_DATE":
      return handleSetDatePrompt(ctx, "start_at")
    case "SET_RECURRING":
      return handleSetDatePrompt(ctx, "rrule")
    case "SET_PRIORITY":
      return handleSetPriority(ctx)
    case "SET_PRIORITY_0":
      return handleSetPriority(ctx, "P0")
    case "SET_PRIORITY_1":
      return handleSetPriority(ctx, "P1")
    case "SET_PRIORITY_2":
      return handleSetPriority(ctx, "P2")
    case "SET_PRIORITY_3":
      return handleSetPriority(ctx, "P3")
    case "SET_PRIORITY_4":
      return handleSetPriority(ctx, "P4")
    case "DATE_PROMPT_CONFIRM":
      return handleDatePromptConfirm(ctx)
    case "DATE_PROMPT_CANCEL":
      popDialogMode()
      ctx.setUI({ datePrompt: null })
      return ok()

    // === Clipboard operations ===
    case "CLIPBOARD_COPY":
      return handleClipboardCopy(ctx, "copy")
    case "CLIPBOARD_CUT":
      return handleClipboardCopy(ctx, "cut")
    case "CLIPBOARD_PASTE":
      return handleClipboardPaste(ctx)

    // === Property pickers ===
    case "SET_LABEL":
      pushDialogMode("dialog:picker")
      ctx.closeDetailPane()
      ctx.setUI({ activePicker: { type: "tag" } })
      clearSelection(ctx)
      return ok()
    case "SET_ASSIGNEE":
      pushDialogMode("dialog:picker")
      ctx.closeDetailPane()
      ctx.setUI({ activePicker: { type: "assignee" } })
      clearSelection(ctx)
      return ok()

    // === Move mode actions ===
    // Commands return minimal actions; TUI augments with context before dispatching
    case "ENTER_MOVE_MODE": {
      // SelectionKey IS nodeId — direct conversion
      const nodeIds: string[] = []
      if (ctx.ui.multiSelected.size > 0) {
        for (const selKey of ctx.ui.multiSelected) {
          if (selKey && !nodeIds.includes(selKey)) {
            nodeIds.push(selKey)
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

    // === Text editing actions (dispatched to EditTarget via activeEditTargetRef) ===
    // Read from shared ref directly (not ActionCtx snapshot) because
    // the target is set by useEffect after render.
    case "TEXT_INSERT": {
      const insertTarget = activeEditTargetRef.current
      insertTarget?.insertChar(action.char)
      // Prefix conversion: after typing space, check if content matches a markdown prefix
      if (action.char === " " && insertTarget && ctx.ui.inlineEditBlock) {
        const content = insertTarget.getContent()
        const conversion = detectPrefixConversion(content)
        if (conversion) {
          const nodeId = ctx.ui.inlineEditBlock.nodeId
          const node = ctx.repo.getNode(nodeId)
          if (node) {
            const remainingText = content.slice(conversion.prefixLength)
            ctx.undoHandle.setCursor(ctx.cursorNodeId)
            // Build repo update with type change + correctly formatted content
            const changes: Partial<typeof node> = { ...conversion.nodeChanges }
            // Set content formatted for the new type
            if (isOutline(changes.type ?? node.type, changes.item ?? node.item)) {
              changes.name = remainingText
              changes.content = remainingText
            } else if (changes.task_marker) {
              // Task: format content with checkbox prefix
              const fakeNode = { ...node, ...changes } as typeof node
              changes.content = setNodeText(fakeNode, remainingText)
              // Ensure item flag is set for tasks
              if (!changes.type) changes.type = "p"
              if (changes.item === undefined) changes.item = true
            } else {
              changes.content = remainingText
            }
            // Clear fields that don't apply to the new type
            if (changes.type && !isOutline(changes.type, changes.item) && isOutline(node.type, node.item)) {
              changes.name = undefined
              changes.fstype = undefined
            }
            if (changes.type && !isListItem(changes.type, changes.item) && isListItem(node.type, node.item)) {
              changes.list_marker = undefined
            }
            ctx.repo.updateNode(nodeId, changes)
            // Update edit field to show remaining text (prefix stripped)
            insertTarget.replaceContent?.(remainingText, remainingText.length)
          }
        }
      }
      return ok()
    }
    case "TEXT_DELETE_BACKWARD": {
      const bsTarget = activeEditTargetRef.current
      if (bsTarget && ctx.ui.inlineEditBlock && bsTarget.getCursorOffset() === 0) {
        const nodeId = ctx.ui.inlineEditBlock.nodeId
        const content = bsTarget.getContent()
        if (content === "") {
          // Empty node: delete it
          ctx.setUI({ inlineEditBlock: null })
          executeDelete(ctx, nodeId)
          return ok()
        }
        // Backspace degradation: strip traits/type before merging
        const node = ctx.repo.getNode(nodeId)
        if (node) {
          const degradation = backspaceDegradation(node)
          if (degradation) {
            ctx.undoHandle.setCursor(ctx.cursorNodeId)
            applyDegradation(node, degradation, content)
            ctx.repo.updateNode(nodeId, degradation)
            ctx.dispatchBoard({ type: "SELECT", nodeId: ctx.cursorNodeId })
            return ok()
          }
          // No degradation possible (plain p) → merge with previous
          bsTarget.save()
          ctx.undoHandle.setCursor(ctx.cursorNodeId)
          ctx.undoHandle.startBatch("Merge backward")
          const result = mergeWithPrevious(ctx.repo, nodeId)
          ctx.undoHandle.endBatch()
          if (result) {
            ctx.setUI({ inlineEditBlock: null })
            ctx.dispatchBoard({ type: "SELECT", nodeId: ctx.cursorNodeId })
          }
          return ok()
        }
      }
      bsTarget?.deleteBackward()
      return ok()
    }
    case "TEXT_DELETE_FORWARD": {
      const fwdTarget = activeEditTargetRef.current
      if (fwdTarget && ctx.ui.inlineEditBlock) {
        const content = fwdTarget.getContent()
        const cursor = fwdTarget.getCursorOffset()
        if (content === "" && cursor === 0) {
          // Empty node: delete it (same as backspace-on-empty)
          const nodeId = ctx.ui.inlineEditBlock.nodeId
          ctx.setUI({ inlineEditBlock: null })
          executeDelete(ctx, nodeId)
        } else if (cursor >= content.length) {
          // At end of content: degrade next sibling's traits before merging
          const nodeId = ctx.ui.inlineEditBlock.nodeId
          const nextNode = getNextSibling(ctx.repo, nodeId)
          if (nextNode) {
            const degradation = backspaceDegradation(nextNode)
            if (degradation) {
              // Strip next node's traits progressively (task → type → merge)
              ctx.undoHandle.setCursor(ctx.cursorNodeId)
              applyDegradation(nextNode, degradation, getNodeText(nextNode))
              ctx.repo.updateNode(nextNode.id, degradation)
              ctx.dispatchBoard({ type: "SELECT", nodeId: ctx.cursorNodeId })
              return ok()
            }
          }
          // No next sibling or next is already plain p → merge
          fwdTarget.save()
          ctx.undoHandle.setCursor(ctx.cursorNodeId)
          ctx.undoHandle.startBatch("Merge forward")
          const result = mergeWithNext(ctx.repo, nodeId)
          ctx.undoHandle.endBatch()
          if (result) {
            // Exit edit mode — the merged content is visible on the card.
            // Staying in edit mode would require remounting InlineEditField
            // since the content changed but the nodeId didn't.
            ctx.setUI({ inlineEditBlock: null })
            ctx.dispatchBoard({ type: "SELECT", nodeId: ctx.cursorNodeId })
          }
        } else {
          fwdTarget.deleteForward()
        }
      }
      return ok()
    }
    case "TEXT_CURSOR_LEFT":
      activeEditTargetRef.current?.cursorLeft()
      return ok()
    case "TEXT_CURSOR_RIGHT":
      activeEditTargetRef.current?.cursorRight()
      return ok()
    case "TEXT_CURSOR_UP": {
      const moved = activeEditTargetRef.current?.cursorUp() ?? false
      if (!moved) return handleEditBlockNavigate(ctx, "up")
      return ok()
    }
    case "TEXT_CURSOR_DOWN": {
      const moved = activeEditTargetRef.current?.cursorDown() ?? false
      if (!moved) return handleEditBlockNavigate(ctx, "down")
      return ok()
    }
    case "TEXT_CURSOR_START":
      activeEditTargetRef.current?.cursorStart()
      return ok()
    case "TEXT_CURSOR_END":
      activeEditTargetRef.current?.cursorEnd()
      return ok()
    case "TEXT_DELETE_WORD":
      activeEditTargetRef.current?.deleteWord()
      return ok()
    case "TEXT_DELETE_TO_START":
      activeEditTargetRef.current?.deleteToStart()
      return ok()
    case "TEXT_DELETE_TO_END":
      activeEditTargetRef.current?.deleteToEnd()
      return ok()
    case "TEXT_CONFIRM": {
      // Enter in detail pane or dialog: save and exit.
      const target = activeEditTargetRef.current
      if (target) target.save()
      if (ctx.ui.inlineEditBlock) ctx.setUI({ inlineEditBlock: null })
      return ok()
    }
    case "TEXT_LINEBREAK_SPLIT":
      return handleLinebreakSplit(ctx)
    case "TEXT_LINEBREAK_BEFORE": {
      activeEditTargetRef.current?.save()
      handleLinebreakSibling(ctx, "before")
      return ok()
    }
    case "TEXT_LINEBREAK_AFTER": {
      activeEditTargetRef.current?.save()
      handleLinebreakSibling(ctx, "after")
      return ok()
    }
    case "TEXT_LINEBREAK_CHILD": {
      // Enter at end of title with visible children → insert as FIRST child
      // (right after the title, like outliner flow)
      activeEditTargetRef.current?.save()
      handleAddNodeChildFirst(ctx)
      return ok()
    }
    case "TEXT_CHILD_BLOCK": {
      // Shift+Enter → add child at end (same as normal "add child" command)
      activeEditTargetRef.current?.save()
      handleAddNodeChild(ctx)
      return ok()
    }
    case "TEXT_EXIT_EDIT": {
      const target = activeEditTargetRef.current
      if (ctx.ui.inlineEditBlock) {
        // Escape saves and exits: save() persists content synchronously via
        // handleTitleSave (repo.updateNode), then we exit edit mode.
        // We use save() (not confirm()) because confirm → handleInlineEditConfirm
        // goes through the async jobRunner path for renames, which doesn't
        // complete before the React render cycle.
        target?.save()
        ctx.setUI({ inlineEditBlock: null })
      } else {
        // Dialog text input (date prompt, etc.): cancel the dialog
        target?.cancel()
      }
      return ok()
    }
    case "TEXT_BOLD":
    case "TEXT_ITALIC":
      // Stub: rich text formatting — not yet implemented (needs rich text editor)
      return unimplemented("text.formatting")
    case "TEXT_YANK":
      // Stub: yank (paste kill ring) — not yet implemented
      return unimplemented("text.yank")

    // === Pane operations (windowing) ===
    case "PANE_SPLIT": {
      // "split vertical" = divider is vertical = panes side by side = layout direction "h"
      // "split horizontal" = divider is horizontal = panes stacked = layout direction "v"
      const layoutDir = action.direction === "vertical" ? "h" : "v"
      ctx.splitFocusedPane(layoutDir)
      return ok()
    }
    case "PANE_CLOSE": {
      ctx.closeFocusedPane()
      return ok()
    }
    case "PANE_FOCUS": {
      ctx.focusPaneInDirection(action.direction)
      ctx.syncFocusScope()
      return ok()
    }
    case "PANE_FOCUS_PREVIOUS": {
      ctx.focusPreviousPane()
      ctx.syncFocusScope()
      return ok()
    }
    case "PANE_FOCUS_CYCLE": {
      ctx.cyclePaneFocus(action.direction)
      ctx.syncFocusScope()
      return ok()
    }
    case "PANE_FOCUS_NUMBER": {
      ctx.focusPaneByNumber(action.number)
      ctx.syncFocusScope()
      return ok()
    }
    case "PANE_RESIZE": {
      ctx.resizeFocusedPane(action.delta, "h")
      return ok()
    }
    case "PANE_RESIZE_VERTICAL": {
      ctx.resizeFocusedPane(action.delta, "v")
      return ok()
    }
    case "PANE_EQUALIZE": {
      ctx.equalizePanes()
      return ok()
    }
    case "PANE_ZOOM": {
      ctx.zoomFocusedPane()
      return ok()
    }
    case "PANE_ONLY": {
      ctx.closeAllButFocused()
      return ok()
    }
    case "PANE_SWAP": {
      ctx.swapPaneInDirection(action.direction)
      return ok()
    }
    case "PANE_SPLIT_AND_PICK": {
      // Split vertical (side by side) then show item picker in the new (empty) pane
      ctx.splitFocusedPane("h")
      // Focus moves to the new pane on next cycle; for now, show the item picker
      // which will navigate when the user picks a board
      pushDialogMode("dialog:picker")
      ctx.closeDetailPane()
      ctx.setUI({
        activePicker: { type: "project" },
      })
      clearSelection(ctx)
      return ok()
    }

    // === Dialog navigation (dispatched to active dialog via dialogTargetRef) ===
    // Filter dialog handles nav/confirm/cancel directly via state, not dialogTargetRef
    case "DIALOG_NAV_UP":
      if (ctx.ui.showFilterDialog) {
        ctx.setUI((prev) => ({
          filterCursorRow: Math.max(prev.filterCursorRow - 1, 0),
          filterCursorVal: 0,
        }))
        return ok()
      }
      dialogTargetRef.current?.navUp()
      return ok()
    case "DIALOG_NAV_DOWN":
      if (ctx.ui.showFilterDialog) {
        ctx.setUI((prev) => ({
          filterCursorRow: Math.min(prev.filterCursorRow + 1, VIEW_DIALOG_ROWS.length - 1),
          filterCursorVal: 0,
        }))
        return ok()
      }
      dialogTargetRef.current?.navDown()
      return ok()
    case "DIALOG_NAV_LEFT":
      if (ctx.ui.showFilterDialog) {
        ctx.setUI((prev) => ({
          filterCursorVal: Math.max(prev.filterCursorVal - 1, 0),
        }))
      }
      return ok()
    case "DIALOG_NAV_RIGHT":
      if (ctx.ui.showFilterDialog) {
        const row = VIEW_DIALOG_ROWS[ctx.ui.filterCursorRow]
        if (row) {
          ctx.setUI((prev) => ({
            filterCursorVal: Math.min(prev.filterCursorVal + 1, row.values.length - 1),
          }))
        }
      }
      return ok()
    case "DIALOG_CONFIRM": {
      if (ctx.ui.showFilterDialog) {
        const row = VIEW_DIALOG_ROWS[ctx.ui.filterCursorRow]
        const val = row?.values[ctx.ui.filterCursorVal]
        if (row && val) {
          if (row.kind === "radio") {
            // Radio: set the value directly
            if (row.key === "viewMode") {
              ctx.navigator.clearStickyY()
              ctx.setUI({ viewMode: val.value as ViewMode })
            } else {
              ctx.setUI({ [row.key]: val.value as IconStyle })
            }
          } else {
            // Checkbox: toggle filter property
            const current = ctx.ui.filterProperties[row.category]
            const next = new Set(current)
            if (next.has(val.value)) {
              next.delete(val.value)
            } else {
              next.add(val.value)
            }
            ctx.setUI({
              filterProperties: { ...ctx.ui.filterProperties, [row.category]: next },
            })
          }
        }
        return ok()
      }
      // P1 fix (km-tui.keys-as-text): Mark that a dialog was just confirmed.
      // This prevents the Enter key from propagating to trigger ENTER_INLINE_EDIT
      // on the newly-focused card within the same event batch or rapid double-tap.
      markDialogConfirmed()
      popDialogMode()
      if (dialogTargetRef.current) {
        dialogTargetRef.current.confirm()
      } else if (activeEditTargetRef.current) {
        log.warn?.("DIALOG_CONFIRM: dialogTargetRef null, falling back to activeEditTargetRef")
        activeEditTargetRef.current.confirm()
      } else {
        log.warn?.("DIALOG_CONFIRM: both refs null, force-closing dialogs")
        if (ctx.ui.datePrompt) ctx.setUI({ datePrompt: null })
        else if (ctx.ui.showSearchDialog) ctx.setUI({ showSearchDialog: false })
        else if (ctx.ui.showNewItemDialog) ctx.setUI({ showNewItemDialog: false })
        else if (ctx.ui.activePicker) ctx.setUI({ activePicker: null })
      }
      return ok()
    }
    case "DIALOG_CANCEL":
      if (ctx.ui.showFavoritesDialog) {
        popDialogMode()
        ctx.setUI({ showFavoritesDialog: false, favoritesSelectedKey: null })
        return ok()
      }
      if (ctx.ui.showFilterDialog) {
        popDialogMode()
        ctx.setUI({ showFilterDialog: false })
        return ok()
      }
      popDialogMode()
      if (dialogTargetRef.current) {
        dialogTargetRef.current.cancel()
      } else if (activeEditTargetRef.current) {
        log.warn?.("DIALOG_CANCEL: dialogTargetRef null, falling back to activeEditTargetRef")
        activeEditTargetRef.current.cancel()
      } else {
        log.warn?.("DIALOG_CANCEL: both refs null, force-closing dialogs")
        if (ctx.ui.datePrompt) ctx.setUI({ datePrompt: null })
        else if (ctx.ui.showSearchDialog) ctx.setUI({ showSearchDialog: false })
        else if (ctx.ui.showNewItemDialog) ctx.setUI({ showNewItemDialog: false })
        else if (ctx.ui.activePicker) ctx.setUI({ activePicker: null })
      }
      return ok()

    case "TOGGLE_SEARCH_SCOPE":
      ctx.setUI((prev) => ({
        searchScope: prev.searchScope === "all" ? "selected" : "all",
      }))
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
    case "SYNC_PANE_TOGGLE":
      ctx.setUI((prev) => ({ showSyncPane: !prev.showSyncPane }))
      return ok()
    case "SYNC_PANE_CLOSE":
      ctx.setUI({ showSyncPane: false })
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

    case "INCREASE_OUTLINE_DEPTH":
    case "DECREASE_OUTLINE_DEPTH":
      // Outline depth changes are handled by view-level reducers
      return ok()
    case "DEV_TEST_TOAST":
      ctx.toastQueue.info("Test toast from DEV_TEST_TOAST action")
      ctx.setUI({})
      return ok()

    default:
      assertNever(action)
  }
}

// =============================================================================
// Helper Functions (local to this file)
// =============================================================================

/** Enter at start/end of title → insert sibling before/after using the node's actual parent. */
function handleLinebreakSibling(ctx: ActionCtx, position: "before" | "after"): void {
  const { repo } = ctx
  const edit = ctx.ui.inlineEditBlock
  if (!edit) return

  const nodeId = edit.nodeId
  const node = repo.getNode(nodeId)
  if (!node?.parent_id) return

  const parentId = node.parent_id
  const siblings = repo.getChildren(parentId)
  const sibIdx = siblings.findIndex((s) => s.id === nodeId)
  if (sibIdx === -1) return

  const currentNode = siblings[sibIdx]
  if (!currentNode) return
  const currentIdx = currentNode.parent_idx ?? 0
  const adjacent = siblings[sibIdx + (position === "after" ? 1 : -1)]
  const adjacentIdx = adjacent?.parent_idx ?? currentIdx + (position === "after" ? 1 : -1)
  const newSortOrder = (currentIdx + adjacentIdx) / 2

  const isCurrentTask = currentNode.task_marker !== undefined
  const newNode: Partial<KNode> = {
    type: isCurrentTask ? "p" : "h",
    item: true,
    content: "",
    parent_idx: newSortOrder,
  }
  if (isCurrentTask) {
    newNode.task_status = "todo"
    newNode.task_marker = "[ ]"
    newNode.list_marker = currentNode.list_marker ?? "-"
  } else {
    newNode.fstype = "mdsection"
  }

  ctx.undoHandle.setCursor(nodeId)
  const newId = repo.addNode(parentId, newNode)
  ctx.dispatchBoard({ type: "SELECT", nodeId: newId })
  ctx.setUI({ inlineEditBlock: { nodeId: newId, blockIndex: 0 } })
}

/** Enter in inline edit — split node at cursor position, adjusting for task markers and body blocks.
 *  Title split with visible children: after-portion becomes first child (not sibling).
 *  Title split without children / body block split: after-portion becomes sibling after. */
function handleLinebreakSplit(ctx: ActionCtx): ActionResult {
  const edit = ctx.ui.inlineEditBlock
  if (!edit) return ok()

  const editTarget = activeEditTargetRef.current
  if (!editTarget) return ok()

  const editOffset = editTarget.getCursorOffset()
  editTarget.save()

  // Resolve to body child node if editing a body block
  let nodeId: string = edit.nodeId
  const isBodyBlock = edit.blockIndex > 0
  if (isBodyBlock) {
    const body = extractBody(ctx.repo.getChildren(edit.nodeId)).body
    const child = body[edit.blockIndex - 1]
    if (!child) return ok()
    nodeId = child.id
  }

  let node = ctx.repo.getNode(nodeId)
  if (!node) return ok()

  // Materialize content for folder nodes (title stored as data.name, not content field).
  // Without this, splitNode/splitAsChild would operate on empty string.
  if (node.content == null) {
    const editText = editTarget.getContent()
    ctx.repo.updateNode(nodeId, { content: editText })
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- just updated the node, it exists
    node = ctx.repo.getNode(nodeId)!
  }

  // Adjust offset for task markers (e.g., "[ ] " prefix hidden from edit field)
  const { marker } = extractTitleTaskMarker(node.content ?? "")
  const adjustedOffset = marker && !isBodyBlock ? editOffset + marker.length + 1 : editOffset

  // Title split with visible children → after-portion becomes first child
  const hasVisibleChildren = !isBodyBlock && hasVisibleItemChildren(ctx.repo, edit.nodeId, ctx.foldDepths)

  try {
    ctx.undoHandle.setCursor(nodeId)
    ctx.undoHandle.startBatch("Split node")
    if (hasVisibleChildren) {
      const result = splitAsChild(ctx.repo, nodeId, adjustedOffset)
      ctx.undoHandle.endBatch()
      ctx.dispatchBoard({ type: "SELECT", nodeId: result.afterId })
      ctx.setUI({ inlineEditBlock: { nodeId: result.afterId, blockIndex: 0 } })
    } else {
      const result = splitNode(ctx.repo, nodeId, adjustedOffset)
      ctx.undoHandle.endBatch()
      ctx.dispatchBoard({ type: "SELECT", nodeId: result.afterId })
      ctx.setUI({ inlineEditBlock: { nodeId: result.afterId, blockIndex: 0 } })
    }
  } catch {
    ctx.undoHandle.endBatch()
    ctx.setUI({ bellState: "split-failed" })
  }

  return ok()
}

/** Check if a node has visible item children (not folded, has items).
 *  Checks for any `item: true` children — not just `type: "h"` outline nodes —
 *  because the board renders all `item` children as cards when no structural items exist. */
function hasVisibleItemChildren(repo: ActionCtx["repo"], nodeId: string, foldDepths: Map<string, number>): boolean {
  if (foldDepths.get(nodeId) === 0) return false
  const children = repo.getChildren(nodeId)
  return children.some((c) => c.item)
}

/** Split node at offset, placing the after-portion as the first child instead of sibling. */
function splitAsChild(repo: ActionCtx["repo"], nodeId: string, offset: number): { beforeId: string; afterId: string } {
  const node = repo.getNode(nodeId)
  if (!node) throw new Error(`splitAsChild: node not found: ${nodeId}`)

  const text = node.content ?? ""
  const clamped = Math.max(0, Math.min(offset, text.length))
  const beforeText = text.slice(0, clamped)
  const afterText = text.slice(clamped)

  // Find sort order before existing first child
  const children = repo.getChildren(nodeId)
  const firstChild = children[0]
  const newSortOrder = firstChild ? (firstChild.parent_idx ?? 0) - 1 : 0

  const isTask = node.task_marker !== undefined
  const newChild: Partial<KNode> = {
    type: isTask ? "p" : "h",
    item: true,
    content: afterText,
    parent_idx: newSortOrder,
  }
  if (isTask) {
    newChild.task_status = node.task_status ?? "todo"
    newChild.task_marker = node.task_marker ?? "[ ]"
    newChild.list_marker = node.list_marker ?? "-"
  }

  const afterId = repo.addNode(nodeId, newChild)
  repo.updateNode(nodeId, { content: beforeText })

  return { beforeId: nodeId, afterId }
}

/** Enter at end of title with visible children → insert empty node as FIRST child. */
function handleAddNodeChildFirst(ctx: ActionCtx): void {
  const cursorId = ctx.cursorNodeId
  if (!cursorId) return

  const { repo } = ctx
  const children = repo.getChildren(cursorId)
  const firstChild = children[0]
  // Sort order before existing first child (or 0 if none)
  const newSortOrder = firstChild ? (firstChild.parent_idx ?? 0) - 1 : 0

  const newNode: Partial<KNode> = {
    type: "h",
    item: true,
    content: "",
    parent_idx: newSortOrder,
    data: {},
  }

  ctx.undoHandle.setCursor(cursorId)
  const newId = repo.addNode(cursorId, newNode)
  ctx.dispatchBoard({ type: "SELECT", nodeId: newId })
  ctx.setUI({ inlineEditBlock: { nodeId: newId, blockIndex: 0 } })
}

function handleEditBlockNavigate(ctx: ActionCtx, direction: "up" | "down"): ActionResult {
  const { ui } = ctx
  const edit = ui.inlineEditBlock
  if (!edit) return ok()

  // Capture the current cursor column before saving/unmounting the edit context.
  // This preserves the preferred column (stickyX) across block boundaries.
  // If the TermEditContext already has a stickyX (from prior vertical movement),
  // use that; otherwise compute the current visual column.
  const editCtx = activeEditContextRef.current
  const stickyX = editCtx ? (editCtx.stickyX ?? editCtx.getCursorRowCol().col) : edit.stickyX

  const blockCount = 1 + extractBody(ctx.repo.getChildren(edit.nodeId)).body.length
  const nextIndex = edit.blockIndex + (direction === "down" ? 1 : -1)

  if (nextIndex >= 0 && nextIndex < blockCount) {
    // Moving between blocks within same node → save current block, change index
    activeEditTargetRef.current?.save()
    ctx.setUI({
      inlineEditBlock: {
        ...edit,
        blockIndex: nextIndex,
        initialCursorPos: direction === "down" ? "start" : "end",
        stickyX,
      },
    })
    return ok()
  }

  // Past edges → save current content and try to enter edit on adjacent card
  activeEditTargetRef.current?.save()

  // Find adjacent card in the current column
  const col = ctx.column
  const currentCardIndex = col?.cardNodes.findIndex((c) => c.id === edit.nodeId) ?? -1
  const adjacentIndex = direction === "down" ? currentCardIndex + 1 : currentCardIndex - 1
  const adjacentCard = col?.cardNodes[adjacentIndex]

  if (adjacentCard) {
    // Navigate to adjacent card and enter edit mode on it
    ctx.dispatchBoard({ type: "SELECT", nodeId: adjacentCard.id })

    // Determine which block to edit (first or last)
    const adjBodyCount = extractBody(ctx.repo.getChildren(adjacentCard.id)).body.length
    const adjBlockIndex = direction === "down" ? 0 : adjBodyCount // title (0) when going down, last body block when going up
    ctx.setUI({
      inlineEditBlock: {
        nodeId: adjacentCard.id,
        blockIndex: adjBlockIndex,
        initialCursorPos: direction === "down" ? "start" : "end",
        stickyX,
      },
    })
    return ok()
  }

  // No adjacent card — exit edit mode entirely
  ctx.setUI({ inlineEditBlock: null })
  return handleCursorMove(ctx, direction === "down" ? "down" : "up")
}

function handleToggleFold(ctx: ActionCtx): ActionResult {
  const { repo } = ctx
  const card = ctx.card

  if (!card) return boundary("fold", "no card selected")

  // Check if card has children to fold/unfold
  const children = repo.getChildren(card.id)
  if (children.length === 0) {
    return boundary("fold", "no children to fold")
  }

  ctx.dispatchBoard({ type: "TOGGLE_FOLD", nodeId: card.id })
  return ok()
}

function handleFavoritesSelectKey(ctx: ActionCtx, key: string): ActionResult {
  if (!key) return ok()
  if (RESERVED_KEYS.has(key)) {
    const label = getReservedKeyLabel(key)
    ctx.toastQueue.warning(`Key '${key}' is reserved for '${label}'`)
    return ok()
  }
  ctx.setUI({ favoritesSelectedKey: key })
  return ok()
}

function handleFavoritesAssign(ctx: ActionCtx): ActionResult {
  const key = ctx.ui.favoritesSelectedKey
  if (!key) return ok()

  const nodeId = ctx.cursorNodeId
  if (!nodeId) {
    ctx.toastQueue.warning("No node selected")
    return ok()
  }

  const node = ctx.repo.getNode(nodeId)
  const name = node?.title ?? node?.name ?? nodeId
  setFavorite(key, nodeId)
  initDefaultKeybindings()
  ctx.toastQueue.success(`Favorite '${key}' → ${name}`)
  popDialogMode()
  ctx.setUI({ showFavoritesDialog: false, favoritesSelectedKey: null })
  return ok()
}

function handleFavoritesClear(ctx: ActionCtx): ActionResult {
  const key = ctx.ui.favoritesSelectedKey
  if (!key) return ok()

  const existing = getFavorite(key)
  if (!existing) {
    ctx.toastQueue.warning(`No favorite assigned to '${key}'`)
    ctx.setUI({ favoritesSelectedKey: null })
    return ok()
  }

  clearFavorite(key)
  initDefaultKeybindings()
  ctx.toastQueue.info(`Cleared favorite '${key}'`)
  ctx.setUI({ favoritesSelectedKey: null })
  return ok()
}

function handleCursorTo(ctx: ActionCtx, locationKey: string): void {
  // "parent" — zoom outwards
  if (locationKey === "parent") {
    handleZoomOutwards(ctx)
    return
  }

  // "first" / "last" — cursor to first/last sibling
  if (locationKey === "first" || locationKey === "last") {
    const nodeId = ctx.cursorNodeId
    if (!nodeId) return
    const node = ctx.repo.getNode(nodeId)
    if (!node?.parent_id) return
    const siblings = ctx.repo.getChildren(node.parent_id)
    if (siblings.length === 0) return
    const target = locationKey === "first" ? siblings[0]! : siblings.at(-1)!
    ctx.dispatchBoard({ type: "SELECT", nodeId: target.id })
    clearSelection(ctx)
    return
  }

  // "fav:X" — jump to favorite
  if (locationKey.startsWith("fav:")) {
    const favoriteId = getFavorite(locationKey.slice(4))
    if (!favoriteId) return
    const targetNode = ctx.repo.getNode(favoriteId)
    if (!targetNode) return
    saveNavHistory(ctx)
    ctx.dispatchBoard({ type: "ZOOM_IN", nodeId: favoriteId })
    clearSelection(ctx)
    return
  }

  // If focused pane is empty, activate it as a board pane first
  if (ctx.focusedPaneViewType() === "empty") {
    ctx.activateEmptyPane()
  }

  // "@home" — go to root
  if (locationKey === "@home") {
    saveNavHistory(ctx)
    ctx.dispatchBoard({ type: "ZOOM_IN", nodeId: null })
    clearSelection(ctx)
    return
  }

  // Board/node ID — navigate there
  const targetNode = ctx.repo.getNode(locationKey) ?? ctx.repo.resolveNode(locationKey)
  if (!targetNode) {
    ctx.toastQueue.warning(`Board "${locationKey}" not found`)
    ctx.setUI({})
    return
  }

  saveNavHistory(ctx)
  const children = ctx.repo.getChildren(targetNode.id)
  const firstChild = children[0]?.id ?? null
  ctx.dispatchBoard({ type: "ZOOM_IN", nodeId: targetNode.id, cursorNodeId: firstChild })
  clearSelection(ctx)
}

/** Move selected nodes as last children of the given parent node. */
function reparentToNode(ctx: ActionCtx, boardId: string): void {
  const cards = getSelectedCards(ctx)
  if (cards.length === 0) return

  const targetNode = ctx.repo.getNode(boardId) ?? ctx.repo.resolveNode(boardId)
  if (!targetNode) {
    ctx.toastQueue.warning(`Board "${boardId}" not found`)
    ctx.setUI({})
    return
  }

  // Compute sort order to append at end of target board's children
  const targetChildren = ctx.repo.getChildren(targetNode.id)
  let sortOrder = targetChildren.length > 0 ? (targetChildren[targetChildren.length - 1]?.parent_idx ?? 0) + 1 : 0

  // Move each selected card to the target board as a child
  ctx.undoHandle.setCursor(ctx.cursorNodeId)
  ctx.undoHandle.startBatch("Move to board")
  for (const card of cards) {
    if (card.id === targetNode.id) continue // Don't move node into itself
    ctx.repo.moveNode(card.id, targetNode.id, sortOrder)
    sortOrder++
  }
  ctx.undoHandle.endBatch()
  clearSelection(ctx)
  ctx.toastQueue.success(`Moved ${cards.length} item(s) to ${targetNode.name ?? targetNode.id}`)
  ctx.setUI({})
}

/**
 * Handle REPARENT_TO verb action — move node(s) to a new parent by locationKey.
 * Uses resolveLocationKey + Position helpers for all cases.
 */
function handleReparentTo(ctx: ActionCtx, locationKey: string): ActionResult {
  // "parent" → structural outdent (special: changes tree depth, not just position)
  if (locationKey === "parent") {
    const nodeId = ctx.cursorNodeId
    if (!nodeId) return boundary("outdent", "no cursor")
    const node = ctx.repo.getNode(nodeId)
    if (!node) return boundary("outdent", "node not found")
    if (!outdentNode(ctx, node)) return boundary("outdent", "can't outdent further")
    return ok()
  }

  // Resolve locationKey → Position or PickTarget
  const resolved = resolveLocationKey(locationKey, ctx, ctx.repo)
  if (!resolved) {
    ctx.toastQueue.warning(`Target "${locationKey}" not found`)
    ctx.setUI({})
    return ok()
  }

  // Pick target → open picker dialog
  if (isPickTarget(resolved)) {
    ctx.setUI({ activePicker: { type: "project" } })
    return ok()
  }

  // Position resolved — move cursor node there
  const nodeId = ctx.cursorNodeId
  if (!nodeId) return boundary("move", "no cursor")

  // Same-parent move (first/last reorder) vs cross-parent move (reparent)
  const node = ctx.repo.getNode(nodeId)
  if (node?.parent_id === resolved.parentId) {
    // Reorder among siblings — single node
    if (isAtPosition(nodeId, resolved, ctx.repo)) return ok()
    ctx.undoHandle.setCursor(nodeId)
    moveTo(ctx.repo, nodeId, resolved)
    ctx.dispatchBoard({ type: "SELECT", nodeId })
  } else {
    // Cross-parent move — batch with selected nodes
    reparentToNode(ctx, resolved.parentId)
  }
  return ok()
}

/**
 * Handle LINK_TO verb action — add link/property by locationKey.
 * Absorbs the old ADD_LINK_TO_BOARD, ADD_LINK_TO_FAVORITE, SET_LABEL,
 * SET_ASSIGNEE, ADD_LINK, and REPARENT_PICKER (for "pick:+") action types.
 */
function handleLinkTo(ctx: ActionCtx, locationKey: string): ActionResult {
  // Pickers
  if (locationKey === "pick:#") {
    pushDialogMode("dialog:picker")
    ctx.closeDetailPane()
    ctx.setUI({ activePicker: { type: "tag" } })
    clearSelection(ctx)
    return ok()
  }
  if (locationKey === "pick:@") {
    pushDialogMode("dialog:picker")
    ctx.closeDetailPane()
    ctx.setUI({ activePicker: { type: "assignee" } })
    clearSelection(ctx)
    return ok()
  }
  if (locationKey === "pick:+") {
    ctx.setUI({ activePicker: { type: "project" } })
    return ok()
  }
  if (locationKey === "pick:[") {
    ctx.toastQueue.info("Link picker not yet implemented")
    ctx.setUI({})
    return ok()
  }

  // "fav:X" → add link to favorite target
  if (locationKey.startsWith("fav:")) {
    const favBoardId = getFavorite(locationKey.slice(4))
    if (favBoardId) {
      ctx.toastQueue.info(`Add link to "${favBoardId}" not yet implemented`)
    } else {
      ctx.toastQueue.warning(`No favorite assigned to key '${locationKey.slice(4)}'`)
    }
    ctx.setUI({})
    return ok()
  }

  // Board/node ID → add link (stub)
  ctx.toastQueue.info(`Add link to "${locationKey}" not yet implemented`)
  ctx.setUI({})
  return ok()
}

/**
 * Handle CREATE_AT verb action — create a new node at the target location.
 * Absorbs the old CAPTURE action type for verb-grid usage.
 */
function handleCreateAt(ctx: ActionCtx, locationKey: string): ActionResult {
  // For now, capture is not yet implemented — stub with toast
  ctx.toastQueue.info(`Create at "${locationKey}" not yet implemented`)
  ctx.setUI({})
  return ok()
}

function handleJumpToColumn(ctx: ActionCtx, columnNumber: number): ActionResult {
  const columns = ctx.columns
  const { dispatchBoard } = ctx

  // Column numbers are 1-indexed for user, 0-indexed internally
  const targetColIdx = columnNumber - 1

  if (targetColIdx < 0 || targetColIdx >= columns.length) {
    return boundary("column", `column ${columnNumber} does not exist`)
  }

  const targetCol = columns[targetColIdx]
  if (targetCol && targetCol.cardNodes.length > 0) {
    const firstCard = targetCol.cardNodes[0]
    if (firstCard) {
      dispatchBoard({ type: "SELECT", nodeId: firstCard.id })
    }
  }
  return ok()
}

function handleCloseOrQuit(ctx: ActionCtx): ActionResult {
  const { ui, dispatchBoard } = ctx

  // v2 Escape Layering — each Escape pops one layer (follows focus stack):
  // 1. Cancel move/visual mode (highest priority — modal states)
  // 2. Text edit -> node mode (save+exit)
  // 3. Pane focused -> focus board (pane stays open)
  // 4. Dialog open -> close topmost dialog
  // 5. Selection active -> clear selection
  // 6. Nothing -> no-op (visual bell)

  // --- Layer 0: Modal states (move mode, visual mode) ---
  if (ui.visualMode) {
    clearSelection(ctx)
    ctx.setUI({
      visualMode: false,
      visualAnchor: null,
      status: null,
    })
    return ok()
  }

  if (ctx.moveMode) {
    dispatchBoard({ type: "CANCEL_MOVE" })
    return ok()
  }

  // --- Layer 1: Text edit -> node mode ---
  // Note: normally Escape during editing routes to TEXT_EXIT_EDIT, not here.
  // This is a safety fallback.
  if (ui.inlineEditBlock) {
    activeEditTargetRef.current?.save()
    ctx.setUI({ inlineEditBlock: null })
    return ok()
  }

  // --- Layer 2: Pane focused -> focus board (pane stays open) ---
  if (ctx.hasDetailPane && ctx.focusedPaneViewType() === "detail") {
    const boardPane = ownerPaneId(ctx.focusedPaneId())
    ctx.focusPaneById(boardPane)
    ctx.syncFocusScope()
    return ok()
  }

  // --- Layer 2b: Pane open but unfocused -> close pane ---
  if (ctx.hasDetailPane) {
    const boardPane = ownerPaneId(ctx.focusedPaneId())
    ctx.closeDetailPane()
    ctx.focusPaneById(boardPane)
    ctx.syncFocusScope()
    return ok()
  }

  // --- Layer 3: Dialog open -> close topmost dialog ---
  if (ui.showHelp) {
    ctx.setUI({ showHelp: false })
    return ok()
  }
  if (ui.showOmnibox) {
    popDialogMode()
    ctx.setUI({ showOmnibox: false })
    return ok()
  }
  if (ui.searchReplace) {
    ctx.setUI({ searchReplace: null })
    return ok()
  }
  if (ui.localSearch) {
    ctx.setUI({ localSearch: null })
    return ok()
  }
  if (ui.showSearchDialog) {
    popDialogMode()
    dialogTargetRef.current?.cancel()
    return ok()
  }
  if (ui.showFilterDialog) {
    popDialogMode()
    ctx.setUI({ showFilterDialog: false })
    return ok()
  }
  if (ui.activePicker) {
    popDialogMode()
    ctx.setUI({ activePicker: null })
    return ok()
  }
  if (ui.showNewItemDialog) {
    popDialogMode()
    ctx.setUI({ showNewItemDialog: false })
    return ok()
  }
  if (ui.datePrompt) {
    popDialogMode()
    ctx.setUI({ datePrompt: null })
    return ok()
  }

  // If cursor is inside a card's sub-items, exit outline mode (move cursor back to card)
  if (ctx.cursorNodeId !== null && ctx.card !== undefined && ctx.cursorNodeId !== ctx.card.id) {
    ctx.dispatchBoard({ type: "SELECT", nodeId: ctx.card.id })
    return ok()
  }

  // --- Layer 4: Selection active -> clear selection ---
  if (ui.multiSelected.size > 0) {
    clearSelection(ctx)
    return ok()
  }

  // --- Layer 5: Nothing -> no-op (visual bell) ---
  // Escape does NOT zoom out — use Z (ZOOM_OUT) for that.
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
        isFolder: isOutline(current.type, current.item) && current.fstype === "folder",
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
  const { repo } = ctx
  // Always ignore at column level — Board.tsx filters columns, not individual cards.
  // Using card?.node would write an ignore path for the task, but the column would
  // stay visible because isIgnored only checks col.node during rendering.
  const node = ctx.column?.node
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

      // Move cursor to adjacent column since this column is now hidden.
      // Find current column position, then pick adjacent
      const colIndex = ctx.columns.findIndex((c) => c.node.id === node.id)
      const nextCol = ctx.columns[colIndex + 1]
      const prevCol = colIndex > 0 ? ctx.columns[colIndex - 1] : undefined
      const targetCol = nextCol ?? prevCol
      if (targetCol) {
        // Select first card in target column, or column header if empty
        const firstCard = targetCol.cardNodes[0]
        ctx.dispatchBoard({
          type: "SELECT",
          nodeId: firstCard?.id ?? targetCol.node.id,
        })
      }
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
  return cards.map((c) => c.id)
}

/** Open the date prompt dialog for a given field. */
function handleSetDatePrompt(ctx: ActionCtx, field: "due_at" | "start_at" | "rrule"): ActionResult {
  const nodeIds = getSelectedCardNodeIds(ctx)
  if (nodeIds.length === 0) return boundary(field, "No card selected")
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length > 0 guarantees [0] exists
  const firstNodeId = nodeIds[0]!

  const firstNode = ctx.repo.getNode(firstNodeId)
  const currentValue = firstNode?.[field] ?? ""

  pushDialogMode("dialog:datePrompt")
  ctx.setUI({
    datePrompt: { field, nodeIds, currentValue },
  })
  return ok()
}

/** Priority cycle order for the cycling command */
const PRIORITY_CYCLE = ["P0", "P1", "P2", "P3", "P4"] as const

/** Cycle priority: none → P0 → P1 → P2 → P3 → P4 → none */
function handleSetPriority(ctx: ActionCtx, value?: string): ActionResult {
  const nodeIds = getSelectedCardNodeIds(ctx)
  if (nodeIds.length === 0) return boundary("priority", "No card selected")
  const firstNodeId = nodeIds[0]
  if (!firstNodeId) return boundary("priority", "No card selected")

  let next: string | undefined
  if (value !== undefined) {
    // Direct set from t 0-4 keybindings
    next = value || undefined
  } else {
    // Cycle through P0 → P1 → P2 → P3 → P4 → none
    const firstNode = ctx.repo.getNode(firstNodeId)
    const current = firstNode?.priority
    const idx = current ? PRIORITY_CYCLE.indexOf(current as (typeof PRIORITY_CYCLE)[number]) : -1
    next =
      idx >= 0 && idx < PRIORITY_CYCLE.length - 1 ? PRIORITY_CYCLE[idx + 1] : idx === -1 ? PRIORITY_CYCLE[0] : undefined
  }

  // Auto-recorded by undoable repo — batch multiple updates into one undo entry
  ctx.undoHandle.setCursor(ctx.cursorNodeId)
  if (nodeIds.length > 1) ctx.undoHandle.startBatch("Set priority")
  for (const nodeId of nodeIds) {
    ctx.repo.updateNode(nodeId, { priority: next })
  }
  if (nodeIds.length > 1) ctx.undoHandle.endBatch()

  const label = next ?? "None"
  ctx.toastQueue.info(`Priority: ${label}`)
  ctx.dispatchBoard({ type: "SELECT", nodeId: ctx.cursorNodeId })
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
// oxlint-disable-next-line complexity/complexity -- date parsing with multiple formats
function handleDatePromptConfirm(ctx: ActionCtx): ActionResult {
  const prompt = ctx.ui.datePrompt
  if (!prompt) return ok()

  // Read the current input from the block edit target (set by DatePromptDialog)
  const input = activeEditTargetRef.current?.getContent() ?? ""
  const trimmed = input.trim()

  const { field, nodeIds } = prompt

  // Auto-recorded by undoable repo — batch multiple updates into one undo entry
  ctx.undoHandle.setCursor(ctx.cursorNodeId)
  const useBatch = nodeIds.length > 1
  if (useBatch) ctx.undoHandle.startBatch(`Set ${field}`)

  if (field === "rrule") {
    // Recurrence: convert NL → RRULE, or clear
    const rrule = trimmed ? naturalToRRule(trimmed) : null
    if (trimmed && !rrule) {
      if (useBatch) ctx.undoHandle.endBatch()
      ctx.toastQueue.error("Invalid recurrence: " + trimmed)
      return ok()
    }
    for (const nodeId of nodeIds) {
      ctx.repo.updateNode(nodeId, { rrule: rrule ?? undefined })
    }
    ctx.toastQueue.info(rrule ? `Recurrence: ${trimmed}` : "Recurrence cleared")
  } else {
    // Date field: resolve NL → ISO 8601 due_at/start_at, or clear
    if (trimmed) {
      const resolved = resolveDate(trimmed)
      if (!resolved) {
        if (useBatch) ctx.undoHandle.endBatch()
        ctx.toastQueue.error("Invalid date: " + trimmed)
        return ok()
      }
      // Compose ISO 8601 value: "2026-02-20" or "2026-02-20T14:00"
      const isoValue = resolved.time ? `${resolved.date}T${resolved.time}` : resolved.date
      for (const nodeId of nodeIds) {
        ctx.repo.updateNode(nodeId, { [field]: isoValue })
      }
      const display = resolved.time ? `${resolved.date} ${resolved.time}` : resolved.date
      const label = field === "due_at" ? "Due" : "Start"
      ctx.toastQueue.info(`${label}: ${display}`)
    } else {
      // Clear the field
      for (const nodeId of nodeIds) {
        ctx.repo.updateNode(nodeId, { [field]: null })
      }
      const label = field === "due_at" ? "Due date" : "Start date"
      ctx.toastQueue.info(`${label} cleared`)
    }
  }

  if (useBatch) ctx.undoHandle.endBatch()

  // Re-evaluate km.add:: rules so @next Inbox picks up newly-dated tasks.
  // onNodeChanged writes embeds directly to DB (bypassing repo mutation API),
  // so touch() is needed to clear stale children cache and notify subscribers.
  if (ctx.repo.database) {
    const ruleCtx = createRuleContext()
    for (const nodeId of nodeIds) {
      onNodeChanged(ctx.repo.database, nodeId, ruleCtx)
    }
    ctx.repo.touch()
  }

  popDialogMode()
  ctx.setUI({ datePrompt: null })
  ctx.dispatchBoard({ type: "SELECT", nodeId: ctx.cursorNodeId })
  return ok()
}

// =============================================================================
// Clipboard Operations
// =============================================================================

/** Copy or cut selected nodes to clipboard. */
function handleClipboardCopy(ctx: ActionCtx, mode: "copy" | "cut"): ActionResult {
  const cards = getSelectedCards(ctx)
  if (cards.length === 0) return boundary("clipboard", "No card to copy")

  const nodeIds = cards.map((c) => c.id)
  ctx.setUI({
    clipboard: { nodeIds, mode },
  })

  // Copy content to system clipboard via OSC 52
  const text = cards.map((c) => c.content ?? c.id).join("\n")
  copyToClipboard(process.stdout, text)

  const label = mode === "cut" ? "Cut" : "Copied"
  ctx.toastQueue.info(`${label} ${nodeIds.length} node${nodeIds.length > 1 ? "s" : ""}`)
  return ok()
}

/** Paste nodes from clipboard as siblings after cursor. */
function handleClipboardPaste(ctx: ActionCtx): ActionResult {
  const clipboard = ctx.ui.clipboard
  if (!clipboard) return boundary("clipboard", "Nothing to paste")

  const { repo } = ctx
  const col = ctx.column
  if (!col) return boundary("clipboard", "No column")

  // Find current position in siblings
  const siblings = repo.getChildren(col.node.id)
  const currentSibIdx = siblings.findIndex((s) => s.id === ctx.cursorNodeId)
  const currentNode = siblings[currentSibIdx]

  // Calculate sort order: after current node
  let baseSortOrder: number
  if (currentNode) {
    const currentIdx = currentNode.parent_idx ?? 0
    const nextSibling = siblings[currentSibIdx + 1]
    const nextIdx = nextSibling?.parent_idx ?? currentIdx + 1
    // Space out evenly between current and next
    const gap = (nextIdx - currentIdx) / (clipboard.nodeIds.length + 1)
    baseSortOrder = currentIdx + gap
  } else {
    // No cursor — append at end
    const lastSibling = siblings[siblings.length - 1]
    baseSortOrder = (lastSibling?.parent_idx ?? 0) + 1
  }

  ctx.undoHandle.setCursor(ctx.cursorNodeId)
  ctx.undoHandle.startBatch(clipboard.mode === "cut" ? "Cut & Paste" : "Paste")

  let pastedCount = 0
  let lastPastedId: string | null = null
  for (let i = 0; i < clipboard.nodeIds.length; i++) {
    const sourceId = clipboard.nodeIds[i]
    if (!sourceId) continue
    const sourceNode = repo.getNode(sourceId)
    if (!sourceNode) continue

    if (clipboard.mode === "cut") {
      // Move the node to the new position
      const sortOrder = baseSortOrder + i * 0.001
      repo.moveNode(sourceId, col.node.id, sortOrder)
      lastPastedId = sourceId
    } else {
      // Copy: create a new node with same properties
      const newNode: Record<string, unknown> = {
        type: sourceNode.type,
        content: sourceNode.content,
        parent_idx: baseSortOrder + i * 0.001,
        data: sourceNode.data ? { ...sourceNode.data } : undefined,
      }
      if (sourceNode.task_status) {
        newNode.task_status = sourceNode.task_status
        newNode.task_marker = sourceNode.task_marker
      }
      if (sourceNode.list_marker) {
        newNode.list_marker = sourceNode.list_marker
      }
      if (sourceNode.fstype) {
        newNode.fstype = sourceNode.fstype
      }
      lastPastedId = repo.addNode(col.node.id, newNode)
    }
    pastedCount++
  }

  ctx.undoHandle.endBatch()

  // After cut, clear clipboard (one-time paste)
  if (clipboard.mode === "cut") {
    ctx.setUI({ clipboard: null })
  }

  clearSelection(ctx)

  ctx.toastQueue.info(`Pasted ${pastedCount} node${pastedCount > 1 ? "s" : ""}`)

  // Select the last pasted node by ID
  if (lastPastedId) {
    ctx.dispatchBoard({ type: "SELECT", nodeId: lastPastedId })
  }

  return ok()
}
