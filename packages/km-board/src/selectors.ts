/**
 * Board State Selectors
 *
 * Pure functions to derive values from BoardState.
 * No side effects, no React imports - pure TypeScript.
 */

import type { BoardState, TNode } from "./board-types.ts";
import { getNodeAtPath, getSiblingCount } from "@km/tree";
import { findPathToNode } from "./board-reducer.ts";

/**
 * Get the currently selected node
 */
export function getCurrentNode(state: BoardState): TNode | null {
  return getNodeAtPath(state.nodes, state.cursor);
}

/**
 * Get the parent of the currently selected node
 */
export function getParentNode(state: BoardState): TNode | null {
  if (state.cursor.length <= 1) return null;
  const parentPath = state.cursor.slice(0, -1);
  return getNodeAtPath(state.nodes, parentPath);
}

/**
 * Get siblings at the current cursor level
 */
export function getSiblings(state: BoardState): TNode[] {
  if (state.cursor.length === 0) return [];
  if (state.cursor.length === 1) return state.nodes;

  const parentPath = state.cursor.slice(0, -1);
  const parent = getNodeAtPath(state.nodes, parentPath);
  return parent?.children ?? [];
}

/**
 * Get the current index (last element of cursor path)
 */
export function getCurrentIndex(state: BoardState): number {
  if (state.cursor.length === 0) return 0;
  const lastIdx = state.cursor[state.cursor.length - 1];
  return lastIdx ?? 0;
}

/**
 * Check if cursor can navigate to previous sibling
 */
export function canNavigateUp(state: BoardState): boolean {
  return getCurrentIndex(state) > 0;
}

/**
 * Check if cursor can navigate to next sibling
 */
export function canNavigateDown(state: BoardState): boolean {
  const siblingCount = getSiblingCount(state.nodes, state.cursor);
  return getCurrentIndex(state) < siblingCount - 1;
}

/**
 * Check if cursor can navigate to parent
 */
export function canNavigateParent(state: BoardState): boolean {
  return state.cursor.length > 1;
}

/**
 * Check if cursor can navigate into children
 */
export function canNavigateChild(state: BoardState): boolean {
  const currentNode = getCurrentNode(state);
  return (currentNode?.children.length ?? 0) > 0;
}

/**
 * Check if a node is folded
 */
export function isNodeFolded(state: BoardState, nodeId: string): boolean {
  return state.foldedNodes.has(nodeId);
}

/**
 * Check if a node is collapsed
 */
export function isNodeCollapsed(state: BoardState, nodeId: string): boolean {
  return state.collapsedNodes.has(nodeId);
}

/**
 * Get total node count (recursive)
 */
export function getTotalNodeCount(state: BoardState): number {
  function countNodes(nodes: TNode[]): number {
    return nodes.reduce((sum, node) => sum + 1 + countNodes(node.children), 0);
  }
  return countNodes(state.nodes);
}

/**
 * Get top-level node count
 */
export function getTopLevelCount(state: BoardState): number {
  return state.nodes.length;
}

/**
 * Get cursor depth (0 = top level)
 */
export function getCursorDepth(state: BoardState): number {
  return state.cursor.length > 0 ? state.cursor.length - 1 : 0;
}

/**
 * Get breadcrumb trail from root to current node
 */
export function getBreadcrumbs(state: BoardState): TNode[] {
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

// ===== Node ID to Path Lookup =====

/**
 * Check if a node is visible (exists) in the current tree.
 */
export function isNodeInTree(nodes: TNode[], nodeId: string): boolean {
  return findPathToNode(nodes, nodeId) !== null;
}

// ===== TPath <-> Column/Card Index Conversion =====

/**
 * Column indices derived from a TPath.
 * Used by TUI to map between tree-based cursor and column-based rendering.
 *
 * In the TUI's column view:
 * - path[0] = column index (depth 0 nodes are columns)
 * - path[1] = card index (depth 1 nodes are cards within a column)
 * - path[2+] = outline sub-item path (depth 2+ are nested within cards)
 */
export interface ColumnIndices {
  /** Column index (path[0]), or -1 if path is empty */
  colIndex: number;
  /** Card index within column (path[1]), or -1 if not at card level */
  cardIndex: number;
  /** Sub-item path within card (path[2+]), empty if at column or card level */
  subPath: number[];
  /** True if cursor is at card level (path.length >= 2) */
  isAtCardLevel: boolean;
  /** True if cursor is in outline mode (path.length > 2) */
  isInOutlineMode: boolean;
}

/**
 * Extract column/card indices from a TPath.
 * This is the primary conversion from tree-based to column-based indexing.
 */
export function pathToColumnIndices(path: number[]): ColumnIndices {
  if (path.length === 0) {
    return {
      colIndex: -1,
      cardIndex: -1,
      subPath: [],
      isAtCardLevel: false,
      isInOutlineMode: false,
    };
  }

  const colIndex = path[0] ?? -1;
  const cardIndex = path.length >= 2 ? (path[1] ?? -1) : -1;
  const subPath = path.length > 2 ? path.slice(2) : [];

  return {
    colIndex,
    cardIndex,
    subPath,
    isAtCardLevel: path.length >= 2,
    isInOutlineMode: path.length > 2,
  };
}

/**
 * Convert column/card indices back to a TPath.
 */
export function columnIndicesToPath(
  colIndex: number,
  cardIndex: number = -1,
  subPath: number[] = [],
): number[] {
  if (colIndex < 0) return [];
  if (cardIndex < 0) return [colIndex];
  if (subPath.length === 0) return [colIndex, cardIndex];
  return [colIndex, cardIndex, ...subPath];
}

/**
 * Get column indices from BoardState.
 * Convenience wrapper around pathToColumnIndices using state.cursor.
 */
export function getCursorColumnIndices(state: BoardState): ColumnIndices {
  return pathToColumnIndices(state.cursor);
}

/**
 * Get the column node at cursor position (depth 0).
 */
export function getCurrentColumn(state: BoardState): TNode | null {
  const { colIndex } = pathToColumnIndices(state.cursor);
  if (colIndex < 0) return null;
  return state.nodes[colIndex] ?? null;
}

/**
 * Get the card node at cursor position (depth 1).
 */
export function getCurrentCard(state: BoardState): TNode | null {
  const { colIndex, cardIndex } = pathToColumnIndices(state.cursor);
  if (colIndex < 0 || cardIndex < 0) return null;
  const column = state.nodes[colIndex];
  return column?.children[cardIndex] ?? null;
}

/**
 * Get card count in the current column.
 */
export function getCurrentColumnCardCount(state: BoardState): number {
  const column = getCurrentColumn(state);
  return column?.children.length ?? 0;
}
