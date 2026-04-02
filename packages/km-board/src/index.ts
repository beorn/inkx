/**
 * @km/board - Board Navigation State
 *
 * ID-based board state for visual navigation.
 * Manages cursor selection, fold/collapse, zoom, and history.
 * Does NOT include app-specific UI state (modals, dialogs).
 *
 * After radical simplification (km-refactor-audit):
 * - No tree data in state (use Repo instead)
 * - No path-based cursor (use cursorNodeId)
 * - No selectors/helpers (use Repo queries)
 */

// ===== Board Types =====
export type {
  // Core state and actions
  BoardState,
  BoardAction,
  MoveState,
  NavHistoryEntry,
  // Common types
  TNode,
  TPath,
  ViewMode,
  TaskStatus,
  BoardViewModel,
  NodeDirection,
} from "./board-types.ts"

// ===== Tree Actions (re-exported for convenience) =====
export type { TAction } from "@km/tree"
export { isTAction, TActionTypes } from "@km/tree"

// ===== Tree Helpers (re-exported from @km/tree) =====
export { getNodeAtPath, getSiblingCount } from "@km/tree"

// ===== Board Reducer =====
export { boardReducer, createBoardState } from "./board-reducer.ts"

// ===== Grid Navigator =====
export { createGridNavigator } from "./grid-navigator.ts"
export type { GridNavigator, CrossAxisResult } from "./grid-navigator.ts"

// ===== View Tree =====
export { buildViewTree, buildViewIndex, dfsTraversal, deriveCursorPath, toColumnViews } from "./view-tree.ts"
export type { ViewNode, ViewRole, ViewTreeRepo, CompatColumnView } from "./view-tree.ts"
