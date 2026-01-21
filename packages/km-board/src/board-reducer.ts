/**
 * Board State Reducer
 *
 * Path-based reducer for board navigation.
 * Supports arbitrary depth with TPath instead of fixed (colIndex, cardIndex).
 *
 * Does NOT handle app-specific UI state (modals, dialogs) - that belongs in app layer.
 */

import createDebug from "debug";
import type { BoardState, BoardAction, TNode, TPath } from "./board-types.ts";

const debug = createDebug("km:board:reducer");
import { isTAction } from "@km/tree";

// ===== Helper Functions =====

/**
 * Get node at a given cursor path
 */
export function getNodeAtPath(nodes: TNode[], path: TPath): TNode | null {
  if (path.length === 0) return null;

  const firstIdx = path[0];
  if (firstIdx === undefined) return null;
  let current: TNode | undefined = nodes[firstIdx];
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
export function getSiblingCount(nodes: TNode[], path: TPath): number {
  if (path.length === 0) return 0;
  if (path.length === 1) return nodes.length;

  const parentPath = path.slice(0, -1);
  const parent = getNodeAtPath(nodes, parentPath);
  // Use childCount for bounds (supports lazy loading)
  return parent?.childCount ?? 0;
}

/**
 * Get the current index (last element of path)
 */
function getCurrentIndex(path: TPath): number {
  if (path.length === 0) return 0;
  const lastIdx = path[path.length - 1];
  return lastIdx ?? 0;
}

/**
 * Recursively collect all node IDs from a tree
 */
function collectAllNodeIds(nodes: TNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    ids.push(node.id);
    if (node.children.length > 0) {
      ids.push(...collectAllNodeIds(node.children));
    }
  }
  return ids;
}

/**
 * Get sibling nodes at the current cursor level
 */
function getSiblings(nodes: TNode[], path: TPath): TNode[] {
  if (path.length === 0) return [];
  if (path.length === 1) return nodes;

  const parentPath = path.slice(0, -1);
  const parent = getNodeAtPath(nodes, parentPath);
  return parent?.children ?? [];
}

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
function updateCursor(
  state: BoardState,
  newCursor: TPath,
): Pick<BoardState, "cursor" | "cursorNodeId"> {
  return {
    cursor: newCursor,
    cursorNodeId: getNodeIdAtPath(state.nodes, newCursor),
  };
}

/**
 * Find the path to a node by its ID.
 * Returns null if the node is not found in the tree.
 *
 * This is the key function for the cursorNodeId -> cursor derivation.
 * It searches the tree depth-first and returns the path as soon as found.
 */
export function findPathToNode(
  nodes: TNode[],
  nodeId: string,
): number[] | null {
  function search(
    currentNodes: TNode[],
    currentPath: number[],
  ): number[] | null {
    for (let i = 0; i < currentNodes.length; i++) {
      const node = currentNodes[i];
      if (!node) continue;

      const pathToHere = [...currentPath, i];

      // Found the node
      if (node.id === nodeId) {
        return pathToHere;
      }

      // Search children
      if (node.children.length > 0) {
        const childResult = search(node.children, pathToHere);
        if (childResult) return childResult;
      }
    }
    return null;
  }

  return search(nodes, []);
}

// ===== Visual Navigation Helpers =====

/**
 * Get the last visible descendant of a node (for CURSOR_UP navigation).
 * Returns the path to the deepest last child that's visible.
 */
