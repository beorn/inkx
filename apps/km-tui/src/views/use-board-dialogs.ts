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
import { popDialogMode } from "../dialog-guard.ts"
import type { ID } from "@silvery/selection"

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
  handleItemPickerSelect: (option: PickerOption) => void
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

  /**
   * Shared navigate-to-picked-node helper. Used by every type-specific
   * picker handler when `pendingVerb === "goto"` — a user who opened the
   * context/tag/project picker via a `goto` chord (e.g. `g @` → go to
   * context) expects Enter to navigate to the picked node, not to run
   * the type's default action (assign/add/move).
   *
   * Fixes the km-tui.omnibox-* Enter-does-nothing regression where
   * `@delei + Enter` silently set `assigned_to = "delei"` on the cursor
   * instead of navigating to @delei. See the verb-switch in
   * `handleItemPickerSelect` for the canonical pattern.
   */
  const navigateToPickedNode = useCallback(
    (targetId: string) => {
      const target = repo.getNode(targetId)
      if (!target) return
      const nav = navigateToNode(target.id, rootId, repo)
      if (!nav) return
      if (nav.action === "SELECT") {
        sel.node.select([nav.cursorTarget as ID])
      } else if (nav.zoomTarget) {
        dispatchBoard({ type: "ZOOM_IN", nodeId: nav.zoomTarget })
        // Mirror the selection tree root so the sel-root-matches-rootId
        // invariant holds. ZOOM_IN changes pane.rootId but doesn't touch
        // sel.root on its own — every goto path that bypasses
        // syncPaneSignals must set it explicitly. Skipping this is how
        // the omnibox go-to path crashed on @delei this morning (see
        // km-tui.cursor-gate-refactor / sixth cursor invariant crash).
        sel.root.set(nav.zoomTarget as ID)
        if (nav.cursorTarget) sel.node.select([nav.cursorTarget as ID])
        if (nav.action === "DETAIL_VIEW") openDetailPane()
      }
    },
    [repo, rootId, sel, dispatchBoard, openDetailPane],
  )

  // Handle project picker selection — verb-aware.
  //   move (default) → reparent cursor under picked project
  //   goto           → navigate to picked project
  const handlePickerSelect = useCallback(
    (option: PickerOption) => {
      const targetNode = option.node

      // Verb dispatch: `goto` delegates to the shared navigation helper.
      // Any other verb (move, or no verb for legacy triggers) falls through
      // to the project-specific "reparent under target" semantics below.
      setUI((prev) => {
        const verb = prev.activePicker?.pendingVerb
        if (verb === "goto") {
          navigateToPickedNode(targetNode.id)
          return { activePicker: null }
        }

        // Default behavior: move cursor under picked project
        if (!cursor) return { activePicker: null }
        const cursorNode = repo.getNode(cursor)
        if (!cursorNode) return { activePicker: null }
        const nodeToMove = cursorNode.embed_of ?? cursorNode.id
        const { sortOrder: newSortOrder } = Tree.toSortOrder(repo, Position.last(targetNode.id))
        undoHandle.setCursor(cursor)
        repo.moveNode(nodeToMove, targetNode.id, newSortOrder)

        return {
          recentProjectIds: [targetNode.id, ...prev.recentProjectIds.filter((id) => id !== targetNode.id)].slice(0, 10),
          activePicker: null,
        }
      })
    },
    [repo, cursor, setUI, undoHandle, navigateToPickedNode],
  )

  const handlePickerCancel = useCallback(() => {
    setUI({ activePicker: null })
  }, [setUI])

  // Handle tag picker selection — verb-aware.
  //   add (default) → append #tag to current node's content
  //   goto          → navigate to picked tag node
  const handleTagSelect = useCallback(
    (option: PickerOption) => {
      setUI((prev) => {
        const verb = prev.activePicker?.pendingVerb
        if (verb === "goto") {
          navigateToPickedNode(option.node.id)
          return { activePicker: null }
        }

        // Default behavior: append #tag to cursor's content
        if (!cursor) return { activePicker: null }
        const node = repo.getNode(cursor)
        if (!node) return { activePicker: null }
        const tag = option.title
        const currentContent = node.content ?? ""
        if (!currentContent.includes(tag)) {
          undoHandle.setCursor(cursor)
          const newContent = currentContent ? `${currentContent} ${tag}` : tag
          repoUpdate(cursor, { content: newContent })
        }
        return { activePicker: null }
      })
    },
    [repo, cursor, setUI, undoHandle, repoUpdate, navigateToPickedNode],
  )

  // Handle assignee picker selection — verb-aware.
  //   assign (default) → set assigned_to on cursor node
  //   goto             → navigate to picked assignee/context node
  //
  // This fixes the user-reported `@delei + Enter → nothing happens` bug.
  // Before this fix the goto chord (g @ → "Go to context") opened the
  // assignee picker and then silently set assigned_to on the cursor
  // because the handler ignored pendingVerb entirely.
  const handleAssigneeSelect = useCallback(
    (option: PickerOption) => {
      setUI((prev) => {
        const verb = prev.activePicker?.pendingVerb
        if (verb === "goto") {
          navigateToPickedNode(option.node.id)
          return { activePicker: null }
        }

        // Default behavior: write assigned_to on cursor node
        if (!cursor) return { activePicker: null }
        const assignee = option.title.startsWith("@") ? option.title.slice(1) : option.title
        undoHandle.setCursor(cursor)
        repo.updateNode(cursor, { assigned_to: assignee })
        return { activePicker: null }
      })
    },
    [repo, cursor, setUI, undoHandle, navigateToPickedNode],
  )

  // Handle item picker selection — verb-aware dispatch.
  //   goto   → navigate cursor to picked item
  //   move   → reparent current selection (or cursor) under picked item
  //   link   → insert [[name]] wikilink into cursor's content
  //   create → create a new child under picked item and navigate there
  const handleItemPickerSelect = useCallback(
    (option: PickerOption) => {
      const picker = repo // typing shim
      void picker
      const targetNode = option.node
      const target = repo.getNode(targetNode.id)
      if (!target) {
        popDialogMode()
        setUI({ activePicker: null })
        return
      }

      // Read the pending verb off the live UI state via the setUI updater
      // (state-snapshot style). This avoids threading pendingVerb as a ref.
      setUI((prev) => {
        const verb = prev.activePicker?.pendingVerb ?? "goto"

        switch (verb) {
          case "goto": {
            // Navigate — same logic as search select.
            const nav = navigateToNode(target.id, rootId, repo)
            if (nav) {
              if (nav.action === "SELECT") {
                sel.node.select([nav.cursorTarget as ID])
              } else if (nav.zoomTarget) {
                dispatchBoard({ type: "ZOOM_IN", nodeId: nav.zoomTarget })
                // See navigateToPickedNode above — ZOOM_IN must pair with
                // sel.root.set() or the sel-root-matches-rootId invariant
                // fires. Auto-heal covers it, but skipping the explicit
                // sync means we're relying on heal instead of correctness.
                sel.root.set(nav.zoomTarget as ID)
                if (nav.cursorTarget) sel.node.select([nav.cursorTarget as ID])
                if (nav.action === "DETAIL_VIEW") openDetailPane()
              }
            }
            break
          }

          case "move": {
            // Reparent cursor node (or whole selection) to picked target.
            if (!cursor) break
            const cursorNode = repo.getNode(cursor)
            if (!cursorNode) break
            // Symlink: operate on the embed target, not the embed node
            const nodeToMove = cursorNode.embed_of ?? cursorNode.id
            if (nodeToMove === target.id) break // can't reparent into self
            const { sortOrder: newSortOrder } = Tree.toSortOrder(repo, Position.last(target.id))
            undoHandle.setCursor(cursor)
            repo.moveNode(nodeToMove, target.id, newSortOrder)
            break
          }

          case "link": {
            // Insert a [[name]] wikilink into the cursor node's content.
            if (!cursor) break
            const node = repo.getNode(cursor)
            if (!node) break
            const label = option.title || target.name || "link"
            const wikilink = `[[${label}]]`
            const currentContent = node.content ?? ""
            const newContent = currentContent ? `${currentContent} ${wikilink}` : wikilink
            undoHandle.setCursor(cursor)
            repoUpdate(cursor, { content: newContent })
            break
          }

          case "create": {
            // Create a new child under the picked item and navigate cursor to it.
            const { sortOrder } = Tree.toSortOrder(repo, Position.last(target.id))
            const newId = repo.addNode(target.id, {
              type: "h",
              content: "New item",
              parent_id: target.id,
              parent_idx: sortOrder,
              item: { list: "-" },
            })
            undoHandle.setCursor(newId)
            sel.node.select([newId as ID])
            break
          }
        }

        // Track recency for project-style lists
        const prevRecent = prev.recentProjectIds.filter((id) => id !== target.id)
        return {
          activePicker: null,
          recentProjectIds: [target.id, ...prevRecent].slice(0, 10),
        }
      })
      popDialogMode()
    },
    [repo, cursor, rootId, setUI, sel, dispatchBoard, openDetailPane, undoHandle, repoUpdate],
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
        // Mirror sel.root to pane.rootId so the sel-root-matches-rootId
        // invariant holds — see navigateToPickedNode for the full rationale.
        sel.root.set(nav.zoomTarget as import("@silvery/selection").ID)
        if (nav.cursorTarget) sel.node.select([nav.cursorTarget as import("@silvery/selection").ID])
        openDetailPane()
      } else {
        // Target is deeper — zoom to make it a visible card.
        // Dispatch zoom synchronously with dialog close so both state changes
        // batch into a single render (avoids the freeze from two separate renders).
        if (nav.zoomTarget) {
          dispatchBoard({ type: "ZOOM_IN", nodeId: nav.zoomTarget })
          sel.root.set(nav.zoomTarget as import("@silvery/selection").ID)
          if (nav.cursorTarget) sel.node.select([nav.cursorTarget as import("@silvery/selection").ID])
        }
      }
    },
    [repo, setUI, dispatchBoard, openDetailPane, rootId, sel],
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
    handleItemPickerSelect,
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
