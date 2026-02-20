/**
 * Board Action Handlers - Edit Operations
 *
 * Handles node creation, deletion, status changes, and card shifting.
 *
 * ## Batch Operations Convention
 *
 * Every card operation is inherently batch-aware (single = batch of 1).
 * Each handler follows this structure:
 *
 * 1. GATHER — `getSelectedCards(ctx)` returns multi-selected or cursor card
 * 2. VALIDATE — all-or-nothing: if ANY card fails, NONE execute
 * 3. CONFIRM (optional) — set UI state, re-enter via separate action
 * 4. EXECUTE — perform mutations on all cards
 * 5. CLEANUP — operation-specific (see selection cleanup rules)
 *
 * Selection cleanup after batch:
 * - Cards destroyed → clearSelection (delete)
 * - Cards moved in tree → clearSelection (indent, outdent)
 * - Cards repositioned → rebuildSelection (move up/down/left/right)
 * - Cards modified in place → keep selection (status toggle)
 */

import { getMarkerForStatus, decomposeDatetime, type KNode, type TaskMarker, type TaskStatus } from "@km/core"
import { type ActionResult, boundary, ok } from "@km/commands"
import { getNextOccurrence } from "@km/storage"
import { moveCardInColumn, moveCardToColumn } from "../keyboard/keyboard-card-ops.ts"
import { clearSelection, getSelectedCards, refreshBoardState } from "../keyboard/keyboard-helpers.ts"
import type { ActionCtx } from "../tui-context.ts"
import type { ColumnState } from "../types.ts"

/**
 * Determine the correct heading depth for a new sibling node.
 * Prefers the sibling's depth (same level), but if the sibling has no depth
 * (e.g. embed/paragraph), computes parent depth + 1 to stay nested correctly.
 * Without this, creating a section among embeds under ## Processing produces
 * a ## heading (depth 2) that the markdown parser sees as a sibling of
 * Processing rather than a child — breaking the tree on re-parse.
 */
function siblingOrParentDepth(
  sibling: KNode,
  parent: { id: string },
  repo: { getNode(id: string): KNode | undefined },
): number | undefined {
  const sibDepth = sibling.data?.depth as number | undefined
  if (sibDepth) return sibDepth

  const parentNode = repo.getNode(parent.id)
  const parentDepth = parentNode?.data?.depth as number | undefined
  if (parentDepth) return parentDepth + 1

  // Parent is file node (no depth) → children are H2 (depth 2)
  return 2
}

// Render flush flag — set by handleAddNodeAfter when a new InlineEditField
// needs to mount before the next event handler runs.
let _needsFlush = false

/** Consume and return the render flush flag. */
export function needsRenderFlush(): boolean {
  const result = _needsFlush
  _needsFlush = false
  return result
}

/**
 * Delete the selected node(s) — with confirmation for non-empty nodes.
 *
 * Handles three levels:
 * - Board level (cursor on board title): not allowed
 * - Column level (cursor on column header): always confirms (columns have cards)
 * - Card level: confirms if node has children, backlinks, or metadata
 *
 * Multi-select: deletes all selected cards. Shows confirmation if ANY node
 * has children/backlinks/metadata. All-or-nothing after confirmation.
 */
export function handleDeleteNode(ctx: ActionCtx): void {
  const { layout, repo } = ctx
  const col = layout.columns[layout.colIndex]
  const card = col?.cards[layout.cardIndex]

  if (!card && col) {
    // Column-level delete — confirmation only if non-empty
    handleDeleteColumn(ctx, col)
    return
  }

  if (!card) return // Board level — nothing to delete

  const cards = getSelectedCards(ctx)
  if (cards.length === 0) return

  // Aggregate impact across all cards
  const TRIVIAL_DATA_KEYS = new Set(["depth", "rules", "lang", "meta", "completion"])
  let totalChildCount = 0
  let totalBacklinkCount = 0
  let anyHasMetadata = false

  for (const c of cards) {
    totalChildCount += repo.getChildren(c.node.id).length
    totalBacklinkCount += repo.getRenameImpact(c.node.id).backlinks.length
    const significantKeys = c.node.data
      ? Object.keys(c.node.data).filter((k) => !k.startsWith("_") && !TRIVIAL_DATA_KEYS.has(k))
      : []
    if (significantKeys.length > 0) anyHasMetadata = true
  }

  if (totalChildCount > 0 || totalBacklinkCount > 0 || anyHasMetadata) {
    // Non-trivial: show confirmation dialog
    const firstCard = cards[0]
    if (!firstCard) return
    const targetNode = firstCard.node
    const title =
      cards.length > 1 ? `${cards.length} selected nodes` : (targetNode.name ?? targetNode.content ?? targetNode.id)
    ctx.setUI({
      deleteConfirm: {
        nodeIds: cards.map((c) => c.node.id),
        title,
        childCount: totalChildCount,
        backlinkCount: totalBacklinkCount,
        hasMetadata: anyHasMetadata,
      },
    })
    return
  }

  // All cards are empty: delete immediately
  executeBatchDelete(
    ctx,
    cards.map((c) => c.node.id),
  )
}

