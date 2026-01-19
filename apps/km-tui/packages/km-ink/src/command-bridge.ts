/**
 * Command System Bridge
 *
 * Bridges the @km/commands system to the current Board.tsx state model.
 * This enables gradual migration from keyboard-handler.ts to the command system.
 *
 * The current Board.tsx uses a columns-based state model:
 *   { columns: ColumnState[], colIndex, cardIndex }
 *
 * The @km/board package uses a tree-based state model:
 *   { nodes: TNode[], cursor: TPath }
 *
 * This bridge:
 * 1. Converts the columns-based state to CommandContext
 * 2. Processes keys through the command system
 * 3. Returns actions that can be handled by the existing dispatch logic
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
  type BoardAction,
  type BoardState as CmdBoardState,
  type TNode,
} from "@km/commands";
import type { BoardState } from "./types.ts";
import type { UIState } from "./ui-reducer.ts";

// Initialize command system once on module load
let initialized = false;

export function ensureCommandSystemInitialized(): void {
  if (!initialized) {
    initCommandSystem();
    initialized = true;
  }
}

/**
 * Convert current Board.tsx state to the CommandContext format.
 * This bridges the old columns-based model to the new tree-based model.
 */
export function boardStateToCommandContext(
  state: BoardState,
  ui: UIState,
): {
  boardState: CmdBoardState;
  currentNode: TNode | null;
} {
  // Get the current column and card
  const col = state.columns[state.colIndex];
  const card = col?.cards[state.cardIndex];
  const currentNode = card?.node ?? null;

  // Build a minimal BoardState for CommandContext
  // This is a bridge until Board.tsx migrates to the new state model
  const boardState: CmdBoardState = {
    rootId: state.rootId,
    rootPath: state.rootPath,
    nodes: state.columns.map((c) => c.node),
    cursor: [state.colIndex, state.cardIndex],
    selectedNodes: ui.multiSelected
      ? new Set(
          Array.from(ui.multiSelected)
            .map((key) => {
              const [colStr, cardStr] = key.split(":");
              const colIdx = parseInt(colStr ?? "0", 10);
              const cardIdx = parseInt(cardStr ?? "0", 10);
              return state.columns[colIdx]?.cards[cardIdx]?.node.id;
            })
            .filter((id): id is string => id !== undefined),
        )
      : new Set<string>(),
    foldedNodes: ui.foldedNodes,
    collapsedNodes: new Set(
      Array.from(ui.collapsedColumns).map((idx) => {
        const col = state.columns[idx];
        return col?.node.id ?? "";
      }),
    ),
    // zoomStack cursor positions are not tracked in Board.tsx state,
    // so we use [0] as a placeholder - zoom operations will recalculate
    zoomStack: state.zoomStack.map((id) => ({
      rootId: id,
      cursor: [0] as [number, ...number[]],
    })),
    // Map navHistory from UIState - convert from columns-based to tree-based cursor
    navHistory: ui.navHistory.map((entry) => ({
      rootId: entry.rootId,
      cursor: [entry.colIndex, entry.cardIndex] as [number, ...number[]],
    })),
    navHistoryIndex: ui.navHistoryIndex,
    moveMode: false,
    moveSourceNodes: [],
    moveSourceCursor: [0],
    maxOutlineDepth: ui.maxOutlineDepth,
    maxContentLines: ui.maxContentLines,
  };

  return { boardState, currentNode };
}

/**
 * Process a key event through the command system.
 *
 * @param input - The input character from useInput
 * @param key - The key event from useInput
 * @param state - Current Board.tsx state
 * @param ui - Current UI state
 * @returns Result with commandId and actions, or null if not handled
 */
export function processKeyThroughCommands(
  input: string,
  key: InkKeyEvent,
  state: BoardState,
  ui: UIState,
): InkCommandResult {
  ensureCommandSystemInitialized();

  const { boardState, currentNode } = boardStateToCommandContext(state, ui);

  // Build keybinding context from UI state
  // Note: moveMode is not yet implemented in TUI - will be false until move mode feature is added
  const kbCtx = buildKeybindingContext({
    inMoveMode: false,
    inSearchMode: state.searchMode,
    inInputMode: ui.showNewItemDialog || ui.showProjectPicker,
    hasSelection: ui.multiSelected.size > 0,
    isInDetailPane: ui.showDetailPane,
    isInOutlineMode: ui.inOutlineMode,
    currentNode,
  });

  // Build command context
  const col = state.columns[state.colIndex];
  const ctx = buildContext(boardState, ui.viewMode, {
    siblingCount: col?.cards.length ?? 0,
    siblingIndex: state.cardIndex,
    columnIndex: state.colIndex,
    columnCount: state.columns.length,
  });

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
export function isHistoryAction(action: CommandAction): action is HistoryAction {
  return action.type === "HISTORY_UNDO" || action.type === "HISTORY_REDO";
}

/**
 * Check if a command action is a board action (can go to boardReducer).
 */
export function isBoardAction(action: CommandAction): action is BoardAction {
  return (
    action.type !== "TASK_SET_STATUS" &&
    action.type !== "HISTORY_UNDO" &&
    action.type !== "HISTORY_REDO"
  );
}
