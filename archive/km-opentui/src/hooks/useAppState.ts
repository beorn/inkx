/**
 * useAppState Hook
 *
 * React hook wrapper around the combined app state reducer.
 * Provides path-based navigation with computed selectors.
 * Includes undo/redo capability and effect layer for side effects.
 *
 * ## Architecture: Command → Action → Reducer → Effect
 *
 * This hook is the central state management layer that connects:
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  1. COMMAND LAYER (commands.ts)                                        │
 * │     - Commands have semantic names (toggle_task_done, cursor_down)     │
 * │     - Commands read context and CREATE actions                         │
 * │     - Toggle/cycle logic lives here (reads state, computes target)     │
 * └─────────────────────────────────────────────────────────────────────────┘
 *                                    ↓
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  2. ACTION LAYER (appState.ts, boardTypes.ts, actions.ts)              │
 * │     - Actions are idempotent (set to value, never toggle)              │
 * │     - Three action types:                                              │
 * │       • BoardAction: navigation state (cursor, fold, zoom)             │
 * │       • AppUIAction: modal/dialog state (search, help, palette)        │
 * │       • TAction: content mutations (UPDATE_NODE, DELETE_NODE)          │
 * └─────────────────────────────────────────────────────────────────────────┘
 *                                    ↓
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  3. REDUCER LAYER (appReducer in this file)                            │
 * │     - Pure functions, no side effects                                  │
 * │     - Computes new state from current state + action                   │
 * │     - Chains: appReducer → appUIReducer OR boardReducer                │
 * │     - TActions pass through unchanged (effect layer handles them)      │
 * └─────────────────────────────────────────────────────────────────────────┘
 *                                    ↓
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  4. EFFECT LAYER (dispatch wrapper in this hook)                       │
 * │     - Intercepts TActions after reducer                                │
 * │     - Calls onTAction callback for storage operations                  │
 * │     - Storage layer persists to SQLite and syncs to filesystem         │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ## Why This Architecture?
 *
 * 1. **Testability**: Reducers are pure, easy to test
 * 2. **Undo/Redo**: All state changes flow through dispatch
 * 3. **Consistency**: Same pattern for navigation AND mutations
 * 4. **Command Palette**: Commands are discoverable and searchable
 * 5. **Multi-window Sync**: Actions can be broadcast to other windows
 */

