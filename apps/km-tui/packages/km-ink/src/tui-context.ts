/**
 * Unified TUI Context
 *
 * Single context object built once per input event and passed to all handlers.
 * Consolidates KeyboardContext, command system context building, and derived state.
 *
 * Inspired by Decker's CmdContext pattern where all commands receive full context.
 */

import type { KNode } from "@km/core";
import type { BoardState as TreeBoardState, NodeMap } from "@km/board";
import { createNodeMap } from "@km/board";
import type { BoardState, CardState, ColumnState } from "./types.ts";
import type { UIState } from "./ui-reducer.ts";
import { actions } from "./ui-reducer.ts";
import type { ColumnsLayout } from "./board-adapter.ts";

// =============================================================================
// Types
// =============================================================================

/**
 * Unified context for all TUI input handling.
 *
 * Built once per input event in Board.tsx, passed to all handlers.
 * Eliminates redundant context building in keyboard-handler.ts and command-bridge.ts.
 */
export interface TUIContext {
  // === State ===
  /** Legacy column-based board state (for backward compatibility) */
  state: BoardState;
  /** Tree-based board state from boardReducer */
  boardState: TreeBoardState;
  /** UI state (dialogs, view mode, selection) */
  ui: UIState;
  /** Derived column layout from tree state */
  layout: ColumnsLayout;

  // === Derived (computed once) ===
  /** Current column (from layout) */
  column: ColumnState | undefined;
  /** Current card (from layout) */
  card: CardState | undefined;
  /** Currently selected node */
  selectedNode: KNode | undefined;
  /** O(1) node lookup by ID */
  nodeMap: NodeMap;

  // === Dispatchers ===
  /** Dispatch to UI reducer */
  dispatch: React.Dispatch<ReturnType<(typeof actions)[keyof typeof actions]>>;
  /** Dispatch to board reducer */
  dispatchBoard: React.Dispatch<import("@km/board").BoardAction>;
  /** Legacy setState for gradual migration */
  setState: React.Dispatch<React.SetStateAction<BoardState>>;
  /** Exit the application */
  exit: () => void;

  // === Utilities ===
  /** Count visible descendants for outline mode */
  countVisibleDescendants: (
    node: KNode,
    depth: number,
    maxDepth: number,
    foldedNodes: Set<string>,
  ) => number;
}

/**
 * Minimal key event interface (matches Ink's useInput callback).
 */
export interface KeyEvent {
  escape?: boolean;
  return?: boolean;
  ctrl?: boolean;
  upArrow?: boolean;
  downArrow?: boolean;
  leftArrow?: boolean;
  rightArrow?: boolean;
  tab?: boolean;
  backspace?: boolean;
  delete?: boolean;
  shift?: boolean;
  meta?: boolean;
}

// =============================================================================
// Context Builder
// =============================================================================

export interface BuildTUIContextParams {
  state: BoardState;
  boardState: TreeBoardState;
  ui: UIState;
  layout: ColumnsLayout;
  dispatch: TUIContext["dispatch"];
  dispatchBoard: TUIContext["dispatchBoard"];
  setState: TUIContext["setState"];
  exit: TUIContext["exit"];
  countVisibleDescendants: TUIContext["countVisibleDescendants"];
}

/**
 * Build unified TUI context from component state.
 *
 * Call this once per input event, then pass to all handlers.
 */
export function buildTUIContext(params: BuildTUIContextParams): TUIContext {
  const { state, boardState, ui, layout } = params;

  // Derive current column and card from layout
  const column = layout.columns[layout.colIndex];
  const card = column?.cards[layout.cardIndex];
  const selectedNode = card?.node;

  // Build O(1) node lookup map
  const nodeMap = createNodeMap(boardState.nodes);

  return {
    state,
    boardState,
    ui,
    layout,
    column,
    card,
    selectedNode,
    nodeMap,
    dispatch: params.dispatch,
    dispatchBoard: params.dispatchBoard,
    setState: params.setState,
    exit: params.exit,
    countVisibleDescendants: params.countVisibleDescendants,
  };
}

// =============================================================================
// Backward Compatibility
// =============================================================================

/**
 * Convert TUIContext to legacy KeyboardContext for existing handlers.
 *
 * Use this during migration - eventually handlers should use TUIContext directly.
 */
export function toKeyboardContext(
  ctx: TUIContext,
): import("./keyboard-types.ts").KeyboardContext {
  return {
    state: ctx.state,
    ui: ctx.ui,
    setState: ctx.setState,
    dispatch: ctx.dispatch,
    exit: ctx.exit,
    countVisibleDescendants: ctx.countVisibleDescendants,
  };
}
