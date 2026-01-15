/**
 * @km/tui-opentui
 *
 * OpenTUI renderer for km TUI.
 * Provides components, views, and hooks for OpenTUI-based rendering.
 */

// Types
export type {
  // From @km/tui
  BoardState,
  BoardAction,
  ColumnState,
  CardState,
  TaskStatus,
  ViewMode,
  CardViewModel,
  ColumnViewModel,
  BoardViewModel,
  // OpenTUI-specific props
  CardProps,
  ColumnProps,
  HeaderProps,
  StatusBarProps,
  RenderContext,
} from "./types.ts";

// Components
export { Card, Column, Header, StatusBar } from "./components/index.ts";

// Views
export { CardsView } from "./views/index.ts";

// Hooks
export {
  useBoardState,
  boardReducer,
  createInitialBoardState,
  type BoardStateHook,
} from "./hooks/index.ts";

// App
export { App } from "./App.tsx";
