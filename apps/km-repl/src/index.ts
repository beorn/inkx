/**
 * @km/repl - REPL Application
 *
 * Read-Eval-Print-Loop for km commands.
 * Supports both interactive and scripted usage for debugging board state.
 * Reads commands from stdin, executes them against BoardState,
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
  executeBoardAction,
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

// Re-export board state types from @km/board for convenience
export type {
  BoardState,
  BoardAction,
  TNode,
  TPath,
  TaskStatus,
} from "@km/board";
export { boardReducer, createBoardState } from "@km/board";
