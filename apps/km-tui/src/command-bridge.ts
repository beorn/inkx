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
import { detectTerminalCaps, activeEditTargetRef } from "@silvery/ag-react"
import type { ActionCtx } from "./tui-context.ts"
import { isDetailPaneId } from "./board-types.ts"
import { getModeStack } from "./dialog-guard.ts"

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

/** Build command and keybinding contexts from the current ActionCtx */
function buildCommandContexts(ctx: ActionCtx) {
  const { ui, selectedNode } = ctx

  // Compute TNode derived fields from KNode for the command system.
  // For embed nodes, resolve through embed_source to check if the target is a task,
  // so that task commands (x, Space) work on embeds pointing to tasks.
  const embedSource = selectedNode?.embed_source
  const nodeForCtx: TNode | null = selectedNode
    ? ({
        ...selectedNode,
        isTask:
          selectedNode.item?.task?.status != null ||
          (embedSource != null && ctx.repo.getNode(embedSource)?.item?.task?.status != null),
        children: [],
        depth: 0,
        childCount: 0,
        childrenLoaded: true,
      } as TNode)
    : null

  const isDialogInput =
    ui.showNewItemDialog ||
    !!ui.activePicker ||
    ui.showSearchDialog ||
    !!ui.datePrompt ||
    ui.showOmnibox ||
    !!ui.localSearch?.isInputActive ||
    !!ui.searchReplace

  const kbCtx = buildKeybindingContext({
    inMoveMode: ctx.moveMode,
    inSearchMode: ui.showSearchDialog,
    inInputMode:
      ui.showNewItemDialog ||
      !!ui.activePicker ||
      ui.showSearchDialog ||
      ui.showFilterDialog ||
      !!ui.datePrompt ||
      ui.showOmnibox ||
      !!ui.localSearch?.isInputActive ||
      !!ui.searchReplace,
    hasMultiSelection: ui.multiSelected.size > 0,
    isInDetailPane: ctx.focusManager.activeScopeId !== null && isDetailPaneId(ctx.focusManager.activeScopeId),
    isInOutlineMode: ctx.cursorNodeId !== null && ctx.card !== undefined && ctx.cursorNodeId !== ctx.card.id,
    currentNode: nodeForCtx,
    textInputFocused: !!ui.inlineEditBlock || isDialogInput,
    isInlineEditing: !!ui.inlineEditBlock,
    searchDialogOpen: ui.showSearchDialog,
    itemPickerOpen: !!ui.activePicker,
    newItemDialogOpen: ui.showNewItemDialog,
    datePromptOpen: !!ui.datePrompt,
    filterDialogOpen: ui.showFilterDialog,
    helpOverlayOpen: ui.showHelp,
    deleteConfirmOpen: !!ui.deleteConfirm,
    consoleOpen: ui.showConsole,
    hasActiveToast: !!ctx.toastQueue.getLatest(),
    inputMode: getModeStack().current(),
    visualMode: ui.visualMode,
    localFindActive: !!ui.localSearch,
    omniboxOpen: ui.showOmnibox,
    searchReplaceOpen: !!ui.searchReplace,
    favoritesDialogOpen: ui.showFavoritesDialog,
    favoritesKeySelected: ui.favoritesSelectedKey != null,
    hasKitty: kittySupported,
    inputType: ui.inlineEditBlock ? "textarea" : isDialogInput ? "field" : undefined,
    editBlockIndex: ui.inlineEditBlock?.blockIndex,
    cursorAtStart() {
      const t = activeEditTargetRef.current
      return t ? t.getCursorOffset() === 0 && t.getContent().length > 0 : false
    },
    cursorAtEnd() {
      const t = activeEditTargetRef.current
      return t ? t.getCursorOffset() >= t.getContent().length : true
    },
    hasVisibleChildren() {
      if (!ui.inlineEditBlock) return false
      if (ctx.foldDepths.get(ui.inlineEditBlock.nodeId) === 0) return false
      const children = ctx.repo.getChildren(ui.inlineEditBlock.nodeId)
      return children.some((c) => c.item)
    },
    editLevel() {
      // When editing, the level is determined by where the edited node sits in the board
      if (!ui.inlineEditBlock) return "card" as const
      return ctx.colIndex < 0 ? ("board" as const) : ctx.isAtCardLevel ? ("card" as const) : ("column" as const)
    },
  })

  const { colIndex, cardIndex, columns } = ctx
  const column = columns[colIndex]

  const cmdCtx = buildContext(ui.viewMode, {
    currentNode: nodeForCtx,
    currentNodeId: selectedNode?.id ?? null,
    cursorNodeId: ctx.cursorNodeId,
    selectedNodes: Array.from(ui.multiSelected),
    siblingCount: column?.cardNodes.length ?? 0,
    siblingIndex: cardIndex >= 0 ? cardIndex : 0,
    columnIndex: colIndex >= 0 ? colIndex : 0,
    columnCount: columns.length,
    moveMode: ctx.moveMode,
    foldDepths: ctx.foldDepths,
  })

  return { cmdCtx, kbCtx }
}

export function processKeyWithContext(input: string, key: KeyEvent, ctx: ActionCtx): KeyCommandResult {
  ensureCommandSystemInitialized()
  const { cmdCtx, kbCtx } = buildCommandContexts(ctx)
  return processKey(input, key, cmdCtx, kbCtx)
}

/** Handle chord timeout — resolves the pending prefix as its standalone command */
export function processChordTimeout(ctx: ActionCtx): KeyCommandResult | null {
  ensureCommandSystemInitialized()
  const { cmdCtx, kbCtx } = buildCommandContexts(ctx)
  return handleChordTimeout(cmdCtx, kbCtx)
}

/** Get the pending chord prefix (for status bar display) */
export function getPendingChord(): string | null {
  return getChordState().pending
}
