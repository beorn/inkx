/**
 * @km/board - Board Navigation State
 *
 * Visual navigation state for board navigation.
 * Manages cursor, selection, fold/collapse, zoom, and history.
 * Does NOT include app-specific UI state (modals, dialogs).
 */

// ===== Board Types =====
export type {
  BoardState,
  BoardAction,
  TNode,
  TPath,
  ViewMode,
  TaskStatus,
  ViewLevelConfig,
  NodeViewModel,
  BoardViewModel,
} from "./boardTypes.ts";
export { VIEW_LEVEL_PRESETS } from "./boardTypes.ts";

// ===== Board Reducer =====
export {
  boardReducer,
  createInitialBoardState,
  getNodeAtPath,
  getSiblingCount,
} from "./boardReducer.ts";

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
} from "./selectors.ts";

// ===== Transformers =====
export {
  toNodeViewModel,
  toBoardViewModel,
  toTreeViewModel,
} from "./transformers.ts";

// ===== Legacy Exports (Backward Compatibility) =====
// These are deprecated and will be removed in a future version.
// Apps should migrate to BoardState/BoardAction and manage their own AppUIState.

// Re-export TPath as TreeCursorPath for backward compatibility
import type { TPath } from "./boardTypes.ts";
/** @deprecated Use TPath instead */
export type TreeCursorPath = TPath;
/** @deprecated Use TPath instead */
export type CursorPath = TPath;

// Legacy aliases
import type { BoardState, BoardAction, BoardViewModel } from "./boardTypes.ts";
import { boardReducer, createInitialBoardState } from "./boardReducer.ts";

/**
 * @deprecated Use BoardState instead. TreeState included app-specific UI fields
 * that should now be managed in the app layer.
 */
export type TreeState = BoardState;

/**
 * @deprecated Use BoardAction instead. TreeAction included app-specific UI actions
 * that should now be handled in the app layer.
 */
export type TreeAction = BoardAction;

/**
 * @deprecated Use BoardViewModel instead.
 */
export type TreeViewModel = BoardViewModel;

/**
 * @deprecated Use boardReducer instead.
 */
export const treeReducer = boardReducer;

/**
 * @deprecated Use createInitialBoardState instead.
 */
export const createInitialTreeState = createInitialBoardState;
