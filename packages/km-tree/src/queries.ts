/**
 * Tree Layer Queries
 *
 * Pure functions for querying tree node structures.
 * NO visual state (cursor, selection) - that's in @km/board.
 */

import type { TreeNode, TreePath } from "./types.ts";

/**
 * Get node at a given path
 */
export function getNodeAtPath(
  nodes: TreeNode[],
  path: TreePath,
): TreeNode | null {
  if (path.length === 0) return null;

  const firstIdx = path[0];
  if (firstIdx === undefined) return null;
  let current: TreeNode | undefined = nodes[firstIdx];
  for (let i = 1; i < path.length && current; i++) {
    const idx = path[i];
    if (idx === undefined) break;
    current = current.children[idx];
  }
  return current ?? null;
}

/**
 * Get sibling count at the given path level
 */
export function getSiblingCount(nodes: TreeNode[], path: TreePath): number {
  if (path.length === 0) return 0;
  if (path.length === 1) return nodes.length;

  const parentPath = path.slice(0, -1);
  const parent = getNodeAtPath(nodes, parentPath);
  return parent?.children.length ?? 0;
}

/**
 * Get the current index (last element of path)
 */
export function getCurrentIndex(path: TreePath): number {
  if (path.length === 0) return 0;
  const lastIdx = path[path.length - 1];
  return lastIdx ?? 0;
}

/**
 * Recursively collect all node IDs from a tree
 */
export function collectAllNodeIds(nodes: TreeNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    ids.push(node.nodeId);
    if (node.children.length > 0) {
      ids.push(...collectAllNodeIds(node.children));
    }
  }
  return ids;
}

/**
 * Get sibling nodes at the given path level
 */
export function getSiblings(nodes: TreeNode[], path: TreePath): TreeNode[] {
  if (path.length === 0) return [];
  if (path.length === 1) return nodes;

  const parentPath = path.slice(0, -1);
  const parent = getNodeAtPath(nodes, parentPath);
  return parent?.children ?? [];
}

/**
 * Get parent path (path with last element removed)
 */
export function getParentPath(path: TreePath): TreePath | null {
  if (path.length <= 1) return null;
  return path.slice(0, -1);
}

/**
 * Get path to first child of node at path
 */
export function getFirstChildPath(
  nodes: TreeNode[],
  path: TreePath,
): TreePath | null {
  const node = getNodeAtPath(nodes, path);
  if (!node || node.children.length === 0) return null;
  return [...path, 0];
}

/**
 * Count total visible nodes in tree (respecting fold state)
 */
export function countVisibleNodes(
  nodes: TreeNode[],
  foldedNodes: Set<string>,
): number {
  let count = 0;
  for (const node of nodes) {
    count++;
    if (!foldedNodes.has(node.nodeId) && node.children.length > 0) {
      count += countVisibleNodes(node.children, foldedNodes);
    }
  }
  return count;
}

/**
 * Find path to node by ID
 */
export function findPathByNodeId(
  nodes: TreeNode[],
  nodeId: string,
  currentPath: TreePath = [],
): TreePath | null {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node) continue;
    const path = [...currentPath, i];
    if (node.nodeId === nodeId) {
      return path;
    }
    if (node.children.length > 0) {
      const found = findPathByNodeId(node.children, nodeId, path);
      if (found) return found;
    }
  }
  return null;
}