/**
 * Handle column deletion — skips confirmation if empty (no descendants, no backlinks).
 *
 * Counts all descendants recursively for the warning message.
 */
function handleDeleteColumn(
  ctx: ActionCtx,
  col: {
    node: { id: string; name?: string | null; content?: string | null; data?: Record<string, unknown> | null }
    cards: { node: { id: string } }[]
  },
): void {
  const { repo } = ctx
  const nodeId = col.node.id

  // Count total descendants (cards + their children recursively)
  let totalDescendants = 0
  const countDescendants = (id: string) => {
    const children = repo.getChildren(id)
    totalDescendants += children.length
    for (const child of children) countDescendants(child.id)
  }
  countDescendants(nodeId)

  const impact = repo.getRenameImpact(nodeId)

  if (totalDescendants === 0 && impact.backlinks.length === 0) {
    // Empty column: delete immediately without confirmation
    executeBatchDelete(ctx, [nodeId])
    return
  }

  ctx.setUI({
    deleteConfirm: {
      nodeIds: [nodeId],
      title: col.node.name ?? col.node.content ?? nodeId,
      childCount: totalDescendants,
      backlinkCount: impact.backlinks.length,
    },
  })
}

/**
 * Execute node deletion and adjust cursor position.
 *
 * Recursively deletes all descendants first (bottom-up), then the node itself.
 * Adjusts cursor: for card-level deletes, moves to adjacent card;
 * for column-level deletes, moves to adjacent column.
 */
export function executeDelete(ctx: ActionCtx, nodeId: string): void {
  executeBatchDelete(ctx, [nodeId])
}

/**
 * Execute batch deletion of multiple nodes and adjust cursor position.
 *
 * Deletes nodes bottom-up (highest index first) to avoid index invalidation.
 * Clears multi-selection after deletion.
 */
export function executeBatchDelete(ctx: ActionCtx, nodeIds: string[]): void {
  const { layout, repo } = ctx

  // Recursively delete all descendants bottom-up
  const deleteRecursive = (id: string) => {
    const children = repo.getChildren(id)
    for (const child of children) {
      deleteRecursive(child.id)
    }
    repo.deleteNode(id)
  }

  // Determine if we're deleting a column (direct child of root)
  const firstNode = repo.getNode(nodeIds[0] ?? "")
  const isDeletingColumn = firstNode?.parent_id === ctx.rootId

  // Batch all deletions into a single undo entry
  ctx.undoHandle.setCursor(ctx.cursorNodeId)
  ctx.undoHandle.startBatch("Delete")

  // Delete bottom-up to avoid index invalidation
  for (const nodeId of [...nodeIds].reverse()) {
    deleteRecursive(nodeId)
  }

  ctx.undoHandle.endBatch()

  clearSelection(ctx)

  if (isDeletingColumn) {
    refreshBoardState(ctx, {
      colIndex: Math.max(0, layout.colIndex - 1),
      cardIndex: 0,
    })
  } else {
    refreshBoardState(ctx, {
      cardIndex: (c) => Math.min(layout.cardIndex, Math.max(0, (c?.cards.length ?? 1) - 1)),
    })
  }
}

/**
 * Create a new sibling node after the current card and enter inline edit on it.
 */
export function handleAddNodeAfter(ctx: ActionCtx): void {
  handleAddNode(ctx, "after")
}

/**
 * Create a new sibling node before the current card and enter inline edit on it.
 */
export function handleAddNodeBefore(ctx: ActionCtx): void {
  handleAddNode(ctx, "before")
}

/**
 * Shared implementation: create sibling node before/after cursor and enter inline edit.
 *
 * Sort order is placed as midpoint between cursor and adjacent sibling.
 * Inherits node type from cursor node (task → task, section → section).
 */
