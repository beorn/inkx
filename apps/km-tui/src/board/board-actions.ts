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
import type { CommandAction, VerbOp, NavOp, EditOp, TextOp, BoardOp, DialogOp, PaneOp, ViewOp } from "@km/commands"
import { type ActionResult, boundary, ok, unimplemented } from "@km/commands"
import { createLogger } from "loggily"
import * as chrono from "chrono-node"
import { naturalToRRule, onNodeChanged, createRuleContext } from "@km/storage"
import { addHidden, removeHidden, computeHiddenPath, isHidden, readBoardHidden } from "../hidden.ts"
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
  getEditableText,
  setEditableText,
} from "@km/tree"
import { KNode, Position, extractTitleTaskMarker, type ItemData } from "@km/core"
import { clearSelection, progressiveSelectAll, saveNavHistory } from "../keyboard/keyboard-helpers.ts"
import { Selection } from "../selection.ts"
import {
  getFavorite,
  setFavorite,
  clearFavorite,
  RESERVED_KEYS,
  getReservedKeyLabel,
  initDefaultKeybindings,
  expandLocationTemplate,
  isDateTemplate,
} from "@km/commands"
import { resolveLocationKey, isPickTarget, type PickTarget } from "./position-resolver.ts"
import { Tree, midpoint } from "@km/tree"
import type { ActionCtx } from "../tui-context.ts"
import type { ColumnView, ViewMode } from "../types.ts"
import { createEmptyFilterProperties, VIEW_DIALOG_ROWS, type IconStyle } from "../ui-reducer.ts"

import { mkdirSync, writeFileSync, existsSync } from "node:fs"
import {
  applyFoldLevel as reducerApplyFoldLevel,
  applyUnfoldLevel as reducerApplyUnfoldLevel,
  applyFoldNode as reducerApplyFoldNode,
  applyUnfoldNode as reducerApplyUnfoldNode,
  applyUnfoldRecursive as reducerApplyUnfoldRecursive,
  applyToggleFold as reducerApplyToggleFold,
  createBoardNavState,
  type ApplyResult,
  type BoardNavState,
} from "./board-reducer.ts"

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loggily types don't fully resolve via tsc bundler mode
const log = createLogger("km:tui:board-actions") as any

// =============================================================================
// Auto-create files for date-template locations
// =============================================================================

/**
 * If locationKey is a date-template (contains {YYYY} etc.), expand it and
 * create the file on disk if it doesn't exist. The file watcher will pick it
 * up and add it to the DB. Returns true if a file was created.
 */
function autoCreateDateTemplateFile(locationKey: string, ctx: ActionCtx): boolean {
  if (!isDateTemplate(locationKey)) return false

  const expanded = expandLocationTemplate(locationKey)
  if (expanded.type !== "resolved") return false

  const vaultPath = ctx.repo.path
  if (!vaultPath) return false

  const fullPath = join(vaultPath, expanded.value)
  if (existsSync(fullPath)) return false

  // Create directory structure and markdown file with date heading
  const dir = dirname(fullPath)
  mkdirSync(dir, { recursive: true })
  // Derive title from filename (e.g., "2026-03-30.md" → "# 2026-03-30\n")
  const filename = expanded.value.split("/").pop() ?? ""
  const title = filename.replace(/\.md$/, "")
  writeFileSync(fullPath, `# ${title}\n`, "utf-8")
  log.debug?.(`auto-created date-template file: ${expanded.value}`)

  ctx.toastQueue.success(`Created ${expanded.value}`)
  return true
}

// =============================================================================
// Type Guards — O(1) dispatch via Sets of type strings
//
// Each list uses `satisfies` (catches invalid entries) + `AssertComplete`
// (catches missing entries). Adding a new action type without listing it errors.
// =============================================================================

/** True if List covers every member of Union; descriptive error type otherwise. */
type AssertComplete<Union extends string, List extends readonly Union[]> =
  Exclude<Union, List[number]> extends never ? true : ["MISSING", Exclude<Union, List[number]>]

const VERB_TYPE_LIST = ["CURSOR_TO", "REPARENT_TO", "LINK_TO", "CREATE_AT"] as const satisfies readonly VerbOp["type"][]
const _verb: AssertComplete<VerbOp["type"], typeof VERB_TYPE_LIST> = true
const VERB_TYPES: ReadonlySet<string> = new Set(VERB_TYPE_LIST)

const NAV_TYPE_LIST = [
  "CURSOR_MOVE",
  "NAV_BACK",
  "NAV_FORWARD",
  "NAV_SIBLING_BOARD",
  "ZOOM_INWARDS",
  "ZOOM_OUTWARDS",
  "ZOOM_TO_ROOT",
  "FOLLOW_LINK",
  "PAGE_JUMP",
  "JUMP_TO_COLUMN",
  "FOLD_LEVEL",
  "UNFOLD_LEVEL",
] as const satisfies readonly NavOp["type"][]
const _nav: AssertComplete<NavOp["type"], typeof NAV_TYPE_LIST> = true
const NAV_TYPES: ReadonlySet<string> = new Set(NAV_TYPE_LIST)

const EDIT_TYPE_LIST = [
  "ENTER_INLINE_EDIT",
  "EDIT_BLOCK_NAVIGATE",
  "INDENT_NODE",
  "OUTDENT_NODE",
  "INSERT_ABOVE",
  "INSERT_BELOW",
  "INSERT_CHILD",
  "INSERT_AT_PARENT",
  "DELETE_NODE",
  "DUPLICATE_NODE",
  "OPEN_IN_SYSTEM",
  "OPEN_IN_TERMINAL",
  "CLIPBOARD_COPY",
  "CLIPBOARD_CUT",
  "CLIPBOARD_PASTE",
  "ADD_LINK",
  "REPARENT_PICKER",
  "ARCHIVE_NODE",
  "TASK_SET_STATUS",
  "CLEAR_TASK",
  "SHIFT_UP",
  "SHIFT_DOWN",
  "SHIFT_LEFT",
  "SHIFT_RIGHT",
] as const satisfies readonly EditOp["type"][]
const _edit: AssertComplete<EditOp["type"], typeof EDIT_TYPE_LIST> = true
const EDIT_TYPES: ReadonlySet<string> = new Set(EDIT_TYPE_LIST)

const TEXT_TYPE_LIST = [
  "TEXT_INSERT",
  "TEXT_DELETE_BACKWARD",
  "TEXT_DELETE_FORWARD",
  "TEXT_CURSOR_LEFT",
  "TEXT_CURSOR_RIGHT",
  "TEXT_CURSOR_UP",
  "TEXT_CURSOR_DOWN",
  "TEXT_CURSOR_START",
  "TEXT_CURSOR_END",
  "TEXT_DELETE_WORD",
  "TEXT_DELETE_TO_START",
  "TEXT_DELETE_TO_END",
  "TEXT_CONFIRM",
  "TEXT_EXIT_EDIT",
  "TEXT_YANK",
  "TEXT_LINEBREAK_SPLIT",
  "TEXT_LINEBREAK_BEFORE",
  "TEXT_LINEBREAK_CHILD",
  "TEXT_LINEBREAK_AFTER",
  "TEXT_CHILD_BLOCK",
  "TEXT_BOLD",
  "TEXT_ITALIC",
] as const satisfies readonly TextOp["type"][]
const _text: AssertComplete<TextOp["type"], typeof TEXT_TYPE_LIST> = true
const TEXT_TYPES: ReadonlySet<string> = new Set(TEXT_TYPE_LIST)

