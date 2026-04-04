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
} from "./command-parser.ts"

// Shell Executor
export {
  runShell,
  executeCommand,
  executeBoardReducerOp,
  executeShellCommand,
  serializeState,
  formatStateHuman,
  renderAsciiView,
  getPromptPath,
  type OutputEvent,
  type SerializedState,
  type ShellContext,
  type MutationResult,
  type MutationHandler,
} from "./shell-executor.ts"

// Command Registry (legacy - use @km/commands directly for new code)
// These re-exports are for backwards compatibility
export {
  commands,
  getCommandsByCategory as getLegacyCommandsByCategory,
  getCommandById,
  filterCommands as filterLegacyCommands,
  fuzzyMatch,
  type CommandDef,
  type CommandCategory,
} from "./commands.ts"

// Plain text utilities (for OpenTUI - no ANSI codes)
export { renderPlain, displayLength } from "./text.ts"

// Command Adapter (unified @km/commands integration - preferred over legacy)
export {
  initShellCommands,
  getRegisteredCommandIds,
  getCommandInfo,
  buildShellContext,
  tryExecuteRegisteredCommand,
  isRegisteredCommand,
  getCommandsByCategory,
  type KmOp,
  type CommandContext,
} from "./command-adapter.ts"

// Board state types (local to km-repl - decoupled from @km/board)
export type { BoardState, BoardReducerOp, TNode, TPath, NodeDirection } from "./board-types.ts"
export { boardReducer, createBoardState, findPathToNode, getNodeAtPath } from "./board-reducer.ts"
export type { TaskStatus } from "@km/core"
