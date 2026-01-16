/**
 * @km/sh-app - Shell Application
 *
 * Non-interactive shell for scripting and debugging TUI state.
 * Reads commands from stdin, executes them against TreeState,
 * and outputs trace/state to stdout.
 */

// Command Parser
export {
  parseCommand,
  parseKeySpec,
  getCommandHelp,
  getCommandNames,
  type ParseResult,
  type ShellCommand,
} from "./commandParser.ts";

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
} from "./shellExecutor.ts";

// Command Registry
export {
  commands,
  getCommandsByCategory,
  getCommandById,
  filterCommands,
  fuzzyMatch,
  type CommandDef,
  type CommandCategory,
} from "./commands.ts";

// Plain text utilities (for OpenTUI - no ANSI codes)
export { renderPlain, displayLength } from "./text.ts";

// Re-export tree state types from @km/board for convenience
export type {
  TreeState,
  TreeAction,
  TreeNodeState,
  TreeCursorPath as CursorPath,
  TaskStatus,
} from "@km/board";
export { treeReducer, createInitialTreeState } from "@km/board";
