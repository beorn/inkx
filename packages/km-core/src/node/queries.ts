/**
 * Node Layer Queries
 *
 * Pure functions for querying tree node structures.
 */

import type { NodeState, CursorPath } from "./types.ts";

/**
 * Get node at a given cursor path
 */
export function getNodeAtPath(
  nodes: NodeState[],
  path: CursorPath,
): NodeState | null {
  if (path.length === 0) return null;

  const firstIdx = path[0];
  if (firstIdx === undefined) return null;
  let current: NodeState | undefined = nodes[firstIdx];
  for (let i = 1; i < path.length && current; i++) {
    const idx = path[i];
    if (idx === undefined) break;
    current = current.children[idx];
  }
  return current ?? null;
}

/**
 * Get sibling count at the current path level
 */
export function getSiblingCount(nodes: NodeState[], path: CursorPath): number {
  if (path.length === 0) return 0;
  if (path.length === 1) return nodes.length;

  const parentPath = path.slice(0, -1);
  const parent = getNodeAtPath(nodes, parentPath);
  return parent?.children.length ?? 0;
}

/**
 * Get the current index (last element of path)
 */
export function getCurrentIndex(path: CursorPath): number {
  if (path.length === 0) return 0;
  const lastIdx = path[path.length - 1];
  return lastIdx ?? 0;
}

/**
 * Recursively collect all node IDs from a tree
 */
export function collectAllNodeIds(nodes: NodeState[]): string[] {
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
 * Get sibling nodes at the current cursor level
 */
export function getSiblings(nodes: NodeState[], path: CursorPath): NodeState[] {
  if (path.length === 0) return [];
  if (path.length === 1) return nodes;

  const parentPath = path.slice(0, -1);
  const parent = getNodeAtPath(nodes, parentPath);
  return parent?.children ?? [];
}
