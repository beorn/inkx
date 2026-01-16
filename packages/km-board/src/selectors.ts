/**
 * Tree State Selectors
 *
 * Pure functions to derive values from TreeState.
 * No side effects, no React imports - pure TypeScript.
 */

import type { TreeState, TNode } from "./treeTypes.ts";
import { getNodeAtPath, getSiblingCount } from "./treeReducer.ts";

/**
 * Get the currently selected node
 */
export function getCurrentNode(state: TreeState): TNode | null {
  return getNodeAtPath(state.nodes, state.cursor);
}

/**
 * Get the parent of the currently selected node
 */
export function getParentNode(state: TreeState): TNode | null {
  if (state.cursor.length <= 1) return null;
  const parentPath = state.cursor.slice(0, -1);
  return getNodeAtPath(state.nodes, parentPath);
}

/**
 * Get siblings at the current cursor level
 */
export function getSiblings(state: TreeState): TNode[] {
  if (state.cursor.length === 0) return [];
  if (state.cursor.length === 1) return state.nodes;

  const parentPath = state.cursor.slice(0, -1);
  const parent = getNodeAtPath(state.nodes, parentPath);
  return parent?.children ?? [];
}

/**
 * Get the current index (last element of cursor path)
 */
export function getCurrentIndex(state: TreeState): number {
  if (state.cursor.length === 0) return 0;
  const lastIdx = state.cursor[state.cursor.length - 1];
  return lastIdx ?? 0;
}

/**
 * Check if cursor can navigate to previous sibling
 */
export function canNavigateUp(state: TreeState): boolean {
  return getCurrentIndex(state) > 0;
}

/**
 * Check if cursor can navigate to next sibling
 */
export function canNavigateDown(state: TreeState): boolean {
  const siblingCount = getSiblingCount(state.nodes, state.cursor);
  return getCurrentIndex(state) < siblingCount - 1;
}

/**
 * Check if cursor can navigate to parent
 */
export function canNavigateParent(state: TreeState): boolean {
  return state.cursor.length > 1;
}

/**
 * Check if cursor can navigate into children
 */
export function canNavigateChild(state: TreeState): boolean {
  const currentNode = getCurrentNode(state);
  return (currentNode?.children.length ?? 0) > 0;
}

/**
 * Check if a node is folded
 */
export function isNodeFolded(state: TreeState, nodeId: string): boolean {
  return state.foldedNodes.has(nodeId);
}

/**
 * Check if a node is collapsed
 */
export function isNodeCollapsed(state: TreeState, nodeId: string): boolean {
  return state.collapsedNodes.has(nodeId);
}

/**
 * Get total node count (recursive)
 */
export function getTotalNodeCount(state: TreeState): number {
  function countNodes(nodes: TNode[]): number {
    return nodes.reduce((sum, node) => sum + 1 + countNodes(node.children), 0);
  }
  return countNodes(state.nodes);
}

/**
 * Get top-level node count
 */
export function getTopLevelCount(state: TreeState): number {
  return state.nodes.length;
}

/**
 * Get cursor depth (0 = top level)
 */
export function getCursorDepth(state: TreeState): number {
  return state.cursor.length > 0 ? state.cursor.length - 1 : 0;
}

/**
 * Get breadcrumb trail from root to current node
 */
export function getBreadcrumbs(state: TreeState): TNode[] {
  const crumbs: TNode[] = [];
  let current = state.nodes;

  for (const idx of state.cursor) {
    const node = current[idx];
    if (node) {
      crumbs.push(node);
      current = node.children;
    }
  }

  return crumbs;
}
