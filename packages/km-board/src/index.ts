/**
 * @km/board - Board Navigation State
 *
 * Visual navigation state for board navigation.
 * Manages cursor, selection, fold/collapse, zoom, and history.
 * Does NOT include app-specific UI state (modals, dialogs).
 */

// ===== Board Types =====
export type {
  // Current types (simplified architecture - NEW)
  BoardState,
  BoardAction,
  ZoomEntry,
  NavHistoryEntry,
  // Legacy types (DEPRECATED - will be removed)
  BoardStateLegacy,
  BoardActionLegacy,
  NodeDirection,
  // Transitional type for gradual migration
  TransitionalBoardAction,
  // Common types
  TNode,
  TPath,
  ViewMode,
  TaskStatus,
  ViewLevelConfig,
  BoardViewModel,
} from "./board-types.ts";
export { VIEW_LEVEL_PRESETS } from "./board-types.ts";

// ===== Tree Actions (re-exported for convenience) =====
export type { TAction } from "@km/tree";
export { isTAction, TActionTypes } from "@km/tree";

// ===== Tree Helpers (re-exported from @km/tree) =====
export { getNodeAtPath, getSiblingCount } from "@km/tree";

// ===== Board Reducer =====
export {
  // Current reducer (uses simplified BoardState without nodes - NEW)
  boardReducer,
  createBoardState,
  // Legacy reducer (uses BoardStateLegacy with nodes - DEPRECATED)
  boardReducerLegacy,
  createBoardStateLegacy,
  findPathToNode,
} from "./board-reducer.ts";

// ===== Selectors =====
export {
  getCurrentNode,
  getParentNode,
  getSiblings,
  getCurrentIndex,
  canNavigateUp,
  canNavigateDown,
  canNavigateParent,
  canNavigateChild,
  isNodeFolded,
  isNodeCollapsed,
  getTotalNodeCount,
  getTopLevelCount,
  getCursorDepth,
  getBreadcrumbs,
  isNodeInTree,
  // TPath <-> Column/Card index conversion
  pathToColumnIndices,
  columnIndicesToPath,
  getCursorColumnIndices,
  getCurrentColumn,
  getCurrentCard,
  getCurrentColumnCardCount,
} from "./selectors.ts";

export type { ColumnIndices } from "./selectors.ts";

// ===== Transformers =====
export { toBoardViewModel } from "./transformers.ts";

// ===== Node Map (O(1) ID Lookup) =====
export { createNodeMap } from "./node-map.ts";
export type { NodeMap, NodeMapEntry } from "./node-map.ts";

// ===== Visual-to-Structural Navigation =====
export { visualToStructural, canMove } from "./navigation.ts";
export type { VisualDir, StructuralAction } from "./navigation.ts";

// ===== Board Domain Object (preferred API) =====
export { createBoard } from "./board-object.ts";
export type { Board, BoardOptions } from "./board-object.ts";
