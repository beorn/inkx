/**
 * Board Reducer
 *
 * Pure reducer for visual navigation state.
 * Receives tree nodes as read-only third argument for path validation.
 */

import type { BoardState, BoardAction, CursorPath } from "./types.ts";
import type { TreeNode, TreePath } from "@km/tree";
import {
  getNodeAtPath,
  getSiblingCount,
  getCurrentIndex,
  getSiblings,
  collectAllNodeIds,
} from "@km/tree";

/**
 * Get the next visible path in visual order (for CURSOR_DOWN).
 * This traverses tree structure following visual display order.
 */
function getNextVisiblePath(
  nodes: TreeNode[],
  path: TreePath,
  foldedNodes: Set<string>,
): TreePath | null {
  if (path.length === 0) {
    return nodes.length > 0 ? [0] : null;
  }

  const currentNode = getNodeAtPath(nodes, path);
  if (!currentNode) return null;

  // If current node has visible children, go to first child
  if (currentNode.children.length > 0 && !foldedNodes.has(currentNode.nodeId)) {
    return [...path, 0];
  }

  // Otherwise, try next sibling or parent's next sibling
  return getNextSiblingOrAncestor(nodes, path);
}

/**
 * Get next sibling, or if none, go up to parent and try its next sibling.
 */
function getNextSiblingOrAncestor(
  nodes: TreeNode[],
  path: TreePath,
): TreePath | null {
  if (path.length === 0) return null;

  const idx = getCurrentIndex(path);
  const siblingCount = getSiblingCount(nodes, path);

  // Has next sibling?
  if (idx < siblingCount - 1) {
    const newPath = [...path];
    newPath[newPath.length - 1] = idx + 1;
    return newPath;
  }

  // Go up to parent and try its next sibling
  const parentPath = path.slice(0, -1);
  if (parentPath.length === 0) return null;

  return getNextSiblingOrAncestor(nodes, parentPath);
}

/**
 * Get the previous visible path in visual order (for CURSOR_UP).
 * This traverses tree structure following reverse visual display order.
 */
function getPrevVisiblePath(
  nodes: TreeNode[],
  path: TreePath,
  foldedNodes: Set<string>,
): TreePath | null {
  if (path.length === 0) return null;

  const idx = getCurrentIndex(path);

  // If has previous sibling, go to its last visible descendant
  if (idx > 0) {
    const newPath = [...path];
    newPath[newPath.length - 1] = idx - 1;
    return getLastVisibleDescendantPath(nodes, newPath, foldedNodes);
  }

  // Otherwise go to parent (if exists)
  if (path.length > 1) {
    return path.slice(0, -1);
  }

  return null;
}

/**
 * Get path to last visible descendant of node at path.
 * Used for CURSOR_UP to find the deepest visible child of previous sibling.
 */
function getLastVisibleDescendantPath(
  nodes: TreeNode[],
  path: TreePath,
  foldedNodes: Set<string>,
): TreePath {
  const node = getNodeAtPath(nodes, path);
  if (!node) return path;

  // If no children or folded, return this path
  if (node.children.length === 0 || foldedNodes.has(node.nodeId)) {
    return path;
  }

  // Recurse to last child
  const lastChildIdx = node.children.length - 1;
  return getLastVisibleDescendantPath(
    nodes,
    [...path, lastChildIdx],
    foldedNodes,
  );
}

/**
 * Pure reducer for board state transitions.
 * Nodes are passed as read-only context for navigation validation.
 */
