/**
 * @km/tui
 *
 * Shareable TUI state management and view models for km.
 * Pure TypeScript - no React, no renderer dependencies.
 *
 * Use in:
 * - apps/km-cli/src/tui2/ (OpenTUI renderer)
 * - apps/km-web/ (future React DOM renderer)
 */

// Types
export type {
  // State types
  BoardState,
  BoardAction,
  ColumnState,
  CardState,
  TaskStatus,
  ViewMode,
  NavHistoryEntry,
  // ViewModel types
  CardViewModel,
  ColumnViewModel,
  BoardViewModel,
} from "./types.ts";

// Reducer
export { boardReducer, createInitialBoardState } from "./boardReducer.ts";

// Selectors
export {
  getCurrentColumn,
  getCurrentCard,
  canMoveUp,
  canMoveDown,
  canMoveLeft,
  canMoveRight,
  isCardFolded,
  isColumnCollapsed,
  getTotalCardCount,
  isColumnOverWipLimit,
} from "./selectors.ts";

// Transformers
export {
  toCardViewModel,
  toColumnViewModel,
  toBoardViewModel,
} from "./transformers.ts";

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
  executeBoardAction,
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
