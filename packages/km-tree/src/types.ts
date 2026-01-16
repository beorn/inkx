/**
 * Tree Layer Types
 *
 * Structural types for tree nodes - the content/data model.
 * NO visual state (cursor, selection, fold) - that's in @km/board.
 */

// Re-export TaskStatus from @km/core for convenience
export type { TaskStatus } from "@km/core";

/**
 * TNode - recursive tree node
 *
 * This is the tree-layer representation of a node, with recursive `children[]`.
 * Used for navigation and display. Built from DBNode via buildTree().
 *
 * For storage-layer operations, use `DBNode` from @km/core.
 */
export interface TNode {
  nodeId: string;
  title: string;
  children: TNode[]; // Recursive children
  childCount: number; // Total children (may exceed loaded children.length)

  // Content properties
  isTask: boolean;
  taskStatus?: "todo" | "wip" | "blocked" | "done" | "dropped";
  color?: string;
  icon?: string;
  priority?: number;
  dueDate?: string;
  hasBacklinks?: boolean;
  refsCount?: number;
  content?: string;

  // Tree metadata
  depth: number; // Depth from current view root (0 = top level)
}

/**
 * Path-based position in tree.
 * Variable-length array of indices: [2, 0, 3] = node 2, child 0, grandchild 3
 */
export type TPath = number[];
