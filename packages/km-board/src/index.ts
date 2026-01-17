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
  NodeDirection,
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
  createBoardState,
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