function handleAddNode(ctx: ActionCtx, position: "before" | "after"): void {
  const { layout, repo } = ctx
  const col = layout.columns[layout.colIndex]
  if (!col) return

  // Query repo for fresh children (layout.columns.cards may be stale after prior addNode)
  const siblings = repo.getChildren(col.node.id)
  const currentSibIdx = siblings.findIndex((s) => s.id === ctx.cursorNodeId)
  const currentNode = siblings[currentSibIdx]
  if (!currentNode) return

  // Sort order: midpoint between current and adjacent sibling
  const currentIdx = currentNode.parent_idx ?? 0
  const adjacentSibling = siblings[currentSibIdx + (position === "after" ? 1 : -1)]
  const adjacentIdx = adjacentSibling?.parent_idx ?? currentIdx + (position === "after" ? 1 : -1)
  const newSortOrder = (currentIdx + adjacentIdx) / 2

  // Inherit type + depth from current node
  // Tasks (li with task_marker) create new tasks; outline items create new outline items
  const isCurrentTask = currentNode.task_marker !== undefined
  const newNode: Partial<KNode> = {
    type: isCurrentTask ? "li" : "oi",
    content: "",
    parent_idx: newSortOrder,
  }
  if (isCurrentTask) {
    newNode.task_status = "todo"
    newNode.task_marker = "[ ]"
    newNode.list_marker = currentNode.list_marker ?? "-"
  } else if (newNode.type === "oi") {
    newNode.fstype = "mdsection"
  }
  // Depth: inherit from sibling if available, otherwise compute from parent.
  // Embeds/paragraphs have no depth — using the default (2) would create a
  // same-level heading that breaks the markdown tree on re-parse.
  const depth = siblingOrParentDepth(currentNode, col.node, repo)
  if (depth) {
    newNode.data = { ...newNode.data, depth }
  }

  ctx.undoHandle.setCursor(ctx.cursorNodeId)
  const newId = repo.addNode(col.node.id, newNode)

  // Refresh board state — usePositionHints because new node isn't in nodeIndex yet
  refreshBoardState(ctx, {
    cardIndex: position === "after" ? currentSibIdx + 1 : currentSibIdx,
    usePositionHints: true,
  })

  ctx.setUI({ inlineEditBlock: { nodeId: newId, blockIndex: 0 } })
  _needsFlush = true
}

/**
 * Duplicate a node: create a copy immediately after it with the same content and type.
 * Pushes an undo entry that deletes the new node.
 */
export function handleDuplicateNode(ctx: ActionCtx, nodeId: string): void {
  const { layout, repo } = ctx
  const col = layout.columns[layout.colIndex]
  if (!col) return

  const sourceNode = repo.getNode(nodeId)
  if (!sourceNode) return

  // Find position in siblings
  const siblings = repo.getChildren(col.node.id)
  const currentSibIdx = siblings.findIndex((s) => s.id === nodeId)
  if (currentSibIdx === -1) return

  const currentIdx = sourceNode.parent_idx ?? 0
  const nextSibling = siblings[currentSibIdx + 1]
  const nextIdx = nextSibling?.parent_idx ?? currentIdx + 1
  const newSortOrder = (currentIdx + nextIdx) / 2

  const newNode: Partial<KNode> = {
    type: sourceNode.type,
    content: sourceNode.content,
    parent_idx: newSortOrder,
    data: sourceNode.data ? { ...sourceNode.data } : undefined,
  }
  if (sourceNode.task_status) {
    newNode.task_status = sourceNode.task_status
    newNode.task_marker = sourceNode.task_marker
  }
  if (sourceNode.list_marker) {
    newNode.list_marker = sourceNode.list_marker
  }
  if (sourceNode.fstype) {
    newNode.fstype = sourceNode.fstype
  }

  const parentId = col.node.id
  // Auto-recorded by undoable repo — no manual undo entry needed
  ctx.undoHandle.setCursor(ctx.cursorNodeId)
  repo.addNode(parentId, newNode)

  refreshBoardState(ctx, {
    cardIndex: currentSibIdx + 1,
    usePositionHints: true,
  })
}

/**
 * Confirm move operation - move selected nodes to target column.
 */
