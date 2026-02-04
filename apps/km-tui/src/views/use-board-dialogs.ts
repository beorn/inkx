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
  /** Current root node ID (from board state) */
  rootId: string | null
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
  rootId,
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
  // Uses "smart zoom" to ensure target becomes visible (only zooms when necessary)
  const handleSearchSelect = useCallback(
    (targetNode: KNode) => {
      const target = repo.getNode(targetNode.id)
      if (!target) {
        dispatch(actions.hideSearchDialog())
        return
      }

      // If target IS the current root, just close dialog (already viewing it)
      if (target.id === rootId) {
        dispatch(actions.hideSearchDialog())
        return
      }

      // Check if target is visible in current view:
      // - As a column: target.parent_id === rootId
      // - As a card: target's parent's parent_id === rootId
      const parentId = target.parent_id
      const parent = parentId ? repo.getNode(parentId) : null
      const grandparentId = parent?.parent_id

      const isVisibleAsColumn = parentId === rootId
      const isVisibleAsCard = grandparentId === rootId

      if (isVisibleAsColumn || isVisibleAsCard) {
        // Target already visible, just move cursor
        dispatchBoard({ type: "SELECT", nodeId: target.id })
      } else if (parentId) {
        // Target not visible, zoom to parent to make it visible as a card
        dispatchBoard({
          type: "ZOOM_IN",
          nodeId: parentId,
          cursorNodeId: target.id,
        })
      } else {
        // No parent (root-level node), zoom into it
        dispatchBoard({
          type: "ZOOM_IN",
          nodeId: target.id,
        })
      }

      dispatch(actions.hideSearchDialog())
    },
    [repo, dispatch, dispatchBoard, rootId],
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
