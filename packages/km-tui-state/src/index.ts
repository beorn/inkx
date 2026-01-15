/**
 * @km/tui-state
 *
 * Shareable TUI state management for km.
 * Pure TypeScript - no React, no renderer dependencies.
 *
 * Use in:
 * - apps/km-cli/src/tui2/ (OpenTUI renderer)
 * - apps/km-web/ (future React DOM renderer)
 */

export type {
  BoardState,
  BoardAction,
  ColumnState,
  CardState,
  TaskStatus,
  ViewMode,
} from "./types.ts";

export { boardReducer, createInitialBoardState } from "./boardReducer.ts";

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
