/**
 * @km/board - Board Navigation State
 *
 * ID-based board state for visual navigation.
 * Manages cursor selection, fold/collapse, zoom, and history.
 * Does NOT include app-specific UI state (modals, dialogs).
 *
 * After radical simplification (km-refactor-audit):
 * - No tree data in state (use Repo instead)
 * - No path-based cursor (use sel.node.cursor())
 * - No selectors/helpers (use Repo queries)
 */

// ===== Board Types =====
export type {
  // Core state and actions
  BoardState,
  BoardReducerOp,
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

// ===== Tree Ops (re-exported for convenience) =====
export type { TOp } from "@km/tree"
export { isTOp, TOpTypes } from "@km/tree"

// ===== Tree Helpers (re-exported from @km/tree) =====
export { getNodeAtPath, getSiblingCount } from "@km/tree"

// ===== Board Reducer =====
export { boardReducer, createBoardState } from "./board-reducer.ts"

// ===== Grid Navigator =====
export { createGridNavigator } from "./grid-navigator.ts"
export type { GridNavigator, CrossAxisResult } from "./grid-navigator.ts"

// ===== View Helpers (shared pure helpers used by the lens and consumers) =====
export {
  CARD_REMAINING_DEPTH,
  isCollapsedChild,
  isDetailOnly,
  deduplicateByFsPath,
  extractWipLimits,
  createVirtualBodyNode,
  getCollapseRules,
} from "./view-lens-helpers.ts"

// ===== Tree Lens (universal navigation interface) =====
export type { TreeLens, ViewRole } from "./tree-lens.ts"

// ===== View Lens (TreeLens-based view over repo) =====
export { createViewLens, classifyCursorFromLens } from "./view-lens.ts"
export type { ViewLensRepo, ViewLensOptions } from "./view-lens.ts"

// ===== Visible Lens (collapse + filter over view lens) =====
export { createVisibleLens } from "./visible-lens.ts"
export type { VisibleLensOptions } from "./visible-lens.ts"

// ===== Projected Map (reusable reactive per-key signal bags) =====
export { createProjectedMap } from "./projected-map.ts"
export type { ProjectedMap, Projected } from "./projected-map.ts"

// ===== ViewTree (per-node projection + navigation) =====
export { createViewTree } from "./view-tree-projection.ts"
export type {
  ViewTree as ViewTreeProjection,
  ViewNode as ProjectedViewNode,
  ViewNodeState,
  ViewType,
} from "./view-tree-projection.ts"
