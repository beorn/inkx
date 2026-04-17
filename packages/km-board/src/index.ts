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

// =============================================================================
// LAYERING — choose the right API for your use case
// =============================================================================
//
//   TreeLens (createViewLens, createVisibleLens, type TreeLens)
//     └── Pure data layer. No state, no signals. Lazy caching.
//         Use directly from non-React code: bulk computation, navigation
//         helpers, board-state derivation, pane-signals reactive graph.
//
//   ViewTree (createViewTree)
//     └── React-side projection of a TreeLens. Adds per-node signal bags
//         (ProjectedMap) for incremental rendering. Components subscribe
//         to individual nodes via useNode(id) — re-renders only when THAT
//         node's view state changes.
//
//   Rule of thumb:
//     - In a React component? Use ViewTree via useNode(id).
//     - In reducer/selector/navigation/store code? Use TreeLens directly.
//
//   See: docs/design/ui/visibility.md, docs/glossary.md (TreeLens, ViewTree)
// =============================================================================

// ===== Tree Lens (universal navigation interface — DATA LAYER) =====
// React code should NOT consume TreeLens directly. Use ViewTree below.
export type { TreeLens, ViewRole } from "./tree-lens.ts"

// ===== View Lens (TreeLens-based view over repo — DATA LAYER) =====
// React code should NOT consume this directly. Use ViewTree below.
export { createViewLens, classifyCursorFromLens } from "./view-lens.ts"
export type { ViewLensRepo, ViewLensOptions } from "./view-lens.ts"

// ===== Visible Lens (collapse + filter over view lens — DATA LAYER) =====
// React code should NOT consume this directly. Use ViewTree below.
export { createVisibleLens } from "./visible-lens.ts"
export type { VisibleLensOptions } from "./visible-lens.ts"

// ===== Projected Map (reusable reactive per-key signal bags) =====
export { createProjectedMap } from "./projected-map.ts"
export type { ProjectedMap, Projected } from "./projected-map.ts"

// ===== ViewTree (per-node projection + navigation — REACT LAYER) =====
// This is what React code should use. Wraps a TreeLens with per-node signals.
export { createViewTree } from "./view-tree-projection.ts"
export type {
  ViewTree as ViewTreeProjection,
  ViewNode as ProjectedViewNode,
  ViewNodeState,
  ViewType,
} from "./view-tree-projection.ts"
