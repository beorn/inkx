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
import type { SimplifiedBoardState, TransitionalBoardAction } from "@km/board";
import type {
  TUIBoardState,
  CardState,
  ColumnState,
  ColumnsLayout,
} from "./types.ts";
import type { UIState } from "./ui-reducer.ts";
import { actions } from "./ui-reducer.ts";
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
  state: TUIBoardState;
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
  state: TUIBoardState;
  boardState: SimplifiedBoardState;
  ui: UIState;
  layout: ColumnsLayout;
  /** Card position registry for h/l navigation */
  positionRegistry: LayoutRegistry;
  dispatch: TUIContext["dispatch"];
  dispatchBoard: TUIContext["dispatchBoard"];
  exit: TUIContext["exit"];
  countVisibleDescendants: TUIContext["countVisibleDescendants"];
}

/**
 * Build unified TUI context from component state.
 * Call this once per render, then pass to all handlers.
 */
export function buildTUIContext(params: BuildTUIContextParams): TUIContext {
  const { vault, state, boardState, ui, layout, positionRegistry } = params;

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