export function handleConfirmMove(ctx: ActionCtx): void {
  const { layout, repo, dispatchBoard } = ctx
  const sourceNodeIds = ctx.moveSourceNodes
  if (sourceNodeIds.length === 0) return
  const targetCol = layout.columns[layout.colIndex]
  if (!targetCol) return

  // Batch all moves into a single undo entry
  ctx.undoHandle.setCursor(ctx.cursorNodeId)
  ctx.undoHandle.startBatch("Move cards")

  let newSortOrder =
    targetCol.cards.length > 0 ? (targetCol.cards[targetCol.cards.length - 1]?.node.parent_idx ?? 0) + 1 : 0
  for (const nodeId of sourceNodeIds) {
    repo.moveNode(nodeId, targetCol.node.id, newSortOrder)
    newSortOrder++
  }

  ctx.undoHandle.endBatch()
  dispatchBoard({ type: "CONFIRM_MOVE" })
  refreshBoardState(ctx, {
    colIndex: layout.colIndex,
    cardIndex: () => targetCol.cards.length,
  })
}

/**
 * Cycle task status (todo → wip → blocked → done → dropped).
 *
 * Batch-aware: when multi-selection is active, cycles all selected cards.
 * Each card advances from its own current status independently.
 * Selection is preserved — status is an in-place modification.
 */
export function handleTaskStatusCycle(ctx: ActionCtx): void {
  const cards = getSelectedCards(ctx)
  if (cards.length === 0) return

  // Batch all status changes (especially recurring task clone: updateNode + addNode)
  ctx.undoHandle.setCursor(ctx.cursorNodeId)
  ctx.undoHandle.startBatch("Toggle status")

  const statusCycle: TaskStatus[] = ["todo", "wip", "blocked", "done", "dropped"]

  for (const c of cards) {
    const targetId = c.node.link_to || c.node.id
    const targetNode = c.node.link_to ? ctx.repo.getNode(c.node.link_to) : c.node
    const currentStatus = targetNode?.task_status || "todo"
    const currentIndex = statusCycle.indexOf(currentStatus)
    const nextIndex = (currentIndex + 1) % statusCycle.length
    const nextStatus = statusCycle[nextIndex] ?? "todo"

    // Recurrence: when a recurring task transitions to "done", clone it with next due date
    const dueParts = decomposeDatetime(targetNode?.due_at)
    if (nextStatus === "done" && targetNode?.recurrence && dueParts?.date) {
      const nextDue = getNextOccurrence(targetNode.recurrence, dueParts.date)
      // Mark current task done with completion timestamp
      ctx.repo.updateNode(targetId, {
        task_status: "done",
        task_marker: "[x]",
        completed_at: Date.now(),
      })
      if (nextDue) {
        // Clone task with next due date, reset to todo
        // Compose due_at from the next due date + existing time
        const nextDueAt = dueParts.time ? `${nextDue}T${dueParts.time}` : nextDue
        const parentId = targetNode.parent_id
        if (parentId) {
          ctx.repo.addNode(parentId, {
            type: targetNode.type,
            content: targetNode.content,
            task_status: "todo",
            task_marker: "[ ]",
            list_marker: targetNode.list_marker,
            due_at: nextDueAt,
            start_at: targetNode.start_at,
            recurrence: targetNode.recurrence,
            priority: targetNode.priority,
            assigned_to: targetNode.assigned_to,
            recur_prev: targetId,
            parent_idx: (targetNode.parent_idx ?? 0) + 0.001,
            data: targetNode.data ? { ...targetNode.data } : undefined,
          })
        }
      }
    } else {
      ctx.repo.updateNode(targetId, {
        task_status: nextStatus,
        task_marker: getMarkerForStatus(nextStatus),
      })
    }
  }

  ctx.undoHandle.endBatch()

  // Selection preserved: status toggle is in-place modification.
  // User can press x again to cycle all selected cards further.
  refreshBoardState(ctx)
}

/**
 * Shift card or column in a direction.
 *
 * When cursor is on a card: up/down shifts within column, left/right moves between columns.
 * When cursor is on a column header: left/right reorders columns.
 */
export function handleShiftCard(ctx: ActionCtx, direction: "up" | "down" | "left" | "right"): ActionResult {
  const { layout } = ctx
  const col = layout.columns[layout.colIndex]
  const card = col?.cards[layout.cardIndex]

  if (!card) {
    // At column header level — reorder columns left/right
    // Virtual columns (body column) can't be moved
    if (col && !col.isVirtual && (direction === "left" || direction === "right")) {
      return moveColumn(ctx, col, direction)
    }
    return boundary(direction)
  }

  if (direction === "up" || direction === "down") {
    return moveCardInColumn(ctx, card, direction)
  } else {
    return moveCardToColumn(ctx, card, direction)
  }
}

