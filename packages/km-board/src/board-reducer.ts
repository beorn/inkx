/**
 * Board Reducers
 *
 * Current architecture uses boardReducer with BoardState (includes nodes).
 * Migration to SimplifiedBoardState in progress.
 *
 * New simplified reducer (simplifiedBoardReducer):
 * - Works with SimplifiedBoardState (no nodes array)
 * - ID-based actions only
 * - Navigation handlers use Vault for tree traversal
 *
 * Current reducer (boardReducer):
 * - Works with BoardState (includes nodes array)
 * - Path-based cursor
 * - Being phased out
 */

// Current reducer (still in use)
export {
  boardReducer,
  createBoardState,
  findPathToNode,
} from "./board-reducer-legacy.ts";

// New simplified reducer (for migration)
export {
  simplifiedBoardReducer,
  createSimplifiedBoardState,
} from "./board-reducer-new.ts";
