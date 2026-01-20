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
  /** Pre-computed nodeMap (use useMemo in caller to avoid O(n) rebuild per render) */
  nodeMap: NodeMap;
  dispatch: TUIContext["dispatch"];
  dispatchBoard: TUIContext["dispatchBoard"];
  exit: TUIContext["exit"];
  countVisibleDescendants: TUIContext["countVisibleDescendants"];
}

/**
 * Build unified TUI context from component state.
 *
 * Call this once per render, then pass to all handlers.
 * The nodeMap should be created via useMemo to avoid O(n) rebuild on every render.
 */
export function buildTUIContext(params: BuildTUIContextParams): TUIContext {
  const { state, boardState, ui, layout, nodeMap } = params;

  // Derive current column and card from layout
  const column = layout.columns[layout.colIndex];
  const card = column?.cards[layout.cardIndex];
  const selectedNode = card?.node;

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
    exit: params.exit,
    countVisibleDescendants: params.countVisibleDescendants,
  };
}

// =============================================================================
// Cursor Helpers (for Phase 6 migration)
// =============================================================================

/**
 * Get subIndex from cursor path.
 * cursor[2] is the sub-item index within outline mode.
 * Returns 0 if not in outline mode.
 */
export function getSubIndex(ctx: TUIContext): number {
  return ctx.boardState.cursor[2] ?? 0;
}

/**
 * Check if cursor is in outline mode (depth > 2).
 */
export function isInOutlineMode(ctx: TUIContext): boolean {
  return ctx.boardState.cursor.length > 2;
}

/**
 * Build a new cursor path with updated subIndex.
 * Preserves colIndex and cardIndex, sets depth 2 element.
 */
export function cursorWithSubIndex(ctx: TUIContext, subIndex: number): number[] {
  const [colIndex, cardIndex] = ctx.boardState.cursor;
  if (colIndex === undefined || cardIndex === undefined) {
    return ctx.boardState.cursor;
  }
  if (subIndex === 0) {
    // Exit outline mode - return to card level
    return [colIndex, cardIndex];
  }
  return [colIndex, cardIndex, subIndex];
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
    boardState: ctx.boardState,
    layout: ctx.layout,
    ui: ctx.ui,
    dispatch: ctx.dispatch,
    dispatchBoard: ctx.dispatchBoard,
    exit: ctx.exit,
    countVisibleDescendants: ctx.countVisibleDescendants,
  };
}
