/**
 * @km/sh-app - Shell Application
 *
 * Non-interactive shell for scripting and debugging TUI state.
 * Reads commands from stdin, executes them against TreeState,
 * and outputs trace/state to stdout.
 *
 * Re-exports shell functionality from @km/tui-core for standalone use.
 */

// Command Parser
export {
  parseCommand,
  parseKeySpec,
  getCommandHelp,
  getCommandNames,
  type ParseResult,
  type ShellCommand,
} from "@km/tui-core";

// Shell Executor
export {
  runShell,
  executeCommand,
  executeTreeAction,
  executeShellCommand,
  serializeState,
  formatStateHuman,
  renderAsciiView,
  getPromptPath,
  type OutputEvent,
  type SerializedState,
  type ShellContext,
} from "@km/tui-core";

// Command Registry
export {
  commands,
  getCommandsByCategory,
  getCommandById,
  filterCommands,
  fuzzyMatch,
  type CommandDef,
  type CommandCategory,
} from "@km/tui-core";

// Plain text utilities (for OpenTUI - no ANSI codes)
export { renderPlain, displayLength } from "@km/tui-core";

// Re-export tree state types for convenience
export type {
  TreeState,
  TreeAction,
  TreeNodeState,
  CursorPath,
} from "@km/tui-core";
export { treeReducer, createInitialTreeState } from "@km/tui-core";
