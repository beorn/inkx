/**
 * useAppState Hook
 *
 * React hook wrapper around the combined app state reducer.
 * Provides path-based navigation with computed selectors.
 * Includes undo/redo capability for state mutations.
 */

import { useReducer, useMemo, useCallback, useState } from "react";
import {
  boardReducer,
  createBoardState,
  getNodeAtPath,
  getSiblingCount,
  type BoardState,
  type BoardAction,
  type TNode,
  type TPath,
} from "@km/board";
import {
  appUIReducer,
  createAppUIState,
  isAppUIAction,
  type AppState,
  type AppAction,
  type AppUIState,
} from "../appState.ts";

// Re-export for convenience
export { boardReducer, createBoardState };
export type { AppState, AppAction, TNode };

// Maximum undo history size
const MAX_UNDO_HISTORY = 50;

// Actions that should be tracked in undo history (state mutations)
// Navigation and modal toggles are NOT undoable
const UNDOABLE_ACTIONS = new Set([
  "TOGGLE_FOLD",
  "TOGGLE_COLLAPSE",
  "FOLD_LEVEL",
  "UNFOLD_LEVEL",
  "ZOOM_IN",
  "ZOOM_OUT",
  "SELECT_NODE_ADD",
  "SELECT_NODE_REMOVE",
  "SELECT_NODE_TOGGLE",
  "SELECT_ALL_SIBLINGS",
  "SELECT_ALL",
  "CLEAR_SELECTION",
  // Note: REFRESH is triggered by external mutations (store changes)
  // so it's tracked as undoable to allow reverting to previous state
  "REFRESH",
]);

/**
 * Combined app reducer that handles both board and app UI actions.
 */
function appReducer(state: AppState, action: AppAction): AppState {
  // Check if it's an app UI action
  if (isAppUIAction(action)) {
    // Extract app UI state, apply app UI reducer, merge back
    const appUIState: AppUIState = {
      searchQuery: state.searchQuery,
      searchMode: state.searchMode,
      helpMode: state.helpMode,
      newItemMode: state.newItemMode,
      newItemText: state.newItemText,
      projectPickerOpen: state.projectPickerOpen,
      projectPickerQuery: state.projectPickerQuery,
      projectPickerIndex: state.projectPickerIndex,
      detailPaneOpen: state.detailPaneOpen,
      commandPaletteOpen: state.commandPaletteOpen,
      commandPaletteQuery: state.commandPaletteQuery,
      commandPaletteIndex: state.commandPaletteIndex,
    };
    const newAppUIState = appUIReducer(appUIState, action);
    return { ...state, ...newAppUIState };
  }

  // Otherwise it's a board action
  const boardState: BoardState = {
    rootId: state.rootId,
    rootPath: state.rootPath,
    nodes: state.nodes,
    cursor: state.cursor,
    selectedNodes: state.selectedNodes,
    foldedNodes: state.foldedNodes,
    collapsedNodes: state.collapsedNodes,
    zoomStack: state.zoomStack,
    navHistory: state.navHistory,
    navHistoryIndex: state.navHistoryIndex,
    moveMode: state.moveMode,
    moveSourceNodes: state.moveSourceNodes,
    moveSourceCursor: state.moveSourceCursor,
    maxOutlineDepth: state.maxOutlineDepth,
    maxContentLines: state.maxContentLines,
  };
  const newBoardState = boardReducer(boardState, action as BoardAction);
  return { ...state, ...newBoardState };
}

/**
 * Create combined app state.
 */
export function createAppState(
  nodes: TNode[],
  rootId: string | null = null,
  rootPath: string | null = null,
): AppState {
  const boardState = createBoardState(nodes, rootId, rootPath);
  const appUIState = createAppUIState();
  return { ...boardState, ...appUIState };
}

// Export app reducer
export { appReducer };

/**
 * App state hook with selectors
 */
export interface AppStateHook {
  state: AppState;
  dispatch: (action: AppAction) => void;

  // Computed selectors
  currentNode: TNode | null;
  parentNode: TNode | null;
  siblings: TNode[];
  siblingCount: number;
  cursorDepth: number;

  // Navigation helpers
  canNavigateUp: boolean;
  canNavigateDown: boolean;
  canNavigateParent: boolean;
  canNavigateChild: boolean;

