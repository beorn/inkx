/**
 * Board Reducers
 *
 * MIGRATION STATUS (km-board-refactor):
 * - boardReducer / createBoardState: NEW simplified reducer (renamed from simplifiedBoardReducer)
 * - boardReducerLegacy / createBoardStateLegacy: DEPRECATED (will be deleted)
 *
 * New simplified reducer (boardReducer):
 * - Works with BoardState (no nodes array)
 * - ID-based actions only
 * - Navigation handlers use Vault for tree traversal
 *
 * Legacy reducer (boardReducerLegacy):
 * - Works with BoardStateLegacy (includes nodes array)
 * - Path-based cursor
 * - Being phased out
 */

// Current reducer (NEW - simplified architecture)
export {
  simplifiedBoardReducer as boardReducer,
  createBoardState,
} from "./board-reducer-new.ts";

// Legacy reducer (DEPRECATED - will be deleted)
export {
  boardReducer as boardReducerLegacy,
  createBoardState as createBoardStateLegacy,
  findPathToNode,
} from "./board-reducer-legacy.ts";
