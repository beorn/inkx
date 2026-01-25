/**
 * Board Dialog Handlers Hook
 *
 * Encapsulates dialog-related event handlers for the Board component.
 * Handles project picker and new item dialog interactions.
 */
import { useCallback } from "react";
import type { KNode } from "@km/core";
import type { Vault } from "../vault-context.tsx";
import type { TUIBoardState } from "../types.ts";
import { actions } from "../ui-reducer.ts";

// =============================================================================
// Types
// =============================================================================

interface UseBoardDialogsParams {
  vault: Vault;
  state: TUIBoardState;
  dispatch: (
    action: ReturnType<(typeof actions)[keyof typeof actions]>,
  ) => void;
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
  dispatch,
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

      // Close picker - columns will be re-derived from vault on next render
      dispatch(actions.hideProjectPicker());
    },
    [vault, state, dispatch],
  );

  const handleProjectCancel = useCallback(() => {
    dispatch(actions.hideProjectPicker());
  }, [dispatch]);

  // Handler for new item creation
  const handleNewItemCreate = useCallback(
    (_newNodeId: string) => {
      // Close dialog - columns will be re-derived from vault on next render
      dispatch(actions.hideNewItemDialog());
    },
    [dispatch],
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
