/**
 * Board Dialog Handlers Hook
 *
 * Encapsulates dialog-related event handlers for the Board component.
 * Handles item picker (project/tag/assignee) and new item dialog interactions.
 */
import { useCallback } from "react"
import { type KNode, Position, resolveRelativeDate } from "@km/core"
import { naturalToRRule } from "@km/storage"
import { Tree } from "@km/tree"
import type { BoardReducerOp } from "../board/board-types.ts"
import type { Repo } from "../repo-context.tsx"
import type { UndoableRepoHandle } from "../undo/undoable-repo.ts"
import type { PaneUI } from "../state/ui-reducer.ts"
import { activeEditTargetRef } from "@silvery/ag-react"
import { createLogger } from "loggily"
import { useRepoEffect } from "../hooks/use-repo-effect.ts"
import { navigateToNode, resolveZoomTarget, type NavigateRepo } from "../navigation/navigate-to-node.ts"
import type { PickerOption } from "./ItemPicker.tsx"

const log = createLogger("km:tui:dialogs")

/**
 * Legacy adapter: wraps resolveZoomTarget() to return KNode objects.
 * Existing tests import this — preserved for backward compatibility.
 * @deprecated Use navigateToNode() or resolveZoomTarget() directly for new code.
 */
export function findZoomTarget(target: KNode, repo: NavigateRepo): { zoomTarget: KNode; cursorTarget: KNode } {
  const { zoomTarget: zoomId, cursorTarget: cursorId } = resolveZoomTarget(target, repo)
  const zoomTarget = repo.getNode(zoomId) ?? target
  const cursorTarget = repo.getNode(cursorId) ?? target
  return { zoomTarget, cursorTarget }
}

// =============================================================================
// Types
// =============================================================================

type SetUI = (partial: Partial<PaneUI> | ((prev: PaneUI) => Partial<PaneUI>)) => void

interface UseBoardDialogsParams {
  repo: Repo
  setUI: SetUI
  sel: import("@silvery/selection").SelectionStore
  dispatchBoard: (action: BoardReducerOp) => void
  /** Open detail pane via workspace operations (Phase 2 windowing) */
  openDetailPane: () => void
  /** Current cursor node ID (from board state) */
  cursor: string | null
  /** Current root node ID (from board state) */
  rootId: string | null
  /** Undo handle for cursor recording and batching */
  undoHandle: UndoableRepoHandle
}

interface BoardDialogHandlers {
  handlePickerSelect: (option: PickerOption) => void
  handlePickerCancel: () => void
  handleTagSelect: (option: PickerOption) => void
  handleAssigneeSelect: (option: PickerOption) => void
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
  setUI,
  sel,
  dispatchBoard,
  openDetailPane,
  cursor,
  rootId,
  undoHandle,
}: UseBoardDialogsParams): BoardDialogHandlers {
  const repoUpdate = useRepoEffect(repo)

  // Handle item picker selection (move to project)
  // For linked nodes (transclusions), re-parent the TARGET node, not the link
  const handlePickerSelect = useCallback(
    (option: PickerOption) => {
      const targetNode = option.node
      if (!cursor) {
        setUI({ activePicker: null })
        return
      }

      // Get the node at the cursor
      const cursorNode = repo.getNode(cursor)
      if (!cursorNode) {
        setUI({ activePicker: null })
        return
      }

      // Resolve embed target: if this is an embed, operate on the target
      const nodeToMove = cursorNode.symlink_to ?? cursorNode.id

      // Calculate sort order (add at end of target)
      const { sortOrder: newSortOrder } = Tree.toSortOrder(repo, Position.last(targetNode.id))

      // Record cursor for undo
      undoHandle.setCursor(cursor)

      // Update database via repo (handles memory/disk mode)
      repo.moveNode(nodeToMove, targetNode.id, newSortOrder)

      // Track as recent project and close picker
      setUI((prev) => ({
        recentProjectIds: [targetNode.id, ...prev.recentProjectIds.filter((id) => id !== targetNode.id)].slice(0, 10),
        activePicker: null,
      }))
    },
    [repo, cursor, setUI, undoHandle],
  )

  const handlePickerCancel = useCallback(() => {
    setUI({ activePicker: null })
  }, [setUI])

  // Handle tag picker selection — append #tag to current node's content
  const handleTagSelect = useCallback(
    (option: PickerOption) => {
      if (!cursor) {
        setUI({ activePicker: null })
        return
      }

      const node = repo.getNode(cursor)
      if (!node) {
        setUI({ activePicker: null })
        return
      }

      // The option title is "#tagname" — use it directly
      const tag = option.title
      const currentContent = node.content ?? ""

      // Only append if not already present
      if (!currentContent.includes(tag)) {
        undoHandle.setCursor(cursor)
        const newContent = currentContent ? `${currentContent} ${tag}` : tag
        repoUpdate(cursor, { content: newContent })
      }

      setUI({ activePicker: null })
    },
    [repo, cursor, setUI, undoHandle],
  )

  // Handle assignee picker selection — set assigned_to on current node
  const handleAssigneeSelect = useCallback(
    (option: PickerOption) => {
      if (!cursor) {
        setUI({ activePicker: null })
        return
      }

      // The option title is "@name" — strip the @ prefix for assigned_to
      const assignee = option.title.startsWith("@") ? option.title.slice(1) : option.title

      undoHandle.setCursor(cursor)
      repo.updateNode(cursor, { assigned_to: assignee })

      setUI({ activePicker: null })
    },
    [repo, cursor, setUI, undoHandle],
  )

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
        sel.node.select([nav.cursorTarget as import("@silvery/selection").ID])
      } else if (nav.action === "DETAIL_VIEW" && nav.zoomTarget) {
        // Zoom target would produce a flat list — zoom there but also open detail pane
        // so the user sees rich content instead of a single-column flat board.
        dispatchBoard({ type: "ZOOM_IN", nodeId: nav.zoomTarget })
        if (nav.cursorTarget) sel.node.select([nav.cursorTarget as import("@silvery/selection").ID])
        openDetailPane()
      } else {
        // Target is deeper — zoom to make it a visible card.
        // Dispatch zoom synchronously with dialog close so both state changes
        // batch into a single render (avoids the freeze from two separate renders).
        if (nav.zoomTarget) {
          dispatchBoard({ type: "ZOOM_IN", nodeId: nav.zoomTarget })
          if (nav.cursorTarget) sel.node.select([nav.cursorTarget as import("@silvery/selection").ID])
        }
      }
    },
    [repo, setUI, dispatchBoard, openDetailPane, rootId],
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
      undoHandle.setCursor(cursor)
      if (useBatch) undoHandle.startBatch(`Set ${field}`)

      if (field === "rrule") {
        const rrule = trimmed ? naturalToRRule(trimmed) : null
        if (trimmed && !rrule) {
          // Can't show toast here without toastQueue — just close
          if (useBatch) undoHandle.endBatch()
          return { datePrompt: null }
        }
        for (const nodeId of nodeIds) {
          repo.updateNode(nodeId, { rrule: rrule ?? undefined })
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
  }, [repo, setUI, undoHandle, cursor])

  const handleDatePromptCancel = useCallback(() => {
    setUI({ datePrompt: null })
  }, [setUI])

  return {
    handlePickerSelect,
    handlePickerCancel,
    handleTagSelect,
    handleAssigneeSelect,
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
