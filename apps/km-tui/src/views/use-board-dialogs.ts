/**
 * Board Dialog Handlers Hook
 *
 * Encapsulates dialog-related event handlers for the Board component.
 * Handles project picker and new item dialog interactions.
 */
import { useCallback } from "react"
import { type KNode, resolveRelativeDate } from "@km/core"
import { naturalToRRule } from "@km/storage"
import type { BoardAction } from "../board-types.ts"
import type { Repo } from "../repo-context.tsx"
import type { UndoableRepoHandle } from "../undo/undoable-repo.ts"
import type { TUIBoardState } from "../types.ts"
import type { UIState } from "../ui-reducer.ts"
import { activeEditTargetRef } from "inkx"
import { createLogger } from "@beorn/logger"
import { navigateToNode, resolveZoomTarget, type NavigateRepo } from "../navigate-to-node.ts"

const log = createLogger("km:tui:dialogs")

/**
 * Legacy adapter: wraps resolveZoomTarget() to return KNode objects.
 * Existing tests import this — preserved for backward compatibility.
 * @deprecated Use navigateToNode() or resolveZoomTarget() directly for new code.
 */
export function findZoomTarget(
  target: KNode,
  repo: NavigateRepo,
): { zoomTarget: KNode; cursorTarget: KNode } {
  const { zoomTarget: zoomId, cursorTarget: cursorId } = resolveZoomTarget(target, repo)
  const zoomTarget = repo.getNode(zoomId) ?? target
  const cursorTarget = repo.getNode(cursorId) ?? target
  return { zoomTarget, cursorTarget }
}

// =============================================================================
// Types
// =============================================================================

type SetUI = (partial: Partial<UIState> | ((prev: UIState) => Partial<UIState>)) => void

interface UseBoardDialogsParams {
  repo: Repo
  state: TUIBoardState
  setUI: SetUI
  dispatchBoard: (action: BoardAction) => void
  /** Current cursor node ID (from board state) */
  cursorNodeId: string | null
  /** Current root node ID (from board state) */
  rootId: string | null
  /** Undo handle for cursor recording and batching */
  undoHandle: UndoableRepoHandle
}

