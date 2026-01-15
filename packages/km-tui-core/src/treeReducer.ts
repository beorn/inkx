/**
 * Tree State Reducer
 *
 * Path-based reducer for generic tree navigation.
 * Supports arbitrary depth with CursorPath instead of fixed (colIndex, cardIndex).
 */

import type { TreeState, TreeAction, TreeNodeState, CursorPath } from "./types";

// ===== Helper Functions =====

/**
 * Get node at a given cursor path
 */
export function getNodeAtPath(
  nodes: TreeNodeState[],
  path: CursorPath,
): TreeNodeState | null {
  if (path.length === 0) return null;

  const firstIdx = path[0];
  if (firstIdx === undefined) return null;
  let current: TreeNodeState | undefined = nodes[firstIdx];
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
export function getSiblingCount(
  nodes: TreeNodeState[],
  path: CursorPath,
): number {
  if (path.length === 0) return 0;
  if (path.length === 1) return nodes.length;

  const parentPath = path.slice(0, -1);
  const parent = getNodeAtPath(nodes, parentPath);
  return parent?.children.length ?? 0;
}

/**
 * Get the current index (last element of path)
 */
function getCurrentIndex(path: CursorPath): number {
  if (path.length === 0) return 0;
  const lastIdx = path[path.length - 1];
  return lastIdx ?? 0;
}

/**
 * Recursively collect all node IDs from a tree
 */
function collectAllNodeIds(nodes: TreeNodeState[]): string[] {
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
function getSiblings(
  nodes: TreeNodeState[],
  path: CursorPath,
): TreeNodeState[] {
  if (path.length === 0) return [];
  if (path.length === 1) return nodes;

  const parentPath = path.slice(0, -1);
  const parent = getNodeAtPath(nodes, parentPath);
  return parent?.children ?? [];
}

// ===== Reducer =====

/**
 * Pure reducer for tree state transitions
 */
export function treeReducer(state: TreeState, action: TreeAction): TreeState {
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
      const siblingCount = getSiblingCount(state.nodes, state.cursor);
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
      const currentNode = getNodeAtPath(state.nodes, state.cursor);
      if (!currentNode || currentNode.children.length === 0) return state;
      return { ...state, cursor: [...state.cursor, 0] };
    }

    case "NAV_TO_PATH": {
      // Validate path exists
      if (action.path.length === 0) return state;
      const node = getNodeAtPath(state.nodes, action.path);
      if (!node) return state;
      return { ...state, cursor: action.path };
    }

    // ===== Legacy 2D Navigation (mapped to path-based) =====

    case "MOVE_UP":
      return treeReducer(state, { type: "NAV_PREV_SIBLING" });

    case "MOVE_DOWN":
      return treeReducer(state, { type: "NAV_NEXT_SIBLING" });

    case "MOVE_LEFT": {
      // At depth > 1: move to parent
      // At depth 1 (top level): move to previous sibling
      if (state.cursor.length > 1) {
        return treeReducer(state, { type: "NAV_PARENT" });
      }
      const leftIdx = state.cursor[0];
      if (state.cursor.length === 1 && leftIdx !== undefined && leftIdx > 0) {
        return { ...state, cursor: [leftIdx - 1] };
      }
      return state;
    }

    case "MOVE_RIGHT": {
      // At depth 1 (top level): move to next sibling (column)
      // Otherwise: try to move into child
      const rightIdx = state.cursor[0];
      if (state.cursor.length === 1 && rightIdx !== undefined) {
        if (rightIdx < state.nodes.length - 1) {
          return { ...state, cursor: [rightIdx + 1] };
        }
        // If at last column, try to drill into children
        return treeReducer(state, { type: "NAV_CHILD" });
      }
      return treeReducer(state, { type: "NAV_CHILD" });
    }

    case "JUMP_TOP": {
      if (state.cursor.length === 0) return state;
      const newPath = [...state.cursor];
      newPath[newPath.length - 1] = 0;
      return { ...state, cursor: newPath };
    }

    case "JUMP_BOTTOM": {
      if (state.cursor.length === 0) return state;
      const siblingCount = getSiblingCount(state.nodes, state.cursor);
      if (siblingCount === 0) return state;
      const newPath = [...state.cursor];
      newPath[newPath.length - 1] = siblingCount - 1;
      return { ...state, cursor: newPath };
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
      const addNodeAtDepth = (nodes: TreeNodeState[], currentDepth: number) => {
        for (const node of nodes) {
          if (currentDepth === action.depth) {
            newFolded.add(node.nodeId);
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
      const removeNodeAtDepth = (
        nodes: TreeNodeState[],
        currentDepth: number,
      ) => {
        for (const node of nodes) {
          if (currentDepth === action.depth) {
            newFolded.delete(node.nodeId);
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
        nodes: action.nodes,
        cursor: [0],
        zoomStack: newZoomStack,
      };
    }

    case "ZOOM_OUT": {
      if (state.zoomStack.length === 0) return state;
      const newZoomStack = [...state.zoomStack];
      const prev = newZoomStack.pop();
      if (!prev) return state; // Shouldn't happen, but satisfies lint
      return {
        ...state,
        rootId: prev.rootId,
        nodes: action.nodes,
        cursor: prev.cursor,
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
      const safeCursor: CursorPath = action.nodes.length > 0 ? [0] : [];
      return { ...state, nodes: action.nodes, cursor: safeCursor };
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
      return {
        ...state,
        rootId: action.rootId,
        rootPath: action.rootPath,
        nodes: action.nodes,
        cursor: [0],
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
        newSelected.add(sibling.nodeId);
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

    // ===== Modals =====

    case "TOGGLE_SEARCH_MODE": {
      return {
        ...state,
        searchMode: !state.searchMode,
        searchQuery: state.searchMode ? "" : state.searchQuery,
      };
    }

    case "SET_SEARCH_QUERY": {
      return { ...state, searchQuery: action.query };
    }

    case "TOGGLE_HELP_MODE": {
      return { ...state, helpMode: !state.helpMode };
    }

    case "TOGGLE_NEW_ITEM_MODE": {
      return {
        ...state,
        newItemMode: !state.newItemMode,
        newItemText: state.newItemMode ? "" : state.newItemText,
      };
    }

    case "SET_NEW_ITEM_TEXT": {
      return { ...state, newItemText: action.text };
    }

    case "CLEAR_NEW_ITEM": {
      return { ...state, newItemMode: false, newItemText: "" };
    }

    case "TOGGLE_PROJECT_PICKER": {
      return {
        ...state,
        projectPickerOpen: !state.projectPickerOpen,
        projectPickerQuery: state.projectPickerOpen
          ? ""
          : state.projectPickerQuery,
        projectPickerIndex: state.projectPickerOpen
          ? 0
          : state.projectPickerIndex,
      };
    }

    case "SET_PROJECT_PICKER_QUERY": {
      return {
        ...state,
        projectPickerQuery: action.query,
        projectPickerIndex: 0,
      };
    }

    case "PROJECT_PICKER_UP": {
      if (state.projectPickerIndex <= 0) return state;
      return { ...state, projectPickerIndex: state.projectPickerIndex - 1 };
    }

    case "PROJECT_PICKER_DOWN": {
      if (state.projectPickerIndex >= action.maxIndex) return state;
      return { ...state, projectPickerIndex: state.projectPickerIndex + 1 };
    }

    case "CLOSE_PROJECT_PICKER": {
      return {
        ...state,
        projectPickerOpen: false,
        projectPickerQuery: "",
        projectPickerIndex: 0,
      };
    }

    case "TOGGLE_DETAIL_PANE": {
      return { ...state, detailPaneOpen: !state.detailPaneOpen };
    }

    // ===== Outline Depth =====

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

    default:
      return state;
  }
}

/**
 * Create initial tree state
 */
export function createInitialTreeState(
  nodes: TreeNodeState[],
  rootId: string | null = null,
  rootPath: string | null = null,
): TreeState {
  return {
    rootId,
    rootPath,
    nodes,
    cursor: nodes.length > 0 ? [0] : [],
    selectedNodes: new Set(),
    foldedNodes: new Set(),
    collapsedNodes: new Set(),
    searchQuery: "",
    searchMode: false,
    helpMode: false,
    zoomStack: [],
    navHistory: [],
    navHistoryIndex: 0,
    maxOutlineDepth: 99,
    maxContentLines: 2,
    newItemMode: false,
    newItemText: "",
    projectPickerOpen: false,
    projectPickerQuery: "",
    projectPickerIndex: 0,
    detailPaneOpen: false,
  };
}
