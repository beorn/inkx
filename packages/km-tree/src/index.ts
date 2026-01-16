/**
 * @km/tree - Tree Data Model
 *
 * Structural types and queries for tree nodes.
 * NO visual state (cursor, selection, fold) - that's in @km/board.
 */

// Types
export type {
  TNode,
  TreeNode, // Deprecated alias for TNode
  TreePath,
  NodeState, // Deprecated alias for TNode
  CursorPath,
} from "./types.ts";
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
