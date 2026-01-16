/**
 * Board Layer
 *
 * Visual navigation state for TUI board navigation.
 * Re-exports all board types, state, and reducer.
 */

export type { BoardState, BoardAction, CursorPath } from "./types.ts";

export { createInitialBoardState } from "./types.ts";

export { boardReducer, validateCursor } from "./boardReducer.ts";
