/**
 * Unified TUI Context
 *
 * Single context object built once per input event and passed to all handlers.
 * Consolidates KeyboardContext, command system context building, and derived state.
 *
 * Inspired by Decker's CmdContext pattern where all commands receive full context.
 */

import type { KNode } from "@km/core";
import type { Vault } from "./vault-context.tsx";
import type {
  SimplifiedBoardState,
  TransitionalBoardAction,
  NodeMap,
} from "@km/board";
import type { BoardState, CardState, ColumnState } from "./types.ts";
import type { UIState } from "./ui-reducer.ts";
import { actions } from "./ui-reducer.ts";
import type { ColumnsLayout } from "./board-adapter.ts";
import type { LayoutRegistry } from "./card-positions.ts";

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
  // === Storage ===
  /** Vault for storage operations */
  vault: Vault;

  // === State ===
  /** Legacy column-based board state (for backward compatibility) */
  state: BoardState;
  /** Simplified board state from simplifiedBoardReducer */
  boardState: SimplifiedBoardState;
  /** UI state (dialogs, view mode, selection) */
  ui: UIState;
  /** Derived column layout from tree state */
  layout: ColumnsLayout;
  /** Card position registry for h/l navigation (Y-position tracking) */
  positionRegistry: LayoutRegistry;

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
  /** Dispatch to board reducer (transitional: accepts old and new actions) */
  dispatchBoard: React.Dispatch<TransitionalBoardAction>;
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
  vault: Vault;
  state: BoardState;
  boardState: SimplifiedBoardState;
  ui: UIState;
  layout: ColumnsLayout;
  /** Pre-computed nodeMap (use useMemo in caller to avoid O(n) rebuild per render) */
  nodeMap: NodeMap;
  /** Card position registry for h/l navigation */
  positionRegistry: LayoutRegistry;
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
  const { vault, state, boardState, ui, layout, nodeMap, positionRegistry } =
    params;

  // Derive current column and card from layout
  const column = layout.columns[layout.colIndex];
  const card = column?.cards[layout.cardIndex];
  const selectedNode = card?.node;

  return {
    vault,
    state,
    boardState,
    ui,
    layout,
    positionRegistry,
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
// Cursor Helpers (simplified for new architecture)
// =============================================================================

/**
 * Get subIndex from layout.
 * TODO: Outline mode support will be added in a future update.
 */
export function getSubIndex(ctx: TUIContext): number {
  return ctx.layout.subPath[0] ?? 0;
}

/**
 * Check if cursor is in outline mode (has subPath).
 * TODO: Outline mode support will be added in a future update.
 */
export function isInOutlineMode(ctx: TUIContext): boolean {
  return ctx.layout.isInOutlineMode;
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
    vault: ctx.vault,
    boardState: ctx.boardState,
    layout: ctx.layout,
    ui: ctx.ui,
    dispatch: ctx.dispatch,
    dispatchBoard: ctx.dispatchBoard,
    exit: ctx.exit,
    countVisibleDescendants: ctx.countVisibleDescendants,
  };
}
