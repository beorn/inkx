/**
 * @km/tui-viewmodels
 *
 * Shareable TUI view model transformations for km.
 * Pure TypeScript - no React, no renderer dependencies.
 *
 * Use in:
 * - apps/km-cli/src/tui2/ (OpenTUI renderer)
 * - apps/km-web/ (future React DOM renderer)
 */

export type {
  CardViewModel,
  ColumnViewModel,
  BoardViewModel,
  TaskStatus,
  ViewMode,
} from "./types.ts";

export {
  toCardViewModel,
  toColumnViewModel,
  toBoardViewModel,
} from "./transformers.ts";
