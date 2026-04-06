/**
 * Board Action Handlers
 *
 * Main dispatcher for command actions.
 * Delegates to specialized handler modules for different operation categories.
 *
 * These handlers bridge KmOp from @km/commands to actual state changes.
 * Eventually, commands will be directly executable (per km-mz2g design),
 * but this extraction is a first step to make Board.tsx manageable.
 *
 * Card operations follow the batch convention (see board-actions-edit.ts header):
 * gather → validate (all-or-nothing) → confirm? → execute → cleanup.
 * Every operation is batch-aware; single card = batch of 1.
 */

import { spawn } from "node:child_process"
import { dirname, join } from "node:path"
import type { KmOp, VerbOp, NavOp, EditOp, TextOp, BoardOp, DialogOp, PaneOp, ViewOp } from "@km/commands"
import { type OpResult, boundary, ok, unimplemented } from "@km/commands"
import { createLogger } from "loggily"
import * as chrono from "chrono-node"
import { naturalToRRule, onNodeChanged, createRuleContext } from "@km/storage"
import { addHidden, removeHidden, computeHiddenPath, isHidden, readBoardHidden } from "../hidden.ts"
import { ownerPaneId, detailPaneIdFor } from "./board-types.ts"
import { DETAIL_META_PREFIX } from "../views/detail-pane-items.ts"
import { assertNever } from "../action-handlers.ts"
import { markDialogConfirmed, isDialogConfirmGracePeriod, pushDialogMode, popDialogMode } from "../dialog-guard.ts"
import { indentNode, outdentNode } from "../keyboard/keyboard-card-ops.ts"
import { activeEditTargetRef, activeEditContextRef, copyToClipboard } from "@silvery/ag-react"
import { dialogTargetRef } from "../dialog-target.ts"
import { extractBody, detectPrefixConversion, degrade, KTree } from "@km/tree"
import { boardSplit, boardMergeBackward, boardMergeForward } from "./board-tree-ops.ts"
import { KNode, Position, extractTitleTaskMarker, type ItemData } from "@km/core"
import type { ID } from "@silvery/selection"
import { saveNavHistory } from "../keyboard/keyboard-helpers.ts"
import {
  clearSelection,
  progressiveSelectAll,
  getSelectedNodes,
  getSelectedNodeIds,
  moveSelectedTo,
} from "./board-selection-helpers.ts"
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
import type { OpCtx } from "../tui-context.ts"
import type { ViewMode } from "../types.ts"
import { createEmptyFilterProperties, VIEW_DIALOG_ROWS, type IconStyle } from "../state/ui-reducer.ts"

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
function autoCreateDateTemplateFile(locationKey: string, ctx: OpCtx): boolean {
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
  "TASK_CYCLE_STATUS",
  "CLEAR_TASK",
  "SHIFT_UP",
  "SHIFT_DOWN",
  "SHIFT_LEFT",
  "SHIFT_RIGHT",
] as const satisfies readonly EditOp["type"][]
const _edit: AssertComplete<EditOp["type"], typeof EDIT_TYPE_LIST> = true

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

// ViewOp types: everything not matched above (no Set needed — it's the fallback)

/**
 * Unified namespace for action category type guards.
 *
 * Usage: `ActionType.is("verb", action)` narrows to VerbOp.
 * Categories and their Sets are also exposed: `ActionType.verb`, `ActionType.nav`, etc.
 */
// oxlint-disable-next-line typescript/no-namespace -- intentional grouping of related type guards
namespace ActionType {
  /** Category name → narrowed Op type */
  interface CategoryMap {
    verb: VerbOp
    nav: NavOp
    edit: EditOp
    text: TextOp
    board: BoardOp
    dialog: DialogOp
    pane: PaneOp
  }

  export const verb: ReadonlySet<string> = new Set(VERB_TYPE_LIST)
  export const nav: ReadonlySet<string> = new Set(NAV_TYPE_LIST)
  export const edit: ReadonlySet<string> = new Set(EDIT_TYPE_LIST)
  export const text: ReadonlySet<string> = new Set(TEXT_TYPE_LIST)
  export const board: ReadonlySet<string> = new Set(BOARD_TYPE_LIST)
  export const dialog: ReadonlySet<string> = new Set(DIALOG_TYPE_LIST)
  export const pane: ReadonlySet<string> = new Set(PANE_TYPE_LIST)

  const sets: Record<keyof CategoryMap, ReadonlySet<string>> = { verb, nav, edit, text, board, dialog, pane }

  /** O(1) type guard: `ActionType.is("verb", action)` narrows action to VerbOp. */
  export function is<K extends keyof CategoryMap>(category: K, action: KmOp): action is CategoryMap[K] {
    return sets[category].has(action.type)
  }
}

// MAX_FOLD_DEPTH is now in board-reducer.ts

/** Extract BoardNavState from OpCtx for fold reducer functions. */
function extractFoldState(ctx: OpCtx): BoardNavState {
  return createBoardNavState({
    cursor: ctx.cursor,
    foldDepths: ctx.foldDepths,
    collapsedNodes: ctx.collapsedNodes,
    rootId: ctx.rootId,
  })
}

/** Apply effects from a Board.apply() result to the runtime. */
function applyFoldEffects(ctx: OpCtx, result: ApplyResult): void {
  runBoardEffects(ctx, result)
}

/** Short display name for a node (≤25 chars), suitable for toast messages. */
function shortName(ctx: OpCtx, nodeId: string | null | undefined): string {
  if (!nodeId) return "?"
  const node = ctx.repo.getNode(nodeId)
  const raw = node?.title ?? node?.name ?? nodeId.slice(-8)
  return raw.length > 25 ? raw.slice(0, 22) + "…" : raw
}

