/**
 * @km/tui-core
 *
 * Shareable TUI state management and view models for km.
 * Pure TypeScript - no React, no renderer dependencies.
 *
 * Uses a generic tree model with path-based navigation.
 *
 * NOTE: Tree state (TreeState, treeReducer, selectors, transformers)
 * is now implemented in @km/board and re-exported here for backward compatibility.
 */

// ====== Re-exports from @km/board (canonical location) ======

// Types
export type {
  // Base types
  TaskStatus,
  ViewMode,
  TreeCursorPath as CursorPath,
  // State types
  TreeState,
  TreeAction,
  TreeNodeState,
  // View configuration
  ViewLevelConfig,
  // ViewModel types
  NodeViewModel,
  TreeViewModel,
} from "@km/board";

// View level presets
export { VIEW_LEVEL_PRESETS } from "@km/board";

// Reducer
export {
  treeReducer,
  createInitialTreeState,
  getNodeAtPath,
  getSiblingCount,
} from "@km/board";

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
} from "@km/board";

// Transformers
export { toNodeViewModel, toTreeViewModel } from "@km/board";

// ====== Local implementations (shell, icons, commands) ======

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
  getPromptPath,
} from "./shellExecutor.ts";
export type {
  OutputEvent,
  SerializedState,
  ShellContext,
} from "./shellExecutor.ts";

// Icon utilities
export {
  getStatusIcon,
  getTypeIcon,
  getNodeIcon,
  COLORED_CIRCLE,
  type StatusIcon,
} from "./icons.ts";

// Tree utilities (re-exported from @km/tree)
export {
  getNodeDisplayName,
  getTypeIndicator,
  normalizeName,
  namesAreSimilar,
  getCollapsedTypeSuffix,
  collapseRedundantAncestors,
  collapseAncestorsWithTypes,
  getParentContext,
  type CollapsedAncestor,
  type GetChildrenFn,
  type GetNodeFn,
} from "./tree.ts";

// Plain text utilities (for OpenTUI - no ANSI codes)
export { renderPlain, displayLength } from "./text.ts";

// Command registry (for command palette)
export {
  commands,
  getCommandsByCategory,
  getCommandById,
  filterCommands,
  fuzzyMatch,
} from "./commands.ts";
export type { CommandDef, CommandCategory } from "./commands.ts";
