/**
 * Board Reducer
 *
 * Pure reducer for visual navigation state.
 * Receives nodes as read-only third argument for path validation.
 */

import type { BoardState, BoardAction, CursorPath } from "./types.ts";
import type { NodeState } from "../node/types.ts";
import {
  getNodeAtPath,
  getSiblingCount,
  getCurrentIndex,
  getSiblings,
  collectAllNodeIds,
} from "../node/queries.ts";

/**
 * Pure reducer for board state transitions.
 * Nodes are passed as read-only context for navigation validation.
 */
export function boardReducer(
  state: BoardState,
  action: BoardAction,
  nodes: NodeState[],
): BoardState {
  switch (action.type) {
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
      const addNodeAtDepth = (nodeList: NodeState[], currentDepth: number) => {
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
        nodeList: NodeState[],
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

    // ===== Zoom =====

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
  nodes: NodeState[],
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
