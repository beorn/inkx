/**
 * @km/tui - Ink-based TUI Components
 *
 * Interactive terminal UI for km using Ink (React renderer for CLI).
 * This package provides the board/kanban view and related components.
 */

// Re-export types and utilities
export * from "./theme.ts"
export * from "./types.ts"
export * from "./state.ts"
export * from "./render.ts"
export * from "./tui.tsx"

// Export views
export { BoardCore, BoardApp } from "./views/index.ts"

// Export repo context for wrapping components
export { RepoProvider, useRepo, type Repo } from "./repo-context.tsx"

// Export store context for fine-grained reactive signals
export { StoreProvider, useStore, type Store } from "./state/store-context.tsx"

// Export signal hooks for reactive components
export { useSignal, useNodeSignal, useChildIdsSignal } from "./hooks/use-signal.ts"

// Export UI reducer utilities
export { createInitialUIState, createInitialPaneUI, PaneUI } from "./state/ui-reducer.ts"

// Export grid navigator for card position tracking
export { createGridNavigator } from "@km/board"
export type { GridNavigator } from "@km/board"

// Export navigation utilities
export {
  navigateToNode,
  resolveZoomTarget,
  type NavigateResult,
  type NavigateOp,
  type NavigateRepo,
} from "./navigation/navigate-to-node.ts"

// Export text utilities
export * from "./text/index.ts"

// Export layout utilities
export * from "./layout/index.ts"

// Note: Icons are exported via ./text/index.ts

// Testing utilities exported via @km/tui/testing, NOT from main entry point
// to avoid setting IS_REACT_ACT_ENVIRONMENT in production
// See: apps/km-tui/src/testing.ts
