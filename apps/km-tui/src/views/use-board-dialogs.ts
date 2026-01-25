/**
 * Board Dialog Handlers Hook
 *
 * Encapsulates dialog-related event handlers for the Board component.
 * Handles project picker and new item dialog interactions.
 */
import { useCallback } from "react";
import type { KNode } from "@km/core";
import type { Vault } from "../vault-context.tsx";
import type { BoardState } from "../types.ts";
import type { BoardState as TreeBoardState, BoardAction } from "@km/board";
import { buildTreeNodes } from "../board-adapter.ts";
import { actions } from "../ui-reducer.ts";

// =============================================================================
// Types
// =============================================================================

interface UseBoardDialogsParams {
  vault: Vault;
  state: BoardState;
  boardState: TreeBoardState;
  dispatch: (
    action: ReturnType<(typeof actions)[keyof typeof actions]>,
  ) => void;
  dispatchBoard: (action: BoardAction) => void;
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
  vault,
  state,
  boardState,
  dispatch,
  dispatchBoard,
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
      const targetChildren = vault.getChildren(targetNode.id);
      const lastChild = targetChildren[targetChildren.length - 1];
      const newSortOrder = lastChild ? lastChild.parent_idx + 1 : 0;

      // Update database via vault (handles memory/disk mode)
      vault.moveNode(nodeToMove, targetNode.id, newSortOrder);

      // Track as recent project
      dispatch(actions.addRecentProject(targetNode.id));

      // Close picker and rebuild board
      dispatch(actions.hideProjectPicker());

      setTimeout(() => {
        if (boardState.rootId) {
          // Build tree nodes directly and dispatch to boardReducer
          const nodes = buildTreeNodes(vault, boardState.rootId);
          dispatchBoard({ type: "REFRESH", nodes });
        }
      }, 50);
    },
    [vault, state, boardState, dispatch, dispatchBoard],
  );

  const handleProjectCancel = useCallback(() => {
    dispatch(actions.hideProjectPicker());
  }, [dispatch]);

  // Handler for new item creation
  const handleNewItemCreate = useCallback(
    (_newNodeId: string) => {
      dispatch(actions.hideNewItemDialog());
      // Refresh the board to show the new item
      if (boardState.rootId) {
        const nodes = buildTreeNodes(vault, boardState.rootId);
        dispatchBoard({ type: "REFRESH", nodes });
      }
    },
    [boardState, dispatch, dispatchBoard],
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
