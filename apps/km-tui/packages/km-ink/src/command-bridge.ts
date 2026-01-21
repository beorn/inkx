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
  type CommandAction,
  type TaskSetStatusAction,
  type HistoryAction,
  type UIAction,
  type TUIAction,
  type BoardAction,
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

/**
 * Check if a command action is a task status action (requires storage update).
 */
export function isTaskStatusAction(
  action: CommandAction,
): action is TaskSetStatusAction {
  return action.type === "TASK_SET_STATUS";
}

/**
 * Check if a command action is a history action (undo/redo).
 */
export function isHistoryAction(
  action: CommandAction,
): action is HistoryAction {
  return action.type === "HISTORY_UNDO" || action.type === "HISTORY_REDO";
}

/**
 * Check if a command action is a UI action (handled by TUI directly).
 * Includes both UI actions and TUI-specific actions (quit, dialogs, etc).
 */
export function isUIAction(action: CommandAction): action is UIAction {
  return (
    action.type === "GO_UP_PATH" ||
    action.type === "OPEN_DETAIL_PANE" ||
    action.type === "CLOSE_DETAIL_PANE" ||
    action.type === "SHOW_HELP" ||
    action.type === "HIDE_HELP" ||
    action.type === "CYCLE_VIEW_MODE" ||
    action.type === "DELETE_NODE" ||
    action.type === "SELECT_ALL_PROGRESSIVE" ||
    // TUI-specific actions
    action.type === "QUIT" ||
    action.type === "SHOW_NEW_ITEM_DIALOG" ||
    action.type === "SHOW_PROJECT_PICKER" ||
    action.type === "JUMP_TO_FAVORITE" ||
    action.type === "JUMP_TO_COLUMN" ||
    action.type === "CLOSE_OR_QUIT" ||
    action.type === "OUTDENT_NODE" ||
    action.type === "NAV_SIBLING_BOARD" ||
    action.type === "ENTER_NODE" ||
    action.type === "PAGE_JUMP" ||
    action.type === "ZOOM_INWARDS" ||
    action.type === "ZOOM_OUTWARDS"
  );
}

/**
 * Check if a command action is a TUI-specific action (quit, dialogs, favorites, etc).
 */
export function isTUIAction(action: CommandAction): action is TUIAction {
  return (
    action.type === "QUIT" ||
    action.type === "SHOW_NEW_ITEM_DIALOG" ||
    action.type === "SHOW_PROJECT_PICKER" ||
    action.type === "JUMP_TO_FAVORITE" ||
    action.type === "JUMP_TO_COLUMN" ||
    action.type === "CLOSE_OR_QUIT" ||
    action.type === "OUTDENT_NODE" ||
    action.type === "NAV_SIBLING_BOARD" ||
    action.type === "ZOOM_INWARDS" ||
    action.type === "PAGE_JUMP"
  );
}

/**
 * Check if a command action is a board action (can go to boardReducer).
 */
export function isBoardAction(action: CommandAction): action is BoardAction {
  return (
    !isTaskStatusAction(action) &&
    !isHistoryAction(action) &&
    !isUIAction(action)
  );
}
