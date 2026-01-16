/**
 * Tree State Reducer
 *
 * Path-based reducer for generic tree navigation.
 * Supports arbitrary depth with CursorPath instead of fixed (colIndex, cardIndex).
 */

import type { TreeState, TreeAction, TNode, CursorPath } from "./treeTypes.ts";

// ===== Helper Functions =====

/**
 * Get node at a given cursor path
 */
export function getNodeAtPath(nodes: TNode[], path: CursorPath): TNode | null {
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
export function getSiblingCount(nodes: TNode[], path: CursorPath): number {
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
function collectAllNodeIds(nodes: TNode[]): string[] {
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
function getSiblings(nodes: TNode[], path: CursorPath): TNode[] {
  if (path.length === 0) return [];
  if (path.length === 1) return nodes;

  const parentPath = path.slice(0, -1);
  const parent = getNodeAtPath(nodes, parentPath);
  return parent?.children ?? [];
}

// ===== Visual Navigation Helpers =====

/**
 * Check if a node is visible (not folded)
 */
function _isNodeVisible(nodeId: string, foldedNodes: Set<string>): boolean {
  return !foldedNodes.has(nodeId);
}

/**
 * Get the last visible descendant of a node (for CURSOR_UP navigation).
 * Returns the path to the deepest last child that's visible.
 */
function getLastVisibleDescendantPath(
  nodes: TNode[],
  path: CursorPath,
  foldedNodes: Set<string>,
): CursorPath {
  const node = getNodeAtPath(nodes, path);
  if (!node) return path;

  // If node is folded or has no children, return the node itself
  if (foldedNodes.has(node.nodeId) || node.children.length === 0) {
    return path;
  }

  // Go to last child and recurse
  const lastChildIdx = node.children.length - 1;
  const childPath = [...path, lastChildIdx];
  return getLastVisibleDescendantPath(nodes, childPath, foldedNodes);
}

/**
 * Get the next visible block below the current position (CURSOR_DOWN).
 * Order: first child (if visible) -> next sibling -> parent's next sibling -> ...
 */
function getNextVisiblePath(
  nodes: TNode[],
  path: CursorPath,
  foldedNodes: Set<string>,
): CursorPath | null {
  if (path.length === 0) {
    // At root level, go to first top-level node
    return nodes.length > 0 ? [0] : null;
  }

  const node = getNodeAtPath(nodes, path);
  if (!node) return null;

  // 1. Try to enter first child (if not folded and has children)
  if (!foldedNodes.has(node.nodeId) && node.children.length > 0) {
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
  path: CursorPath,
  foldedNodes: Set<string>,
): CursorPath | null {
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
      const siblingCount = getSiblingCount(state.nodes, state.cursor);
      if (siblingCount === 0) return state;
      const newPath = [...state.cursor];
      newPath[newPath.length - 1] = siblingCount - 1;
      return { ...state, cursor: newPath };
    }

    // Directional navigation aliases
    case "MOVE_UP": {
      return treeReducer(state, { type: "NAV_PREV_SIBLING" });
    }

    case "MOVE_DOWN": {
      return treeReducer(state, { type: "NAV_NEXT_SIBLING" });
    }

    case "MOVE_LEFT": {
      // At top level (depth 1), move to previous column
      if (state.cursor.length === 1) {
        const idx = getCurrentIndex(state.cursor);
        if (idx <= 0) return state;
        return { ...state, cursor: [idx - 1] };
      }
      // Deeper: go to parent
      return treeReducer(state, { type: "NAV_PARENT" });
    }

    case "MOVE_RIGHT": {
      // At top level (depth 1), move to next column
      if (state.cursor.length === 1) {
        const idx = getCurrentIndex(state.cursor);
        const siblingCount = getSiblingCount(state.nodes, state.cursor);
        if (idx >= siblingCount - 1) return state;
        return { ...state, cursor: [idx + 1] };
      }
      // Deeper: enter child
      return treeReducer(state, { type: "NAV_CHILD" });
    }

    case "NAV_CROSS_COLUMN": {
      // Move horizontally between columns, preserving Y position within column
      if (state.cursor.length < 2) return state; // Must be at card level [col, row]
      const colIdx = state.cursor[0] ?? 0;
      const rowIdx = state.cursor[1] ?? 0;
      const newColIdx = action.direction === "right" ? colIdx + 1 : colIdx - 1;

      // Check if target column exists
      if (newColIdx < 0 || newColIdx >= state.nodes.length) return state;

      // Get child count of target column
      const targetCol = state.nodes[newColIdx];
      if (!targetCol) return state;

      // If target column is empty, navigate to column level
      if (targetCol.children.length === 0) {
        return { ...state, cursor: [newColIdx] };
      }

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
      const addNodeAtDepth = (nodes: TNode[], currentDepth: number) => {
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
      const removeNodeAtDepth = (nodes: TNode[], currentDepth: number) => {
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

    // ===== Extend-Select (shift+hjkl) =====

    case "EXTEND_SELECT_DOWN": {
      // Add current node to selection and move down
      const currentNode = getNodeAtPath(state.nodes, state.cursor);
      if (!currentNode) return state;

      const newSelected = new Set(state.selectedNodes);
      newSelected.add(currentNode.nodeId);

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
        newSelected.add(nextNode.nodeId);
      }

      return { ...state, cursor: nextPath, selectedNodes: newSelected };
    }

    case "EXTEND_SELECT_UP": {
      // Add current node to selection and move up
      const currentNode = getNodeAtPath(state.nodes, state.cursor);
      if (!currentNode) return state;

      const newSelected = new Set(state.selectedNodes);
      newSelected.add(currentNode.nodeId);

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
        newSelected.add(prevNode.nodeId);
      }

      return { ...state, cursor: prevPath, selectedNodes: newSelected };
    }

    case "EXTEND_SELECT_LEFT": {
      // Add current node to selection and move left (cross-column)
      const currentNode = getNodeAtPath(state.nodes, state.cursor);
      if (!currentNode) return state;

      const newSelected = new Set(state.selectedNodes);
      newSelected.add(currentNode.nodeId);

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

      let newPath: CursorPath;
      if (targetCol.children.length === 0) {
        newPath = [newColIdx];
        newSelected.add(targetCol.nodeId);
      } else {
        const clampedRow = Math.min(rowIdx, targetCol.children.length - 1);
        newPath = [newColIdx, clampedRow];
        const targetNode = targetCol.children[clampedRow];
        if (targetNode) {
          newSelected.add(targetNode.nodeId);
        }
      }

      return { ...state, cursor: newPath, selectedNodes: newSelected };
    }

    case "EXTEND_SELECT_RIGHT": {
      // Add current node to selection and move right (cross-column)
      const currentNode = getNodeAtPath(state.nodes, state.cursor);
      if (!currentNode) return state;

      const newSelected = new Set(state.selectedNodes);
      newSelected.add(currentNode.nodeId);

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

      let newPath: CursorPath;
      if (targetCol.children.length === 0) {
        newPath = [newColIdx];
        newSelected.add(targetCol.nodeId);
      } else {
        const clampedRow = Math.min(rowIdx, targetCol.children.length - 1);
        newPath = [newColIdx, clampedRow];
        const targetNode = targetCol.children[clampedRow];
        if (targetNode) {
          newSelected.add(targetNode.nodeId);
        }
      }

      return { ...state, cursor: newPath, selectedNodes: newSelected };
    }

    // ===== Shifting (opt+hjkl) =====
    // Note: These are "intent" actions - actual tree mutation happens in the TUI/store layer
    // The reducer just returns current state; TUI intercepts and handles via store API
    case "SHIFT_UP":
    case "SHIFT_DOWN":
    case "SHIFT_LEFT":
    case "SHIFT_RIGHT": {
      // No-op in reducer - handled by TUI via store integration
      // The TUI will catch these actions and call the appropriate store methods
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
        nodesToMove = [currentNode.nodeId];
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
      // Actual move handled by TUI via store API
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
      return {
        ...state,
        moveMode: false,
        moveSourceNodes: [],
        cursor:
          state.moveSourceCursor.length > 0
            ? state.moveSourceCursor
            : state.cursor,
        moveSourceCursor: [],
      };
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

    // ===== Command Palette =====

    case "TOGGLE_COMMAND_PALETTE": {
      return {
        ...state,
        commandPaletteOpen: !state.commandPaletteOpen,
        commandPaletteQuery: state.commandPaletteOpen
          ? ""
          : state.commandPaletteQuery,
        commandPaletteIndex: state.commandPaletteOpen
          ? 0
          : state.commandPaletteIndex,
      };
    }

    case "SET_COMMAND_PALETTE_QUERY": {
      return {
        ...state,
        commandPaletteQuery: action.query,
        commandPaletteIndex: 0,
      };
    }

    case "COMMAND_PALETTE_UP": {
      if (state.commandPaletteIndex <= 0) return state;
      return { ...state, commandPaletteIndex: state.commandPaletteIndex - 1 };
    }

    case "COMMAND_PALETTE_DOWN": {
      if (state.commandPaletteIndex >= action.maxIndex) return state;
      return { ...state, commandPaletteIndex: state.commandPaletteIndex + 1 };
    }

    case "CLOSE_COMMAND_PALETTE": {
      return {
        ...state,
        commandPaletteOpen: false,
        commandPaletteQuery: "",
        commandPaletteIndex: 0,
      };
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
 *
 * Cursor starts at [0, 0] (first card in first column) if there are children,
 * otherwise [0] (first column) if there are nodes, otherwise empty.
 */
export function createInitialTreeState(
  nodes: TNode[],
  rootId: string | null = null,
  rootPath: string | null = null,
): TreeState {
  // Determine initial cursor position
  // Prefer starting at card level [0, 0] if first node has children
  let cursor: CursorPath = [];
  if (nodes.length > 0) {
    const firstNode = nodes[0];
    if (firstNode && firstNode.children.length > 0) {
      cursor = [0, 0]; // Start at first card in first column
    } else {
      cursor = [0]; // Start at first column (no children)
    }
  }

  return {
    rootId,
    rootPath,
    nodes,
    cursor,
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
    commandPaletteOpen: false,
    commandPaletteQuery: "",
    commandPaletteIndex: 0,
    moveMode: false,
    moveSourceNodes: [],
    moveSourceCursor: [],
  };
}
