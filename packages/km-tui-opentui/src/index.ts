/**
 * @km/tui-opentui
 *
 * OpenTUI renderer for km TUI.
 * Provides components, views, and hooks for OpenTUI-based rendering.
 */

// Types
export type {
  // From @km/tui-core
  TreeState,
  TreeAction,
  TreeNodeState,
  CursorPath,
  ViewLevelConfig,
  TaskStatus,
  ViewMode,
  NodeViewModel,
  TreeViewModel,
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
  useTreeState,
  treeReducer,
  createInitialTreeState,
  type TreeStateHook,
} from "./hooks/index.ts";

// App component
export { App } from "./App.tsx";
