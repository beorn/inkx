/**
 * Board Reducer
 *
 * ID-based reducer for board navigation.
 * No tree traversal - just updates IDs and Sets.
 * Navigation handlers compute target nodeIds using Repo.
 */

export {
  simplifiedBoardReducer as boardReducer,
  createBoardState,
} from "./board-reducer-new.ts"
