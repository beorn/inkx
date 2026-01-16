/**
 * @km/tui-ink - Ink-based TUI Components
 *
 * Interactive terminal UI for km using Ink (React renderer for CLI).
 * This package provides the board/kanban view and related components.
 */

// Re-export types and utilities
export * from "./types.ts";
export * from "./state.ts";
export * from "./render.ts";
export * from "./tui.ts";

// Export views
export {
  renderInkBoard,
  InkBoardTestable,
  makeSelectionKey,
} from "./views/index.ts";

// Export text utilities
export * from "./text/index.ts";

// Export layout utilities
export * from "./layout/index.ts";
