/**
 * @km/board - Visual Board State
 *
 * Visual navigation state for TUI board navigation.
 * Manages cursor, selection, fold/collapse, zoom, and history.
 * NO UI rendering - that's in @km/tui.
 */

// Board-specific types (column/card navigation)
export type { BoardState, BoardAction, CursorPath } from "./types.ts";
export { createInitialBoardState } from "./types.ts";
export { boardReducer, validateCursor } from "./boardReducer.ts";

// Tree types (path-based navigation)
export type {
  TaskStatus,
  ViewMode,
  CursorPath as TreeCursorPath,
  TreeState,
  TreeAction,
  TreeNodeState,
  ViewLevelConfig,
  NodeViewModel,
  TreeViewModel,
} from "./treeTypes.ts";
export { VIEW_LEVEL_PRESETS } from "./treeTypes.ts";

// Tree reducer
export {
  treeReducer,
  createInitialTreeState,
  getNodeAtPath,
  getSiblingCount,
} from "./treeReducer.ts";

// Selectors
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

// Transformers
export { toNodeViewModel, toTreeViewModel } from "./transformers.ts";
