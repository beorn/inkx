/**
 * Selection Handlers
 *
 * Extracted from board-reducer.ts for maintainability.
 * Contains SELECT_* and EXTEND_SELECT_* action handlers.
 */

import type { BoardStateLegacy, TPath } from "./board-types.ts";
import { getNodeAtPath, getSiblings, collectAllNodeIds } from "@km/tree";
import {
  getNextVisiblePath,
  getPrevVisiblePath,
  updateCursor,
} from "./board-reducer-cursor.ts";

// =============================================================================
// SELECT_* Handlers
// =============================================================================

/**
 * Handle SELECT_NODE_ADD action.
 * Adds a node to the selection set.
 */
export function handleSelectNodeAdd(
  state: BoardStateLegacy,
  nodeId: string,
): BoardStateLegacy {
  const newSelected = new Set(state.selectedNodes);
  newSelected.add(nodeId);
  return { ...state, selectedNodes: newSelected };
}

/**
 * Handle SELECT_NODE_REMOVE action.
 * Removes a node from the selection set.
 */
export function handleSelectNodeRemove(
  state: BoardStateLegacy,
  nodeId: string,
): BoardStateLegacy {
  const newSelected = new Set(state.selectedNodes);
  newSelected.delete(nodeId);
  return { ...state, selectedNodes: newSelected };
}

/**
 * Handle SELECT_NODE_TOGGLE action.
 * Toggles a node's selection state.
 */
export function handleSelectNodeToggle(
  state: BoardStateLegacy,
  nodeId: string,
): BoardStateLegacy {
  const newSelected = new Set(state.selectedNodes);
  if (newSelected.has(nodeId)) {
    newSelected.delete(nodeId);
  } else {
    newSelected.add(nodeId);
  }
  return { ...state, selectedNodes: newSelected };
}

/**
 * Handle SELECT_ALL_SIBLINGS action.
 * Selects all siblings at the current cursor level.
 */
export function handleSelectAllSiblings(state: BoardStateLegacy): BoardStateLegacy {
  const siblings = getSiblings(state.nodes, state.cursor);
  const newSelected = new Set(state.selectedNodes);
  for (const sibling of siblings) {
    newSelected.add(sibling.id);
  }
  return { ...state, selectedNodes: newSelected };
}

/**
 * Handle SELECT_ALL action.
 * Selects all nodes in the tree.
 */
export function handleSelectAll(state: BoardStateLegacy): BoardStateLegacy {
  const allIds = collectAllNodeIds(state.nodes);
  return { ...state, selectedNodes: new Set(allIds) };
}

/**
 * Handle CLEAR_SELECTION action.
 * Clears all selected nodes.
 */
export function handleClearSelection(state: BoardStateLegacy): BoardStateLegacy {
  return { ...state, selectedNodes: new Set() };
}

// =============================================================================
// EXTEND_SELECT_* Handlers
// =============================================================================

/**
 * Handle EXTEND_SELECT_DOWN action.
 * Adds current node to selection and moves down.
 */
export function handleExtendSelectDown(state: BoardStateLegacy): BoardStateLegacy {
  const currentNode = getNodeAtPath(state.nodes, state.cursor);
  if (!currentNode) return state;

  const newSelected = new Set(state.selectedNodes);
  newSelected.add(currentNode.id);

  // Get next visible path
  const nextPath = getNextVisiblePath(
    state.nodes,
    state.cursor,
    state.foldedNodes,
  );
  if (!nextPath) {
    // No next path, just add current to selection
    return { ...state, selectedNodes: newSelected };
  }

  // Add the new node to selection
  const nextNode = getNodeAtPath(state.nodes, nextPath);
  if (nextNode) {
    newSelected.add(nextNode.id);
  }

  return {
    ...state,
    ...updateCursor(state, nextPath),
    selectedNodes: newSelected,
  };
}

/**
 * Handle EXTEND_SELECT_UP action.
 * Adds current node to selection and moves up.
 */