function getLastVisibleDescendantPath(
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
function getNextVisiblePath(
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
function getPrevVisiblePath(
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

// ===== Reducer =====

/**
 * Pure reducer for board state transitions.
 * Handles navigation, selection, fold/collapse, zoom.
 * Does NOT handle app-specific UI (modals, dialogs).
 */
export function boardReducer(
  state: BoardState,
  action: BoardAction,
): BoardState {
  // Check if this is a tree action (content manipulation)
  // These are pass-through - the app layer handles them via @km/storage
  if (isTAction(action)) {
    // No-op in board reducer - app layer intercepts and handles
    return state;
  }

  debug("action: %s", action.type);

  switch (action.type) {
    // ===== Cursor Movement (parameterized) =====

    case "CURSOR_MOVE": {
      switch (action.dir) {
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
          return boardReducer(state, {
            type: "NAV_CROSS_COLUMN",
            direction: "left",
          });
        }

        case "right": {
          // Cross-column right (visual horizontal movement)
          return boardReducer(state, {
            type: "NAV_CROSS_COLUMN",
            direction: "right",
          });
        }

        default:
          return state;
      }
    }

    // ===== Jump Navigation =====

    case "NAV_TO_PATH": {
      // Empty path means board level (no node selected)
      if (action.path.length === 0) {
        return {
          ...state,
          cursor: [],
          cursorNodeId: null,
        };
      }
      // Validate path exists for non-empty paths
      const node = getNodeAtPath(state.nodes, action.path);
      if (!node) return state;
      return { ...state, ...updateCursor(state, action.path) };
    }

    case "NAV_CROSS_COLUMN": {
      // Move horizontally between columns, preserving cursor depth
      // Cursor can be column-level [col] or card-level [col, row, ...]
      if (state.cursor.length === 0) return state;

      const colIdx = state.cursor[0] ?? 0;
      const isAtColumnLevel = state.cursor.length === 1;
      const newColIdx = action.direction === "right" ? colIdx + 1 : colIdx - 1;

      // Check if target column exists
      if (newColIdx < 0 || newColIdx >= state.nodes.length) return state;

      const targetCol = state.nodes[newColIdx];
      if (!targetCol) return state;

      // Preserve cursor depth: column level stays column level
      if (isAtColumnLevel) {
        return { ...state, ...updateCursor(state, [newColIdx]) };
      }

      // At card level: navigate to card in target column
      // If target column is empty, stay at column level
      // Use childCount for bounds (supports lazy loading)
      if (targetCol.childCount === 0) {
        return { ...state, ...updateCursor(state, [newColIdx]) };
      }

      // Clamp row index to target column's children
      const rowIdx = state.cursor[1] ?? 0;
      const clampedRow = Math.min(rowIdx, targetCol.childCount - 1);
      return { ...state, ...updateCursor(state, [newColIdx, clampedRow]) };
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
      const addNodeAtDepth = (nodes: TNode[], currentDepth: number) => {
        for (const node of nodes) {
          if (currentDepth === action.depth) {
            newFolded.add(node.id);
          }
          if (node.children.length > 0) {
            addNodeAtDepth(node.children, currentDepth + 1);
          }
        }
      };
      addNodeAtDepth(state.nodes, 0);
      return { ...state, foldedNodes: newFolded };
    }

    case "UNFOLD_LEVEL": {
      // Unfold all nodes at a specific depth
      const newFolded = new Set(state.foldedNodes);
      const removeNodeAtDepth = (nodes: TNode[], currentDepth: number) => {
        for (const node of nodes) {
          if (currentDepth === action.depth) {
            newFolded.delete(node.id);
          }
          if (node.children.length > 0) {
            removeNodeAtDepth(node.children, currentDepth + 1);
          }
        }
      };
      removeNodeAtDepth(state.nodes, 0);
      return { ...state, foldedNodes: newFolded };
    }

    // ===== Zoom =====

    case "ZOOM_IN": {
      // nodeId can be null (root level) or a string
      // IMPORTANT: cursorNodeId is PRESERVED across zoom - the same node stays selected
      // The cursor path changes (relative to new root), but the actual node is the same
      //
      // Special case: if cursorNodeId IS the new root, the cursor becomes board level
      // (the selected node is now "the whole view" not a visible column/card)
      const newZoomStack = [
        ...state.zoomStack,
        {
          rootId: state.rootId,
          cursor: state.cursor,
        },
      ];

      let newCursor: TPath;
      let newCursorNodeId: string | null;

      if (action.cursor) {
        // Explicit cursor provided - use it and derive cursorNodeId
        newCursor = action.cursor;
        newCursorNodeId = getNodeIdAtPath(action.nodes, newCursor);
      } else {
        // No cursor provided - preserve cursorNodeId and derive cursor from it
        newCursorNodeId = state.cursorNodeId;

        // Special case: selected node is now the root
        // The root isn't visible as a column, so cursor goes to board level
        if (newCursorNodeId && newCursorNodeId === action.nodeId) {
          newCursor = []; // Board level - no column selected
          // cursorNodeId stays the same (it's the root now)
        } else if (newCursorNodeId) {
          // Find where the cursor node is in the new tree
          const derivedPath = findPathToNode(action.nodes, newCursorNodeId);
          newCursor = derivedPath ?? [0]; // Fall back to [0] if not found
        } else {
          newCursor = [0];
        }
      }

      return {
        ...state,
        rootId: action.nodeId,
        nodes: action.nodes,
        cursor: newCursor,
        cursorNodeId: newCursorNodeId,
        zoomStack: newZoomStack,
      };
    }

    case "ZOOM_OUT": {
      if (state.zoomStack.length === 0) return state;
      const newZoomStack = [...state.zoomStack];
      const prev = newZoomStack.pop();
      if (!prev) return state; // Shouldn't happen, but satisfies lint

      // IMPORTANT: cursorNodeId is PRESERVED across zoom
      // Derive cursor from cursorNodeId in the new tree
      let newCursor: TPath;
      if (state.cursorNodeId) {
        const derivedPath = findPathToNode(action.nodes, state.cursorNodeId);
        newCursor = derivedPath ?? prev.cursor; // Fall back to stored cursor if not found
      } else {
        newCursor = prev.cursor;
      }

      return {
        ...state,
        rootId: prev.rootId,
        nodes: action.nodes,
        cursor: newCursor,
        // cursorNodeId stays unchanged - same node remains selected
        zoomStack: newZoomStack,
      };
    }

    // ===== Refresh =====

    case "REFRESH": {
      // Preserve cursor if possible
      const node = getNodeAtPath(action.nodes, state.cursor);
      if (node) {
        return { ...state, nodes: action.nodes };
      }
      // Cursor invalid, reset to safe position
      const safeCursor: TPath = action.nodes.length > 0 ? [0] : [];
      const safeNodeId = getNodeIdAtPath(action.nodes, safeCursor);
      return {
        ...state,
        nodes: action.nodes,
        cursor: safeCursor,
        cursorNodeId: safeNodeId,
      };
    }

    // ===== Navigation History =====

    case "NAV_TO": {
      const newHistory = [
        ...state.navHistory.slice(0, state.navHistoryIndex + 1),
        {
          rootId: state.rootId,
          cursor: state.cursor,
        },
      ];
      const newCursor: TPath = [0];
      return {
        ...state,
        rootId: action.rootId,
        rootPath: action.rootPath,
        nodes: action.nodes,
        cursor: newCursor,
        cursorNodeId: getNodeIdAtPath(action.nodes, newCursor),
        navHistory: newHistory,
        navHistoryIndex: newHistory.length,
      };
    }

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
      const siblings = getSiblings(state.nodes, state.cursor);
      const newSelected = new Set(state.selectedNodes);
      for (const sibling of siblings) {
        newSelected.add(sibling.id);
      }
      return { ...state, selectedNodes: newSelected };
    }

    case "SELECT_ALL": {
      const allIds = collectAllNodeIds(state.nodes);
      return { ...state, selectedNodes: new Set(allIds) };
    }

    case "CLEAR_SELECTION": {
      return { ...state, selectedNodes: new Set() };
    }

    // ===== Extend-Select (shift+hjkl) =====

    case "EXTEND_SELECT_DOWN": {
      // Add current node to selection and move down
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

    case "EXTEND_SELECT_UP": {
      // Add current node to selection and move up
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

    case "EXTEND_SELECT_LEFT": {
      // Add current node to selection and move left (cross-column)
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

    case "EXTEND_SELECT_RIGHT": {
      // Add current node to selection and move right (cross-column)
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

    // ===== Shifting (opt+hjkl) =====
    // Note: These are "intent" actions - actual tree mutation happens in the app/store layer
    // The reducer just returns current state; app intercepts and handles via store API
    case "SHIFT_UP":
    case "SHIFT_DOWN":
    case "SHIFT_LEFT":
    case "SHIFT_RIGHT": {
      // No-op in reducer - handled by app via store integration
      return state;
    }

    // ===== Moving (m + destination) =====
    case "ENTER_MOVE_MODE": {
      // Enter move mode with currently selected nodes (or cursor node if none selected)
      const currentNode = getNodeAtPath(state.nodes, state.cursor);
      let nodesToMove: string[] = [];

      if (state.selectedNodes.size > 0) {
        nodesToMove = Array.from(state.selectedNodes);
      } else if (currentNode) {
        nodesToMove = [currentNode.id];
      }

      if (nodesToMove.length === 0) return state;

      return {
        ...state,
        moveMode: true,
        moveSourceNodes: nodesToMove,
        moveSourceCursor: [...state.cursor],
      };
    }

    case "CONFIRM_MOVE": {
      // Actual move handled by app via store API
      // Reducer just exits move mode
      return {
        ...state,
        moveMode: false,
        moveSourceNodes: [],
        moveSourceCursor: [],
        selectedNodes: new Set(), // Clear selection after move
      };
    }

    case "CANCEL_MOVE": {
      // Cancel move mode, restore original cursor position
      const restoredCursor =
        state.moveSourceCursor.length > 0
          ? state.moveSourceCursor
          : state.cursor;
      return {
        ...state,
        moveMode: false,
        moveSourceNodes: [],
        ...updateCursor(state, restoredCursor),
        moveSourceCursor: [],
      };
    }

    // ===== View Configuration =====
    case "INCREASE_OUTLINE_DEPTH": {
      if (state.maxOutlineDepth >= 99) return state;
      return { ...state, maxOutlineDepth: state.maxOutlineDepth + 1 };
    }

    case "DECREASE_OUTLINE_DEPTH": {
      if (state.maxOutlineDepth <= 0) return state;
      return { ...state, maxOutlineDepth: state.maxOutlineDepth - 1 };
    }

    case "INCREASE_CONTENT_LINES": {
      if (state.maxContentLines >= 10) return state;
      return { ...state, maxContentLines: state.maxContentLines + 1 };
    }

    case "DECREASE_CONTENT_LINES": {
      if (state.maxContentLines <= 0) return state;
      return { ...state, maxContentLines: state.maxContentLines - 1 };
    }

    default: {
      // Throw on unhandled actions - catches routing bugs immediately
      const unhandled = action as { type: string };
      throw new Error(`[km:board] Unhandled action: ${unhandled.type}`);
    }
  }
}

/**
 * Create initial board state
 *
 * Cursor starts at [0, 0] (first card in first column) if there are children,
 * otherwise [0] (first column) if there are nodes, otherwise empty.
 */
export function createBoardState(
  nodes: TNode[],
  rootId: string | null = null,
  rootPath: string | null = null,
): BoardState {
  // Determine initial cursor position and cursor node
  // Prefer starting at card level [0, 0] if first node has children
  let cursor: TPath = [];
  let cursorNodeId: string | null = null;

  if (nodes.length > 0) {
    const firstNode = nodes[0];
    if (firstNode && firstNode.childCount > 0) {
      cursor = [0, 0]; // Start at first card in first column
      cursorNodeId = firstNode.children[0]?.id ?? null;
    } else if (firstNode) {
      cursor = [0]; // Start at first column (no children)
      cursorNodeId = firstNode.id;
    }
  }

  return {
    rootId,
    rootPath,
    nodes,
    cursorNodeId,
    cursor,
    selectedNodes: new Set(),
    foldedNodes: new Set(),
    collapsedNodes: new Set(),
    zoomStack: [],
    navHistory: [],
    navHistoryIndex: 0,
    moveMode: false,
    moveSourceNodes: [],
    moveSourceCursor: [],
    maxOutlineDepth: 99,
    maxContentLines: 2,
  };
}
