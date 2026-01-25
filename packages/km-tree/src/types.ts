/**
 * Tree Layer Types
 *
 * Re-exports TNode from @km/core and defines tree-specific types.
 * NO visual state (cursor, selection, fold) - that's in @km/board.
 */

// Re-export TNode and TaskStatus from @km/core
export type { TNode, TaskStatus } from "@km/core"

/**
 * Path-based position in tree.
 * Variable-length array of indices: [2, 0, 3] = node 2, child 0, grandchild 3
 */
export type TPath = number[]