export function handleExtendSelectUp(state: BoardStateLegacy): BoardStateLegacy {
  const currentNode = getNodeAtPath(state.nodes, state.cursor);
  if (!currentNode) return state;

  const newSelected = new Set(state.selectedNodes);
  newSelected.add(currentNode.id);

  // Get previous visible path
  const prevPath = getPrevVisiblePath(
    state.nodes,
    state.cursor,
    state.foldedNodes,
  );
  if (!prevPath) {
    // No prev path, just add current to selection
    return { ...state, selectedNodes: newSelected };
  }

  // Add the new node to selection
  const prevNode = getNodeAtPath(state.nodes, prevPath);
  if (prevNode) {
    newSelected.add(prevNode.id);
  }

  return {
    ...state,
    ...updateCursor(state, prevPath),
    selectedNodes: newSelected,
  };
}

/**
 * Handle EXTEND_SELECT_LEFT action.
 * Adds current node to selection and moves left (cross-column).
 */
export function handleExtendSelectLeft(state: BoardStateLegacy): BoardStateLegacy {
  const currentNode = getNodeAtPath(state.nodes, state.cursor);
  if (!currentNode) return state;

  const newSelected = new Set(state.selectedNodes);
  newSelected.add(currentNode.id);

  // Cross-column navigation left
  if (state.cursor.length < 2) {
    // At column level, can't go left - just add to selection
    return { ...state, selectedNodes: newSelected };
  }

  const colIdx = state.cursor[0] ?? 0;
  const rowIdx = state.cursor[1] ?? 0;
  const newColIdx = colIdx - 1;

  if (newColIdx < 0) {
    // Already at first column
    return { ...state, selectedNodes: newSelected };
  }

  const targetCol = state.nodes[newColIdx];
  if (!targetCol) {
    return { ...state, selectedNodes: newSelected };
  }

  let newPath: TPath;
  if (targetCol.childCount === 0) {
    newPath = [newColIdx];
    newSelected.add(targetCol.id);
  } else {
    const clampedRow = Math.min(rowIdx, targetCol.childCount - 1);
    newPath = [newColIdx, clampedRow];
    const targetNode = targetCol.children[clampedRow];
    if (targetNode) {
      newSelected.add(targetNode.id);
    }
  }

  return {
    ...state,
    ...updateCursor(state, newPath),
    selectedNodes: newSelected,
  };
}

/**
 * Handle EXTEND_SELECT_RIGHT action.
 * Adds current node to selection and moves right (cross-column).
 */
export function handleExtendSelectRight(state: BoardStateLegacy): BoardStateLegacy {
  const currentNode = getNodeAtPath(state.nodes, state.cursor);
  if (!currentNode) return state;

  const newSelected = new Set(state.selectedNodes);
  newSelected.add(currentNode.id);

  // Cross-column navigation right
  if (state.cursor.length < 2) {
    // At column level, can't go right for extend-select
    return { ...state, selectedNodes: newSelected };
  }

  const colIdx = state.cursor[0] ?? 0;
  const rowIdx = state.cursor[1] ?? 0;
  const newColIdx = colIdx + 1;

  if (newColIdx >= state.nodes.length) {
    // Already at last column
    return { ...state, selectedNodes: newSelected };
  }

  const targetCol = state.nodes[newColIdx];
  if (!targetCol) {
    return { ...state, selectedNodes: newSelected };
  }

  let newPath: TPath;
  if (targetCol.childCount === 0) {
    newPath = [newColIdx];
    newSelected.add(targetCol.id);
  } else {
    const clampedRow = Math.min(rowIdx, targetCol.childCount - 1);
    newPath = [newColIdx, clampedRow];
    const targetNode = targetCol.children[clampedRow];
    if (targetNode) {
      newSelected.add(targetNode.id);
    }
  }

  return {
    ...state,
    ...updateCursor(state, newPath),
    selectedNodes: newSelected,
  };
}
