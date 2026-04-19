/**
 * Command System Bridge
 *
 * Bridges the @km/commands system to the TUI.
 * Processes keyboard input through the command system and returns actions.
 */

import {
  initCommandSystem,
  processKey,
  buildKeybindingContext,
  buildContext,
  getChordState,
  handleChordTimeout,
  type KeyEvent,
  type KeyCommandResult,
  type TNode,
} from "@km/commands"
import { Tree } from "@km/tree"
import { detectTerminalCaps, activeEditTargetRef } from "@silvery/ag-react"
import type { OpCtx } from "../tui-context.ts"
import { NO_SELECTION } from "../state/selection.ts"
import { isDetailPaneId } from "./board-types.ts"
import { CursorDepth } from "../state/cursor-depth.ts"
import { PaneUI } from "../state/ui-reducer.ts"
import { createLogger } from "loggily"
import { currentMode } from "../dialog-guard.ts"

const log = createLogger("km:command-bridge")

/** Cached Kitty keyboard protocol detection (static — doesn't change at runtime).
 * In test environments, Kitty is disabled so bare y/d/p bindings work (tests don't
 * use real Kitty protocol sequences). */
const kittySupported = process.env.VITEST ? false : detectTerminalCaps().kittyKeyboard

let commandSystemInitialized = false
export function ensureCommandSystemInitialized(): void {
  if (commandSystemInitialized) return
  commandSystemInitialized = true
  initCommandSystem()
}

/**
 * Derive a `TNode` for the command system from the focused pane's selected
 * KNode. For symlink nodes we resolve through `embed_of` so task commands
 * (x, Space) see the target's task status — not the symlink's (which has none).
 */
function deriveNodeForCtx(ctx: OpCtx): TNode | null {
  const { selectedNode } = ctx
  if (!selectedNode) return null
  const embedTarget = selectedNode.embed_of
  const targetNode = embedTarget ? ctx.repo.getNode(embedTarget) : null
  const resolvedItem =
    embedTarget && targetNode?.item?.task ? { ...selectedNode.item, task: targetNode.item.task } : selectedNode.item
  return {
    ...selectedNode,
    item: resolvedItem,
    isTask: selectedNode.item?.task?.status != null || (embedTarget != null && targetNode?.item?.task?.status != null),
    children: [],
    depth: 0,
    childCount: ctx.tree.children(selectedNode.id).length,
    childrenLoaded: true,
  } as TNode
}

/**
 * Build a `KeybindingContext` from the current OpCtx. Exported so render-time
 * callers (UnifiedOmniboxConnector, which needs it to gate commands through
 * `filterCommandsByAvailability`) can reuse the exact same shape the keypress
 * path assembles. The keypress path goes through `buildCommandContexts` which
 * composes this helper with `buildContext` from @km/commands.
 */