// Type-safe: if a new BoardOp type is added but not listed here, TypeScript errors.
const BOARD_TYPE_LIST = [
  "SELECT",
  "SET_ROOT",
  "SET_CURSWANT",
  "TOGGLE_FOLD",
  "TOGGLE_COLLAPSE",
  "SET_COLLAPSED_NODES",
  "ZOOM_IN",
  "FOLD_NODE",
  "UNFOLD_NODE",
  "UNFOLD_RECURSIVE",
  "SELECT_ALL",
  "SELECT_NODE_TOGGLE",
  "SELECT_NODE_ADD",
  "SELECT_NODE_REMOVE",
  "CLEAR_SELECTION",
  "VISUAL_MODE_ENTER",
  "VISUAL_MODE_EXIT",
  "EXTEND_SELECT_UP",
  "EXTEND_SELECT_DOWN",
  "EXTEND_SELECT_LEFT",
  "EXTEND_SELECT_RIGHT",
  "SELECT_ALL_SIBLINGS",
  "ENTER_MOVE_MODE",
  "CONFIRM_MOVE",
  "CANCEL_MOVE",
  "INCREASE_CONTENT_LINES",
  "DECREASE_CONTENT_LINES",
  "HIDE_NODE",
  "TOGGLE_SHOW_HIDDEN",
] as const satisfies readonly BoardOp["type"][]

const _board: AssertComplete<BoardOp["type"], typeof BOARD_TYPE_LIST> = true
const BOARD_TYPES: ReadonlySet<string> = new Set(BOARD_TYPE_LIST)

const DIALOG_TYPE_LIST = [
  "SHOW_NEW_ITEM_DIALOG",
  "SHOW_ITEM_PICKER",
  "SHOW_TASK_DIALOG",
  "SHOW_SEARCH_DIALOG",
  "SHOW_FILTER_DIALOG",
  "SET_FILTER",
  "CLEAR_FILTER",
  "TOGGLE_FILTER_PROPERTY",
  "CLEAR_FILTER_CATEGORY",
  "CLEAR_ALL_FILTER_PROPERTIES",
  "TOGGLE_HIDE_DONE",
  "CLEAR_FILTERS",
  "COMMAND_PALETTE",
  "DIALOG_NAV_UP",
  "DIALOG_NAV_DOWN",
  "DIALOG_NAV_LEFT",
  "DIALOG_NAV_RIGHT",
  "DIALOG_CONFIRM",
  "DIALOG_CANCEL",
  "TOGGLE_SEARCH_SCOPE",
  "DELETE_CONFIRM_EXECUTE",
  "DELETE_CONFIRM_CANCEL",
  "MANAGE_FAVORITES",
  "FAVORITES_SELECT_KEY",
  "FAVORITES_ASSIGN",
  "FAVORITES_CLEAR",
  "FAVORITES_BACK",
  "SET_DUE_DATE",
  "SET_START_DATE",
  "SET_RECURRING",
  "SET_PRIORITY",
  "SET_PRIORITY_0",
  "SET_PRIORITY_1",
  "SET_PRIORITY_2",
  "SET_PRIORITY_3",
  "SET_PRIORITY_4",
  "SET_LABEL",
  "SET_ASSIGNEE",
  "DATE_PROMPT_CONFIRM",
  "DATE_PROMPT_CANCEL",
  "LOCAL_FIND_OPEN",
  "LOCAL_FIND_NEXT",
  "LOCAL_FIND_PREV",
  "LOCAL_FIND_CLOSE",
  "LOCAL_FIND_CONFIRM",
  "SEARCH_REPLACE_OPEN",
  "SEARCH_REPLACE_CLOSE",
  "SEARCH_REPLACE_NEXT",
  "SEARCH_REPLACE_PREV",
  "SEARCH_REPLACE_DO_REPLACE",
  "SEARCH_REPLACE_DO_REPLACE_ALL",
  "SEARCH_REPLACE_TOGGLE_REGEX",
  "FOCUS_NEXT",
  "FOCUS_PREV",
] as const satisfies readonly DialogOp["type"][]
const _dialog: AssertComplete<DialogOp["type"], typeof DIALOG_TYPE_LIST> = true
const DIALOG_TYPES: ReadonlySet<string> = new Set(DIALOG_TYPE_LIST)

const PANE_TYPE_LIST = [
  "PANE_SPLIT",
  "PANE_CLOSE",
  "PANE_FOCUS",
  "PANE_FOCUS_PREVIOUS",
  "PANE_FOCUS_CYCLE",
  "PANE_FOCUS_NUMBER",
  "PANE_RESIZE",
  "PANE_RESIZE_VERTICAL",
  "PANE_EQUALIZE",
  "PANE_ZOOM",
  "PANE_ONLY",
  "PANE_SWAP",
  "PANE_SPLIT_AND_PICK",
  "CLOSE_DETAIL_PANE",
  "TOGGLE_DETAIL_PANE",
] as const satisfies readonly PaneOp["type"][]
const _pane: AssertComplete<PaneOp["type"], typeof PANE_TYPE_LIST> = true
const PANE_TYPES: ReadonlySet<string> = new Set(PANE_TYPE_LIST)

// ViewOp types: everything not matched above (no Set needed — it's the fallback)

function isVerbOp(action: CommandAction): action is VerbOp {
  return VERB_TYPES.has(action.type)
}
function isNavOp(action: CommandAction): action is NavOp {
  return NAV_TYPES.has(action.type)
}
function isEditOp(action: CommandAction): action is EditOp {
  return EDIT_TYPES.has(action.type)
}
function isTextOp(action: CommandAction): action is TextOp {
  return TEXT_TYPES.has(action.type)
}
function isBoardOp(action: CommandAction): action is BoardOp {
  return BOARD_TYPES.has(action.type)
}
function isDialogOp(action: CommandAction): action is DialogOp {
  return DIALOG_TYPES.has(action.type)
}
function isPaneOp(action: CommandAction): action is PaneOp {
  return PANE_TYPES.has(action.type)
}

// MAX_FOLD_DEPTH is now in board-reducer.ts

/** Extract BoardNavState from ActionCtx for fold reducer functions. */
function extractFoldState(ctx: ActionCtx): BoardNavState {
  return createBoardNavState({
    cursorNodeId: ctx.cursorNodeId,
    foldDepths: ctx.foldDepths,
    collapsedNodes: ctx.collapsedNodes,
    rootId: ctx.rootId,
  })
}

/** Apply effects from a Board.apply() result to the runtime. */
function applyFoldEffects(ctx: ActionCtx, result: ApplyResult): void {
  runBoardEffects(ctx, result)
}

