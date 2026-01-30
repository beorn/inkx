/**
 * @km/tui - Ink-based TUI Components
 *
 * Interactive terminal UI for km using Ink (React renderer for CLI).
 * This package provides the board/kanban view and related components.
 */

// Re-export types and utilities
export * from "./types.ts"
export * from "./state.ts"
export * from "./render.ts"
export * from "./tui.tsx"

// Export views
export {
  renderInkxBoard,
  BoardCore,
  BoardApp,
  makeSelectionKey,
} from "./views/index.ts"

// Export repo context for wrapping components
export { RepoProvider, useRepo, type Repo } from "./repo-context.tsx"

// Export UI reducer utilities
export { createInitialUIState } from "./ui-reducer.ts"

// Export layout registry for card position tracking
export { createLayoutRegistry } from "./card-positions.ts"

// Export text utilities
export * from "./text/index.ts"

// Export layout utilities
export * from "./layout/index.ts"

// Note: Icons are exported via ./text/index.ts

// Testing utilities exported via @km/tui/testing, NOT from main entry point
// to avoid setting IS_REACT_ACT_ENVIRONMENT in production
// See: apps/km-tui/src/testing.ts
