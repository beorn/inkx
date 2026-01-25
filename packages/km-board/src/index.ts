/**
 * @km/board - Board Navigation State
 *
 * ID-based board state for visual navigation.
 * Manages cursor selection, fold/collapse, zoom, and history.
 * Does NOT include app-specific UI state (modals, dialogs).
 *
 * After radical simplification (km-refactor-audit):
 * - No tree data in state (use Vault instead)
 * - No path-based cursor (use cursorNodeId)
 * - No selectors/helpers (use Vault queries)
 */

// ===== Board Types =====
export type {
  // Core state and actions
  BoardState,
  BoardAction,
  ZoomEntry,
  NavHistoryEntry,
  // Common types
  TNode,
  TPath,
  ViewMode,
  TaskStatus,
  BoardViewModel,
  NodeDirection,
} from "./board-types.ts";

// ===== Tree Actions (re-exported for convenience) =====
export type { TAction } from "@km/tree";
export { isTAction, TActionTypes } from "@km/tree";

// ===== Tree Helpers (re-exported from @km/tree) =====
export { getNodeAtPath, getSiblingCount } from "@km/tree";

// ===== Board Reducer =====
export { boardReducer, createBoardState } from "./board-reducer.ts";
