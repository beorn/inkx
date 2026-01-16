/**
 * Node Layer Types
 *
 * Structural types for tree nodes in TUI navigation.
 * These are view models used by the TUI, distinct from the storage Node type.
 */

// Re-export TaskStatus from parent types for convenience
export type { TaskStatus } from "../types.ts";

/**
 * Generic tree node for TUI state.
 * Unified structure for all tree levels.
 */
export interface NodeState {
  nodeId: string;
  title: string;
  children: NodeState[]; // Recursive children
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
 * Path-based cursor position.
 * Variable-length array of indices: [2, 0, 3] = node 2, child 0, grandchild 3
 */
export type CursorPath = number[];
