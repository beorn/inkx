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
export {
  ViewTree,
  buildViewTree,
  buildViewIndex,
  dfsTraversal,
  deriveCursorPath,
  classifyCursorFromViewIndex,
  toColumnViews,
  viewNodeToColumnViews,
  // Canonical helpers — shared by view-tree, use-columns, state.ts, etc.
  isCollapsedChild,
  isDetailOnly,
  deduplicateByFsPath,
  extractWipLimits,
} from "./view-tree.ts"
export type {
  ViewNode,
  ViewRole,
  ViewTreeRepo,
  ViewTreeNodesOptions,
  CompatColumnView,
  ViewNodeCacheEntry,
  ViewNodeColumnCache,
} from "./view-tree.ts"
