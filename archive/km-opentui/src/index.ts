/**
 * @km/tui
 *
 * OpenTUI renderer for km TUI.
 * Provides components, views, and hooks for OpenTUI-based rendering.
 *
 * Architecture:
 * - @km/tree: Tree data model (node structure, queries)
 * - @km/board: Visual board state (cursor, selection, fold)
 * - @km/tui: UI rendering (this package)
 */

// Types
export type {
  // Board types (re-exported from @km/board)
  BoardState,
  BoardAction,
  TNode,
  TPath,
  ViewLevelConfig,
  TaskStatus,
  ViewMode,
  NodeViewModel,
  BoardViewModel,
  // App state types
  AppState,
  AppAction,
  AppUIState,
  AppUIAction,
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
  useAppState,
  appReducer,
  createAppState,
  type AppStateHook,
} from "./hooks/index.ts";

// App state
export { appUIReducer, createAppUIState, isAppUIAction } from "./appState.ts";

// App commands
export {
  appCommands,
  getAppCommandsByCategory,
  getAppCommandById,
  filterAppCommands,
  type AppCommandDef,
  type AppCommandCategory,
} from "./commands.ts";

// App component
export { App } from "./App.tsx";
