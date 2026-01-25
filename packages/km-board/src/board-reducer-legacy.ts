/**
 * Board State Reducer (Current Implementation)
 *
 * Path-based reducer for board navigation.
 * Supports arbitrary depth with TPath instead of fixed (colIndex, cardIndex).
 *
 * Being migrated to simplified reducer - see board-reducer-new.ts
 *
 * Does NOT handle app-specific UI state (modals, dialogs) - that belongs in app layer.
 */

import createDebug from "debug";
import type { BoardState, BoardAction, TNode, TPath } from "./board-types.ts";

const debug = createDebug("km:board:reducer");
import { isTAction, getNodeAtPath } from "@km/tree";

// Cursor movement handlers (extracted)
import { handleCursorMove, updateCursor } from "./board-reducer-cursor.ts";

// Selection handlers (extracted)
import {
  handleSelectNodeAdd,
  handleSelectNodeRemove,
  handleSelectNodeToggle,
  handleSelectAllSiblings,
  handleSelectAll,
  handleClearSelection,
  handleExtendSelectDown,
  handleExtendSelectUp,
  handleExtendSelectLeft,
  handleExtendSelectRight,
} from "./board-reducer-selection.ts";

/**
 * Get node ID at a given cursor path.
 * Returns null if path is empty or node doesn't exist.
 */
function getNodeIdAtPath(nodes: TNode[], path: TPath): string | null {
  const node = getNodeAtPath(nodes, path);
  return node?.id ?? null;
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

  // Cross-column handler for CURSOR_MOVE left/right
  const handleCrossColumn = (s: BoardState, dir: "left" | "right") =>
    boardReducer(s, { type: "NAV_CROSS_COLUMN", direction: dir });

  switch (action.type) {
    // ===== Cursor Movement (parameterized) =====

    case "CURSOR_MOVE":
      return handleCursorMove(state, action.dir, handleCrossColumn);

    // ===== Jump Navigation =====

    case "NAV_TO_PATH": {
      // Explicit navigation clears curswant
      // Empty path means board level (no node selected)
      if (action.path.length === 0) {
        return {
          ...state,
          cursor: [],
          cursorNodeId: null,
          curswantX: null,
          curswantY: null,
        };
      }
      // Validate path exists for non-empty paths
      const node = getNodeAtPath(state.nodes, action.path);
      if (!node) return state;
      return {
        ...state,
        ...updateCursor(state, action.path),
        curswantX: null,
        curswantY: null,
      };
    }

    case "NAV_CROSS_COLUMN": {
      // Move horizontally between columns, preserving cursor depth
      // Cursor can be column-level [col] or card-level [col, row, ...]
      // Uses curswantY for sticky position using normalized ratio (see bead km-jm2r)

      // At board level: clear curswantX (explicit horizontal movement)
      if (state.cursor.length === 0) {
        return { ...state, curswantX: null };
      }

      const colIdx = state.cursor[0] ?? 0;
      const isAtColumnLevel = state.cursor.length === 1;
      const newColIdx = action.direction === "right" ? colIdx + 1 : colIdx - 1;

      // Check if target column exists
      if (newColIdx < 0 || newColIdx >= state.nodes.length) return state;

      const targetCol = state.nodes[newColIdx];
      if (!targetCol) return state;

      // Preserve cursor depth: column level stays column level
      if (isAtColumnLevel) {
        return {
          ...state,
          ...updateCursor(state, [newColIdx]),
          curswantY: 0, // Column level: curswantY = 0 (top)
        };
      }

      // At card level: navigate to card in target column
      // curswantY stores a normalized ratio (0.0 = top, 1.0 = bottom)
      // This provides better visual correspondence than raw row indices
      const sourceCol = state.nodes[colIdx];
      const sourceColCount = sourceCol?.childCount ?? 1;
      const currentRowIdx = state.cursor[1] ?? 0;

      // Convert current position to ratio (using top edge of card)
      // Row 1 in 2-item column → 1/2 = 0.5
      const currentRatio =
        sourceColCount > 0 ? currentRowIdx / sourceColCount : 0;
      const newCurswantY = state.curswantY ?? currentRatio;

      debug("NAV_CROSS_COLUMN", {
        cursor: state.cursor,
        curswantY: state.curswantY,
        currentRatio,
        sourceColCount,
        targetChildCount: targetCol.childCount,
      });

      // If target column is empty, fall back to column level
      if (targetCol.childCount === 0) {
        return {
          ...state,
          ...updateCursor(state, [newColIdx]),
          curswantY: newCurswantY, // Preserve for when we return to a column with cards
        };
      }

      // Convert ratio back to row index in target column
      // Ratio 0.5 in 4-item column → round(0.5 * 4) = 2
      const idealIdx = Math.round(newCurswantY * targetCol.childCount);
      const targetRowIdx = Math.max(
        0,
        Math.min(idealIdx, targetCol.childCount - 1),
      );

      debug(
        "NAV_CROSS_COLUMN: targetRowIdx=%d, newCursor=[%d, %d]",
        targetRowIdx,
        newColIdx,
        targetRowIdx,
      );

      return {
        ...state,
        ...updateCursor(state, [newColIdx, targetRowIdx]),
        curswantY: newCurswantY, // Preserve sticky ratio
      };
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
        curswantX: null, // Clear on zoom
        curswantY: null,
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
        curswantX: null, // Clear on zoom
        curswantY: null,
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
        curswantX: null, // Clear on navigation
        curswantY: null,
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

    case "SELECT_NODE_ADD":
      return handleSelectNodeAdd(state, action.nodeId);

    case "SELECT_NODE_REMOVE":
      return handleSelectNodeRemove(state, action.nodeId);

    case "SELECT_NODE_TOGGLE":
      return handleSelectNodeToggle(state, action.nodeId);

    case "SELECT_ALL_SIBLINGS":
      return handleSelectAllSiblings(state);

    case "SELECT_ALL":
      return handleSelectAll(state);

    case "CLEAR_SELECTION":
      return handleClearSelection(state);

    // ===== Extend-Select (shift+hjkl) =====

    case "EXTEND_SELECT_DOWN":
      return handleExtendSelectDown(state);

    case "EXTEND_SELECT_UP":
      return handleExtendSelectUp(state);

    case "EXTEND_SELECT_LEFT":
      return handleExtendSelectLeft(state);

    case "EXTEND_SELECT_RIGHT":
      return handleExtendSelectRight(state);

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
        curswantX: null, // Clear on cancel
        curswantY: null,
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
    curswantX: null,
    curswantY: null,
  };
}