  // Undo/redo
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * Get siblings at current cursor level
 */
function getSiblings(nodes: TNode[], path: TPath): TNode[] {
  if (path.length === 0) return [];
  if (path.length === 1) return nodes;

  const parentPath = path.slice(0, -1);
  const parent = getNodeAtPath(nodes, parentPath);
  return parent?.children ?? [];
}

export function useAppState(initialState: AppState): AppStateHook {
  const [state, baseDispatch] = useReducer(appReducer, initialState);

  // Undo/redo history stacks
  const [undoStack, setUndoStack] = useState<AppState[]>([]);
  const [redoStack, setRedoStack] = useState<AppState[]>([]);

  // Wrapped dispatch that tracks undo history for undoable actions
  const dispatch = useCallback(
    (action: AppAction) => {
      if (UNDOABLE_ACTIONS.has(action.type)) {
        // Save current state to undo stack before applying action
        setUndoStack((prev) => {
          const newStack = [...prev, state];
          // Limit history size
          if (newStack.length > MAX_UNDO_HISTORY) {
            return newStack.slice(-MAX_UNDO_HISTORY);
          }
          return newStack;
        });
        // Clear redo stack when new action is performed
        setRedoStack([]);
      }
      baseDispatch(action);
    },
    [state],
  );

  // Undo - restore previous state from undo stack
  const undo = useCallback(() => {
    if (undoStack.length === 0) return;

    const newUndoStack = [...undoStack];
    const prevState = newUndoStack.pop();
    if (!prevState) return;

    // Save current state to redo stack
    setRedoStack((prev) => [...prev, state]);
    setUndoStack(newUndoStack);

    // Restore previous state by dispatching a special restore action
    // We need to directly restore the full state, so we use REFRESH with the old nodes
    // and NAV_TO_PATH to restore cursor position
    baseDispatch({ type: "REFRESH", nodes: prevState.nodes });
    baseDispatch({ type: "NAV_TO_PATH", path: prevState.cursor });
  }, [undoStack, state]);

  // Redo - restore next state from redo stack
  const redo = useCallback(() => {
    if (redoStack.length === 0) return;

    const newRedoStack = [...redoStack];
    const nextState = newRedoStack.pop();
    if (!nextState) return;

    // Save current state to undo stack
    setUndoStack((prev) => [...prev, state]);
    setRedoStack(newRedoStack);

    // Restore next state
    baseDispatch({ type: "REFRESH", nodes: nextState.nodes });
    baseDispatch({ type: "NAV_TO_PATH", path: nextState.cursor });
  }, [redoStack, state]);

  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;

  // Current node at cursor path
  const currentNode = useMemo(
    () => getNodeAtPath(state.nodes, state.cursor),
    [state.nodes, state.cursor],
  );

  // Parent node (one level up from cursor)
  const parentNode = useMemo(() => {
    if (state.cursor.length <= 1) return null;
    const parentPath = state.cursor.slice(0, -1);
    return getNodeAtPath(state.nodes, parentPath);
  }, [state.nodes, state.cursor]);

  // Siblings at current level
  const siblings = useMemo(
    () => getSiblings(state.nodes, state.cursor),
    [state.nodes, state.cursor],
  );

  // Total sibling count
  const siblingCount = useMemo(
    () => getSiblingCount(state.nodes, state.cursor),
    [state.nodes, state.cursor],
  );

  // Cursor depth
  const cursorDepth = state.cursor.length;

  // Navigation availability
  const currentIndex =
    state.cursor.length > 0 ? state.cursor[state.cursor.length - 1] : 0;
  const canNavigateUp = currentIndex > 0;
  const canNavigateDown = currentIndex < siblingCount - 1;
  const canNavigateParent = state.cursor.length > 1;
  const canNavigateChild = (currentNode?.children.length ?? 0) > 0;

  return {
    state,
    dispatch,
    currentNode,
    parentNode,
    siblings,
    siblingCount,
    cursorDepth,
    canNavigateUp,
    canNavigateDown,
    canNavigateParent,
    canNavigateChild,
    undo,
    redo,
    canUndo,
    canRedo,
  };
}

export default useAppState;
