/**
 * Cursor Movement Handlers
 *
 * Extracted from board-reducer.ts for maintainability.
 * Contains CURSOR_MOVE direction handlers and visual navigation helpers.
 */

import type { BoardState, TNode, TPath } from "./board-types.ts";
import { getNodeAtPath, getSiblingCount, getCurrentIndex } from "@km/tree";

// =============================================================================
// Visual Navigation Helpers
// =============================================================================

/**
 * Get the last visible descendant of a node (for CURSOR_UP navigation).
 * Returns the path to the deepest last child that's visible.
 */
export function getLastVisibleDescendantPath(
  nodes: TNode[],
  path: TPath,
  foldedNodes: Set<string>,
): TPath {
  const node = getNodeAtPath(nodes, path);
  if (!node) return path;

  // If node is folded or has no children, return the node itself
  // Use childCount for bounds (supports lazy loading)
  if (foldedNodes.has(node.id) || node.childCount === 0) {
    return path;
  }

  // Go to last child and recurse
  const lastChildIdx = node.childCount - 1;
  const childPath = [...path, lastChildIdx];
  return getLastVisibleDescendantPath(nodes, childPath, foldedNodes);
}

/**
 * Get the next visible block below the current position (CURSOR_DOWN).
 * Order: first child (if visible) -> next sibling -> parent's next sibling -> ...
 */
export function getNextVisiblePath(
  nodes: TNode[],
  path: TPath,
  foldedNodes: Set<string>,
): TPath | null {
  if (path.length === 0) {
    // At root level, go to first top-level node
    return nodes.length > 0 ? [0] : null;
  }

  const node = getNodeAtPath(nodes, path);
  if (!node) return null;

  // 1. Try to enter first child (if not folded and has children)
  // Use childCount for bounds (supports lazy loading)
  if (!foldedNodes.has(node.id) && node.childCount > 0) {
    return [...path, 0];
  }

  // 2. Try next sibling at current level, or bubble up to parent's next sibling
  let currentPath = [...path];
  while (currentPath.length > 0) {
    const idx = currentPath[currentPath.length - 1];
    if (idx === undefined) break;

    const siblings =
      currentPath.length === 1
        ? nodes
        : (getNodeAtPath(nodes, currentPath.slice(0, -1))?.children ?? []);

    // If there's a next sibling, go there
    if (idx < siblings.length - 1) {
      const newPath = [...currentPath];
      newPath[newPath.length - 1] = idx + 1;
      return newPath;
    }

    // No next sibling, go up one level and try again
    currentPath = currentPath.slice(0, -1);
  }

  // No more nodes below
  return null;
}

/**
 * Get the previous visible block above the current position (CURSOR_UP).
 * Order: previous sibling's last descendant -> previous sibling -> parent
 */
export function getPrevVisiblePath(
  nodes: TNode[],
  path: TPath,
  foldedNodes: Set<string>,
): TPath | null {
  if (path.length === 0) return null;

  const idx = path[path.length - 1];
  if (idx === undefined) return null;

  // 1. If there's a previous sibling, go to its last visible descendant
  if (idx > 0) {
    const newPath = [...path];
    newPath[newPath.length - 1] = idx - 1;
    return getLastVisibleDescendantPath(nodes, newPath, foldedNodes);
  }

  // 2. No previous sibling, go to parent
  if (path.length > 1) {
    return path.slice(0, -1);
  }

  // At first top-level node, no previous
  return null;
}

// =============================================================================
// Cursor Update Helper
// =============================================================================

/**
 * Get node ID at a given cursor path.
 * Returns null if path is empty or node doesn't exist.
 */
function getNodeIdAtPath(nodes: TNode[], path: TPath): string | null {
  const node = getNodeAtPath(nodes, path);
  return node?.id ?? null;
}

/**
 * Helper to update both cursor and cursorNodeId together.
 * This ensures they stay in sync.
 */
export function updateCursor(
  state: BoardState,
  newCursor: TPath,
): Pick<BoardState, "cursor" | "cursorNodeId"> {
  return {
    cursor: newCursor,
    cursorNodeId: getNodeIdAtPath(state.nodes, newCursor),
  };
}

// =============================================================================
// CURSOR_MOVE Handler
// =============================================================================

export type CursorDirection =
  | "prev"
  | "next"
  | "out"
  | "in"
  | "first"
  | "last"
  | "up"
  | "down"
  | "left"
  | "right";

/**
 * Handle CURSOR_MOVE action with parameterized direction.
 *
 * @param state Current board state
 * @param dir Direction to move cursor
 * @param crossColumnHandler Handler for left/right cross-column navigation
 * @returns Updated board state
 */
export function handleCursorMove(
  state: BoardState,
  dir: CursorDirection,
  crossColumnHandler: (
    state: BoardState,
    direction: "left" | "right",
  ) => BoardState,
): BoardState {
  switch (dir) {
    // Structural directions (hjkl)
    case "prev": {
      // Previous sibling (k)
      if (state.cursor.length === 0) return state;
      const idx = getCurrentIndex(state.cursor);
      if (idx <= 0) return state;
      const newPath = [...state.cursor];
      newPath[newPath.length - 1] = idx - 1;
      return { ...state, ...updateCursor(state, newPath) };
    }

    case "next": {
      // Next sibling (j)
      if (state.cursor.length === 0) return state;
      const idx = getCurrentIndex(state.cursor);
      const siblingCount = getSiblingCount(state.nodes, state.cursor);
      if (idx >= siblingCount - 1) return state;
      const newPath = [...state.cursor];
      newPath[newPath.length - 1] = idx + 1;
      return { ...state, ...updateCursor(state, newPath) };
    }

    case "out": {
      // To parent (h)
      if (state.cursor.length <= 1) return state;
      return { ...state, ...updateCursor(state, state.cursor.slice(0, -1)) };
    }

    case "in": {
      // Into first child (l)
      const currentNode = getNodeAtPath(state.nodes, state.cursor);
      // Use childCount for bounds (supports lazy loading)
      if (!currentNode || currentNode.childCount === 0) return state;
      return { ...state, ...updateCursor(state, [...state.cursor, 0]) };
    }

    case "first": {
      // First sibling (g)
      if (state.cursor.length === 0) return state;
      const newPath = [...state.cursor];
      newPath[newPath.length - 1] = 0;
      return { ...state, ...updateCursor(state, newPath) };
    }

    case "last": {
      // Last sibling (G)
      if (state.cursor.length === 0) return state;
      const siblingCount = getSiblingCount(state.nodes, state.cursor);
      if (siblingCount === 0) return state;
      const newPath = [...state.cursor];
      newPath[newPath.length - 1] = siblingCount - 1;
      return { ...state, ...updateCursor(state, newPath) };
    }

    // Visual/spatial directions (arrows)
    case "up": {
      // Previous visible block above (may cross tree levels)
      const prevPath = getPrevVisiblePath(
        state.nodes,
        state.cursor,
        state.foldedNodes,
      );
      if (!prevPath) return state;
      return { ...state, ...updateCursor(state, prevPath) };
    }

    case "down": {
      // Next visible block below (may cross tree levels)
      const nextPath = getNextVisiblePath(
        state.nodes,
        state.cursor,
        state.foldedNodes,
      );
      if (!nextPath) return state;
      return { ...state, ...updateCursor(state, nextPath) };
    }

    case "left": {
      // Cross-column left (visual horizontal movement)
      return crossColumnHandler(state, "left");
    }

    case "right": {
      // Cross-column right (visual horizontal movement)
      return crossColumnHandler(state, "right");
    }

    default:
      return state;
  }
}
