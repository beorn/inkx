/**
 * Command System Bridge
 *
 * Bridges the @km/commands system to the TUI.
 * Processes keyboard input through the command system and returns actions.
 */

import {
  initCommandSystem,
  processInkKey,
  buildKeybindingContext,
  buildContext,
  getChordState,
  handleChordTimeout,
  type InkKeyEvent,
  type InkCommandResult,
  type TNode,
} from "@km/commands"
import type { ActionCtx } from "./tui-context.ts"
import { getModeStack } from "./dialog-guard.ts"

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
          selectedNode.task_status != null ||
          (embedSource != null && ctx.repo.getNode(embedSource)?.task_status != null),
        children: [],
        depth: 0,
        childCount: 0,
        childrenLoaded: true,
      } as TNode)
    : null

  const kbCtx = buildKeybindingContext({
    inMoveMode: ctx.moveMode,
    inSearchMode: ui.showSearchDialog,
    inInputMode:
      ui.showNewItemDialog ||
      ui.showProjectPicker ||
      ui.showSearchDialog ||
      ui.showFilterDialog ||
      !!ui.datePrompt ||
      ui.showOmnibox ||
      !!ui.searchReplace,
    hasMultiSelection: ctx.selectedNodes.size > 0 || ui.multiSelected.size > 0,
    isInDetailPane: ctx.focusManager.getSnapshot().activeId === "detail-pane",
    isInOutlineMode: ctx.cursorNodeId !== null && ctx.card !== undefined && ctx.cursorNodeId !== ctx.card.id,
    currentNode: nodeForCtx,
    textInputFocused:
      !!ui.inlineEditBlock ||
      ui.showSearchDialog ||
      ui.showNewItemDialog ||
      ui.showProjectPicker ||
      !!ui.datePrompt ||
      ui.showOmnibox ||
      !!ui.localSearch?.isInputActive ||
      !!ui.searchReplace,
    isInlineEditing: !!ui.inlineEditBlock,
    searchDialogOpen: ui.showSearchDialog,
    projectPickerOpen: ui.showProjectPicker,
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
  })

  const { colIndex, cardIndex, columns } = ctx
  const column = columns[colIndex]

  const cmdCtx = buildContext(ui.viewMode, {
    currentNode: nodeForCtx,
    currentNodeId: selectedNode?.id ?? null,
    selectedNodes: Array.from(ctx.selectedNodes),
    siblingCount: column?.cardNodes.length ?? 0,
    siblingIndex: cardIndex >= 0 ? cardIndex : 0,
    columnIndex: colIndex >= 0 ? colIndex : 0,
    columnCount: columns.length,
    moveMode: ctx.moveMode,
    foldedNodes: ctx.foldedNodes,
  })

  return { cmdCtx, kbCtx }
}

export function processKeyWithContext(input: string, key: InkKeyEvent, ctx: ActionCtx): InkCommandResult {
  ensureCommandSystemInitialized()
  const { cmdCtx, kbCtx } = buildCommandContexts(ctx)
  return processInkKey(input, key, cmdCtx, kbCtx)
}

/** Handle chord timeout — resolves the pending prefix as its standalone command */
export function processChordTimeout(ctx: ActionCtx): InkCommandResult | null {
  ensureCommandSystemInitialized()
  const { cmdCtx, kbCtx } = buildCommandContexts(ctx)
  return handleChordTimeout(cmdCtx, kbCtx)
}

/** Get the pending chord prefix (for status bar display) */
export function getPendingChord(): string | null {
  return getChordState().pending
}
