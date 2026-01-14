/**
 * Board TUI Module
 *
 * Interactive terminal UI for board/kanban view
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
