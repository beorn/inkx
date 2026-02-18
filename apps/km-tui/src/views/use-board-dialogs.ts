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

const log = createLogger("km:tui:dialogs")

/**
 * Find appropriate zoom and cursor targets for a search result node.
 * Walks up the ancestor chain to determine where to zoom so the target is visible.
 */
function findZoomTarget(
  target: KNode,
  repo: { getNode(id: string): KNode | null },
): { zoomTarget: KNode; cursorTarget: KNode } {
  // Build ancestor chain: [target, parent, grandparent, great-grandparent, ...]
  const ancestors: KNode[] = [target]
  let ancestor: KNode | null = target
  while (ancestor?.parent_id) {
    const parent = repo.getNode(ancestor.parent_id)
    if (parent) ancestors.push(parent)
    ancestor = parent
  }
  log.debug?.(`search: ancestor chain has ${ancestors.length} nodes: ${ancestors.map((n) => n.type).join(" > ")}`)

  // Find best zoom target based on depth:
  // depth >= 3: zoom to great-grandparent, cursor on parent (card)
  // depth 2: zoom to grandparent, cursor on target (card)
  // depth 1: zoom to parent, cursor on target (column)
  // depth 0: zoom to target itself
  let zoomTarget: KNode = target
  let cursorTarget: KNode = target

  const [, parent, grandparent, greatGrandparent] = ancestors

  if (ancestors.length >= 4 && greatGrandparent && parent) {
    zoomTarget = greatGrandparent
    cursorTarget = parent
    log.debug?.(
      `search: ZOOM_IN to great-grandparent=${zoomTarget.id.slice(-8)}, cursor on parent=${cursorTarget.id.slice(-8)}`,
    )
  } else if (ancestors.length >= 3 && grandparent) {
    zoomTarget = grandparent
    log.debug?.(`search: ZOOM_IN to grandparent=${zoomTarget.id.slice(-8)}, cursor on target`)
  } else if (ancestors.length >= 2 && parent) {
    zoomTarget = parent
    log.debug?.(`search: ZOOM_IN to parent=${zoomTarget.id.slice(-8)}, cursor on target`)
  } else {
    log.debug?.(`search: ZOOM_IN to target itself`)
  }

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

  // Handler for search selection - navigate to the selected node
  // Uses "smart zoom" - only zooms when necessary to make target visible
  const handleSearchSelect = useCallback(
    (targetNode: KNode) => {
      // Debug logging - enable with LOG_LEVEL=debug
      log.debug?.(
        `search select: id=${targetNode.id.slice(-8)} type=${targetNode.type} rootId=${rootId?.slice(-8) ?? "null"}`,
      )
      const target = repo.getNode(targetNode.id)
      if (!target) {
        // This is a programming error - the search result came from the repo
        // but the node is no longer there. This shouldn't happen in normal use.
        const errMsg = `search: node not found in repo: ${targetNode.id}`
        log.error?.(errMsg)
        console.error(errMsg)
        setUI({ showSearchDialog: false, searchDialogInitialInput: "", searchScope: "all", searchScopeNodeIds: [] })
        return
      }

      // If target IS the current root, just close dialog (already viewing it)
      if (target.id === rootId) {
        setUI({ showSearchDialog: false, searchDialogInitialInput: "", searchScope: "all", searchScopeNodeIds: [] })
        return
      }

      // Walk up ancestor chain to check if target (or any ancestor) is visible
      // A node is visible if its parent is root (column) or grandparent is root (card)
      // Cards are children of columns (grandparent = root)
      // Columns are direct children of root (parent = root)
      let current: KNode | null = target
      let depth = 0
      while (current) {
        const parentId: string | null = current.parent_id
        const parent: KNode | null = parentId ? repo.getNode(parentId) : null
        const grandparentId: string | null | undefined = parent?.parent_id

        // Check if CURRENT node is visible in current view
        if (grandparentId === rootId) {
          // current is a card (its grandparent is root, so parent is column)
          // Select current (the card), not the deeply nested target
          log.debug?.(`search: SELECT card at depth ${depth}: ${current.id.slice(-8)}`)
          dispatchBoard({ type: "SELECT", nodeId: current.id })
          setUI({ showSearchDialog: false, searchDialogInitialInput: "", searchScope: "all", searchScopeNodeIds: [] })
          return
        }
        if (parentId === rootId) {
          // current is a column (direct child of root)
          // Can't select columns, need to go into it - fall through to zoom logic
          log.debug?.(`search: found column at depth ${depth}, will zoom instead`)
          break
        }

        // Move up to parent
        current = parent
        depth++
      }

      // Target not visible in current view - need to zoom
      log.debug?.(`search: ZOOM needed, walked ${depth} levels`)

      const { zoomTarget, cursorTarget } = findZoomTarget(target, repo)

      dispatchBoard({
        type: "ZOOM_IN",
        nodeId: zoomTarget.id,
        cursorNodeId: cursorTarget.id,
      })

      setUI({ showSearchDialog: false, searchDialogInitialInput: "", searchScope: "all", searchScopeNodeIds: [] })
    },
    [repo, setUI, dispatchBoard, rootId],
  )

  const handleSearchCancel = useCallback(() => {
    setUI({ showSearchDialog: false, searchDialogInitialInput: "", searchScope: "all", searchScopeNodeIds: [] })
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
    handleDatePromptConfirm,
    handleDatePromptCancel,
  }
}
