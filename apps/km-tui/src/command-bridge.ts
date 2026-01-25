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

  const { colIndex, cardIndex, columns } = layout;
  const column = columns[colIndex];

  // Build legacy BoardState shape for @km/commands compatibility.
  // The command system expects { cursor, nodes, selectedNodes } which we derive
  // from layout since SimplifiedBoardState no longer has these fields.
  // We use a minimal object with just the fields buildContext actually uses.
  const legacyBoardState = {
    rootId: boardState.rootId,
    rootPath: boardState.rootPath,
    cursor: cardIndex >= 0 ? [colIndex, cardIndex] : [colIndex],
    nodes: [] as TNode[], // Commands don't traverse nodes, they use extras
    cursorNodeId: boardState.cursorNodeId,
    selectedNodes: boardState.selectedNodes,
    foldedNodes: boardState.foldedNodes,
    zoomStack: [] as { rootId: string | null; cursor: number[] }[],
  } as CmdBoardState;

  const cmdCtx = buildContext(legacyBoardState, ui.viewMode, {
    siblingCount: column?.cards.length ?? 0,
    siblingIndex: cardIndex >= 0 ? cardIndex : 0,
    columnIndex: colIndex >= 0 ? colIndex : 0,
    columnCount: columns.length,
  });

  return processInkKey(input, key, cmdCtx, kbCtx);
}
