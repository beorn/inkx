/**
 * Board Dialog Handlers Hook
 *
 * Encapsulates dialog-related event handlers for the Board component.
 * Handles project picker and new item dialog interactions.
 */
import { useCallback } from "react";
import type { KNode } from "@km/core";
import type { BoardState } from "../types.ts";
import { getChildren, moveNode } from "@km/storage";
import { buildBoardState, initBoardState } from "../state.ts";
import { actions } from "../ui-reducer.ts";

// =============================================================================
// Types
// =============================================================================

interface UseBoardDialogsParams {
  state: BoardState;
  dispatch: (
    action: ReturnType<(typeof actions)[keyof typeof actions]>,
  ) => void;
  setState: React.Dispatch<React.SetStateAction<BoardState>>;
}

interface BoardDialogHandlers {
  handleProjectSelect: (targetNode: KNode) => void;
  handleProjectCancel: () => void;
  handleNewItemCreate: (newNodeId: string) => void;
  handleNewItemCancel: () => void;
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Custom hook that provides dialog handlers for the Board component.
 * Extracts dialog logic to improve Board.tsx maintainability.
 */
export function useBoardDialogs({
  state,
  dispatch,
  setState,
}: UseBoardDialogsParams): BoardDialogHandlers {
  // Handle project picker selection
  // For linked nodes (transclusions), re-parent the TARGET node, not the link
  const handleProjectSelect = useCallback(
    (targetNode: KNode) => {
      const card = state.columns[state.colIndex]?.cards[state.cardIndex];
      if (!card) {
        dispatch(actions.hideProjectPicker());
        return;
      }

      // Resolve link target: if this is a link, operate on the target
      const nodeToMove = card.node.link_to || card.node.id;

      // Calculate sort order (add at end of target)
      const targetChildren = getChildren(targetNode.id);
      const lastChild = targetChildren[targetChildren.length - 1];
      const newSortOrder = lastChild ? lastChild.parent_idx + 1 : 0;

      // Update database via store layer (handles memory/disk mode)
      moveNode(nodeToMove, targetNode.id, newSortOrder);

      // Track as recent project
      dispatch(actions.addRecentProject(targetNode.id));

      // Close picker and rebuild board
      dispatch(actions.hideProjectPicker());

      setTimeout(() => {
        const newState = state.rootId
          ? buildBoardState(state.rootId)
          : initBoardState();

        if (newState) {
          newState.zoomStack = state.zoomStack;
          newState.rootPath = state.rootPath;
          // Reset to first card if current no longer exists
          newState.colIndex = Math.min(
            state.colIndex,
            Math.max(0, newState.columns.length - 1),
          );
          const col = newState.columns[newState.colIndex];
          newState.cardIndex = Math.min(
            state.cardIndex,
            Math.max(0, (col?.cards.length ?? 1) - 1),
          );
          setState(newState);
        }
      }, 50);
    },
    [state, dispatch, setState],
  );

  const handleProjectCancel = useCallback(() => {
    dispatch(actions.hideProjectPicker());
  }, [dispatch]);

  // Handler for new item creation
  const handleNewItemCreate = useCallback(
    (_newNodeId: string) => {
      dispatch(actions.hideNewItemDialog());
      // Refresh the board to show the new item
      setState((s) => (s.rootId ? buildBoardState(s.rootId) : s));
    },
    [dispatch, setState],
  );

  const handleNewItemCancel = useCallback(() => {
    dispatch(actions.hideNewItemDialog());
  }, [dispatch]);

  return {
    handleProjectSelect,
    handleProjectCancel,
    handleNewItemCreate,
    handleNewItemCancel,
  };
}
