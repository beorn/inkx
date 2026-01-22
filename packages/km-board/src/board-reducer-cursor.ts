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
 * Get the next visible block below the current position (CURSOR_DOWN / j key).
 *
 * Per docs/06-ui.md navigation model:
 * - At board level: enter first column (or curswantX column if set)
 * - At column level: enter first card (if has cards), else no-op
 * - At card level: next sibling card, stops at last card (does NOT cross to next column)
 * - At deeper levels: document traversal within card subtree
 *
 * @param curswantX Optional sticky column index for board→column navigation
 */
export function getNextVisiblePath(
  nodes: TNode[],
  path: TPath,
  foldedNodes: Set<string>,
  curswantX?: number | null,
): TPath | null {
  if (path.length === 0) {
    // At board level, go to curswantX column (or first column if not set)
    if (nodes.length === 0) return null;
    const targetCol =
      curswantX !== null && curswantX !== undefined
        ? Math.min(curswantX, nodes.length - 1)
        : 0;
    return [targetCol];
  }

  const node = getNodeAtPath(nodes, path);
  if (!node) return null;

  // At column level (depth 1): enter first card if has children
  if (path.length === 1) {
    if (!foldedNodes.has(node.id) && node.childCount > 0) {
      return [...path, 0]; // first card
    }
    // No cards - stay at column level (don't cross to next column)
    return null;
  }

  // At card level (depth 2): only allow next sibling, no column crossing
  if (path.length === 2) {
    const idx = path[1];
    if (idx === undefined) return null;

    const parentNode = getNodeAtPath(nodes, path.slice(0, 1));
    const siblingCount = parentNode?.childCount ?? 0;

    // Try next sibling card
    if (idx < siblingCount - 1) {
      return [path[0]!, idx + 1];
    }
    // At last card - stop (don't cross to next column)
    return null;
  }

  // At deeper levels (outline mode): full document traversal within card subtree
  // 1. Try to enter first child (if not folded and has children)
  if (!foldedNodes.has(node.id) && node.childCount > 0) {
    return [...path, 0];
  }

  // 2. Try next sibling, but DON'T bubble up past card level (depth 2)
  let currentPath = [...path];
  while (currentPath.length > 2) {
    const idx = currentPath[currentPath.length - 1];
    if (idx === undefined) break;

    const parentPath = currentPath.slice(0, -1);
    const parent = getNodeAtPath(nodes, parentPath);
    const siblingCount = parent?.childCount ?? 0;

    // If there's a next sibling, go there
    if (idx < siblingCount - 1) {
      const newPath = [...currentPath];
      newPath[newPath.length - 1] = idx + 1;
      return newPath;
    }

    // No next sibling, go up one level (but not past card level)
    currentPath = parentPath;
  }

  // Reached card level boundary - stop
  return null;
}

/**
 * Get the previous visible block above the current position (CURSOR_UP / k key).
 *
 * Per docs/06-ui.md navigation model:
 * - At column level: exit to board level (NOT traverse to prev column's cards)
 * - At card level: exit to parent (column) if at first card, else prev sibling
 * - At deeper levels: document traversal (prev sibling's last descendant, or parent)
 */
export function getPrevVisiblePath(
  nodes: TNode[],
  path: TPath,
  foldedNodes: Set<string>,
): TPath | null {
  if (path.length === 0) return null;

  const idx = path[path.length - 1];
  if (idx === undefined) return null;

  // At column level (depth 1): always exit to board level
  // This gives clear "zoom out" behavior for k at column headers
  if (path.length === 1) {
    return []; // board level
  }

  // At card level (depth 2): exit to column if at first card
  if (path.length === 2 && idx === 0) {
    return path.slice(0, -1); // go to column level
  }

  // At deeper levels or not at first sibling: document traversal
  // 1. If there's a previous sibling, go to its last visible descendant
  if (idx > 0) {
    const newPath = [...path];
    newPath[newPath.length - 1] = idx - 1;
    return getLastVisibleDescendantPath(nodes, newPath, foldedNodes);
  }

  // 2. No previous sibling, go to parent
  return path.slice(0, -1);
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

      // curswantX: When going from column level (depth 1) to board level (depth 0),
      // remember the column index so 'down' can return to it
      const isColumnToBoard =
        state.cursor.length === 1 && prevPath.length === 0;
      const newCurswantX = isColumnToBoard ? state.cursor[0] ?? null : null;

      // curswantY: Clear on j/k navigation
      return {
        ...state,
        ...updateCursor(state, prevPath),
        curswantX: newCurswantX,
        curswantY: null,
      };
    }

    case "down": {
      // Next visible block below (may cross tree levels)
      // Pass curswantX for board→column navigation
      const nextPath = getNextVisiblePath(
        state.nodes,
        state.cursor,
        state.foldedNodes,
        state.curswantX,
      );
      if (!nextPath) return state;

      // curswantX: Clear when we've used it (board→column) or when entering a card
      const usedCurswantX =
        state.cursor.length === 0 && nextPath.length === 1;
      const enteringCard =
        state.cursor.length === 1 && nextPath.length === 2;
      const shouldClearCurswantX = usedCurswantX || enteringCard;

      // curswantY: Clear on j/k navigation
      return {
        ...state,
        ...updateCursor(state, nextPath),
        curswantX: shouldClearCurswantX ? null : state.curswantX,
        curswantY: null,
      };
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