export function buildKeybindingContextFromOpCtx(ctx: OpCtx) {
  const { ui } = ctx
  const nodeForCtx = deriveNodeForCtx(ctx)
  const dialogInput = PaneUI.isDialogInput(ui)

  // Detect orphaned text selection: sel.text() is non-null but no edit target is mounted.
  // This can happen when a card is scrolled off screen or the edit field didn't mount.
  // Clear the orphaned state to prevent keys being captured as TEXT_INSERT.
  const textSel = ctx.sel.text()
  const isTextEditing = textSel !== null && activeEditTargetRef.current !== null
  if (textSel !== null && activeEditTargetRef.current === null) {
    log.debug?.("Clearing orphaned text selection (no active edit target)")
    ctx.setSelection(NO_SELECTION)
  }

  return buildKeybindingContext({
    inMoveMode: ctx.moveState.active,
    inSearchMode: ui.showSearchDialog,
    inInputMode: dialogInput || ui.showFilterDialog,
    hasMultiSelection: ctx.selectedIds.size > 0,
    isInDetailPane:
      ctx.focusManager != null &&
      ctx.focusManager.activeScopeId !== null &&
      isDetailPaneId(ctx.focusManager.activeScopeId),
    isInOutlineMode: CursorDepth.isOutline(
      CursorDepth.derive({
        cursor: ctx.cursor,
        cursorCardNodeId: ctx.cursorCardNodeId,
        cursorColumnNodeId: ctx.columnId,
      }),
    ),
    currentNode: nodeForCtx,
    textInputFocused: PaneUI.isTextInputFocused(ui, isTextEditing),
    isInlineEditing: isTextEditing,
    searchDialogOpen: ui.showSearchDialog,
    itemPickerOpen: false,
    newItemDialogOpen: ui.showNewItemDialog,
    datePromptOpen: !!ui.datePrompt,
    filterDialogOpen: ui.showFilterDialog,
    helpOverlayOpen: ui.showHelp,
    deleteConfirmOpen: !!ui.deleteConfirm,
    consoleOpen: ui.showConsole,
    hasActiveToast: !!ctx.toastQueue.getLatest(),
    inputMode: currentMode(),
    visualMode: false, // visual mode removed — sel handles multi-selection
    localFindActive: !!ui.localSearch,
    omniboxOpen: !!ui.omnibox,
    searchReplaceOpen: !!ui.searchReplace,
    hasKitty: kittySupported,
    activeScopes: ctx.focusManager?.scopeStack ?? [],
    inputType: ctx.sel.text() ? "textarea" : dialogInput ? "field" : undefined,
    editBlockIndex: ctx.textEditHints?.blockIndex,
    cursorAtStart() {
      const t = activeEditTargetRef.current
      return t ? t.getCursorOffset() === 0 && t.getContent().length > 0 : false
    },
    cursorAtEnd() {
      const t = activeEditTargetRef.current
      return t ? t.getCursorOffset() >= t.getContent().length : true
    },
    hasVisibleChildren() {
      const textSel = ctx.sel.text()
      if (!textSel) return false
      return ctx.tree.children(textSel.nodeId).length > 0
    },
    editDepth() {
      const textSel = ctx.sel.text()
      if (!textSel) {
        log.error?.("editDepth() called without text editing active")
        return "card" as const
      }
      const editNodeId = textSel.nodeId as string

      // Direct lookup in nodeIndex
      let entry = ctx.nodeIndex?.get(editNodeId)

      // If not found, walk up ancestors to find the containing card/column
      if (!entry && ctx.nodeIndex) {
        for (const ancestor of Tree.ancestors(ctx.repo, editNodeId)) {
          entry = ctx.nodeIndex.get(ancestor.id)
          if (entry) break
        }
      }

      if (!entry) {
        log.error?.(`editDepth(): editing node ${editNodeId} not found in nodeIndex`)
        return "card" as const
      }
      return entry.cardIndex < 0 ? ("column" as const) : ("card" as const)
    },
  })
}

/** Build command and keybinding contexts from the current OpCtx */
function buildCommandContexts(ctx: OpCtx) {
  const { ui, selectedNode, colIndex, cardIndex, columnId } = ctx
  const nodeForCtx = deriveNodeForCtx(ctx)
  const kbCtx = buildKeybindingContextFromOpCtx(ctx)

  const cmdCtx = buildContext(ui.viewMode, {
    currentNode: nodeForCtx,
    currentNodeId: selectedNode?.id ?? null,
    cursor: ctx.cursor,
    selectedNodes: Array.from(ctx.selectedIds),
    siblingCount: columnId ? ctx.tree.children(columnId).length : 0,
    siblingIndex: cardIndex >= 0 ? cardIndex : 0,
    columnIndex: colIndex >= 0 ? colIndex : 0,
    columnCount: ctx.rootId ? ctx.tree.children(ctx.rootId).length : 0,
    moveMode: ctx.moveState.active,
    foldDepths: ctx.foldDepths,
  })

  return { cmdCtx, kbCtx }
}

export function processKeyWithContext(input: string, key: KeyEvent, ctx: OpCtx): KeyCommandResult {
  ensureCommandSystemInitialized()
  const { cmdCtx, kbCtx } = buildCommandContexts(ctx)
  return processKey(input, key, cmdCtx, kbCtx)
}

/** Handle chord timeout — resolves the pending prefix as its standalone command */
export function processChordTimeout(ctx: OpCtx): KeyCommandResult | null {
  ensureCommandSystemInitialized()
  const { cmdCtx, kbCtx } = buildCommandContexts(ctx)
  return handleChordTimeout(cmdCtx, kbCtx)
}

/** Get the pending chord prefix (for status bar display) */
export function getPendingChord(): string | null {
  return getChordState().pending
}