/** Determine fold target node IDs from selection → card → column fallback. */
function getFoldTargetRoots(ctx: ActionCtx, card: KNode | null | undefined): string[] {
  const selected = Selection.nodes(ctx)
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
  const degradedItem = degradation.item as ItemData | undefined
  if (node.item?.task?.marker && degradedItem?.task?.marker === undefined) {
    degradation.content = content
  }
  if (degradation.type === "p" && KNode.isOutline(node)) {
    degradation.content = content
    degradation.name = undefined
  }
  if (degradation.type === "p" && KNode.isListItem(node)) {
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
  requestRenderFlush,
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
import { runBoardEffects, runRepoEffect } from "./board-effect-runner.ts"

// Re-export for external consumers (Board.tsx callbacks)
export { updateLocalSearchMatches } from "./board-actions-find.ts"
export { updateSearchReplaceMatches } from "./board-actions-search-replace.ts"

// =============================================================================
// Main Action Dispatcher (Router)
// =============================================================================

/**
 * Handle a command action from the command system.
 *
 * Routes to focused sub-handlers by action category. Each sub-handler has its
 * own exhaustive switch with assertNever, so TypeScript catches missing cases.
 *
 * Returns ActionResult: ok() on success, boundary/precondition/unimplemented on expected failure.
 * Callers should check result and provide feedback (e.g., ring bell for boundary).
 */
export function handleCommandAction(ctx: ActionCtx, action: CommandAction): ActionResult {
  if (isVerbOp(action)) return handleVerbAction(ctx, action)
  if (isNavOp(action)) return handleNavAction(ctx, action)
  if (isEditOp(action)) return handleEditAction(ctx, action)
  if (isTextOp(action)) return handleTextAction(ctx, action)
  if (isBoardOp(action)) return handleBoardAction(ctx, action)
  if (isDialogOp(action)) return handleDialogAction(ctx, action)
  if (isPaneOp(action)) return handlePaneAction(ctx, action)
  // ViewOp is the fallback — no type guard needed
  return handleViewAction(ctx, action as ViewOp)
}

// =============================================================================
// Sub-Handlers (focused switches, each ≤25 cases)
// =============================================================================

/** VerbOp: verb x location actions (4 cases). */
function handleVerbAction(ctx: ActionCtx, action: VerbOp): ActionResult {
  switch (action.type) {
    case "CURSOR_TO": {
      // "{parent}" is special: zoom outwards (view-level, not positional)
      if (action.locationKey === "{parent}" || action.locationKey === "parent") {
        handleZoomOutwards(ctx)
        return ok()
      }
      const cursorTarget = resolveLocationKey(action.locationKey, ctx, ctx.repo)
      // Auto-create missing files for date-template locations (e.g., journal)
      if (!cursorTarget) {
        const created = autoCreateDateTemplateFile(action.locationKey, ctx)
        if (created) {
          // File created — watcher will pick it up. Press g j again to navigate.
          ctx.toastQueue.success("Press again to navigate")
          ctx.setUI({})
          return ok()
        }
      }
      if (!cursorTarget) {
        ctx.toastQueue.warning(`"${action.locationKey}" not found`)
        ctx.setUI({})
        return ok()
      }
      if (isPickTarget(cursorTarget)) {
        pushDialogMode("dialog:picker")
        ctx.closeDetailPane()
        ctx.setUI({ activePicker: { type: "project" } })
        clearSelection(ctx)
        return ok()
      }
      handleCursorTo(ctx, cursorTarget)
      return ok()
    }
    case "REPARENT_TO": {
      // "{parent}" is special: structural outdent (tree-level, not positional)
      if (action.locationKey === "{parent}" || action.locationKey === "parent") {
        const nodeId = ctx.cursorNodeId
        if (!nodeId) return boundary("outdent", "no cursor")
        const node = ctx.repo.getNode(nodeId)
        if (!node) return boundary("outdent", "node not found")
        if (!outdentNode(ctx, node)) return boundary("outdent", "can't outdent further")
        return ok()
      }
      const moveTarget = resolveLocationKey(action.locationKey, ctx, ctx.repo)
      if (!moveTarget) {
        ctx.toastQueue.warning(`"${action.locationKey}" not found`)
        ctx.setUI({})
        return ok()
      }
      if (isPickTarget(moveTarget)) {
        ctx.setUI({ activePicker: { type: "project" } })
        return ok()
      }
      return handleReparentTo(ctx, moveTarget)
    }
    case "LINK_TO": {
      const linkTarget = resolveLocationKey(action.locationKey, ctx, ctx.repo)
      if (!linkTarget) {
        ctx.toastQueue.warning(`"${action.locationKey}" not found`)
        ctx.setUI({})
        return ok()
      }
      return handleLinkTo(ctx, linkTarget)
    }
    case "CREATE_AT": {
      const createTarget = resolveLocationKey(action.locationKey, ctx, ctx.repo)
      if (!createTarget) {
        ctx.toastQueue.warning(`"${action.locationKey}" not found`)
        ctx.setUI({})
        return ok()
      }
      return handleCreateAt(ctx, createTarget)
    }
    // VerbAction is a single interface (not a DU) — TS can't narrow to never.
    // The isVerbOp type guard guarantees only verb types reach here.
  }
}

/** NavOp: cursor movement, zoom, page jumps, history (12 cases). */
function handleNavAction(ctx: ActionCtx, action: NavOp): ActionResult {
  switch (action.type) {
    case "CURSOR_MOVE":
      // Navigate-away saves: confirm inline edit before moving cursor.
      if (ctx.ui.inlineEditBlock && activeEditTargetRef.current) {
        activeEditTargetRef.current.confirm()
      }
      return handleCursorMove(ctx, action.dir)
    case "NAV_BACK":
      return handleNavBack(ctx)
    case "NAV_FORWARD":
      return handleNavForward(ctx)
    case "NAV_SIBLING_BOARD":
      return handleNavSiblingBoard(ctx, action.direction)
    case "ZOOM_INWARDS":
      return handleZoomInwards(ctx)
    case "ZOOM_OUTWARDS":
      return handleZoomOutwards(ctx)
    case "ZOOM_TO_ROOT":
      return handleZoomToRoot(ctx)
    case "FOLLOW_LINK":
      return handleFollowLink(ctx)
    case "PAGE_JUMP":
      handlePageJump(ctx, action.direction)
      return ok()
    case "JUMP_TO_COLUMN":
      return handleJumpToColumn(ctx, action.columnNumber)
    case "FOLD_LEVEL": {
      const cardIds = ctx.columns.flatMap((col) => col.cardNodes.map((c) => c.id))
      const result = reducerApplyFoldLevel(extractFoldState(ctx), cardIds)
      applyFoldEffects(ctx, result)
      return ok()
    }
    case "UNFOLD_LEVEL": {
      const cardIds = ctx.columns.flatMap((col) => col.cardNodes.map((c) => c.id))
      const result = reducerApplyUnfoldLevel(extractFoldState(ctx), cardIds)
      applyFoldEffects(ctx, result)
      return ok()
    }
    default:
      assertNever(action)
  }
}

/** EditOp: structural editing — insert, delete, move, indent, clipboard (24 cases). */
// oxlint-disable-next-line complexity/complexity -- Exhaustive edit action switch
function handleEditAction(ctx: ActionCtx, action: EditOp): ActionResult {
  const col = ctx.column
  const card = ctx.card

  switch (action.type) {
    case "ENTER_INLINE_EDIT": {
      if (isDialogConfirmGracePeriod()) {
        log.debug?.("ENTER_INLINE_EDIT suppressed: dialog confirm grace period")
        return ok()
      }
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
    case "INDENT_NODE": {
      if (!card && col) return handleIndentColumn(ctx, col)
      if (!card) return boundary("indent", "No card to indent")
      // Resolve actual target: inline edit node OR cursor node (spatial nav),
      // falling back to card. Ensures Tab operates on the selected sub-item
      // in both normal mode (J/K navigated to sub-item) and edit mode.
      const indentTargetId = ctx.ui.inlineEditBlock?.nodeId ?? ctx.cursorNodeId
      const indentTarget = indentTargetId && indentTargetId !== card.id ? ctx.repo.getNode(indentTargetId) : null
      if (!indentNode(ctx, indentTarget ?? card)) return boundary("indent", "Can't indent further")
      return ok()
    }
    case "OUTDENT_NODE": {
      if (!card) return boundary("outdent", "No card to outdent")
      const outdentTargetId = ctx.ui.inlineEditBlock?.nodeId ?? ctx.cursorNodeId
      const outdentTarget = outdentTargetId && outdentTargetId !== card.id ? ctx.repo.getNode(outdentTargetId) : null
      if (!outdentNode(ctx, outdentTarget ?? card)) return boundary("outdent", "Can't outdent further")
      return ok()
    }
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
    case "DELETE_NODE":
      handleDeleteNode(ctx)
      return ok()
    case "DUPLICATE_NODE":
      handleDuplicateNode(ctx, action.nodeId)
      return ok()
    case "OPEN_IN_SYSTEM":
      handleOpenInSystem(ctx, action.nodeId)
      return ok()
    case "OPEN_IN_TERMINAL":
      handleOpenInTerminal(ctx, action.nodeId)
      return ok()
    case "CLIPBOARD_COPY":
      return handleClipboardCopy(ctx, "copy")
    case "CLIPBOARD_CUT":
      return handleClipboardCopy(ctx, "cut")
    case "CLIPBOARD_PASTE":
      return handleClipboardPaste(ctx)
    case "ADD_LINK":
      ctx.toastQueue.info("Link picker not yet implemented")
      ctx.setUI({})
      return ok()
    case "REPARENT_PICKER":
      ctx.setUI({ activePicker: { type: "project" } })
      return ok()
    case "ARCHIVE_NODE":
      return unimplemented("ui")
    case "TASK_SET_STATUS":
      handleTaskStatusCycle(ctx)
      return ok()
    case "CLEAR_TASK":
      handleClearTask(ctx)
      return ok()
    case "SHIFT_UP":
      return handleShiftCard(ctx, "up")
    case "SHIFT_DOWN":
      return handleShiftCard(ctx, "down")
    case "SHIFT_LEFT":
      return handleShiftCard(ctx, "left")
    case "SHIFT_RIGHT":
      return handleShiftCard(ctx, "right")
    default:
      assertNever(action)
  }
}

/** TextOp: character-level editing dispatched to EditTarget (22 cases). */
// oxlint-disable-next-line complexity/complexity -- Exhaustive text action switch with inline edit logic
function handleTextAction(ctx: ActionCtx, action: TextOp): ActionResult {
  switch (action.type) {
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
            const changes: Partial<typeof node> = { ...conversion.nodeChanges }
            if (KNode.isOutline({ type: changes.type ?? node.type, item: changes.item ?? node.item })) {
              changes.name = remainingText
              changes.content = remainingText
            } else if (changes.item?.task?.marker) {
              const fakeNode = { ...node, ...changes } as typeof node
              changes.content = setEditableText(fakeNode, remainingText)
              if (!changes.type) changes.type = "p"
              if (changes.item === undefined) changes.item = {}
            } else {
              changes.content = remainingText
            }
            if (changes.type && !KNode.isOutline({ type: changes.type, item: changes.item }) && KNode.isOutline(node)) {
              changes.name = undefined
              changes.fstype = undefined
            }
            if (
              changes.type &&
              !KNode.isListItem({ type: changes.type, item: changes.item }) &&
              KNode.isListItem(node)
            ) {
              if (changes.item) {
                const { list: _, ...rest } = changes.item
                changes.item = rest
              }
            }
            runRepoEffect(ctx, { type: "REPO_UPDATE_NODE", nodeId, updates: changes })
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
          ctx.setUI({ inlineEditBlock: null })
          executeDelete(ctx, nodeId)
          return ok()
        }
        const node = ctx.repo.getNode(nodeId)
        if (node) {
          const degradation = backspaceDegradation(node, ctx.repo, nodeId)
          if (degradation) {
            ctx.undoHandle.setCursor(ctx.cursorNodeId)
            applyDegradation(node, degradation, content)
            runRepoEffect(ctx, { type: "REPO_UPDATE_NODE", nodeId, updates: degradation })
            ctx.dispatchBoard({ type: "SELECT", nodeId: ctx.cursorNodeId })
            return ok()
          }
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
          const nodeId = ctx.ui.inlineEditBlock.nodeId
          ctx.setUI({ inlineEditBlock: null })
          executeDelete(ctx, nodeId)
        } else if (cursor >= content.length) {
          const nodeId = ctx.ui.inlineEditBlock.nodeId
          const nextNode = getNextSibling(ctx.repo, nodeId)
          if (nextNode) {
            const degradation = backspaceDegradation(nextNode, ctx.repo, nextNode.id)
            if (degradation) {
              ctx.undoHandle.setCursor(ctx.cursorNodeId)
              applyDegradation(nextNode, degradation, getEditableText(nextNode))
              runRepoEffect(ctx, { type: "REPO_UPDATE_NODE", nodeId: nextNode.id, updates: degradation })
              ctx.dispatchBoard({ type: "SELECT", nodeId: ctx.cursorNodeId })
              return ok()
            }
          }
          fwdTarget.save()
          ctx.undoHandle.setCursor(ctx.cursorNodeId)
          ctx.undoHandle.startBatch("Merge forward")
          const result = mergeWithNext(ctx.repo, nodeId)
          ctx.undoHandle.endBatch()
          if (result) {
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
      if (!moved) return handleEditBlockNavigate(ctx, "up", true)
      return ok()
    }
    case "TEXT_CURSOR_DOWN": {
      const moved = activeEditTargetRef.current?.cursorDown() ?? false
      if (!moved) return handleEditBlockNavigate(ctx, "down", true)
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
      const target = activeEditTargetRef.current
      if (target) target.save()
      if (ctx.ui.inlineEditBlock) ctx.setUI({ inlineEditBlock: null })
      return ok()
    }
    case "TEXT_LINEBREAK_SPLIT":
      return handleLinebreakSplit(ctx)
    case "TEXT_LINEBREAK_BEFORE":
      activeEditTargetRef.current?.save()
      handleLinebreakSibling(ctx, "before")
      return ok()
    case "TEXT_LINEBREAK_AFTER":
      activeEditTargetRef.current?.save()
      handleLinebreakSibling(ctx, "after")
      return ok()
    case "TEXT_LINEBREAK_CHILD":
      activeEditTargetRef.current?.save()
      handleAddNodeChildFirst(ctx)
      return ok()
    case "TEXT_CHILD_BLOCK":
      activeEditTargetRef.current?.save()
      handleAddNodeChild(ctx)
      return ok()
    case "TEXT_EXIT_EDIT": {
      const target = activeEditTargetRef.current
      if (ctx.ui.inlineEditBlock) {
        target?.save()
        ctx.setUI({ inlineEditBlock: null })
      } else {
        target?.cancel()
      }
      return ok()
    }
    case "TEXT_BOLD":
    case "TEXT_ITALIC":
      return unimplemented("text.formatting")
    case "TEXT_YANK":
      return unimplemented("text.yank")
    default:
      assertNever(action)
  }
}

/** BoardOp: selection, fold, visual mode, move mode, content lines (25+ cases). */
// oxlint-disable-next-line complexity/complexity -- Exhaustive board state switch with fold logic
function handleBoardAction(ctx: ActionCtx, action: BoardOp): ActionResult {
  const col = ctx.column
  const card = ctx.card

  switch (action.type) {
    case "SELECT":
      if (ctx.ui.columnScrollAnchor !== null) {
        ctx.setUI({ columnScrollAnchor: null })
      }
      ctx.dispatchBoard(action)
      return ok()
    case "SET_ROOT":
    case "SET_CURSWANT":
    case "SET_COLLAPSED_NODES":
      ctx.dispatchBoard(action)
      return ok()
    case "TOGGLE_FOLD":
      return handleToggleFold(ctx)
    case "TOGGLE_COLLAPSE": {
      const collapseNodeId = col?.node.id
      if (!collapseNodeId) return boundary("collapse", "No column to collapse")
      if (collapseNodeId.startsWith("__body__")) return boundary("collapse", "Body column cannot be collapsed")
      const wasCollapsed = ctx.collapsedNodes?.has(collapseNodeId) ?? false
      ctx.undoHandle.setCursor(ctx.cursorNodeId)

      // Snapshot fold state before toggle (for undo)
      const foldStateBefore = {
        foldDepths: new Map(ctx.foldDepths),
        collapsedNodes: new Set(ctx.collapsedNodes),
      }

      // Calculate new fold state after toggle
      const newCollapsed = new Set(ctx.collapsedNodes)
      if (newCollapsed.has(collapseNodeId)) {
        newCollapsed.delete(collapseNodeId)
      } else {
        newCollapsed.add(collapseNodeId)
      }
      const foldStateAfter = {
        foldDepths: new Map(ctx.foldDepths),
        collapsedNodes: newCollapsed,
      }

      const colNode = ctx.repo.getNode(collapseNodeId)
      if (colNode) {
        const existingData = colNode.data
        if (!wasCollapsed) {
          runRepoEffect(ctx, {
            type: "REPO_UPDATE_NODE",
            nodeId: collapseNodeId,
            updates: { data: { ...existingData, collapsed: true } },
          })
        } else {
          const { collapsed: _, ...rest } = existingData
          runRepoEffect(ctx, { type: "REPO_UPDATE_NODE", nodeId: collapseNodeId, updates: { data: rest } })
        }
      }

      // Push undo entry with fold state
      ctx.undoStack.push({
        label: "Collapse",
        cursorNodeId: ctx.cursorNodeId,
        foldStateBefore,
        foldStateAfter,
        undo: () => {
          // Fold state restoration is handled by the caller (undo handler in board-actions.ts)
        },
        redo: () => {
          // Fold state restoration is handled by the caller (redo handler in board-actions.ts)
        },
      })

      ctx.dispatchBoard({ type: "TOGGLE_COLLAPSE", nodeId: collapseNodeId })
      if (!wasCollapsed && ctx.cursorNodeId !== collapseNodeId) {
        ctx.dispatchBoard({ type: "SELECT", nodeId: collapseNodeId })
      }
      return ok()
    }
    case "ZOOM_IN":
      return handleZoomIn(ctx)
    case "FOLD_NODE": {
      const roots = getFoldTargetRoots(ctx, card)
      const scope = action.scope ?? "card"
      if (scope !== "root" && roots.length === 0) return boundary("fold", "no card or column selected")
      const columnCardIds = ctx.columns.flatMap((col) => col.cardNodes.map((c) => c.id))
      const result = reducerApplyFoldNode(extractFoldState(ctx), scope, ctx.rootId ?? "", roots, columnCardIds)
      if (result.effects.length === 0) return boundary("fold", "already fully folded")
      applyFoldEffects(ctx, result)
      return ok()
    }
    case "UNFOLD_NODE": {
      const roots = getFoldTargetRoots(ctx, card)
      const scope = action.scope ?? "card"
      if (scope !== "root" && roots.length === 0) return boundary("fold", "no card or column selected")
      const columnCardIds = ctx.columns.flatMap((col) => col.cardNodes.map((c) => c.id))
      const result = reducerApplyUnfoldNode(extractFoldState(ctx), scope, ctx.rootId ?? "", roots, columnCardIds)
      if (result.effects.length === 0) return boundary("fold", "maximum depth reached")
      applyFoldEffects(ctx, result)
      return ok()
    }
    case "UNFOLD_RECURSIVE": {
      if (!card) return boundary("fold", "no card selected")
      // Pre-compute which fold entries are descendants of this card
      const cardId = card.id
      const descendantFoldIds: string[] = []
      for (const [id] of ctx.foldDepths) {
        if (id === cardId) continue
        let nodeId: string | null = id
        while (nodeId) {
          const n = ctx.repo.getNode(nodeId)
          if (!n?.parent_id) break
          if (n.parent_id === cardId) {
            descendantFoldIds.push(id)
            break
          }
          nodeId = n.parent_id
        }
      }
      const result = reducerApplyUnfoldRecursive(extractFoldState(ctx), cardId, descendantFoldIds)
      applyFoldEffects(ctx, result)
      return ok()
    }
    case "SELECT_ALL":
      progressiveSelectAll(ctx)
      return ok()
    case "SELECT_NODE_TOGGLE": {
      const selected = new Set(ctx.ui.multiSelected)
      if (selected.has(action.nodeId)) selected.delete(action.nodeId)
      else selected.add(action.nodeId)
      ctx.setUI({ multiSelected: selected })
      return ok()
    }
    case "SELECT_NODE_ADD": {
      const selected = new Set(ctx.ui.multiSelected)
      selected.add(action.nodeId)
      ctx.setUI({ multiSelected: selected })
      return ok()
    }
    case "SELECT_NODE_REMOVE": {
      const selected = new Set(ctx.ui.multiSelected)
      selected.delete(action.nodeId)
      ctx.setUI({ multiSelected: selected })
      return ok()
    }
    case "CLEAR_SELECTION":
      clearSelection(ctx)
      return ok()
    case "VISUAL_MODE_ENTER": {
      if (!ctx.cursorNodeId) return boundary("visual", "no cursor")
      const anchorKey = ctx.cursorNodeId
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
    case "SELECT_ALL_SIBLINGS":
      return unimplemented("selection")
    case "ENTER_MOVE_MODE": {
      const nodeIds: string[] = []
      if (ctx.ui.multiSelected.size > 0) {
        for (const selKey of ctx.ui.multiSelected) {
          if (selKey && !nodeIds.includes(selKey)) {
            nodeIds.push(selKey)
          }
        }
      }
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
    case "HIDE_NODE":
      return handleHideNode(ctx)
    case "TOGGLE_SHOW_HIDDEN":
      ctx.setUI((prev) => ({ showHidden: !prev.showHidden }))
      return ok()
    default:
      assertNever(action)
  }
}

/** DialogOp: pickers, filter, favorites, date prompts, search, confirmations (44 cases). */
// oxlint-disable-next-line complexity/complexity -- Exhaustive dialog switch covering all dialog/filter/search/property actions
function handleDialogAction(ctx: ActionCtx, action: DialogOp): ActionResult {
  switch (action.type) {
    case "SHOW_NEW_ITEM_DIALOG":
      pushDialogMode("dialog:newItem")
      ctx.closeDetailPane()
      ctx.setUI({ showNewItemDialog: true })
      clearSelection(ctx)
      return ok()
    case "SHOW_ITEM_PICKER":
      if (ctx.card || ctx.focusedPaneViewType() === "empty") {
        pushDialogMode("dialog:picker")
        ctx.closeDetailPane()
        ctx.setUI({ activePicker: { type: "project" } })
        clearSelection(ctx)
      }
      return ok()
    case "SHOW_TASK_DIALOG":
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
      ctx.setUI({ filterText: action.text, showFilterDialog: false })
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
    case "TOGGLE_HIDE_DONE": {
      const activeStatuses = new Set(["todo", "wip", "blocked"])
      const current = ctx.ui.filterProperties.taskStatus
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
    case "COMMAND_PALETTE":
      if (ctx.ui.showOmnibox) {
        popDialogMode()
        ctx.setUI({ showOmnibox: false })
      } else {
        pushDialogMode("dialog:omnibox")
        ctx.setUI({ showOmnibox: true })
        clearSelection(ctx)
      }
      return ok()
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
            if (row.key === "viewMode") {
              ctx.navigator.clearStickyY()
              ctx.setUI({ viewMode: val.value as ViewMode })
            } else {
              ctx.setUI({ [row.key]: val.value as IconStyle })
            }
          } else {
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
    case "DELETE_CONFIRM_EXECUTE":
      if (ctx.ui.deleteConfirm) {
        executeBatchDelete(ctx, ctx.ui.deleteConfirm.nodeIds)
      }
      ctx.setUI({ deleteConfirm: null })
      return ok()
    case "DELETE_CONFIRM_CANCEL":
      ctx.setUI({ deleteConfirm: null })
      return ok()
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
    case "DATE_PROMPT_CONFIRM":
      return handleDatePromptConfirm(ctx)
    case "DATE_PROMPT_CANCEL":
      popDialogMode()
      ctx.setUI({ datePrompt: null })
      return ok()
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
      if (ctx.ui.localSearch) {
        ctx.setUI({
          localSearch: { ...ctx.ui.localSearch, isInputActive: false },
        })
      }
      return ok()
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
    default:
      assertNever(action)
  }
}

/** PaneOp: split, close, focus, resize, detail pane (15 cases). */
function handlePaneAction(ctx: ActionCtx, action: PaneOp): ActionResult {
  switch (action.type) {
    case "PANE_SPLIT": {
      const layoutDir = action.direction === "vertical" ? "h" : "v"
      ctx.splitFocusedPane(layoutDir)
      return ok()
    }
    case "PANE_CLOSE":
      ctx.closeFocusedPane()
      return ok()
    case "PANE_FOCUS":
      ctx.focusPaneInDirection(action.direction)
      ctx.syncFocusScope()
      return ok()
    case "PANE_FOCUS_PREVIOUS":
      ctx.focusPreviousPane()
      ctx.syncFocusScope()
      return ok()
    case "PANE_FOCUS_CYCLE":
      ctx.cyclePaneFocus(action.direction)
      ctx.syncFocusScope()
      return ok()
    case "PANE_FOCUS_NUMBER":
      ctx.focusPaneByNumber(action.number)
      ctx.syncFocusScope()
      return ok()
    case "PANE_RESIZE":
      ctx.resizeFocusedPane(action.delta, "h")
      return ok()
    case "PANE_RESIZE_VERTICAL":
      ctx.resizeFocusedPane(action.delta, "v")
      return ok()
    case "PANE_EQUALIZE":
      ctx.equalizePanes()
      return ok()
    case "PANE_ZOOM":
      ctx.zoomFocusedPane()
      return ok()
    case "PANE_ONLY":
      ctx.closeAllButFocused()
      return ok()
    case "PANE_SWAP":
      ctx.swapPaneInDirection(action.direction)
      return ok()
    case "PANE_SPLIT_AND_PICK":
      ctx.splitFocusedPane("h")
      pushDialogMode("dialog:picker")
      ctx.closeDetailPane()
      ctx.setUI({ activePicker: { type: "project" } })
      clearSelection(ctx)
      return ok()
    case "CLOSE_DETAIL_PANE": {
      const boardPane = ownerPaneId(ctx.focusedPaneId())
      ctx.closeDetailPane()
      ctx.focusPaneById(boardPane)
      ctx.syncFocusScope()
      return ok()
    }
    case "TOGGLE_DETAIL_PANE": {
      const boardPaneId = ownerPaneId(ctx.focusedPaneId())
      const wasOpen = ctx.hasDetailPane
      ctx.toggleDetailPane()
      if (!wasOpen) {
        ctx.focusPaneById(detailPaneIdFor(boardPaneId))
      } else {
        ctx.focusPaneById(boardPaneId)
      }
      ctx.syncFocusScope()
      return ok()
    }
    default:
      assertNever(action)
  }
}

/** ViewOp: lifecycle, view modes, help, console, history, misc (23 cases). */
function handleViewAction(ctx: ActionCtx, action: ViewOp): ActionResult {
  switch (action.type) {
    case "QUIT":
      ctx.exit()
      return ok()
    case "CLOSE_OR_QUIT":
      return handleCloseOrQuit(ctx)
    case "CYCLE_VIEW_MODE":
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
    case "HISTORY_UNDO": {
      if (!ctx.undoHandle.canUndo()) return boundary("undo", "Nothing to undo")
      const result = ctx.undoHandle.undo()
      const cursorNodeId = result.ok && result.cursorNodeId != null ? result.cursorNodeId : ctx.cursorNodeId
      ctx.dispatchBoard({ type: "SELECT", nodeId: cursorNodeId })
      // Restore fold state if captured in the undo entry
      if (result.foldState) {
        ctx.setFoldDepths(result.foldState.foldDepths)
        ctx.dispatchBoard({ type: "SET_COLLAPSED_NODES", nodeIds: Array.from(result.foldState.collapsedNodes) })
      }
      if (result.label) ctx.setUI({ status: { level: "info", message: `Undo: ${result.label}` } })
      return ok()
    }
    case "HISTORY_REDO": {
      if (!ctx.undoHandle.canRedo()) return boundary("redo", "Nothing to redo")
      const result = ctx.undoHandle.redo()
      ctx.dispatchBoard({ type: "SELECT", nodeId: ctx.cursorNodeId })
      // Restore fold state if captured in the redo entry
      if (result.foldState) {
        ctx.setFoldDepths(result.foldState.foldDepths)
        ctx.dispatchBoard({ type: "SET_COLLAPSED_NODES", nodeIds: Array.from(result.foldState.collapsedNodes) })
      }
      if (result.label) ctx.setUI({ status: { level: "info", message: `Redo: ${result.label}` } })
      return ok()
    }
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
    case "TOAST_DISMISS": {
      const latest = ctx.toastQueue.getLatest()
      if (latest?.action && typeof latest.action.trigger === "function") {
        latest.action.trigger()
      } else {
        ctx.toastQueue.dismissAll()
      }
      ctx.setUI({})
      return ok()
    }
    case "NOOP":
      return ok()
    case "INCREASE_OUTLINE_DEPTH":
    case "DECREASE_OUTLINE_DEPTH":
      return ok()
    case "CAPTURE":
    case "SETTINGS":
      return unimplemented("ui")
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

/** Derive fstype from parent context (not inherited from source). */
function deriveFsType(parent: KNode): KNode["fstype"] | undefined {
  if (parent.fstype === "mdfile" || parent.fstype === "mdsection") return "mdsection"
  if (parent.fstype === "folder") return "mdfile"
  return undefined
}

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
  const newSortOrder = midpoint(currentIdx, adjacentIdx)

  const parentNode = repo.getNode(parentId)
  const newNode: Partial<KNode> = {
    ...KNode.extractProps(currentNode),
    content: "",
    parent_idx: newSortOrder,
    fstype: parentNode ? deriveFsType(parentNode) : undefined,
  }

  ctx.undoHandle.setCursor(nodeId)
  const newId = repo.addNode(parentId, newNode)
  ctx.dispatchBoard({ type: "SELECT", nodeId: newId })
  ctx.setUI({ inlineEditBlock: { nodeId: newId, blockIndex: 0 } })
  requestRenderFlush()
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
    runRepoEffect(ctx, { type: "REPO_UPDATE_NODE", nodeId, updates: { content: editText } })
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
    requestRenderFlush()
  } catch {
    ctx.undoHandle.endBatch()
    ctx.setUI({ bellState: "split-failed" })
  }

  return ok()
}

/** Check if a node has visible item children (not folded, has items).
 *  Checks for any `item: {}` children — not just `type: "h"` outline nodes —
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
  const { sortOrder: newSortOrder } = Tree.toSortOrder(repo, Position.first(nodeId))

  const newChild: Partial<KNode> = {
    ...KNode.extractProps(node),
    content: afterText,
    parent_idx: newSortOrder,
    fstype: deriveFsType(node),
  }

  const afterId = repo.addNode(nodeId, newChild)
  repo.updateNode(nodeId, { content: beforeText })

  return { beforeId: nodeId, afterId }
}

/** Enter at end of title with visible children → insert empty node as FIRST child.
 *  Inherits all non-system properties from the parent node via extractProps()
 *  so that pressing Enter on a task creates another task (not a plain list item). */
function handleAddNodeChildFirst(ctx: ActionCtx): void {
  const cursorId = ctx.cursorNodeId
  if (!cursorId) return

  const { repo } = ctx
  const parentNode = repo.getNode(cursorId)
  if (!parentNode) return

  // Sort order before existing first child (or 0 if none)
  const { sortOrder: newSortOrder } = Tree.toSortOrder(repo, Position.first(cursorId))

  const newNode: Partial<KNode> = {
    ...KNode.extractProps(parentNode),
    content: "",
    parent_idx: newSortOrder,
    fstype: deriveFsType(parentNode),
  }

  ctx.undoHandle.setCursor(cursorId)
  const newId = repo.addNode(cursorId, newNode)
  ctx.dispatchBoard({ type: "SELECT", nodeId: newId })
  ctx.setUI({ inlineEditBlock: { nodeId: newId, blockIndex: 0 } })
  requestRenderFlush()
}

/** Find next/prev editable node using tree traversal.
 *  Cards at column level use col.cardNodes for sibling lookup.
 *  Sub-section nodes walk siblings via extractBody().items, then recurse up
 *  to the parent level — so sub→sibling, sub→next-card, and card→card all work. */
function findAdjacentEditNode(
  repo: ActionCtx["repo"],
  nodeId: string,
  direction: "up" | "down",
  col: ColumnView | undefined,
): KNode | null {
  const node = repo.getNode(nodeId)
  if (!node?.parent_id) return null

  // If this node is a card (in col.cardNodes), navigate between cards
  const cardIdx = col?.cardNodes.findIndex((c) => c.id === nodeId) ?? -1
  if (cardIdx !== -1) {
    const adjIdx = cardIdx + (direction === "down" ? 1 : -1)
    return col?.cardNodes[adjIdx] ?? null
  }

  // Sub-section: walk structural siblings under the same parent
  const allChildren = repo.getChildren(node.parent_id)
  const { items } = extractBody(allChildren)
  const idx = items.findIndex((s) => s.id === nodeId)

  if (idx !== -1) {
    const nextIdx = idx + (direction === "down" ? 1 : -1)
    if (nextIdx >= 0 && nextIdx < items.length) return items[nextIdx]!
  }

  // No sibling in that direction — recurse up to parent level
  return findAdjacentEditNode(repo, node.parent_id, direction, col)
}

function handleEditBlockNavigate(ctx: ActionCtx, direction: "up" | "down", exitAtBoundary = false): ActionResult {
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

  // Past edges → save current content and try to enter edit on adjacent node
  activeEditTargetRef.current?.save()

  // When going down from a title and the node has item children (sub-sections),
  // descend into the first child instead of jumping to the next sibling/card.
  if (direction === "down" && edit.blockIndex === 0) {
    const children = ctx.repo.getChildren(edit.nodeId)
    const { items } = extractBody(children)
    if (items.length > 0) {
      const firstChild = items[0]!
      ctx.dispatchBoard({ type: "SELECT", nodeId: firstChild.id })
      ctx.setUI({
        inlineEditBlock: {
          nodeId: firstChild.id,
          blockIndex: 0,
          initialCursorPos: "start",
          stickyX,
        },
      })
      requestRenderFlush()
      return ok()
    }
  }

  // When going up from a title and this node has a previous sibling,
  // enter that sibling's LAST child (or last body block) instead of its title.
  // This gives proper "bottom-up" traversal matching the "top-down" descent above.

  // Find next/prev editable node using tree traversal instead of col.cardNodes lookup.
  // Walks siblings via extractBody().items, then recurses up parent levels.
  const adjacentNode = findAdjacentEditNode(ctx.repo, edit.nodeId, direction, ctx.column)

  if (adjacentNode) {
    const adjBodyCount = extractBody(ctx.repo.getChildren(adjacentNode.id)).body.length
    const adjBlockIndex = direction === "down" ? 0 : adjBodyCount
    ctx.dispatchBoard({ type: "SELECT", nodeId: adjacentNode.id })
    ctx.setUI({
      inlineEditBlock: {
        nodeId: adjacentNode.id,
        blockIndex: adjBlockIndex,
        initialCursorPos: direction === "down" ? "start" : "end",
        stickyX,
      },
    })
    requestRenderFlush()
    return ok()
  }

  // No adjacent node — bell (ctrl-n/p) or exit edit mode (arrow keys)
  if (exitAtBoundary) {
    ctx.setUI({ inlineEditBlock: null })
    return handleCursorMove(ctx, direction === "down" ? "down" : "up")
  }
  return boundary("edit_block_navigate", "no adjacent node")
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

  // Use pure reducer to compute before/after fold state for undo
  const foldStateBefore = {
    foldDepths: new Map(ctx.foldDepths),
    collapsedNodes: new Set(ctx.collapsedNodes),
  }
  const toggleResult = reducerApplyToggleFold(extractFoldState(ctx), card.id, true)
  const foldStateAfter = {
    foldDepths: toggleResult.state.foldDepths,
    collapsedNodes: new Set(ctx.collapsedNodes),
  }

  // Push undo entry with fold state
  ctx.undoStack.push({
    label: "Fold",
    cursorNodeId: ctx.cursorNodeId,
    foldStateBefore,
    foldStateAfter,
    undo: () => {
      // Fold state restoration is handled by the caller (undo handler in board-actions.ts)
    },
    redo: () => {
      // Fold state restoration is handled by the caller (redo handler in board-actions.ts)
    },
  })

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

/** Cursor to resolved Position: same-parent → SELECT sibling, cross-parent → ZOOM_IN to board. */
function handleCursorTo(ctx: ActionCtx, to: Position): void {
  const cursorNode = ctx.cursorNodeId ? ctx.repo.getNode(ctx.cursorNodeId) : null

  // Same parent — cursor to sibling at position
  if (cursorNode?.parent_id === to.parentId) {
    const target = Tree.nodeAt(ctx.repo, to)
    if (target) {
      ctx.dispatchBoard({ type: "SELECT", nodeId: target.id })
      clearSelection(ctx)
    }
    return
  }

  // @home sentinel — go to root
  if (to.parentId === "") {
    saveNavHistory(ctx)
    ctx.dispatchBoard({ type: "ZOOM_IN", nodeId: null })
    clearSelection(ctx)
    return
  }

  // If focused pane is empty, activate it as a board pane first
  if (ctx.focusedPaneViewType() === "empty") {
    ctx.activateEmptyPane()
  }

  // Cross-parent — navigate to that board
  saveNavHistory(ctx)
  const children = ctx.repo.getChildren(to.parentId)
  ctx.dispatchBoard({ type: "ZOOM_IN", nodeId: to.parentId, cursorNodeId: children[0]?.id ?? null })
  clearSelection(ctx)
}

/** Move node(s) to resolved Position: same-parent → reorder, cross-parent → reparent batch. */
function handleReparentTo(ctx: ActionCtx, to: Position): ActionResult {
  const cards = Selection.nodes(ctx)
  if (cards.length === 0) return boundary("move", "no selection")

  // Same-parent reorder (single node) — quick path
  if (cards.length === 1 && cards[0]!.parent_id === to.parentId) {
    const nodeId = cards[0]!.id
    if (Tree.isAtPosition(ctx.repo, nodeId, to)) return ok()
    ctx.undoHandle.setCursor(nodeId)
    Tree.moveTo(ctx.repo, nodeId, to)
    ctx.dispatchBoard({ type: "SELECT", nodeId })
    return ok()
  }

  // Cross-parent or multi-selection — batch move
  const { moved } = Selection.moveTo(ctx, to)
  clearSelection(ctx)
  const targetNode = ctx.repo.getNode(to.parentId)
  ctx.toastQueue.success(`Moved ${moved} item(s) to ${targetNode?.name ?? to.parentId}`)
  ctx.setUI({})
  return ok()
}

/**
 * Handle LINK_TO verb action — add link/property by locationKey.
 * Absorbs the old ADD_LINK_TO_BOARD, ADD_LINK_TO_FAVORITE, SET_LABEL,
 * SET_ASSIGNEE, ADD_LINK, and REPARENT_PICKER (for "pick:+") action types.
 */
/** Handle LINK_TO with resolved target. */
function handleLinkTo(ctx: ActionCtx, to: Position | PickTarget): ActionResult {
  if (isPickTarget(to)) {
    const pickerType = to.pick === "#" ? "tag" : to.pick === "@" ? "assignee" : to.pick === "+" ? "project" : null
    if (!pickerType) {
      ctx.toastQueue.info("Link picker not yet implemented")
      ctx.setUI({})
      return ok()
    }
    pushDialogMode("dialog:picker")
    ctx.closeDetailPane()
    ctx.setUI({ activePicker: { type: pickerType } })
    clearSelection(ctx)
    return ok()
  }

  // Position → add link (stub)
  const targetNode = ctx.repo.getNode(to.parentId)
  ctx.toastQueue.info(`Add link to "${targetNode?.name ?? to.parentId}" not yet implemented`)
  ctx.setUI({})
  return ok()
}

/** Handle CREATE_AT with resolved target (stub). */
function handleCreateAt(ctx: ActionCtx, to: Position | PickTarget): ActionResult {
  if (isPickTarget(to)) {
    ctx.toastQueue.info("Create with picker not yet implemented")
    ctx.setUI({})
    return ok()
  }
  const targetNode = ctx.repo.getNode(to.parentId)
  ctx.toastQueue.info(`Create at "${targetNode?.name ?? to.parentId}" not yet implemented`)
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

  if (ctx.moveState.active) {
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
        isFolder: KNode.isOutline(current) && current.fstype === "folder",
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

function handleHideNode(ctx: ActionCtx): ActionResult {
  const { repo } = ctx
  // Always hide at column level — Board.tsx filters columns, not individual cards.
  const node = ctx.column?.node
  if (!node) return boundary("hide", "No node to hide")

  const hiddenPath = computeHiddenPath(node, repo)
  if (!hiddenPath) return boundary("hide", "Cannot compute hidden path")

  const hiddenPaths = readBoardHidden(repo.path)
  if (isHidden(hiddenPaths, node, repo)) {
    removeHidden(repo.path, hiddenPath)
    ctx.toastQueue.info(`Un-hidden: ${hiddenPath}`)
  } else {
    addHidden(repo.path, hiddenPath)
    ctx.toastQueue.info(`Hidden: ${hiddenPath}`)

    // Move cursor to adjacent column since this one is now hidden
    const colIndex = ctx.columns.findIndex((c) => c.node.id === node.id)
    const targetCol = ctx.columns[colIndex + 1] ?? (colIndex > 0 ? ctx.columns[colIndex - 1] : undefined)
    if (targetCol) {
      ctx.dispatchBoard({
        type: "SELECT",
        nodeId: targetCol.cardNodes[0]?.id ?? targetCol.node.id,
      })
    }
  }

  ctx.setUI((prev) => ({ hiddenVersion: prev.hiddenVersion + 1 }))
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
  return Selection.nodeIds(ctx)
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
    runRepoEffect(ctx, { type: "REPO_UPDATE_NODE", nodeId, updates: { priority: next } })
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
      runRepoEffect(ctx, { type: "REPO_UPDATE_NODE", nodeId, updates: { rrule: rrule ?? undefined } })
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
        runRepoEffect(ctx, { type: "REPO_UPDATE_NODE", nodeId, updates: { [field]: isoValue } })
      }
      const display = resolved.time ? `${resolved.date} ${resolved.time}` : resolved.date
      const label = field === "due_at" ? "Due" : "Start"
      ctx.toastQueue.info(`${label}: ${display}`)
    } else {
      // Clear the field
      for (const nodeId of nodeIds) {
        runRepoEffect(ctx, { type: "REPO_UPDATE_NODE", nodeId, updates: { [field]: null } })
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
  const cards = Selection.nodes(ctx)
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
      // Copy: duplicate node — extractProps strips system fields, restore source-specific fields
      const newNode: Partial<KNode> = {
        ...KNode.extractProps(sourceNode),
        content: sourceNode.content,
        name: sourceNode.name,
        fstype: sourceNode.fstype,
        item: sourceNode.item ? { ...sourceNode.item } : undefined,
        data: sourceNode.data ? { ...sourceNode.data } : undefined,
        parent_idx: baseSortOrder + i * 0.001,
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