export function boardReducer(
  state: BoardState,
  action: BoardAction,
  nodes: TreeNode[],
): BoardState {
  switch (action.type) {
    // ===== Visual Cursor Movement (CURSOR_*) =====

    case "CURSOR_UP": {
      const prevPath = getPrevVisiblePath(
        nodes,
        state.cursor,
        state.foldedNodes,
      );
      if (!prevPath) return state;
      return { ...state, cursor: prevPath };
    }

    case "CURSOR_DOWN": {
      const nextPath = getNextVisiblePath(
        nodes,
        state.cursor,
        state.foldedNodes,
      );
      if (!nextPath) return state;
      return { ...state, cursor: nextPath };
    }

    case "CURSOR_LEFT": {
      // Move to previous column, finding closest card by Y position
      if (state.cursor.length < 1) return state;
      const colIdx = state.cursor[0] ?? 0;
      if (colIdx <= 0) return state;

      const newColIdx = colIdx - 1;
      const targetCol = nodes[newColIdx];
      if (!targetCol) return state;

      // If target column has no children, land on column header
      if (targetCol.children.length === 0) {
        return { ...state, cursor: [newColIdx] };
      }

      // Find closest card by row index (simplified Y matching)
      const rowIdx = state.cursor[1] ?? 0;
      const clampedRow = Math.min(rowIdx, targetCol.children.length - 1);
      return { ...state, cursor: [newColIdx, clampedRow] };
    }

    case "CURSOR_RIGHT": {
      // Move to next column, finding closest card by Y position
      if (state.cursor.length < 1) return state;
      const colIdx = state.cursor[0] ?? 0;
      if (colIdx >= nodes.length - 1) return state;

      const newColIdx = colIdx + 1;
      const targetCol = nodes[newColIdx];
      if (!targetCol) return state;

      // If target column has no children, land on column header
      if (targetCol.children.length === 0) {
        return { ...state, cursor: [newColIdx] };
      }

      // Find closest card by row index (simplified Y matching)
      const rowIdx = state.cursor[1] ?? 0;
      const clampedRow = Math.min(rowIdx, targetCol.children.length - 1);
      return { ...state, cursor: [newColIdx, clampedRow] };
    }

    // ===== Path-based Navigation =====

    case "NAV_PREV_SIBLING": {
      if (state.cursor.length === 0) return state;
      const idx = getCurrentIndex(state.cursor);
      if (idx <= 0) return state;
      const newPath = [...state.cursor];
      newPath[newPath.length - 1] = idx - 1;
      return { ...state, cursor: newPath };
    }

    case "NAV_NEXT_SIBLING": {
      if (state.cursor.length === 0) return state;
      const idx = getCurrentIndex(state.cursor);
      const siblingCount = getSiblingCount(nodes, state.cursor);
      if (idx >= siblingCount - 1) return state;
      const newPath = [...state.cursor];
      newPath[newPath.length - 1] = idx + 1;
      return { ...state, cursor: newPath };
    }

    case "NAV_PARENT": {
      if (state.cursor.length <= 1) return state;
      return { ...state, cursor: state.cursor.slice(0, -1) };
    }

    case "NAV_CHILD": {
      const currentNode = getNodeAtPath(nodes, state.cursor);
      if (!currentNode || currentNode.children.length === 0) return state;
      return { ...state, cursor: [...state.cursor, 0] };
    }

    case "NAV_TO_PATH": {
      // Validate path exists
      if (action.path.length === 0) return state;
      const node = getNodeAtPath(nodes, action.path);
      if (!node) return state;
      return { ...state, cursor: action.path };
    }

    case "JUMP_TOP":
    case "NAV_FIRST_SIBLING": {
      if (state.cursor.length === 0) return state;
      const newPath = [...state.cursor];
      newPath[newPath.length - 1] = 0;
      return { ...state, cursor: newPath };
    }

    case "JUMP_BOTTOM":
    case "NAV_LAST_SIBLING": {
      if (state.cursor.length === 0) return state;
      const siblingCount = getSiblingCount(nodes, state.cursor);
      if (siblingCount === 0) return state;
      const newPath = [...state.cursor];
      newPath[newPath.length - 1] = siblingCount - 1;
      return { ...state, cursor: newPath };
    }

    // Legacy directional navigation (for backwards compatibility)
    case "MOVE_UP": {
      return boardReducer(state, { type: "NAV_PREV_SIBLING" }, nodes);
    }

    case "MOVE_DOWN": {
      return boardReducer(state, { type: "NAV_NEXT_SIBLING" }, nodes);
    }

    case "MOVE_LEFT": {
      // At top level (depth 1), move to previous column
      if (state.cursor.length === 1) {
        const idx = getCurrentIndex(state.cursor);
        if (idx <= 0) return state;
        return { ...state, cursor: [idx - 1] };
      }
      // Deeper: go to parent
      return boardReducer(state, { type: "NAV_PARENT" }, nodes);
    }

    case "MOVE_RIGHT": {
      // At top level (depth 1), move to next column
      if (state.cursor.length === 1) {
        const idx = getCurrentIndex(state.cursor);
        const siblingCount = getSiblingCount(nodes, state.cursor);
        if (idx >= siblingCount - 1) return state;
        return { ...state, cursor: [idx + 1] };
      }
      // Deeper: enter child
      return boardReducer(state, { type: "NAV_CHILD" }, nodes);
    }

    case "NAV_CROSS_COLUMN": {
      // Move horizontally between columns, preserving Y position within column
      if (state.cursor.length < 2) return state; // Must be at card level [col, row]
      const colIdx = state.cursor[0] ?? 0;
      const rowIdx = state.cursor[1] ?? 0;
      const newColIdx = action.direction === "right" ? colIdx + 1 : colIdx - 1;

      // Check if target column exists
      if (newColIdx < 0 || newColIdx >= nodes.length) return state;

      // Get child count of target column
      const targetCol = nodes[newColIdx];
      if (!targetCol || targetCol.children.length === 0) return state;

      // Clamp row index to target column's children
      const clampedRow = Math.min(rowIdx, targetCol.children.length - 1);
      return { ...state, cursor: [newColIdx, clampedRow] };
    }

    // ===== Node Operations =====

    case "TOGGLE_FOLD": {
      const newFolded = new Set(state.foldedNodes);
      if (newFolded.has(action.nodeId)) {
        newFolded.delete(action.nodeId);
      } else {
        newFolded.add(action.nodeId);
      }
      return { ...state, foldedNodes: newFolded };
    }

    case "TOGGLE_COLLAPSE": {
      const newCollapsed = new Set(state.collapsedNodes);
      if (newCollapsed.has(action.nodeId)) {
        newCollapsed.delete(action.nodeId);
      } else {
        newCollapsed.add(action.nodeId);
      }
      return { ...state, collapsedNodes: newCollapsed };
    }

    case "FOLD_LEVEL": {
      // Fold all nodes at a specific depth
      const newFolded = new Set(state.foldedNodes);
      const addNodeAtDepth = (nodeList: TreeNode[], currentDepth: number) => {
        for (const node of nodeList) {
          if (currentDepth === action.depth) {
            newFolded.add(node.nodeId);
          }
          if (node.children.length > 0) {
            addNodeAtDepth(node.children, currentDepth + 1);
          }
        }
      };
      addNodeAtDepth(nodes, 0);
      return { ...state, foldedNodes: newFolded };
    }

    case "UNFOLD_LEVEL": {
      // Unfold all nodes at a specific depth
      const newFolded = new Set(state.foldedNodes);
      const removeNodeAtDepth = (
        nodeList: TreeNode[],
        currentDepth: number,
      ) => {
        for (const node of nodeList) {
          if (currentDepth === action.depth) {
            newFolded.delete(node.nodeId);
          }
          if (node.children.length > 0) {
            removeNodeAtDepth(node.children, currentDepth + 1);
          }
        }
      };
      removeNodeAtDepth(nodes, 0);
      return { ...state, foldedNodes: newFolded };
    }

    // ===== Zoom (Navigating) =====

    case "ZOOM_IN": {
      if (!action.nodeId) return state;
      const newZoomStack = [
        ...state.zoomStack,
        {
          rootId: state.rootId,
          cursor: state.cursor,
        },
      ];
      return {
        ...state,
        rootId: action.nodeId,
        cursor: [0],
        zoomStack: newZoomStack,
      };
    }

    case "ZOOM_OUT": {
      if (state.zoomStack.length === 0) return state;
      const newZoomStack = [...state.zoomStack];
      const prev = newZoomStack.pop();
      if (!prev) return state;
      return {
        ...state,
        rootId: prev.rootId,
        cursor: prev.cursor,
        zoomStack: newZoomStack,
      };
    }

    // ===== Navigation History =====

    case "NAV_BACK": {
      if (state.navHistoryIndex <= 0) return state;
      return {
        ...state,
        navHistoryIndex: state.navHistoryIndex - 1,
      };
    }

    case "NAV_FORWARD": {
      if (state.navHistoryIndex >= state.navHistory.length - 1) return state;
      return {
        ...state,
        navHistoryIndex: state.navHistoryIndex + 1,
      };
    }

    case "SET_ROOT": {
      const newHistory = [
        ...state.navHistory.slice(0, state.navHistoryIndex + 1),
        {
          rootId: state.rootId,
          cursor: state.cursor,
        },
      ];
      return {
        ...state,
        rootId: action.rootId,
        rootPath: action.rootPath,
        cursor: [0],
        navHistory: newHistory,
        navHistoryIndex: newHistory.length,
      };
    }

    // ===== Selection =====

    case "SELECT_NODE_ADD": {
      const newSelected = new Set(state.selectedNodes);
      newSelected.add(action.nodeId);
      return { ...state, selectedNodes: newSelected };
    }

    case "SELECT_NODE_REMOVE": {
      const newSelected = new Set(state.selectedNodes);
      newSelected.delete(action.nodeId);
      return { ...state, selectedNodes: newSelected };
    }

    case "SELECT_NODE_TOGGLE": {
      const newSelected = new Set(state.selectedNodes);
      if (newSelected.has(action.nodeId)) {
        newSelected.delete(action.nodeId);
      } else {
        newSelected.add(action.nodeId);
      }
      return { ...state, selectedNodes: newSelected };
    }

    case "SELECT_ALL_SIBLINGS": {
      const siblings = getSiblings(nodes, state.cursor);
      const newSelected = new Set(state.selectedNodes);
      for (const sibling of siblings) {
        newSelected.add(sibling.nodeId);
      }
      return { ...state, selectedNodes: newSelected };
    }

    case "SELECT_ALL": {
      const allIds = collectAllNodeIds(nodes);
      return { ...state, selectedNodes: new Set(allIds) };
    }

    case "CLEAR_SELECTION": {
      return { ...state, selectedNodes: new Set() };
    }

    // Extend-select (placeholder - needs visual navigation context)
    case "EXTEND_SELECT_UP":
    case "EXTEND_SELECT_DOWN":
    case "EXTEND_SELECT_LEFT":
    case "EXTEND_SELECT_RIGHT": {
      // TODO: Implement extend-select - add nodes between anchor and cursor
      return state;
    }

    // Shifting (placeholder - needs data mutation)
    case "SHIFT_UP":
    case "SHIFT_DOWN":
    case "SHIFT_LEFT":
    case "SHIFT_RIGHT": {
      // TODO: Implement shifting - requires mutation layer integration
      return state;
    }

    // ===== Search Filter =====

    case "SET_SEARCH_QUERY": {
      return { ...state, searchQuery: action.query };
    }

    default:
      return state;
  }
}

/**
 * Validate and adjust cursor after nodes change.
 * Returns a valid cursor position, resetting if necessary.
 */
export function validateCursor(
  cursor: CursorPath,
  nodes: TreeNode[],
): CursorPath {
  if (cursor.length === 0) {
    // No cursor, try to set one
    if (nodes.length > 0) {
      const firstNode = nodes[0];
      if (firstNode && firstNode.children.length > 0) {
        return [0, 0]; // Start at first card in first column
      }
      return [0]; // Start at first column
    }
    return [];
  }

  // Check if current cursor is valid
  const node = getNodeAtPath(nodes, cursor);
  if (node) return cursor;

  // Invalid, reset to safe position
  if (nodes.length > 0) {
    const firstNode = nodes[0];
    if (firstNode && firstNode.children.length > 0) {
      return [0, 0];
    }
    return [0];
  }
  return [];
}
