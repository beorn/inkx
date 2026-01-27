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
  type InkKeyEvent,
  type InkCommandResult,
  type TNode,
} from "@km/commands"
import type { TUIContext } from "./tui-context.ts"

export function ensureCommandSystemInitialized(): void {
  initCommandSystem()
}

export function processKeyWithContext(
  input: string,
  key: InkKeyEvent,
  ctx: TUIContext,
): InkCommandResult {
  ensureCommandSystemInitialized()

  const { boardState, ui, layout, selectedNode } = ctx

  const kbCtx = buildKeybindingContext({
    inMoveMode: boardState.moveMode,
    inSearchMode: ui.showSearchDialog,
    inInputMode:
      ui.showNewItemDialog || ui.showProjectPicker || ui.showSearchDialog,
    hasSelection:
      boardState.selectedNodes.size > 0 || ui.multiSelected.size > 0,
    isInDetailPane: ui.showDetailPane,
    isInOutlineMode: ui.inOutlineMode,
    currentNode: (selectedNode as TNode) ?? null,
  })

  const { colIndex, cardIndex, columns } = layout
  const column = columns[colIndex]

  // Build CommandContext directly - no legacy shim needed
  const cmdCtx = buildContext(ui.viewMode, {
    currentNode: (selectedNode as TNode) ?? null,
    currentNodeId: selectedNode?.id ?? null,
    selectedNodes: Array.from(boardState.selectedNodes),
    siblingCount: column?.cards.length ?? 0,
    siblingIndex: cardIndex >= 0 ? cardIndex : 0,
    columnIndex: colIndex >= 0 ? colIndex : 0,
    columnCount: columns.length,
    moveMode: boardState.moveMode,
    foldedNodes: boardState.foldedNodes,
  })

  return processInkKey(input, key, cmdCtx, kbCtx)
}
