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
  type BoardState as CmdBoardState,
  type TNode,
} from "@km/commands";
import type { TUIContext } from "./tui-context.ts";

let initialized = false;

export function ensureCommandSystemInitialized(): void {
  if (!initialized) {
    initCommandSystem();
    initialized = true;
  }
}

export function processKeyWithContext(
  input: string,
  key: InkKeyEvent,
  ctx: TUIContext,
): InkCommandResult {
  ensureCommandSystemInitialized();

  const { boardState, ui, layout, selectedNode } = ctx;

  const kbCtx = buildKeybindingContext({
    inMoveMode: boardState.moveMode,
    inSearchMode: false,
    inInputMode: ui.showNewItemDialog || ui.showProjectPicker,
    hasSelection:
      boardState.selectedNodes.size > 0 || ui.multiSelected.size > 0,
    isInDetailPane: ui.showDetailPane,
    isInOutlineMode: ui.inOutlineMode,
    currentNode: (selectedNode as TNode) ?? null,
  });

  const { colIndex, cardIndex } = layout;
  const columnNode = boardState.nodes[colIndex];

  const cmdCtx = buildContext(
    boardState as unknown as CmdBoardState,
    ui.viewMode,
    {
      siblingCount: columnNode?.children.length ?? 0,
      siblingIndex: cardIndex >= 0 ? cardIndex : 0,
      columnIndex: colIndex >= 0 ? colIndex : 0,
      columnCount: boardState.nodes.length,
    },
  );

  return processInkKey(input, key, cmdCtx, kbCtx);
}
