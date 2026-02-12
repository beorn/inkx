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

let commandSystemInitialized = false
export function ensureCommandSystemInitialized(): void {
  if (commandSystemInitialized) return
  commandSystemInitialized = true
  initCommandSystem()
}

export function processKeyWithContext(input: string, key: InkKeyEvent, ctx: ActionCtx): InkCommandResult {
  ensureCommandSystemInitialized()

  const { ui, layout, selectedNode } = ctx

  // Compute TNode derived fields from KNode for the command system
  const nodeForCtx: TNode | null = selectedNode
    ? ({
        ...selectedNode,
        isTask: selectedNode.task_status != null,
        children: [],
        depth: 0,
        childCount: 0,
        childrenLoaded: true,
      } as TNode)
    : null

  const kbCtx = buildKeybindingContext({
    inMoveMode: ctx.moveMode,
    inSearchMode: ui.showSearchDialog,
    inInputMode: ui.showNewItemDialog || ui.showProjectPicker || ui.showSearchDialog,
    hasMultiSelection: ctx.selectedNodes.size > 0 || ui.multiSelected.size > 0,
    isInDetailPane: ui.showDetailPane,
    isInOutlineMode: ui.inOutlineMode,
    currentNode: nodeForCtx,
    textInputFocused: !!ui.inlineEditBlock || ui.showSearchDialog || ui.showNewItemDialog || ui.showProjectPicker,
    isInlineEditing: !!ui.inlineEditBlock,
    searchDialogOpen: ui.showSearchDialog,
    projectPickerOpen: ui.showProjectPicker,
    newItemDialogOpen: ui.showNewItemDialog,
    helpOverlayOpen: ui.showHelp,
    deleteConfirmOpen: !!ui.deleteConfirm,
    consoleOpen: ui.showConsole,
    hasActiveToast: !!ctx.toastQueue.getLatest(),
  })

  const { colIndex, cardIndex, columns } = layout
  const column = columns[colIndex]

  const cmdCtx = buildContext(ui.viewMode, {
    currentNode: nodeForCtx,
    currentNodeId: selectedNode?.id ?? null,
    selectedNodes: Array.from(ctx.selectedNodes),
    siblingCount: column?.cards.length ?? 0,
    siblingIndex: cardIndex >= 0 ? cardIndex : 0,
    columnIndex: colIndex >= 0 ? colIndex : 0,
    columnCount: columns.length,
    moveMode: ctx.moveMode,
    foldedNodes: ctx.foldedNodes,
  })

  return processInkKey(input, key, cmdCtx, kbCtx)
}

/** Handle chord timeout — resolves the pending prefix as its standalone command */
export function processChordTimeout(ctx: ActionCtx): InkCommandResult | null {
  ensureCommandSystemInitialized()

  const { ui, layout, selectedNode } = ctx

  const nodeForCtx: TNode | null = selectedNode
    ? ({
        ...selectedNode,
        isTask: selectedNode.task_status != null,
        children: [],
        depth: 0,
        childCount: 0,
        childrenLoaded: true,
      } as TNode)
    : null

  const kbCtx = buildKeybindingContext({
    inMoveMode: ctx.moveMode,
    inSearchMode: ui.showSearchDialog,
    inInputMode: ui.showNewItemDialog || ui.showProjectPicker || ui.showSearchDialog,
    hasMultiSelection: ctx.selectedNodes.size > 0 || ui.multiSelected.size > 0,
    isInDetailPane: ui.showDetailPane,
    isInOutlineMode: ui.inOutlineMode,
    currentNode: nodeForCtx,
    textInputFocused: !!ui.inlineEditBlock || ui.showSearchDialog || ui.showNewItemDialog || ui.showProjectPicker,
    isInlineEditing: !!ui.inlineEditBlock,
    searchDialogOpen: ui.showSearchDialog,
    projectPickerOpen: ui.showProjectPicker,
    newItemDialogOpen: ui.showNewItemDialog,
    helpOverlayOpen: ui.showHelp,
    deleteConfirmOpen: !!ui.deleteConfirm,
    consoleOpen: ui.showConsole,
    hasActiveToast: !!ctx.toastQueue.getLatest(),
  })

  const { colIndex, cardIndex, columns } = layout
  const column = columns[colIndex]

  const cmdCtx = buildContext(ui.viewMode, {
    currentNode: nodeForCtx,
    currentNodeId: selectedNode?.id ?? null,
    selectedNodes: Array.from(ctx.selectedNodes),
    siblingCount: column?.cards.length ?? 0,
    siblingIndex: cardIndex >= 0 ? cardIndex : 0,
    columnIndex: colIndex >= 0 ? colIndex : 0,
    columnCount: columns.length,
    moveMode: ctx.moveMode,
    foldedNodes: ctx.foldedNodes,
  })

  return handleChordTimeout(cmdCtx, kbCtx)
}

/** Get the pending chord prefix (for status bar display) */
export function getPendingChord(): string | null {
  return getChordState().pending
}
