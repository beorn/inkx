/**
 * @km/tree - Tree Data Model
 *
 * Structural types and queries for tree nodes.
 * NO visual state (cursor, selection, fold) - that's in @km/board.
 */

// Types
export type { TNode, TPath } from "./types.ts";
export type { TaskStatus } from "./types.ts";

// Queries
export {
  getNodeAtPath,
  getSiblingCount,
  getCurrentIndex,
  collectAllNodeIds,
  getSiblings,
  getParentPath,
  getFirstChildPath,
  countVisibleNodes,
  findPathByNodeId,
} from "./queries.ts";

// Display utilities (moved from @km/tui-core)
export {
  getNodeDisplayName,
  getTypeIndicator,
  normalizeName,
  namesAreSimilar,
  getCollapsedTypeSuffix,
  collapseRedundantAncestors,
  collapseAncestorsWithTypes,
  getParentContext,
  type GetChildrenFn,
  type GetNodeFn,
  type CollapsedAncestor,
} from "./display.ts";