interface BoardDialogHandlers {
  handleProjectSelect: (targetNode: KNode) => void
  handleProjectCancel: () => void
  handleNewItemCreate: (newNodeId: string) => void
  handleNewItemCancel: () => void
  handleSearchSelect: (targetNode: KNode) => void
  handleSearchCancel: () => void
  handleFilterApply: (text: string) => void
  handleFilterCancel: () => void
  handleDatePromptConfirm: () => void
  handleDatePromptCancel: () => void
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
  setUI,
  dispatchBoard,
  cursorNodeId,
  rootId,
  undoHandle,
}: UseBoardDialogsParams): BoardDialogHandlers {
  // Handle project picker selection
  // For linked nodes (transclusions), re-parent the TARGET node, not the link
  const handleProjectSelect = useCallback(
    (targetNode: KNode) => {
      if (!cursorNodeId) {
        setUI({ showProjectPicker: false })
        return
      }

      // Get the node at the cursor
      const cursorNode = repo.getNode(cursorNodeId)
      if (!cursorNode) {
        setUI({ showProjectPicker: false })
        return
      }

      // Resolve link target: if this is a link, operate on the target
      const nodeToMove = cursorNode.link_to || cursorNode.id

      // Calculate sort order (add at end of target)
      const targetChildren = repo.getChildren(targetNode.id)
      const lastChild = targetChildren[targetChildren.length - 1]
      const newSortOrder = lastChild ? lastChild.parent_idx + 1 : 0

      // Record cursor for undo
      undoHandle.setCursor(cursorNodeId)

      // Update database via repo (handles memory/disk mode)
      repo.moveNode(nodeToMove, targetNode.id, newSortOrder)

      // Track as recent project and close picker
      setUI((prev) => ({
        recentProjectIds: [targetNode.id, ...prev.recentProjectIds.filter((id) => id !== targetNode.id)].slice(0, 10),
        showProjectPicker: false,
      }))
    },
    [repo, cursorNodeId, setUI, undoHandle],
  )

  const handleProjectCancel = useCallback(() => {
    setUI({ showProjectPicker: false })
  }, [setUI])

  // Handler for new item creation
  const handleNewItemCreate = useCallback(
    (_newNodeId: string) => {
      // Close dialog - columns will be re-derived from repo on next render
      setUI({ showNewItemDialog: false })
    },
    [setUI],
  )

  const handleNewItemCancel = useCallback(() => {
    setUI({ showNewItemDialog: false })
  }, [setUI])

  // Handler for search selection - navigate to the selected node.
  // Zooms to the target's grandparent so the target becomes a visible card,
  // or selects in place if the target is already visible.
  const handleSearchSelect = useCallback(
    (targetNode: KNode) => {
      log.debug?.(
        `search select: id=${targetNode.id.slice(-8)} type=${targetNode.type} rootId=${rootId?.slice(-8) ?? "null"}`,
      )
      const target = repo.getNode(targetNode.id)
      if (!target) {
        const errMsg = `search: node not found in repo: ${targetNode.id}`
        log.error?.(errMsg)
        console.error(errMsg)
        setUI({ showSearchDialog: false, searchDialogInitialInput: "", searchScope: "all", searchScopeNodeIds: [] })
        return
      }

      const closeDialog = {
        showSearchDialog: false,
        searchDialogInitialInput: "",
        searchScope: "all" as const,
        searchScopeNodeIds: [] as string[],
      }

      const nav = navigateToNode(target.id, rootId, repo)
      if (!nav) {
        setUI(closeDialog)
        return
      }

      setUI(closeDialog)

      if (nav.action === "SELECT") {
        // Target is already visible (child/grandchild of root, or IS the root)
        dispatchBoard({ type: "SELECT", nodeId: nav.cursorTarget })
      } else {
        // Target is deeper — zoom to make it a visible card.
        // Dispatch zoom synchronously with dialog close so both state changes
        // batch into a single render (avoids the freeze from two separate renders).
        dispatchBoard({
          type: "ZOOM_IN",
          nodeId: nav.zoomTarget!,
          cursorNodeId: nav.cursorTarget,
        })
      }
    },
    [repo, setUI, dispatchBoard, rootId],
  )

  const handleSearchCancel = useCallback(() => {
    setUI({ showSearchDialog: false, searchDialogInitialInput: "", searchScope: "all", searchScopeNodeIds: [] })
  }, [setUI])

  // Filter: apply sets filter text, cancel closes dialog without changing filter
  const handleFilterApply = useCallback(
    (text: string) => {
      setUI({ filterText: text, showFilterDialog: false })
    },
    [setUI],
  )

  const handleFilterCancel = useCallback(() => {
    setUI({ showFilterDialog: false })
  }, [setUI])

  // Date prompt: confirm handler reads input from activeEditTargetRef and resolves dates
  const handleDatePromptConfirm = useCallback(() => {
    const input = activeEditTargetRef.current?.getContent() ?? ""
    const trimmed = input.trim()

    setUI((prev) => {
      const prompt = prev.datePrompt
      if (!prompt) return { datePrompt: null }

      const { field, nodeIds } = prompt
      const useBatch = nodeIds.length > 1

      // Record cursor and batch for multi-node operations
      undoHandle.setCursor(cursorNodeId)
      if (useBatch) undoHandle.startBatch(`Set ${field}`)

      if (field === "recurrence") {
        const rrule = trimmed ? naturalToRRule(trimmed) : null
        if (trimmed && !rrule) {
          // Can't show toast here without toastQueue — just close
          if (useBatch) undoHandle.endBatch()
          return { datePrompt: null }
        }
        for (const nodeId of nodeIds) {
          repo.updateNode(nodeId, { recurrence: rrule })
        }
      } else {
        // Date field: resolve NL → ISO 8601 due_at/start_at
        if (trimmed) {
          const resolved = resolveRelativeDate(trimmed)
          if (!resolved) {
            if (useBatch) undoHandle.endBatch()
            return { datePrompt: null }
          }
          const isoValue = resolved.time ? `${resolved.date}T${resolved.time}` : resolved.date
          for (const nodeId of nodeIds) {
            repo.updateNode(nodeId, { [field]: isoValue })
          }
        } else {
          for (const nodeId of nodeIds) {
            repo.updateNode(nodeId, { [field]: null })
          }
        }
      }

      if (useBatch) undoHandle.endBatch()
      return { datePrompt: null }
    })
  }, [repo, setUI, undoHandle, cursorNodeId])

  const handleDatePromptCancel = useCallback(() => {
    setUI({ datePrompt: null })
  }, [setUI])

  return {
    handleProjectSelect,
    handleProjectCancel,
    handleNewItemCreate,
    handleNewItemCancel,
    handleSearchSelect,
    handleSearchCancel,
    handleFilterApply,
    handleFilterCancel,
    handleDatePromptConfirm,
    handleDatePromptCancel,
  }
}
