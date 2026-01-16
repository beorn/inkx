/**
 * @km/board - Visual Board State
 *
 * Visual navigation state for TUI board navigation.
 * Manages cursor, selection, fold/collapse, zoom, and history.
 * NO UI rendering - that's in @km/tui.
 */

// Types
export type { BoardState, BoardAction, CursorPath } from "./types.ts";

// State factory
export { createInitialBoardState } from "./types.ts";

// Reducer
export { boardReducer, validateCursor } from "./boardReducer.ts";