import {
  useReducer,
  useMemo,
  useCallback,
  useState,
  useEffect,
  useRef,
} from "react";
import {
  boardReducer,
  createBoardState,
  getNodeAtPath,
  getSiblingCount,
  isTAction,
  type BoardState,
  type BoardAction,
  type TNode,
  type TPath,
  type TAction,
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

/**
 * Actions that should be tracked in undo history.
 *
 * Board state changes (fold, zoom, selection) are undoable.
 * Navigation (cursor movement) is NOT undoable.
 * TActions (content mutations) are handled by the effect layer
 * and tracked via storage events, not reducer undo.
 */
const UNDOABLE_ACTIONS = new Set([
  // Board state mutations
  "TOGGLE_FOLD",
  "TOGGLE_COLLAPSE",
  "FOLD_LEVEL",
  "UNFOLD_LEVEL",
  "ZOOM_IN",
  "ZOOM_OUT",
  // Selection
  "SELECT_NODE_ADD",
  "SELECT_NODE_REMOVE",
  "SELECT_NODE_TOGGLE",
  "SELECT_ALL_SIBLINGS",
  "SELECT_ALL",
  "CLEAR_SELECTION",
  // Tree refresh (from external changes)
  "REFRESH",
  // TActions (content mutations) - tracked for undo
  "UPDATE_NODE",
  "DELETE_NODE",
  "ADD_NODE",
  "MOVE_NODE",
]);

/**
 * Combined app reducer that handles board, app UI, and tree actions.
 *
 * Routing logic:
 * 1. AppUIAction → appUIReducer (modal/dialog state)
 * 2. TAction → pass through unchanged (effect layer handles persistence)
 * 3. BoardAction → boardReducer (navigation state)
 */
function appReducer(state: AppState, action: AppAction): AppState {
  // Route 1: App UI actions (modals, dialogs)
  if (isAppUIAction(action)) {
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

  // Route 2: TActions pass through (effect layer handles persistence)
  // The reducer doesn't modify state for TActions - the effect layer
  // will call storage and then refresh the tree.
  if (isTAction(action)) {
    return state;
  }

  // Route 3: Board actions (navigation state)
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
 * Create combined app state from tree nodes.
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
 * App state hook configuration.
 */
export interface UseAppStateConfig {
  /**
   * Callback when a TAction is dispatched.
   * The effect layer calls this to persist content mutations to storage.
   * After storage updates, caller should call refreshTree() to update UI.
   */
  onTAction?: (action: TAction) => void;
}

/**
 * App state hook return type.
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
 * Get siblings at current cursor level.
 */
function getSiblings(nodes: TNode[], path: TPath): TNode[] {
  if (path.length === 0) return [];
  if (path.length === 1) return nodes;

  const parentPath = path.slice(0, -1);
  const parent = getNodeAtPath(nodes, parentPath);
  return parent?.children ?? [];
}

/**
 * App state management hook.
 *
 * @param initialState - Initial app state
 * @param config - Optional configuration including onTAction callback
 *
 * ## Usage
 *
 * ```tsx
 * const tree = useAppState(initialState, {
 *   onTAction: (action) => {
 *     // Effect layer: persist content mutations to storage
 *     switch (action.type) {
 *       case "UPDATE_NODE":
 *         updateNode(action.nodeId, action.updates);
 *         break;
 *       case "DELETE_NODE":
 *         deleteNode(action.nodeId);
 *         break;
 *     }
 *     refreshTree(); // Reload tree from storage
 *   }
 * });
 *
 * // Dispatch actions (commands create these)
 * tree.dispatch({ type: "CURSOR_MOVE", dir: "next" });
 * tree.dispatch({ type: "UPDATE_NODE", nodeId: "...", updates: {...} });
 * ```
 */
export function useAppState(
  initialState: AppState,
  config: UseAppStateConfig = {},
): AppStateHook {
  const { onTAction } = config;
  const [state, baseDispatch] = useReducer(appReducer, initialState);

  // Undo/redo history stacks
  const [undoStack, setUndoStack] = useState<AppState[]>([]);
  const [redoStack, setRedoStack] = useState<AppState[]>([]);

  // Track pending TActions for effect layer
  const pendingTAction = useRef<TAction | null>(null);

  /**
   * Wrapped dispatch that:
   * 1. Tracks undo history for undoable actions
   * 2. Routes TActions to effect layer after reducer
   */
  const dispatch = useCallback(
    (action: AppAction) => {
      // Track undoable actions in history
      if (UNDOABLE_ACTIONS.has(action.type)) {
        setUndoStack((prev) => {
          const newStack = [...prev, state];
          if (newStack.length > MAX_UNDO_HISTORY) {
            return newStack.slice(-MAX_UNDO_HISTORY);
          }
          return newStack;
        });
        setRedoStack([]);
      }

      // Dispatch to reducer
      baseDispatch(action);

      // Queue TActions for effect layer
      if (isTAction(action)) {
        pendingTAction.current = action;
      }
    },
    [state],
  );

  /**
   * Effect layer: Execute side effects for TActions.
   *
   * TActions represent content mutations that need to be persisted
   * to storage. The reducer doesn't handle these - it just passes
   * them through. This effect runs after render and calls the
   * onTAction callback to actually persist the change.
   */
  useEffect(() => {
    if (pendingTAction.current && onTAction) {
      onTAction(pendingTAction.current);
      pendingTAction.current = null;
    }
  });

  // Undo - restore previous state from undo stack
  const undo = useCallback(() => {
    if (undoStack.length === 0) return;

    const newUndoStack = [...undoStack];
    const prevState = newUndoStack.pop();
    if (!prevState) return;

    setRedoStack((prev) => [...prev, state]);
    setUndoStack(newUndoStack);

    baseDispatch({ type: "REFRESH", nodes: prevState.nodes });
    baseDispatch({ type: "NAV_TO_PATH", path: prevState.cursor });
  }, [undoStack, state]);

  // Redo - restore next state from redo stack
  const redo = useCallback(() => {
    if (redoStack.length === 0) return;

    const newRedoStack = [...redoStack];
    const nextState = newRedoStack.pop();
    if (!nextState) return;

    setUndoStack((prev) => [...prev, state]);
    setRedoStack(newRedoStack);

    baseDispatch({ type: "REFRESH", nodes: nextState.nodes });
    baseDispatch({ type: "NAV_TO_PATH", path: nextState.cursor });
  }, [redoStack, state]);

  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;

  // Computed selectors
  const currentNode = useMemo(
    () => getNodeAtPath(state.nodes, state.cursor),
    [state.nodes, state.cursor],
  );

  const parentNode = useMemo(() => {
    if (state.cursor.length <= 1) return null;
    const parentPath = state.cursor.slice(0, -1);
    return getNodeAtPath(state.nodes, parentPath);
  }, [state.nodes, state.cursor]);

  const siblings = useMemo(
    () => getSiblings(state.nodes, state.cursor),
    [state.nodes, state.cursor],
  );

  const siblingCount = useMemo(
    () => getSiblingCount(state.nodes, state.cursor),
    [state.nodes, state.cursor],
  );

  const cursorDepth = state.cursor.length;

  // Navigation availability
  const currentIndex =
    state.cursor.length > 0 ? (state.cursor[state.cursor.length - 1] ?? 0) : 0;
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
