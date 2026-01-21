/**
 * Command System Bridge
 *
 * Bridges the @km/commands system to the TUI.
 * Processes keyboard input through the command system and returns actions.
 *
 * Board.tsx uses useReducer(boardReducer, treeState) for navigation.
 * This bridge accepts unified TUIContext or tree-based state directly.
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
import type { UIState } from "./ui-reducer.ts";
import type { BoardState as TreeBoardState } from "@km/board";
import { pathToColumnIndices, getNodeAtPath } from "@km/board";
import type { TUIContext } from "./tui-context.ts";

// Initialize command system once on module load
let initialized = false;

export function ensureCommandSystemInitialized(): void {
  if (!initialized) {
    initCommandSystem();
    initialized = true;
  }
}

/**
 * Process a key event through the command system using TUIContext.
 *
 * Preferred method - uses pre-computed context values to avoid redundant work.
 *
 * @param input - The input character from useInput
 * @param key - The key event from useInput
 * @param ctx - Unified TUI context with all state and derived values
 * @returns Result with commandId and actions, or null if not handled
 */
export function processKeyWithContext(
  input: string,
  key: InkKeyEvent,
  ctx: TUIContext,
): InkCommandResult {
  ensureCommandSystemInitialized();

  const { boardState, ui, layout, selectedNode } = ctx;

  // Build keybinding context from pre-computed values
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

  // Use pre-computed layout indices
  const { colIndex, cardIndex } = layout;
  const columnNode = boardState.nodes[colIndex];

  // Build command context
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

/**
 * Process a key event through the command system using tree-based state.
 *
 * Legacy method - prefer processKeyWithContext when TUIContext is available.
 *
 * @param input - The input character from useInput
 * @param key - The key event from useInput
 * @param boardState - Tree-based board state from boardReducer
 * @param ui - Current UI state
 * @returns Result with commandId and actions, or null if not handled
 */
export function processKeyWithBoardState(
  input: string,
  key: InkKeyEvent,
  boardState: TreeBoardState,
  ui: UIState,
): InkCommandResult {
  ensureCommandSystemInitialized();

  // Get current node from tree state
  const currentNode = getNodeAtPath(boardState.nodes, boardState.cursor);

  // Build keybinding context from UI state
  const kbCtx = buildKeybindingContext({
    inMoveMode: boardState.moveMode,
    inSearchMode: false, // searchMode not in tree state yet
    inInputMode: ui.showNewItemDialog || ui.showProjectPicker,
    hasSelection:
      boardState.selectedNodes.size > 0 || ui.multiSelected.size > 0,
    isInDetailPane: ui.showDetailPane,
    isInOutlineMode: ui.inOutlineMode,
    currentNode: currentNode as TNode | null,
  });

  // Extract column indices from cursor path
  const { colIndex, cardIndex } = pathToColumnIndices(boardState.cursor);

  // Build command context
  const columnNode = boardState.nodes[colIndex];
  const ctx = buildContext(
    boardState as unknown as CmdBoardState,
    ui.viewMode,
    {
      siblingCount: columnNode?.children.length ?? 0,
      siblingIndex: cardIndex >= 0 ? cardIndex : 0,
      columnIndex: colIndex >= 0 ? colIndex : 0,
      columnCount: boardState.nodes.length,
    },
  );

  // Process key through command system
  return processInkKey(input, key, ctx, kbCtx);
}

// NOTE: Type guard functions (isTaskStatusAction, isHistoryAction, isUIAction,
// isTUIAction, isBoardAction) have been removed in favor of exhaustive switch
// statements in Board.tsx. See issue km-y00m for details.
//
// The old approach required manually keeping type guards in sync with switch
// statements, leading to silent failures when new action types were added.
// The new approach uses a single exhaustive switch with assertNever() in the
// default case, so TypeScript catches missing handlers at compile time.