/** Determine fold target node IDs from selection → card → column fallback. */
function getFoldTargetRoots(ctx: OpCtx, card: KNode | null | undefined): string[] {
  const selected = getSelectedNodes(ctx)
  return selected.length > 0
    ? selected.map((c) => c.id)
    : card
      ? [card.id]
      : ctx.columnId
        ? [...ctx.tree.children(ctx.columnId)]
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
 * Returns OpResult: ok() on success, boundary/precondition/unimplemented on expected failure.
 * Callers should check result and provide feedback (e.g., ring bell for boundary).
 */
export function handleKmOp(ctx: OpCtx, action: KmOp): OpResult {
  if (ActionType.is("verb", action)) return handleVerbAction(ctx, action)
  if (ActionType.is("nav", action)) return handleNavAction(ctx, action)
  if (ActionType.is("edit", action)) return handleEditAction(ctx, action)
  if (ActionType.is("text", action)) return handleTextAction(ctx, action)
  if (ActionType.is("board", action)) return handleBoardReducerOp(ctx, action)
  if (ActionType.is("dialog", action)) return handleDialogAction(ctx, action)
  if (ActionType.is("pane", action)) return handlePaneAction(ctx, action)
  // ViewOp is the fallback — no type guard needed
  return handleViewAction(ctx, action as ViewOp)
}

// =============================================================================
// Sub-Handlers (focused switches, each ≤25 cases)
// =============================================================================

/** VerbOp: verb x location actions (4 cases). */
function handleVerbAction(ctx: OpCtx, action: VerbOp): OpResult {
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
        const nodeId = ctx.cursor
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
    // The ActionType.is("verb") type guard guarantees only verb types reach here.
  }
}

/** NavOp: cursor movement, zoom, page jumps, history (12 cases). */
function handleNavAction(ctx: OpCtx, action: NavOp): OpResult {
  switch (action.type) {
    case "CURSOR_MOVE":
      // Navigate-away saves: confirm inline edit before moving cursor.
      if (ctx.sel.text() && activeEditTargetRef.current) {
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
      // Cursor-always-visible: if cursor is inside a sub-item, nudge to its card before folding
      if (ctx.card && ctx.cursor && ctx.cursor !== ctx.card.id) {
        ctx.sel.node.select([ctx.card.id as ID])
      }
      const cardIds = getAllCardIds(ctx.tree)
      const result = reducerApplyFoldLevel(extractFoldState(ctx), cardIds)
      applyFoldEffects(ctx, result)
      const msg = result.depth === 0 ? "Folded to titles" : `Fold depth ${result.depth}`
      ctx.setUI({ status: { level: "info", message: msg } })
      return ok()
    }
    case "UNFOLD_LEVEL": {
      const cardIds = getAllCardIds(ctx.tree)
      const result = reducerApplyUnfoldLevel(extractFoldState(ctx), cardIds)
      applyFoldEffects(ctx, result)
      const msg = result.depth === null ? "All unfolded" : `Fold depth ${result.depth}`
      ctx.setUI({ status: { level: "info", message: msg } })
      return ok()
    }
    default:
      assertNever(action)
  }
}

