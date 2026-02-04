/**
 * Board Dialog Handlers Hook
 *
 * Encapsulates dialog-related event handlers for the Board component.
 * Handles project picker and new item dialog interactions.
 */
import { useCallback } from "react"
import type { KNode } from "@km/core"
import type { BoardAction } from "@km/board"
import type { Repo } from "../repo-context.tsx"
import type { TUIBoardState } from "../types.ts"
import { actions } from "../ui-reducer.ts"

// =============================================================================
// Types
// =============================================================================

interface UseBoardDialogsParams {
  repo: Repo
  state: TUIBoardState
  dispatch: (action: ReturnType<(typeof actions)[keyof typeof actions]>) => void
  dispatchBoard: (action: BoardAction) => void
  /** Current cursor node ID (from board state) */
  cursorNodeId: string | null
}

interface BoardDialogHandlers {
  handleProjectSelect: (targetNode: KNode) => void
  handleProjectCancel: () => void
  handleNewItemCreate: (newNodeId: string) => void
  handleNewItemCancel: () => void
  handleSearchSelect: (targetNode: KNode) => void
  handleSearchCancel: () => void
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Custom hook that provides dialog handlers for the Board component.
 * Extracts dialog logic to improve Board.tsx maintainability.
 */
export function useBoardDialogs({
  repo,
  state: _state,
  dispatch,
  dispatchBoard,
  cursorNodeId,
}: UseBoardDialogsParams): BoardDialogHandlers {
  // Handle project picker selection
  // For linked nodes (transclusions), re-parent the TARGET node, not the link
  const handleProjectSelect = useCallback(
    (targetNode: KNode) => {
      if (!cursorNodeId) {
        dispatch(actions.hideProjectPicker())
        return
      }

      // Get the node at the cursor
      const cursorNode = repo.getNode(cursorNodeId)
      if (!cursorNode) {
        dispatch(actions.hideProjectPicker())
        return
      }

      // Resolve link target: if this is a link, operate on the target
      const nodeToMove = cursorNode.link_to || cursorNode.id

      // Calculate sort order (add at end of target)
      const targetChildren = repo.getChildren(targetNode.id)
      const lastChild = targetChildren[targetChildren.length - 1]
      const newSortOrder = lastChild ? lastChild.parent_idx + 1 : 0

      // Update database via repo (handles memory/disk mode)
      repo.moveNode(nodeToMove, targetNode.id, newSortOrder)

      // Track as recent project
      dispatch(actions.addRecentProject(targetNode.id))

      // Close picker - columns will be re-derived from repo on next render
      dispatch(actions.hideProjectPicker())
    },
    [repo, cursorNodeId, dispatch],
  )

  const handleProjectCancel = useCallback(() => {
    dispatch(actions.hideProjectPicker())
  }, [dispatch])

  // Handler for new item creation
  const handleNewItemCreate = useCallback(
    (_newNodeId: string) => {
      // Close dialog - columns will be re-derived from repo on next render
      dispatch(actions.hideNewItemDialog())
    },
    [dispatch],
  )

  const handleNewItemCancel = useCallback(() => {
    dispatch(actions.hideNewItemDialog())
  }, [dispatch])

  // Handler for search selection - navigate to the selected node
  const handleSearchSelect = useCallback(
    (targetNode: KNode) => {
      // Navigate to the node by dispatching a SELECT action
      if (repo.getNode(targetNode.id)) {
        dispatchBoard({ type: "SELECT", nodeId: targetNode.id })
      }
      dispatch(actions.hideSearchDialog())
    },
    [repo, dispatch, dispatchBoard],
  )

  const handleSearchCancel = useCallback(() => {
    dispatch(actions.hideSearchDialog())
  }, [dispatch])

  return {
    handleProjectSelect,
    handleProjectCancel,
    handleNewItemCreate,
    handleNewItemCancel,
    handleSearchSelect,
    handleSearchCancel,
  }
}