/**
 * Reorder a column by swapping its sort order with the adjacent column.
 */
function moveColumn(
  ctx: ActionCtx,
  col: { node: { id: string; parent_idx: number } },
  direction: "left" | "right",
): ActionResult {
  const { layout, repo } = ctx
  const targetIndex = direction === "left" ? layout.colIndex - 1 : layout.colIndex + 1
  if (targetIndex < 0 || targetIndex >= layout.columns.length) return boundary(direction)

  const targetCol = layout.columns[targetIndex]
  if (!targetCol) return boundary(direction)

  // Virtual columns (e.g., __body__) are synthetic — can't be moved in the repo
  if (targetCol.isVirtual) return boundary(direction)

  // Batch all moves (normalize + swap) into a single undo entry
  ctx.undoHandle.setCursor(ctx.cursorNodeId)
  ctx.undoHandle.startBatch("Move column")

  // Normalize sort orders for just the two columns being swapped (not all columns)
  normalizeColumnSortOrders(ctx, layout.colIndex, targetIndex)

  // Swap sort orders by moving each column to the other's position
  const parentId = ctx.rootId
  // Read parent_idx from repo (not layout) to avoid stale references
  const curNode = repo.getNode(col.node.id)
  const targetNode = repo.getNode(targetCol.node.id)
  const curOrder = curNode?.parent_idx ?? col.node.parent_idx
  const targetOrder = targetNode?.parent_idx ?? targetCol.node.parent_idx
  repo.moveNode(col.node.id, parentId, targetOrder)
  repo.moveNode(targetCol.node.id, parentId, curOrder)

  ctx.undoHandle.endBatch()

  refreshBoardState(ctx, { colIndex: targetIndex })
  return ok()
}

/**
 * Ensure the two columns involved in a swap have distinct parent_idx values.
 * When siblings share parent_idx (e.g., all 0 from import), swapping equal
 * values is a no-op. Instead of normalizing ALL columns (which triggers N
 * disk writes and watcher events), only assign distinct indices to the two
 * columns being swapped.
 */
function normalizeColumnSortOrders(
  ctx: ActionCtx,
  colIndexA: number,
  colIndexB: number,
): void {
  const { layout, repo } = ctx
  const colA = layout.columns[colIndexA]
  const colB = layout.columns[colIndexB]
  if (!colA || !colB) return

  // Only normalize if the two columns share the same parent_idx
  if (colA.node.parent_idx !== colB.node.parent_idx) return

  // Assign distinct indices: use their layout positions, which are guaranteed unique
  const parentId = ctx.rootId
  if (!colA.isVirtual && colA.node.parent_idx !== colIndexA) {
    repo.moveNode(colA.node.id, parentId, colIndexA)
    colA.node.parent_idx = colIndexA
  }
  if (!colB.isVirtual && colB.node.parent_idx !== colIndexB) {
    repo.moveNode(colB.node.id, parentId, colIndexB)
    colB.node.parent_idx = colIndexB
  }
}

/**
 * Indent a column: reparent it as the last card of the previous column.
 *
 * The column becomes a child of the previous column. Cursor moves to
 * the previous column to follow the indented content.
 */
export function handleIndentColumn(ctx: ActionCtx, col: ColumnState): ActionResult {
  const { layout, repo } = ctx
  const colIndex = layout.colIndex

  // Need a previous column to indent into
  if (colIndex === 0) return boundary("indent", "First column can't be indented")

  const prevCol = layout.columns[colIndex - 1]
  if (!prevCol) return boundary("indent", "No previous column")

  // Calculate sort order: after last card in target column
  const targetCards = repo.getChildren(prevCol.node.id)
  const lastCard = targetCards[targetCards.length - 1]
  const newSortOrder = lastCard ? lastCard.parent_idx + 1 : 0

  // Record cursor for undo
  ctx.undoHandle.setCursor(ctx.cursorNodeId)

  // Move the column node under the previous column
  repo.moveNode(col.node.id, prevCol.node.id, newSortOrder)

  // Cursor goes to previous column's first card (the column is now a card there)
  refreshBoardState(ctx, {
    colIndex: colIndex - 1,
    cardIndex: () => targetCards.length, // the new card is at the end
  })

  return ok()
}
