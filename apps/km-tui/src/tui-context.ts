/**
 * Unified TUI Context
 *
 * Single context object built once per input event and passed to all handlers.
 * Consolidates KeyboardContext, command system context building, and derived state.
 *
 * Inspired by Decker's CmdContext pattern where all commands receive full context.
 */

import type { KNode } from "@km/core"
import type { Repo } from "./repo-context.tsx"
import type { BoardState, BoardAction } from "@km/board"
import type {
  TUIBoardState,
  CardState,
  ColumnState,
  ColumnsLayout,
} from "./types.ts"
import type { UIState } from "./ui-reducer.ts"
import { actions } from "./ui-reducer.ts"
import type { LayoutRegistry } from "./card-positions.ts"

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
  /** Repo for storage operations */
  repo: Repo

  // === State ===
  /** TUI rendering state (columns/cards structure) */
  state: TUIBoardState
  /** Board state from boardReducer */
  boardState: BoardState
  /** UI state (dialogs, view mode, selection) */
  ui: UIState
  /** Derived column layout from tree state */
  layout: ColumnsLayout
  /** Card position registry for h/l navigation (Y-position tracking) */
  positionRegistry: LayoutRegistry

  // === Derived (computed once) ===
  /** Current column (from layout) */
  column: ColumnState | undefined
  /** Current card (from layout) */
  card: CardState | undefined
  /** Currently selected node */
  selectedNode: KNode | undefined

  // === Dispatchers ===
  /** Dispatch to UI reducer */
  dispatch: React.Dispatch<ReturnType<(typeof actions)[keyof typeof actions]>>
  /** Dispatch to board reducer */
  dispatchBoard: React.Dispatch<BoardAction>
  /** Exit the application */
  exit: () => void

  // === Utilities ===
  /** Count visible descendants for outline mode */
  countVisibleDescendants: (
    node: KNode,
    depth: number,
    maxDepth: number,
    foldedNodes: Set<string>,
  ) => number
}

// =============================================================================
// Context Builder
// =============================================================================

export interface BuildTUIContextParams {
  repo: Repo
  state: TUIBoardState
  boardState: BoardState
  ui: UIState
  layout: ColumnsLayout
  /** Card position registry for h/l navigation */
  positionRegistry: LayoutRegistry
  dispatch: TUIContext["dispatch"]
  dispatchBoard: TUIContext["dispatchBoard"]
  exit: TUIContext["exit"]
  countVisibleDescendants: TUIContext["countVisibleDescendants"]
}

/**
 * Build unified TUI context from component state.
 * Call this once per render, then pass to all handlers.
 */
export function buildTUIContext(params: BuildTUIContextParams): TUIContext {
  const { repo, state, boardState, ui, layout, positionRegistry } = params

  // Derive current column and card from layout
  const column = layout.columns[layout.colIndex]
  const card = column?.cards[layout.cardIndex]
  // At column level (cardIndex -1), use column node; at card level, use card node
  const selectedNode = card?.node ?? column?.node

  return {
    repo,
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
  }
}
