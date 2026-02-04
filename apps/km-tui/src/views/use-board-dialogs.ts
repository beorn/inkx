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
import { createConditionalLogger } from "@beorn/logger"

const log = createConditionalLogger("km:tui:dialogs")

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
  // Uses "smart zoom" - only zooms when necessary to make target visible
  const handleSearchSelect = useCallback(
    (targetNode: KNode) => {
      log.debug?.(
        `handleSearchSelect: targetNode.id=${targetNode.id.slice(-8)} type=${targetNode.type} rootId=${rootId?.slice(-8) ?? "null"}`,
      )
      const target = repo.getNode(targetNode.id)
      if (!target) {
        log.error?.(
          `handleSearchSelect: node not found in repo: ${targetNode.id}`,
        )
        dispatch(actions.hideSearchDialog())
        return
      }

      // If target IS the current root, just close dialog (already viewing it)
      if (target.id === rootId) {
        dispatch(actions.hideSearchDialog())
        return
      }

      // Walk up ancestor chain to check if target (or any ancestor) is visible
      // A node is visible if its parent is root (column) or grandparent is root (card)
      // Cursor can be set to any descendant of a visible card
      let current: KNode | null = target
      let depth = 0
      while (current) {
        const parentId = current.parent_id
        const parent = parentId ? repo.getNode(parentId) : null
        const grandparentId = parent?.parent_id
        log.debug?.(
          `  walk[${depth}]: current=${current.id.slice(-8)} parent=${parentId?.slice(-8) ?? "null"} grandparent=${grandparentId?.slice(-8) ?? "null"}`,
        )

        // Check if this ancestor is visible in current view
        if (parentId === rootId || grandparentId === rootId) {
          // Target is a descendant of a visible node, just SELECT
          log.debug?.(`  → SELECT: target visible at depth ${depth}`)
          dispatchBoard({ type: "SELECT", nodeId: target.id })
          dispatch(actions.hideSearchDialog())
          return
        }

        // Move up to parent
        current = parent
        depth++
      }

      // Target not visible in current view - need to zoom
      // Find the closest ancestor to zoom to (prefer showing target as card)
      log.debug?.(
        `  → ZOOM needed: walked ${depth} levels without finding root`,
      )
      const parentId = target.parent_id
      const parent = parentId ? repo.getNode(parentId) : null
      const grandparentId = parent?.parent_id

      if (grandparentId) {
        // Zoom to grandparent: target shows as a card
        log.debug?.(
          `  → ZOOM_IN to grandparent=${grandparentId.slice(-8)} cursor=${target.id.slice(-8)}`,
        )
        dispatchBoard({
          type: "ZOOM_IN",
          nodeId: grandparentId,
          cursorNodeId: target.id,
        })
      } else if (parentId) {
        // Zoom to parent: target shows as column header
        log.debug?.(
          `  → ZOOM_IN to parent=${parentId.slice(-8)} cursor=${target.id.slice(-8)}`,
        )
        dispatchBoard({
          type: "ZOOM_IN",
          nodeId: parentId,
          cursorNodeId: target.id,
        })
      } else {
        // No ancestors, zoom into target itself
        log.debug?.(`  → ZOOM_IN to target itself (no ancestors)`)
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
