/**
 * useTreeState Hook
 *
 * React hook wrapper around the generic tree state reducer.
 * Provides path-based navigation with computed selectors.
 */

import { useReducer, useMemo } from "react";
import {
  treeReducer,
  createInitialTreeState,
  getNodeAtPath,
  getSiblingCount,
  type TreeState,
  type TreeAction,
  type TreeNodeState,
  type CursorPath,
} from "@km/tui-core";

// Re-export for convenience
export { treeReducer, createInitialTreeState };
export type { TreeState, TreeAction, TreeNodeState, CursorPath };

/**
 * Tree state hook with selectors
 */
export interface TreeStateHook {
  state: TreeState;
  dispatch: (action: TreeAction) => void;

  // Computed selectors
  currentNode: TreeNodeState | null;
  parentNode: TreeNodeState | null;
  siblings: TreeNodeState[];
  siblingCount: number;
  cursorDepth: number;

  // Navigation helpers
  canNavigateUp: boolean;
  canNavigateDown: boolean;
  canNavigateParent: boolean;
  canNavigateChild: boolean;
}

/**
 * Get siblings at current cursor level
 */
function getSiblings(
  nodes: TreeNodeState[],
  path: CursorPath,
): TreeNodeState[] {
  if (path.length === 0) return [];
  if (path.length === 1) return nodes;

  const parentPath = path.slice(0, -1);
  const parent = getNodeAtPath(nodes, parentPath);
  return parent?.children ?? [];
}

export function useTreeState(initialState: TreeState): TreeStateHook {
  const [state, dispatch] = useReducer(treeReducer, initialState);

  // Current node at cursor path
  const currentNode = useMemo(
    () => getNodeAtPath(state.nodes, state.cursor),
    [state.nodes, state.cursor],
  );

  // Parent node (one level up from cursor)
  const parentNode = useMemo(() => {
    if (state.cursor.length <= 1) return null;
    const parentPath = state.cursor.slice(0, -1);
    return getNodeAtPath(state.nodes, parentPath);
  }, [state.nodes, state.cursor]);

  // Siblings at current level
  const siblings = useMemo(
    () => getSiblings(state.nodes, state.cursor),
    [state.nodes, state.cursor],
  );

  // Total sibling count
  const siblingCount = useMemo(
    () => getSiblingCount(state.nodes, state.cursor),
    [state.nodes, state.cursor],
  );

  // Cursor depth
  const cursorDepth = state.cursor.length;

  // Navigation availability
  const currentIndex =
    state.cursor.length > 0 ? state.cursor[state.cursor.length - 1] : 0;
  const canNavigateUp = currentIndex > 0;
  const canNavigateDown = currentIndex < siblingCount - 1;
  const canNavigateParent = state.cursor.length > 1;
  const canNavigateChild = (currentNode?.children.length ?? 0) > 0;

  return {
    state,
    dispatch,
    currentNode,
    parentNode,
    siblings,
    siblingCount,
    cursorDepth,
    canNavigateUp,
    canNavigateDown,
    canNavigateParent,
    canNavigateChild,
  };
}

export default useTreeState;
