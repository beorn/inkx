/**
 * Tree Layer Types
 *
 * Re-exports TreeNode from @km/core and defines tree-specific types.
 * NO visual state (cursor, selection, fold) - that's in @km/board.
 */

// Re-export TreeNode and TaskStatus from @km/core
export type { TreeNode, TaskStatus } from "@km/core";

/**
 * Path-based position in tree.
 * Variable-length array of indices: [2, 0, 3] = node 2, child 0, grandchild 3
 */
export type TPath = number[];