/** EditOp: structural editing — insert, delete, move, indent, clipboard (24 cases). */
// oxlint-disable-next-line complexity/complexity -- Exhaustive edit action switch
function handleEditAction(ctx: OpCtx, action: EditOp): OpResult {
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
      ctx.sel.text.edit(action.nodeId as import("@silvery/selection").ID, 0)
      ctx.textEditHints = { blockIndex: action.blockIndex ?? 0 }
      return ok()
    }
    case "EDIT_BLOCK_NAVIGATE":
      return handleEditBlockNavigate(ctx, action.direction)
    case "INDENT_NODE": {
      if (!card && ctx.columnId) return handleIndentColumn(ctx, ctx.columnId)
      if (!card) return boundary("indent", "No card to indent")
      // Resolve actual target: inline edit node OR cursor node (spatial nav),
      // falling back to card. Ensures Tab operates on the selected sub-item
      // in both normal mode (J/K navigated to sub-item) and edit mode.
      const indentTargetId = ctx.sel.text()?.nodeId ?? ctx.cursor
      const indentTarget = indentTargetId && indentTargetId !== card.id ? ctx.repo.getNode(indentTargetId) : null
      if (!indentNode(ctx, indentTarget ?? card)) return boundary("indent", "Can't indent further")
      return ok()
    }
    case "OUTDENT_NODE": {
      if (!card) return boundary("outdent", "No card to outdent")
      const outdentTargetId = ctx.sel.text()?.nodeId ?? ctx.cursor
      const outdentTarget = outdentTargetId && outdentTargetId !== card.id ? ctx.repo.getNode(outdentTargetId) : null
      // During edit mode, prevent outdenting a subitem beyond the card boundary.
      // If the target's parent is the card itself, outdenting would promote it to column
      // level, which breaks the card structure.
      if (outdentTarget && ctx.sel.text() && outdentTarget.parent_id === card.id) {
        return boundary("outdent", "Can't outdent beyond card boundary during edit")
      }
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
      // Pass op.status through so `x`/toggle_task_done and explicit set_status_*
      // commands apply the requested status instead of cycling.
      handleTaskStatusCycle(ctx, action.status)
      return ok()
    case "TASK_CYCLE_STATUS":
      // No explicit status → per-card cycle (batch-aware).
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
function handleTextAction(ctx: OpCtx, action: TextOp): OpResult {
  switch (action.type) {
    case "TEXT_INSERT": {
      const insertTarget = activeEditTargetRef.current
      insertTarget?.insertChar(action.char)
      // Prefix conversion: after typing space, check if content matches a markdown prefix
      const textEdit = ctx.sel.text()
      if (action.char === " " && insertTarget && textEdit) {
        const content = insertTarget.getContent()
        const conversion = detectPrefixConversion(content)
        if (conversion) {
          const nodeId = textEdit.nodeId
          const node = ctx.repo.getNode(nodeId)
          if (node) {
            const remainingText = content.slice(conversion.prefixLength)
            ctx.undoHandle.setCursor(ctx.cursor)
            const changes: Partial<typeof node> = { ...conversion.nodeChanges }
            if (KNode.isOutline({ type: changes.type ?? node.type, item: changes.item ?? node.item })) {
              changes.name = remainingText
              changes.content = remainingText
            } else if (changes.item?.task?.marker) {
              const fakeNode = { ...node, ...changes } as typeof node
              changes.content = KNode.setString(fakeNode, remainingText)
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
      const bsTextEdit = ctx.sel.text()
      if (bsTarget && bsTextEdit && bsTarget.getCursorOffset() === 0) {
        const nodeId = bsTextEdit.nodeId
        const content = bsTarget.getContent()
        if (content === "") {
          ctx.sel.text.deselect()
          executeDelete(ctx, nodeId)
          return ok()
        }
        const node = ctx.repo.getNode(nodeId)
        if (node) {
          const degradation = degrade(node, ctx.repo, nodeId)
          if (degradation) {
            ctx.undoHandle.setCursor(ctx.cursor)
            applyDegradation(node, degradation, content)
            runRepoEffect(ctx, { type: "REPO_UPDATE_NODE", nodeId, updates: degradation })
            ctx.sel.node.select([ctx.cursor as ID])
            return ok()
          }
          bsTarget.save()
          boardMergeBackward(ctx, nodeId)
          return ok()
        }
      }
      bsTarget?.deleteBackward()
      return ok()
    }
    case "TEXT_DELETE_FORWARD": {
      const fwdTarget = activeEditTargetRef.current
      const fwdTextEdit = ctx.sel.text()
      if (fwdTarget && fwdTextEdit) {
        const content = fwdTarget.getContent()
        const cursor = fwdTarget.getCursorOffset()
        if (content === "" && cursor === 0) {
          const nodeId = fwdTextEdit.nodeId
          ctx.sel.text.deselect()
          executeDelete(ctx, nodeId)
        } else if (cursor >= content.length) {
          const nodeId = fwdTextEdit.nodeId
          const nextNode = KTree.next(ctx.repo, nodeId)
          if (nextNode) {
            const degradation = degrade(nextNode, ctx.repo, nextNode.id)
            if (degradation) {
              ctx.undoHandle.setCursor(ctx.cursor)
              applyDegradation(nextNode, degradation, KNode.string(nextNode))
              runRepoEffect(ctx, { type: "REPO_UPDATE_NODE", nodeId: nextNode.id, updates: degradation })
              ctx.sel.node.select([ctx.cursor as ID])
              return ok()
            }
          }
          fwdTarget.save()
          boardMergeForward(ctx, nodeId)
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
      if (ctx.sel.text()) ctx.sel.text.deselect()
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
      if (ctx.sel.text()) {
        target?.save()
        ctx.sel.text.deselect()
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
function handleBoardReducerOp(ctx: OpCtx, action: BoardOp): OpResult {
  const card = ctx.card

  switch (action.type) {
    case "SELECT":
      if (ctx.ui.columnScrollAnchor !== null) {
        ctx.setUI({ columnScrollAnchor: null })
      }
      ctx.sel.node.select([action.nodeId as ID])
      return ok()
    case "SET_ROOT":
    case "SET_CURSWANT":
    case "SET_COLLAPSED_NODES":
      ctx.dispatchBoard(action)
      return ok()
    case "TOGGLE_FOLD":
      return handleToggleFold(ctx)
    case "TOGGLE_COLLAPSE": {
      const collapseNodeId = ctx.columnId
      if (!collapseNodeId) return boundary("collapse", "No column to collapse")
      if (collapseNodeId.startsWith("__body__")) return boundary("collapse", "Body column cannot be collapsed")
      const wasCollapsed = ctx.collapsedNodes?.has(collapseNodeId) ?? false
      ctx.undoHandle.setCursor(ctx.cursor)

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
        cursor: ctx.cursor,
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
      if (!wasCollapsed && (ctx.cursor as string) !== collapseNodeId) {
        ctx.sel.node.select([collapseNodeId as ID])
      }
      const colName = shortName(ctx, collapseNodeId)
      ctx.setUI({
        status: {
          level: "info",
          message: wasCollapsed ? `Column expanded: ${colName}` : `Column collapsed: ${colName}`,
        },
      })
      return ok()
    }
    case "ZOOM_IN":
      return handleZoomIn(ctx)
    case "FOLD_NODE": {
      const roots = getFoldTargetRoots(ctx, card)
      const scope = action.scope ?? "card"
      if (scope !== "root" && roots.length === 0) return boundary("fold", "no card or column selected")
      const columnCardIds = getAllCardIds(ctx.tree)
      const result = reducerApplyFoldNode(extractFoldState(ctx), scope, ctx.rootId ?? "", roots, columnCardIds)
      if (result.effects.length === 0) return boundary("fold", "already fully folded")
      // Cursor-always-visible: if cursor is inside a card being folded deeper, nudge to card
      if (card && ctx.cursor && ctx.cursor !== card.id) {
        ctx.sel.node.select([card.id as ID])
      }
      applyFoldEffects(ctx, result)
      ctx.setUI({ status: { level: "info", message: `Folded: ${shortName(ctx, roots[0])}` } })
      return ok()
    }
    case "UNFOLD_NODE": {
      const roots = getFoldTargetRoots(ctx, card)
      const scope = action.scope ?? "card"
      if (scope !== "root" && roots.length === 0) return boundary("fold", "no card or column selected")
      const columnCardIds = getAllCardIds(ctx.tree)
      const result = reducerApplyUnfoldNode(extractFoldState(ctx), scope, ctx.rootId ?? "", roots, columnCardIds)
      if (result.effects.length === 0) return boundary("fold", "maximum depth reached")
      applyFoldEffects(ctx, result)
      ctx.setUI({ status: { level: "info", message: `Unfolded: ${shortName(ctx, roots[0])}` } })
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
      ctx.sel.node.select([action.nodeId as import("@silvery/selection").ID], true)
      return ok()
    }
    case "SELECT_NODE_ADD": {
      const ids = [...ctx.selectedIds, action.nodeId] as import("@silvery/selection").ID[]
      ctx.sel.node.select(ids)
      return ok()
    }
    case "SELECT_NODE_REMOVE": {
      ctx.sel.node.remove(action.nodeId as import("@silvery/selection").ID)
      return ok()
    }
    case "CLEAR_SELECTION":
      clearSelection(ctx)
      return ok()
    case "VISUAL_MODE_ENTER": {
      if (!ctx.cursor) return boundary("visual", "no cursor")
      ctx.sel.node.select([ctx.cursor as ID])
      ctx.setUI({ status: { level: "info", message: "-- VISUAL --" } })
      return ok()
    }
    case "VISUAL_MODE_EXIT":
      clearSelection(ctx)
      ctx.setUI({ status: null })
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
      if (ctx.selectedIds.size > 0) {
        for (const selKey of ctx.selectedIds) {
          if (selKey && !nodeIds.includes(selKey)) {
            nodeIds.push(selKey)
          }
        }
      }
      if (nodeIds.length === 0 && ctx.cursor) {
        nodeIds.push(ctx.cursor as string)
      }
      ctx.dispatchBoard({ type: "ENTER_MOVE_MODE", nodeIds })
      return ok()
    }
    case "CONFIRM_MOVE":
      handleConfirmMove(ctx)
      return ok()
    case "CANCEL_MOVE":
      ctx.dispatchBoard(action)
      return ok()
    case "INCREASE_CONTENT_LINES": {
      const prev = ctx.ui.maxContentLines
      if (prev >= 10) return boundary("content", "max content lines")
      const next = prev + 1
      ctx.setUI({ maxContentLines: next, status: { level: "info" as const, message: `Content lines: ${next}` } })
      return ok()
    }
    case "DECREASE_CONTENT_LINES": {
      const prev = ctx.ui.maxContentLines
      if (prev <= 1) return boundary("content", "min content lines")
      const next = prev - 1
      ctx.setUI({ maxContentLines: next, status: { level: "info" as const, message: `Content lines: ${next}` } })
      return ok()
    }
    case "HIDE_NODE":
      return handleHideNode(ctx)
    case "TOGGLE_SHOW_HIDDEN":
      ctx.setUI((prev) => {
        const next = !prev.showHidden
        return {
          showHidden: next,
          status: { level: "info" as const, message: next ? "Hidden: shown" : "Hidden: filtered" },
        }
      })
      return ok()
    default:
      assertNever(action)
  }
}

/** DialogOp: pickers, filter, favorites, date prompts, search, confirmations (44 cases). */
// oxlint-disable-next-line complexity/complexity -- Exhaustive dialog switch covering all dialog/filter/search/property actions
function handleDialogAction(ctx: OpCtx, action: DialogOp): OpResult {
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
        searchScopeNodeIds: ctx.cursor ? [ctx.cursor as string] : [],
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
      ctx.setUI({ showFilterDialog: !ctx.ui.showFilterDialog })
      ctx.sel.text.deselect()
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
function handlePaneAction(ctx: OpCtx, action: PaneOp): OpResult {
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
function handleViewAction(ctx: OpCtx, action: ViewOp): OpResult {
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
      // Exit edit mode before undoing — discard any in-progress edits (cancel, not confirm)
      // so that the undo operates on the last committed change, not a freshly-saved one.
      if (ctx.sel.text() && activeEditTargetRef.current) {
        activeEditTargetRef.current.cancel()
      }
      ctx.sel.text.deselect()
      if (!ctx.undoHandle.canUndo()) return boundary("undo", "Nothing to undo")
      const result = ctx.undoHandle.undo()
      const undoCursor = result.ok && result.cursor != null ? result.cursor : ctx.cursor
      ctx.sel.node.select([undoCursor as ID])
      // Restore fold state if captured in the undo entry
      if (result.foldState) {
        ctx.setFoldDepths(result.foldState.foldDepths)
        ctx.dispatchBoard({ type: "SET_COLLAPSED_NODES", nodeIds: Array.from(result.foldState.collapsedNodes) })
      }
      if (result.label) ctx.setUI({ status: { level: "info", message: `Undo: ${result.label}` } })
      return ok()
    }
    case "HISTORY_REDO": {
      // Exit edit mode before redoing (same rationale as undo above).
      if (ctx.sel.text() && activeEditTargetRef.current) {
        activeEditTargetRef.current.cancel()
      }
      ctx.sel.text.deselect()
      if (!ctx.undoHandle.canRedo()) return boundary("redo", "Nothing to redo")
      const result = ctx.undoHandle.redo()
      ctx.sel.node.select([ctx.cursor as ID])
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
      // Bump toastVersion to trigger React re-render — the toast queue is a mutable
      // object outside React state, so mutating it alone doesn't cause re-renders.
      ctx.setUI((prev) => ({ toastVersion: (prev.toastVersion ?? 0) + 1 }))
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
function handleLinebreakSibling(ctx: OpCtx, position: "before" | "after"): void {
  const { repo } = ctx
  const edit = ctx.sel.text()
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
  ctx.sel.node.select([newId as ID])
  ctx.sel.text.edit(newId as import("@silvery/selection").ID, 0)
  ctx.textEditHints = { blockIndex: 0 }
  requestRenderFlush()
}

/** Enter in inline edit — split node at cursor position, adjusting for task markers and body blocks.
 *  Title split with visible children: after-portion becomes first child (not sibling).
 *  Title split without children / body block split: after-portion becomes sibling after. */
function handleLinebreakSplit(ctx: OpCtx): OpResult {
  const edit = ctx.sel.text()
  if (!edit) return ok()

  const editTarget = activeEditTargetRef.current
  if (!editTarget) return ok()

  const editOffset = editTarget.getCursorOffset()
  editTarget.save()

  // Resolve to body child node if editing a body block
  let nodeId: string = edit.nodeId
  const editBlockIndex = ctx.textEditHints?.blockIndex ?? 0
  const isBodyBlock = editBlockIndex > 0
  if (isBodyBlock) {
    const body = extractBody(ctx.repo.getChildren(edit.nodeId)).body
    const child = body[editBlockIndex - 1]
    if (!child) return ok()
    nodeId = child.id
  }

  let node = ctx.repo.getNode(nodeId)
  if (!node) return ok()

  // Materialize content for folder nodes (title stored as data.name, not content field).
  // Without this, split/splitAsChild would operate on empty string.
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
  const hasVisibleChildren = !isBodyBlock && ctx.tree.children(edit.nodeId).length > 0

  try {
    if (hasVisibleChildren) {
      // Split placing after-portion as first child (not sibling)
      ctx.undoHandle.setCursor(nodeId)
      ctx.undoHandle.startBatch("Split node")
      const result = splitAsChild(ctx.repo, nodeId, adjustedOffset)
      ctx.undoHandle.endBatch()
      ctx.sel.node.select([result.afterId as ID])
      ctx.sel.text.edit(result.afterId as import("@silvery/selection").ID, 0)
      ctx.textEditHints = { blockIndex: 0 }
    } else {
      boardSplit(ctx, nodeId, adjustedOffset)
    }
    requestRenderFlush()
  } catch {
    ctx.undoHandle.endBatch()
    ctx.setUI({ bellState: "split-failed" })
  }

  return ok()
}

/** Split node at offset, placing the after-portion as the first child instead of sibling. */
function splitAsChild(repo: OpCtx["repo"], nodeId: string, offset: number): { beforeId: string; afterId: string } {
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
function handleAddNodeChildFirst(ctx: OpCtx): void {
  const cursorId = ctx.cursor
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
  ctx.sel.node.select([newId as ID])
  ctx.sel.text.edit(newId as import("@silvery/selection").ID, 0)
  ctx.textEditHints = { blockIndex: 0 }
  requestRenderFlush()
}

/** Get all card-level node IDs from the ViewTreeProjection. */
function getAllCardIds(tree: import("@km/board").ViewTreeProjection): string[] {
  const rootId = tree.rootId
  if (!rootId) return []
  const columnIds = tree.children(rootId)
  return columnIds.flatMap((colId) => [...tree.children(colId)])
}

/** Find the deepest last visible descendant of a node by recursively following last children.
 *  Returns the node ID, or the input ID if it has no visible children. */
function findDeepestLastDescendant(tree: import("@km/board").ViewTreeProjection, nodeId: string): string {
  const children = tree.children(nodeId)
  if (children.length === 0) return nodeId
  const lastChild = children[children.length - 1]!
  return findDeepestLastDescendant(tree, lastChild)
}

/** Find next/prev editable sibling node via ViewTreeProjection.
 *  Walks the parent's children array (which is already pruned for visibility).
 *  Skips body-block children (before the first outline child) since those are
 *  navigated via blockIndex, not as separate edit targets.
 *  If no sibling in the given direction, recurses up to the parent level. */
function findAdjacentEditNode(
  tree: import("@km/board").ViewTreeProjection,
  nodeId: string,
  direction: "up" | "down",
  depth = 0,
): KNode | null {
  if (depth > 20) return null // defensive guard against cycles
  const parentId = tree.parent(nodeId)
  if (!parentId) return null

  // Get navigable siblings. At card/subitem level, skip body blocks (non-outline
  // children before the first outline child) since those are navigated via blockIndex.
  // At column level, all children (cards) are navigable — no filtering needed.
  const allSiblingIds = tree.children(parentId)
  const parentViewType = tree.getProjected(parentId)?.viewType()
  const needsBodyFilter = parentViewType === "card" || parentViewType === "subitem"
  let siblingIds = allSiblingIds
  if (needsBodyFilter) {
    const firstOutlineIdx = allSiblingIds.findIndex((id) => {
      const n = tree.node(id)
      return n && KNode.isOutline(n)
    })
    if (firstOutlineIdx > 0) siblingIds = allSiblingIds.slice(firstOutlineIdx)
  }

  const idx = siblingIds.indexOf(nodeId)
  if (idx !== -1) {
    const nextIdx = idx + (direction === "down" ? 1 : -1)
    const adjacentId = siblingIds[nextIdx]
    if (nextIdx >= 0 && adjacentId) return tree.node(adjacentId) ?? null
  }

  // No sibling in that direction — recurse up to parent level
  return findAdjacentEditNode(tree, parentId, direction, depth + 1)
}

function handleEditBlockNavigate(ctx: OpCtx, direction: "up" | "down", exitAtBoundary = false): OpResult {
  const { ui } = ctx
  const edit = ctx.sel.text()
  if (!edit) return ok()

  // Capture the current cursor column before saving/unmounting the edit context.
  // This preserves the preferred column (stickyX) across block boundaries.
  // If the TermEditContext already has a stickyX (from prior vertical movement),
  // use that; otherwise compute the current visual column.
  const editCtx = activeEditContextRef.current
  const hints = ctx.textEditHints
  const stickyX = editCtx ? (editCtx.stickyX ?? editCtx.getCursorRowCol().col) : hints?.stickyX

  // Resolve body block nodes to their parent heading.
  // When a user clicks directly on a body block (paragraph, code, etc.), edit.nodeId
  // points to the body block itself. But body blocks are traversed via blockIndex on
  // the parent node. Detect this and remap so the existing blockIndex logic works.
  let effectiveNodeId = edit.nodeId as string
  let effectiveBlockIndex = hints?.blockIndex ?? 0
  const editNode = ctx.repo.getNode(edit.nodeId)
  if (editNode?.parent_id && !KNode.isOutline(editNode) && !editNode.item && !exitAtBoundary) {
    const parentChildren = ctx.repo.getChildren(editNode.parent_id)
    const { body } = extractBody(parentChildren)
    const bodyIdx = body.findIndex((b) => b.id === edit.nodeId)
    if (bodyIdx !== -1) {
      effectiveNodeId = editNode.parent_id
      effectiveBlockIndex = bodyIdx + 1 // blockIndex 0 = title, 1+ = body blocks
    }
  }

  const blockCount = 1 + extractBody(ctx.repo.getChildren(effectiveNodeId)).body.length
  const nextIndex = effectiveBlockIndex + (direction === "down" ? 1 : -1)

  if (nextIndex >= 0 && nextIndex < blockCount) {
    // Moving between blocks within same node → save current block, change index
    activeEditTargetRef.current?.save()
    ctx.sel.text.edit(effectiveNodeId as import("@silvery/selection").ID, 0)
    ctx.textEditHints = {
      blockIndex: nextIndex,
      initialCursorPos: direction === "down" ? "start" : "end",
      stickyX,
    }
    return ok()
  }

  // Past edges → save current content and try to enter edit on adjacent node
  activeEditTargetRef.current?.save()

  // Descend into outline item children (not body blocks — those are handled via blockIndex).
  // Body blocks are traversed within the same node (blockIndex 0, 1, 2...).
  // Outline items are separate nodes that require a node transition.
  if (direction === "down") {
    const children = ctx.repo.getChildren(effectiveNodeId)
    const { items } = extractBody(children)
    if (items.length > 0) {
      const firstChild = items[0]!
      ctx.sel.node.select([firstChild.id as ID])
      ctx.sel.text.edit(firstChild.id as import("@silvery/selection").ID, 0)
      ctx.textEditHints = { blockIndex: 0, initialCursorPos: "start", stickyX }
      requestRenderFlush()
      return ok()
    }
  }

  // When going up from a title and this node has a previous sibling,
  // enter that sibling's LAST child (or last body block) instead of its title.
  // This gives proper "bottom-up" traversal matching the "top-down" descent above.

  // Find next/prev editable node via ViewTreeProjection — all nav now uses single source of truth.
  const adjacentNode = findAdjacentEditNode(ctx.tree, effectiveNodeId, direction)

  if (adjacentNode) {
    // For "up" direction: navigate to the deepest last visible descendant (bottom of card).
    if (direction === "up") {
      // Find deepest-last visible descendant by recursively following last children.
      const deepestId = findDeepestLastDescendant(ctx.tree, adjacentNode.id)
      const deepestNode = deepestId ? ctx.tree.node(deepestId) : null
      if (deepestNode && deepestId !== adjacentNode.id) {
        const deepBodyCount = extractBody(ctx.repo.getChildren(deepestId)).body.length
        ctx.sel.node.select([deepestId as ID])
        ctx.sel.text.edit(deepestId as import("@silvery/selection").ID, 0)
        ctx.textEditHints = { blockIndex: deepBodyCount, initialCursorPos: "end", stickyX }
        requestRenderFlush()
        return ok()
      }
    }
    // For "down" direction: if adjacent node has children (e.g. a column), drill into
    // its first child instead of editing the container header. Mirrors the "up" path above.
    if (direction === "down") {
      const firstChildId = ctx.tree.children(adjacentNode.id)[0]
      if (firstChildId) {
        const firstChild = ctx.tree.node(firstChildId)
        if (firstChild) {
          ctx.sel.node.select([firstChildId as ID])
          ctx.sel.text.edit(firstChildId as import("@silvery/selection").ID, 0)
          ctx.textEditHints = { blockIndex: 0, initialCursorPos: "start", stickyX }
          requestRenderFlush()
          return ok()
        }
      }
    }
    const adjBodyCount = extractBody(ctx.repo.getChildren(adjacentNode.id)).body.length
    const adjBlockIndex = direction === "down" ? 0 : adjBodyCount
    ctx.sel.node.select([adjacentNode.id as ID])
    ctx.sel.text.edit(adjacentNode.id as import("@silvery/selection").ID, 0)
    ctx.textEditHints = {
      blockIndex: adjBlockIndex,
      initialCursorPos: direction === "down" ? "start" : "end",
      stickyX,
    }
    requestRenderFlush()
    return ok()
  }

  // No adjacent node — bell (ctrl-n/p) or exit edit mode (arrow keys)
  if (exitAtBoundary) {
    ctx.sel.text.deselect()
    return handleCursorMove(ctx, direction === "down" ? "down" : "up")
  }
  return boundary("edit_block_navigate", "no adjacent node")
}

function handleToggleFold(ctx: OpCtx): OpResult {
  const { repo } = ctx
  const card = ctx.card

  if (!card) return boundary("fold", "no card selected")

  // Check if card has children to fold/unfold
  const children = repo.getChildren(card.id)
  if (children.length === 0) {
    return boundary("fold", "no children to fold")
  }

  // Determine if this toggle will FOLD (hide children) or UNFOLD (reveal them)
  const isFolding = !ctx.foldDepths.has(card.id)

  // Cursor-always-visible: if folding and cursor is inside the card's subtree,
  // nudge cursor up to the card itself before folding hides it.
  if (isFolding && ctx.cursor && ctx.cursor !== card.id) {
    ctx.sel.node.select([card.id as ID])
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
    cursor: ctx.cursor,
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
  ctx.setUI({
    status: {
      level: "info",
      message: isFolding ? `Folded: ${shortName(ctx, card.id)}` : `Unfolded: ${shortName(ctx, card.id)}`,
    },
  })
  return ok()
}

function handleFavoritesSelectKey(ctx: OpCtx, key: string): OpResult {
  if (!key) return ok()
  if (RESERVED_KEYS.has(key)) {
    const label = getReservedKeyLabel(key)
    ctx.toastQueue.warning(`Key '${key}' is reserved for '${label}'`)
    return ok()
  }
  ctx.setUI({ favoritesSelectedKey: key })
  return ok()
}

function handleFavoritesAssign(ctx: OpCtx): OpResult {
  const key = ctx.ui.favoritesSelectedKey
  if (!key) return ok()

  const nodeId = ctx.cursor
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

function handleFavoritesClear(ctx: OpCtx): OpResult {
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
function handleCursorTo(ctx: OpCtx, to: Position): void {
  const cursorNode = ctx.cursor ? ctx.repo.getNode(ctx.cursor as string) : null

  // Same parent — cursor to sibling at position
  if (cursorNode?.parent_id === to.parentId) {
    const target = Tree.nodeAt(ctx.repo, to)
    if (target) {
      ctx.sel.node.select([target.id as ID])
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
  ctx.dispatchBoard({ type: "ZOOM_IN", nodeId: to.parentId })
  const firstChild = children[0]?.id ?? null
  if (firstChild) ctx.sel.node.select([firstChild as ID])
  clearSelection(ctx)
}

/** Move node(s) to resolved Position: same-parent → reorder, cross-parent → reparent batch. */
function handleReparentTo(ctx: OpCtx, to: Position): OpResult {
  const cards = getSelectedNodes(ctx)
  if (cards.length === 0) return boundary("move", "no selection")

  // Same-parent reorder (single node) — quick path
  if (cards.length === 1 && cards[0]!.parent_id === to.parentId) {
    const nodeId = cards[0]!.id
    if (Tree.isAtPosition(ctx.repo, nodeId, to)) return ok()
    ctx.undoHandle.setCursor(nodeId)
    Tree.moveTo(ctx.repo, nodeId, to)
    ctx.sel.node.select([nodeId as ID])
    return ok()
  }

  // Cross-parent or multi-selection — batch move
  const { moved } = moveSelectedTo(ctx, to)
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
function handleLinkTo(ctx: OpCtx, to: Position | PickTarget): OpResult {
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
function handleCreateAt(ctx: OpCtx, to: Position | PickTarget): OpResult {
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

function handleJumpToColumn(ctx: OpCtx, columnNumber: number): OpResult {
  const columnIds = ctx.tree.rootId ? ctx.tree.children(ctx.tree.rootId) : []

  // Column numbers are 1-indexed for user, 0-indexed internally
  const targetColIdx = columnNumber - 1

  if (targetColIdx < 0 || targetColIdx >= columnIds.length) {
    return boundary("column", `column ${columnNumber} does not exist`)
  }

  const targetColId = columnIds[targetColIdx]
  if (targetColId) {
    const cardIds = ctx.tree.children(targetColId)
    const firstCardId = cardIds[0]
    if (firstCardId) {
      ctx.sel.node.select([firstCardId as ID])
    }
  }
  return ok()
}

function handleCloseOrQuit(ctx: OpCtx): OpResult {
  const { ui, dispatchBoard } = ctx

  // v2 Escape Layering — each Escape pops one layer (follows focus stack):
  // 1. Cancel move/visual mode (highest priority — modal states)
  // 2. Text edit -> node mode (save+exit)
  // 3. Pane focused -> focus board (pane stays open)
  // 4. Dialog open -> close topmost dialog
  // 5. Selection active -> clear selection
  // 6. Nothing -> no-op (visual bell)

  // --- Layer 0: Modal states (move mode) ---
  if (ctx.moveState.active) {
    dispatchBoard({ type: "CANCEL_MOVE" })
    return ok()
  }

  // --- Layer 1: Text edit -> node mode ---
  // Note: normally Escape during editing routes to TEXT_EXIT_EDIT, not here.
  // This is a safety fallback.
  if (ctx.sel.text()) {
    activeEditTargetRef.current?.save()
    ctx.sel.text.deselect()
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
  if (ctx.cursor !== null && ctx.card !== undefined && (ctx.cursor as string) !== ctx.card.id) {
    ctx.sel.node.select([ctx.card.id as ID])
    return ok()
  }

  // --- Layer 4: Selection active -> clear selection ---
  if (ctx.selectedIds.size > 0) {
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
function resolveNodeFsPath(repo: OpCtx["repo"], nodeId: string): { fsPath: string; isFolder: boolean } {
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
function spawnOpen(ctx: OpCtx, args: string[], label: string): void {
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

function handleOpenInSystem(ctx: OpCtx, nodeId: string): void {
  const result = resolveNodeFsPath(ctx.repo, nodeId)
  log.debug?.("open_in_system: opening %s", result.fsPath)
  spawnOpen(ctx, [result.fsPath], "open_in_system")
}

function handleHideNode(ctx: OpCtx): OpResult {
  const { repo } = ctx
  // Always hide at column level — Board.tsx filters columns, not individual cards.
  if (!ctx.columnId) return boundary("hide", "No node to hide")
  const node = repo.getNode(ctx.columnId)
  if (!node) return boundary("hide", "No node to hide")

  const hiddenPath = computeHiddenPath(node, repo)
  if (!hiddenPath) return boundary("hide", "Cannot compute hidden path")

  const hiddenPaths = readBoardHidden(repo.path)
  if (isHidden(hiddenPaths, node, repo)) {
    removeHidden(repo.path, hiddenPath)
    ctx.setUI({ status: { level: "info", message: `Un-hidden: ${hiddenPath}` } })
  } else {
    addHidden(repo.path, hiddenPath)
    ctx.setUI({ status: { level: "info", message: `Hidden: ${hiddenPath}` } })

    // Move cursor to adjacent column since this one is now hidden
    const columnIds = ctx.tree.rootId ? ctx.tree.children(ctx.tree.rootId) : []
    const colIndex = columnIds.indexOf(node.id)
    const targetColId = columnIds[colIndex + 1] ?? (colIndex > 0 ? columnIds[colIndex - 1] : undefined)
    if (targetColId) {
      const targetCardIds = ctx.tree.children(targetColId)
      ctx.sel.node.select([(targetCardIds[0] ?? targetColId) as ID])
    }
  }

  ctx.setUI((prev) => ({ hiddenVersion: prev.hiddenVersion + 1 }))
  return ok()
}

function handleOpenInTerminal(ctx: OpCtx, nodeId: string): void {
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
function getSelectedCardNodeIds(ctx: OpCtx): string[] {
  return getSelectedNodeIds(ctx)
}

/** Open the date prompt dialog for a given field. */
function handleSetDatePrompt(ctx: OpCtx, field: "due_at" | "start_at" | "rrule"): OpResult {
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
function handleSetPriority(ctx: OpCtx, value?: string): OpResult {
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
  ctx.undoHandle.setCursor(ctx.cursor)
  if (nodeIds.length > 1) ctx.undoHandle.startBatch("Set priority")
  for (const nodeId of nodeIds) {
    runRepoEffect(ctx, { type: "REPO_UPDATE_NODE", nodeId, updates: { priority: next } })
  }
  if (nodeIds.length > 1) ctx.undoHandle.endBatch()

  const label = next ?? "None"
  ctx.toastQueue.info(`Priority: ${label}`)
  ctx.sel.node.select([ctx.cursor as ID])
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
function handleDatePromptConfirm(ctx: OpCtx): OpResult {
  const prompt = ctx.ui.datePrompt
  if (!prompt) return ok()

  // Read the current input from the block edit target (set by DatePromptDialog)
  const input = activeEditTargetRef.current?.getContent() ?? ""
  const trimmed = input.trim()

  const { field, nodeIds } = prompt

  // Auto-recorded by undoable repo — batch multiple updates into one undo entry
  ctx.undoHandle.setCursor(ctx.cursor)
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
  // onNodeChanged writes symlinks directly to DB (bypassing repo mutation API),
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
  ctx.sel.node.select([ctx.cursor as ID])
  return ok()
}

// =============================================================================
// Clipboard Operations
// =============================================================================

/** Copy or cut selected nodes to clipboard. */
function handleClipboardCopy(ctx: OpCtx, mode: "copy" | "cut"): OpResult {
  const cards = getSelectedNodes(ctx)
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
function handleClipboardPaste(ctx: OpCtx): OpResult {
  const clipboard = ctx.ui.clipboard
  if (!clipboard) return boundary("clipboard", "Nothing to paste")

  const { repo } = ctx
  if (!ctx.columnId) return boundary("clipboard", "No column")

  // Find current position in siblings
  const siblings = repo.getChildren(ctx.columnId)
  const currentSibIdx = siblings.findIndex((s) => s.id === (ctx.cursor as string))
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

  ctx.undoHandle.setCursor(ctx.cursor)
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
      repo.moveNode(sourceId, ctx.columnId, sortOrder)
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
      lastPastedId = repo.addNode(ctx.columnId, newNode)
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

  // Select the last pasted node by ID.
  if (lastPastedId) {
    ctx.sel.node.select([lastPastedId as ID])
  }

  return ok()
}
