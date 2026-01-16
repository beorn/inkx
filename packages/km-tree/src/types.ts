/**
 * Tree Layer Types
 *
 * Structural types for tree nodes - the content/data model.
 * NO visual state (cursor, selection, fold) - that's in @km/board.
 */

// Re-export TaskStatus from @km/core for convenience
export type { TaskStatus } from "@km/core";

/**
 * Tree node structure.
 * Represents any node in the content hierarchy.
 */
export interface TreeNode {
  nodeId: string;
  title: string;
  children: TreeNode[]; // Recursive children
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
export type TreePath = number[];

// Legacy aliases for backwards compatibility during migration
export type NodeState = TreeNode;
export type CursorPath = TreePath;
