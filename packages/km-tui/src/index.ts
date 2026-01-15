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
