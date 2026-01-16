/**
 * @km/tui-core
 *
 * Shareable TUI state management and view models for km.
 * Pure TypeScript - no React, no renderer dependencies.
 *
 * Uses a generic tree model with path-based navigation.
 */

// Types
export type {
  // Base types
  TaskStatus,
  ViewMode,
  CursorPath,
  // State types
  TreeState,
  TreeAction,
  TreeNodeState,
  // View configuration
  ViewLevelConfig,
  // ViewModel types
  NodeViewModel,
  TreeViewModel,
} from "./types.ts";

// View level presets
export { VIEW_LEVEL_PRESETS } from "./types.ts";

// Reducer
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

// Command Parser (for km-sh)
export {
  parseCommand,
  parseKeySpec,
  getCommandHelp,
  getCommandNames,
} from "./commandParser.ts";
export type { ParseResult, ShellCommand } from "./commandParser.ts";

// Shell Executor (for km-sh)
export {
  runShell,
  executeCommand,
  executeTreeAction,
  executeShellCommand,
  serializeState,
  formatStateHuman,
  renderAsciiView,
} from "./shellExecutor.ts";
export type {
  OutputEvent,
  SerializedState,
  ShellContext,
} from "./shellExecutor.ts";

// Icon utilities (shared across TUI implementations)
export {
  getStatusIcon,
  getTypeIcon,
  getNodeIcon,
  COLORED_CIRCLE,
  type StatusIcon,
} from "./icons.ts";

// Plain text utilities (for OpenTUI - no ANSI codes)
export { renderPlain, displayLength } from "./text.ts";
